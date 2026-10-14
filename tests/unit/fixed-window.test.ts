
import { describe, expect, it } from "vitest";
import { FixedWindowAlgorithm } from "../../src/algorithms/fixed-window.js";
import { MemoryStorage } from "../../src/storage/memory.js";

describe("FixedWindowAlgorithm", () => {
  it("allows requests up to the configured limit", async () => {
    const storage = new MemoryStorage();
    const limiter = new FixedWindowAlgorithm(storage, {
      limit: 2,
      windowMs: 1_000,
    });

    const first = await limiter.check({ key: "user-1", now: 1_000 });
    const second = await limiter.check({ key: "user-1", now: 1_100 });
    const third = await limiter.check({ key: "user-1", now: 1_200 });

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows requests again in the next window", async () => {
    const storage = new MemoryStorage();
    const limiter = new FixedWindowAlgorithm(storage, {
      limit: 1,
      windowMs: 1_000,
    });

    const first = await limiter.check({ key: "user-1", now: 1_000 });
    const blocked = await limiter.check({ key: "user-1", now: 1_500 });
    const nextWindow = await limiter.check({ key: "user-1", now: 2_000 });

    expect(first.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(nextWindow.allowed).toBe(true);
  });

  it("isolates different keys", async () => {
    const storage = new MemoryStorage();
    const limiter = new FixedWindowAlgorithm(storage, {
      limit: 1,
      windowMs: 1_000,
    });

    const user1 = await limiter.check({ key: "user-1", now: 1_000 });
    const user2 = await limiter.check({ key: "user-2", now: 1_000 });

    expect(user1.allowed).toBe(true);
    expect(user2.allowed).toBe(true);
  });

  it("rejects an invalid limit", () => {
    const storage = new MemoryStorage();

    expect(
      () =>
        new FixedWindowAlgorithm(storage, {
          limit: 0,
          windowMs: 1_000,
        }),
    ).toThrow(RangeError);
  });

  it("rejects an invalid window duration", () => {
    const storage = new MemoryStorage();

    expect(
      () =>
        new FixedWindowAlgorithm(storage, {
          limit: 10,
          windowMs: 0,
        }),
    ).toThrow(RangeError);
  });
});
