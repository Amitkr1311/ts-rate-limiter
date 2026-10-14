
import { describe, expect, it } from "vitest";
import { TokenBucketAlgorithm } from "../../src/algorithms/token-bucket.js";
import { MemoryStorage } from "../../src/storage/memory.js";

describe("TokenBucketAlgorithm", () => {
  it("allows requests while tokens are available", async () => {
    const limiter = new TokenBucketAlgorithm(new MemoryStorage(), {
      capacity: 2,
      refillRatePerSecond: 1,
    });

    const first = await limiter.check({ key: "user-1", now: 1_000 });
    const second = await limiter.check({ key: "user-1", now: 1_000 });
    const third = await limiter.check({ key: "user-1", now: 1_000 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills tokens over time", async () => {
    const limiter = new TokenBucketAlgorithm(new MemoryStorage(), {
      capacity: 2,
      refillRatePerSecond: 1,
    });

    await limiter.check({ key: "user-1", now: 1_000 });
    await limiter.check({ key: "user-1", now: 1_000 });

    const blocked = await limiter.check({
      key: "user-1",
      now: 1_000,
    });

    const afterRefill = await limiter.check({
      key: "user-1",
      now: 2_000,
    });

    expect(blocked.allowed).toBe(false);
    expect(afterRefill.allowed).toBe(true);
  });

  it("isolates different keys", async () => {
    const limiter = new TokenBucketAlgorithm(new MemoryStorage(), {
      capacity: 1,
      refillRatePerSecond: 1,
    });

    const first = await limiter.check({ key: "user-1", now: 1_000 });
    const second = await limiter.check({ key: "user-2", now: 1_000 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
  });

  it("supports a custom request cost", async () => {
    const limiter = new TokenBucketAlgorithm(new MemoryStorage(), {
      capacity: 3,
      refillRatePerSecond: 1,
      cost: 2,
    });

    const first = await limiter.check({ key: "user-1", now: 1_000 });
    const second = await limiter.check({ key: "user-1", now: 1_000 });

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(false);
  });

  it("rejects invalid capacity", () => {
    expect(
      () =>
        new TokenBucketAlgorithm(new MemoryStorage(), {
          capacity: 0,
          refillRatePerSecond: 1,
        }),
    ).toThrow(RangeError);
  });

  it("rejects invalid refill rate", () => {
    expect(
      () =>
        new TokenBucketAlgorithm(new MemoryStorage(), {
          capacity: 10,
          refillRatePerSecond: 0,
        }),
    ).toThrow(RangeError);
  });

  it("rejects a cost greater than capacity", () => {
    expect(
      () =>
        new TokenBucketAlgorithm(new MemoryStorage(), {
          capacity: 2,
          refillRatePerSecond: 1,
          cost: 3,
        }),
    ).toThrow(RangeError);
  });
});
