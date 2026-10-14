
import { describe, expect, it } from "vitest";
import { SlidingWindowAlgorithm } from "../../src/algorithms/sliding-window.js";
import { MemoryStorage } from "../../src/storage/memory.js";

describe("SlidingWindowAlgorithm", () => {
  it("enforces the limit across a rolling window", async () => {
    const storage = new MemoryStorage();
    const limiter = new SlidingWindowAlgorithm(storage, {
      limit: 2,
      windowMs: 1_000,
    });

    const first = await limiter.check({
      key: "user-1",
      now: 1_000,
    });

    const second = await limiter.check({
      key: "user-1",
      now: 1_500,
    });

    const third = await limiter.check({
      key: "user-1",
      now: 1_800,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows a request when the oldest request expires", async () => {
    const storage = new MemoryStorage();
    const limiter = new SlidingWindowAlgorithm(storage, {
      limit: 2,
      windowMs: 1_000,
    });

    await limiter.check({ key: "user-1", now: 1_000 });
    await limiter.check({ key: "user-1", now: 1_500 });

    const result = await limiter.check({
      key: "user-1",
      now: 2_000,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("isolates different keys", async () => {
    const storage = new MemoryStorage();
    const limiter = new SlidingWindowAlgorithm(storage, {
      limit: 1,
      windowMs: 1_000,
    });

    const first = await limiter.check({
      key: "user-1",
      now: 1_000,
    });

    const second = await limiter.check({
      key: "user-2",
      now: 1_000,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
  });

  it("rejects an invalid limit", () => {
    expect(
      () =>
        new SlidingWindowAlgorithm(new MemoryStorage(), {
          limit: 0,
          windowMs: 1_000,
        }),
    ).toThrow(RangeError);
  });

  it("rejects an invalid window duration", () => {
    expect(
      () =>
        new SlidingWindowAlgorithm(new MemoryStorage(), {
          limit: 10,
          windowMs: 0,
        }),
    ).toThrow(RangeError);
  });
});
