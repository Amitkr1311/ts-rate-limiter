
import type { RateLimitResult } from "../core/types.js";
import type {
  FixedWindowInput,
  SlidingWindowInput,
  TokenBucketInput,
  RateLimitStorage,
} from "./storage.js";

interface FixedWindowState {
  windowStart: number;
  windowMs: number;
  limit: number;
  count: number;
  lastSeenAt: number;
}

interface SlidingWindowState {
  windowMs: number;
  limit: number;
  timestamps: number[];
  lastSeenAt: number;
}

interface TokenBucketState {
  tokens: number;
  lastRefillAt: number;
  capacity: number;
  refillRatePerSecond: number;
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function assertInput(key: string, now: number): void {
  if (key.trim().length === 0) {
    throw new Error("key must not be empty");
  }

  if (!Number.isFinite(now) || now < 0) {
    throw new Error("now must be a non-negative finite timestamp");
  }
}

function assertWindowInput(limit: number, windowMs: number): void {
  assertPositiveFinite(limit, "limit");
  assertPositiveFinite(windowMs, "windowMs");

  if (!Number.isInteger(limit)) {
    throw new Error("limit must be an integer");
  }
}

function assertMonotonicTime(previousTime: number, now: number): void {
  if (now < previousTime) {
    throw new Error("now must not move backwards for a key");
  }
}

export class MemoryStorage implements RateLimitStorage {
  readonly type = "memory" as const;

  private readonly fixedWindows = new Map<string, FixedWindowState>();
  private readonly slidingWindows = new Map<string, SlidingWindowState>();
  private readonly tokenBuckets = new Map<string, TokenBucketState>();

  cleanup(now = Date.now()): number {
    if (!Number.isFinite(now) || now < 0) {
      throw new Error("now must be a non-negative finite timestamp");
    }

    let removed = 0;

    for (const [key, state] of this.fixedWindows) {
      if (state.windowStart + state.windowMs <= now) {
        this.fixedWindows.delete(key);
        removed++;
      }
    }

    for (const [key, state] of this.slidingWindows) {
      state.timestamps = state.timestamps.filter(
        (timestamp) => timestamp + state.windowMs > now,
      );

      if (state.timestamps.length === 0) {
        this.slidingWindows.delete(key);
        removed++;
      }
    }

    for (const [key, state] of this.tokenBuckets) {
      const timeToFullMs =
        ((state.capacity - state.tokens) /
          state.refillRatePerSecond) *
        1000;

      if (state.lastRefillAt + timeToFullMs <= now) {
        this.tokenBuckets.delete(key);
        removed++;
      }
    }

    return removed;
  }

  async consumeFixedWindow(
    input: FixedWindowInput,
  ): Promise<RateLimitResult> {
    assertInput(input.key, input.now);
    assertWindowInput(input.limit, input.windowMs);

    const previous = this.fixedWindows.get(input.key);

    if (previous) {
      assertMonotonicTime(previous.lastSeenAt, input.now);

      const configurationChanged =
        previous.limit !== input.limit ||
        previous.windowMs !== input.windowMs;

      if (configurationChanged) {
        if (input.now < previous.windowStart + previous.windowMs) {
          throw new Error(
            "Fixed window configuration cannot change while its window is active",
          );
        }
      }
    }

    const windowStart =
      Math.floor(input.now / input.windowMs) * input.windowMs;

    let state =
      previous &&
      previous.limit === input.limit &&
      previous.windowMs === input.windowMs &&
      previous.windowStart === windowStart
        ? previous
        : undefined;

    if (!state) {
      state = {
        windowStart,
        windowMs: input.windowMs,
        limit: input.limit,
        count: 0,
        lastSeenAt: input.now,
      };
    }

    const resetAt = windowStart + input.windowMs;
    const allowed = state.count < input.limit;

    if (allowed) {
      state.count++;
    }

    state.lastSeenAt = input.now;
    this.fixedWindows.set(input.key, state);

    return {
      allowed,
      limit: input.limit,
      remaining: Math.max(0, input.limit - state.count),
      resetAt,
      retryAfterMs: allowed ? 0 : Math.max(0, resetAt - input.now),
    };
  }

  async consumeSlidingWindow(
    input: SlidingWindowInput,
  ): Promise<RateLimitResult> {
    assertInput(input.key, input.now);
    assertWindowInput(input.limit, input.windowMs);

    const previous = this.slidingWindows.get(input.key);
    let timestamps: number[] = [];

    if (previous) {
      assertMonotonicTime(previous.lastSeenAt, input.now);

      const configurationChanged =
        previous.limit !== input.limit ||
        previous.windowMs !== input.windowMs;

      const oldWindowStillActive = previous.timestamps.some(
        (timestamp) => timestamp + previous.windowMs > input.now,
      );

      if (configurationChanged && oldWindowStillActive) {
        throw new Error(
          "Sliding window configuration cannot change while requests are active",
        );
      }

      if (!configurationChanged) {
        timestamps = previous.timestamps.filter(
          (timestamp) => timestamp > input.now - input.windowMs,
        );
      }
    }

    const allowed = timestamps.length < input.limit;

    if (allowed) {
      timestamps.push(input.now);
    }

    if (timestamps.length === 0) {
      this.slidingWindows.delete(input.key);
    } else {
      this.slidingWindows.set(input.key, {
        windowMs: input.windowMs,
        limit: input.limit,
        timestamps,
        lastSeenAt: input.now,
      });
    }

    const resetAt =
      timestamps.length > 0
        ? timestamps[0]! + input.windowMs
        : input.now + input.windowMs;

    return {
      allowed,
      limit: input.limit,
      remaining: Math.max(0, input.limit - timestamps.length),
      resetAt,
      retryAfterMs: allowed ? 0 : Math.max(0, resetAt - input.now),
    };
  }

  async consumeTokenBucket(
    input: TokenBucketInput,
  ): Promise<RateLimitResult> {
    assertInput(input.key, input.now);
    assertPositiveFinite(input.capacity, "capacity");
    assertPositiveFinite(
      input.refillRatePerSecond,
      "refillRatePerSecond",
    );
    assertPositiveFinite(input.cost, "cost");

    if (!Number.isInteger(input.capacity)) {
      throw new Error("capacity must be an integer");
    }

    if (input.cost > input.capacity) {
      throw new Error("cost must not exceed capacity");
    }

    const previous = this.tokenBuckets.get(input.key);

    if (previous) {
      assertMonotonicTime(previous.lastRefillAt, input.now);

      if (
        previous.capacity !== input.capacity ||
        previous.refillRatePerSecond !== input.refillRatePerSecond
      ) {
        throw new Error(
          "Token bucket configuration must remain consistent for a key",
        );
      }
    }

    const elapsedMs = previous
      ? input.now - previous.lastRefillAt
      : 0;

    const refilledTokens = previous
      ? Math.min(
          input.capacity,
          previous.tokens +
            (elapsedMs / 1000) * input.refillRatePerSecond,
        )
      : input.capacity;

    const allowed = refilledTokens >= input.cost;
    const tokens = allowed
      ? refilledTokens - input.cost
      : refilledTokens;

    this.tokenBuckets.set(input.key, {
      tokens,
      lastRefillAt: input.now,
      capacity: input.capacity,
      refillRatePerSecond: input.refillRatePerSecond,
    });

    const retryAfterMs = allowed
      ? 0
      : Math.ceil(
          ((input.cost - tokens) / input.refillRatePerSecond) * 1000,
        );

    return {
      allowed,
      limit: input.capacity,
      remaining: Math.floor(tokens + Number.EPSILON),
      resetAt:
        input.now +
        ((input.capacity - tokens) / input.refillRatePerSecond) * 1000,
      retryAfterMs,
    };
  }

  async close(): Promise<void> {
    this.fixedWindows.clear();
    this.slidingWindows.clear();
    this.tokenBuckets.clear();
  }
}
