
import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../../src/storage/memory.js";

describe("MemoryStorage", () => {
  it("enforces the fixed window limit", async () => {
    const storage = new MemoryStorage();
    const input = {
      key: "user-1",
      limit: 2,
      windowMs: 1_000,
      now: 1_000,
    };

    expect((await storage.consumeFixedWindow(input)).allowed).toBe(true);
    expect((await storage.consumeFixedWindow(input)).allowed).toBe(true);

    const blocked = await storage.consumeFixedWindow(input);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(1_000);
  });

  it("starts a new fixed window at the exact boundary", async () => {
    const storage = new MemoryStorage();
    const input = {
      key: "user-1",
      limit: 1,
      windowMs: 1_000,
      now: 1_000,
    };

    await storage.consumeFixedWindow(input);

    const next = await storage.consumeFixedWindow({
      ...input,
      now: 2_000,
    });

    expect(next.allowed).toBe(true);
    expect(next.resetAt).toBe(3_000);
  });

  it("keeps different users' fixed window state separate", async () => {
    const storage = new MemoryStorage();
    const input = {
      key: "user-1",
      limit: 1,
      windowMs: 1_000,
      now: 1_000,
    };

    await storage.consumeFixedWindow(input);

    const otherUser = await storage.consumeFixedWindow({
      ...input,
      key: "user-2",
    });

    expect(otherUser.allowed).toBe(true);
  });

  it("enforces a rolling sliding window", async () => {
    const storage = new MemoryStorage();
    const input = {
      key: "user-2",
      limit: 2,
      windowMs: 1_000,
      now: 1_000,
    };

    await storage.consumeSlidingWindow(input);
    await storage.consumeSlidingWindow({ ...input, now: 1_001 });

    const blocked = await storage.consumeSlidingWindow({
      ...input,
      now: 1_002,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(998);

    const allowed = await storage.consumeSlidingWindow({
      ...input,
      now: 2_000,
    });

    expect(allowed.allowed).toBe(true);
  });

  it("refills tokens over time", async () => {
    const storage = new MemoryStorage();
    const input = {
      key: "user-3",
      capacity: 2,
      refillRatePerSecond: 1,
      cost: 1,
      now: 1_000,
    };

    expect((await storage.consumeTokenBucket(input)).remaining).toBe(1);
    expect((await storage.consumeTokenBucket(input)).remaining).toBe(0);

    const blocked = await storage.consumeTokenBucket(input);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1_000);

    const refilled = await storage.consumeTokenBucket({
      ...input,
      now: 2_000,
    });

    expect(refilled.allowed).toBe(true);
    expect(refilled.remaining).toBe(0);
  });

  it("rejects invalid fixed window configuration", async () => {
    const storage = new MemoryStorage();

    await expect(
      storage.consumeFixedWindow({
        key: "user-4",
        limit: 0,
        windowMs: 1_000,
        now: 1_000,
      }),
    ).rejects.toThrow("limit must be a positive finite number");
  });

  it("rejects token costs greater than capacity", async () => {
    const storage = new MemoryStorage();

    await expect(
      storage.consumeTokenBucket({
        key: "user-5",
        capacity: 2,
        refillRatePerSecond: 1,
        cost: 3,
        now: 1_000,
      }),
    ).rejects.toThrow("cost must not exceed capacity");
  });

  it("removes expired state and preserves active state", async () => {
    const storage = new MemoryStorage();

    await storage.consumeFixedWindow({
      key: "expired",
      limit: 2,
      windowMs: 1_000,
      now: 1_000,
    });

    await storage.consumeFixedWindow({
      key: "active",
      limit: 2,
      windowMs: 10_000,
      now: 1_000,
    });

    const removed = storage.cleanup(2_000);

    expect(removed).toBe(1);

    const expiredKey = await storage.consumeFixedWindow({
      key: "expired",
      limit: 2,
      windowMs: 1_000,
      now: 2_000,
    });

    expect(expiredKey.allowed).toBe(true);

    const activeKey = await storage.consumeFixedWindow({
      key: "active",
      limit: 2,
      windowMs: 10_000,
      now: 2_000,
    });

    expect(activeKey.remaining).toBe(0);
  });

  it("does not exceed the fixed window limit under concurrent calls", async () => {
    const storage = new MemoryStorage();
    const input = {
      key: "user-concurrent",
      limit: 10,
      windowMs: 60_000,
      now: 1_000,
    };

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        storage.consumeFixedWindow(input),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(40);
  });

  
    it("cleans up expired sliding windows and fully refilled buckets", async () => {
    const storage = new MemoryStorage();

    await storage.consumeSlidingWindow({
        key: "sliding-user",
        limit: 5,
        windowMs: 1_000,
        now: 1_000,
    });

    await storage.consumeTokenBucket({
        key: "bucket-user",
        capacity: 2,
        refillRatePerSecond: 1,
        cost: 1,
        now: 1_000,
    });

    // At 2,000 ms, the sliding request has expired
    // and the bucket would have refilled to capacity.
    expect(storage.cleanup(2_000)).toBe(2);
    });

    
it("rejects empty keys and invalid timestamps", async () => {
  const storage = new MemoryStorage();

  await expect(
    storage.consumeFixedWindow({
      key: " ",
      limit: 2,
      windowMs: 1_000,
      now: 1_000,
    }),
  ).rejects.toThrow("key must not be empty");

  await expect(
    storage.consumeFixedWindow({
      key: "user",
      limit: 2,
      windowMs: 1_000,
      now: Number.NaN,
    }),
  ).rejects.toThrow(
    "now must be a non-negative finite timestamp",
  );
});

it("rejects timestamps that move backwards", async () => {
  const storage = new MemoryStorage();

  await storage.consumeSlidingWindow({
    key: "user-time",
    limit: 5,
    windowMs: 1_000,
    now: 2_000,
  });

  await expect(
    storage.consumeSlidingWindow({
      key: "user-time",
      limit: 5,
      windowMs: 1_000,
      now: 1_999,
    }),
  ).rejects.toThrow("now must not move backwards for a key");
});

it("rejects fixed-window configuration changes while active", async () => {
  const storage = new MemoryStorage();

  await storage.consumeFixedWindow({
    key: "user-config",
    limit: 2,
    windowMs: 1_000,
    now: 1_000,
  });

  await expect(
    storage.consumeFixedWindow({
      key: "user-config",
      limit: 3,
      windowMs: 1_000,
      now: 1_100,
    }),
  ).rejects.toThrow(
    "Fixed window configuration cannot change while its window is active",
  );
});

it("rejects sliding-window configuration changes while requests are active", async () => {
  const storage = new MemoryStorage();

  await storage.consumeSlidingWindow({
    key: "user-sliding-config",
    limit: 2,
    windowMs: 1_000,
    now: 1_000,
  });

  await expect(
    storage.consumeSlidingWindow({
      key: "user-sliding-config",
      limit: 3,
      windowMs: 1_000,
      now: 1_100,
    }),
  ).rejects.toThrow(
    "Sliding window configuration cannot change while requests are active",
  );
});

it("rejects token bucket configuration changes", async () => {
  const storage = new MemoryStorage();

  await storage.consumeTokenBucket({
    key: "user-bucket-config",
    capacity: 2,
    refillRatePerSecond: 1,
    cost: 1,
    now: 1_000,
  });

  await expect(
    storage.consumeTokenBucket({
      key: "user-bucket-config",
      capacity: 3,
      refillRatePerSecond: 1,
      cost: 1,
      now: 1_100,
    }),
  ).rejects.toThrow(
    "Token bucket configuration must remain consistent for a key",
  );
});

    it("cleans expired state for all algorithms and preserves active state", async () => {
    const storage = new MemoryStorage();

    // Entries that will expire by 2,000 ms.
    await storage.consumeFixedWindow({
        key: "expired-fixed",
        limit: 2,
        windowMs: 1_000,
        now: 1_000,
    });

    await storage.consumeSlidingWindow({
        key: "expired-sliding",
        limit: 2,
        windowMs: 1_000,
        now: 1_000,
    });

    await storage.consumeTokenBucket({
        key: "expired-bucket",
        capacity: 2,
        refillRatePerSecond: 1,
        cost: 1,
        now: 1_000,
    });

    // Entries that should still be active at 2,000 ms.
    await storage.consumeFixedWindow({
        key: "active-fixed",
        limit: 2,
        windowMs: 10_000,
        now: 1_000,
    });

    await storage.consumeSlidingWindow({
        key: "active-sliding",
        limit: 2,
        windowMs: 1_000,
        now: 1_500,
    });

    await storage.consumeTokenBucket({
        key: "active-bucket",
        capacity: 2,
        refillRatePerSecond: 1,
        cost: 1,
        now: 1_500,
    });

    expect(storage.cleanup(2_000)).toBe(3);

    // The expired entries should behave as fresh state.
    expect(
        (await storage.consumeFixedWindow({
        key: "expired-fixed",
        limit: 2,
        windowMs: 1_000,
        now: 2_000,
        })).remaining,
    ).toBe(1);

    expect(
        (await storage.consumeSlidingWindow({
        key: "expired-sliding",
        limit: 2,
        windowMs: 1_000,
        now: 2_000,
        })).remaining,
    ).toBe(1);

    expect(
        (await storage.consumeTokenBucket({
        key: "expired-bucket",
        capacity: 2,
        refillRatePerSecond: 1,
        cost: 1,
        now: 2_000,
        })).remaining,
    ).toBe(1);

    // Existing active state must not have been discarded.
    expect(
        (await storage.consumeFixedWindow({
        key: "active-fixed",
        limit: 2,
        windowMs: 10_000,
        now: 2_000,
        })).remaining,
    ).toBe(0);

    expect(
        (await storage.consumeSlidingWindow({
        key: "active-sliding",
        limit: 2,
        windowMs: 1_000,
        now: 2_000,
        })).remaining,
    ).toBe(0);

    expect(
        (await storage.consumeTokenBucket({
        key: "active-bucket",
        capacity: 2,
        refillRatePerSecond: 1,
        cost: 1,
        now: 2_000,
        })).remaining,
    ).toBe(0);
    });

    it("clears all state when closed", async () => {
    const storage = new MemoryStorage();

    await storage.consumeFixedWindow({
        key: "user-close",
        limit: 1,
        windowMs: 10_000,
        now: 1_000,
    });

    await storage.close();

    const result = await storage.consumeFixedWindow({
        key: "user-close",
        limit: 1,
        windowMs: 10_000,
        now: 1_000,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
    });

});
