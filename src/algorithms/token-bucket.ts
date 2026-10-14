
import type { RateLimitAlgorithm } from "../core/algorithm.js";
import type {
  RateLimitContext,
  RateLimitResult,
  TokenBucketOptions,
} from "../core/types.js";
import type { RateLimitStorage } from "../storage/storage.js";

export class TokenBucketAlgorithm implements RateLimitAlgorithm<TokenBucketOptions> {
  readonly name = "token-bucket" as const;

  private readonly cost: number;

  constructor(
    private readonly storage: RateLimitStorage,
    private readonly options: TokenBucketOptions,
  ) {
    const { capacity, refillRatePerSecond } = options;
    const cost = options.cost ?? 1;

    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new RangeError("capacity must be a positive finite number");
    }

    if (
      !Number.isFinite(refillRatePerSecond) ||
      refillRatePerSecond <= 0
    ) {
      throw new RangeError(
        "refillRatePerSecond must be a positive finite number",
      );
    }

    if (!Number.isFinite(cost) || cost <= 0) {
      throw new RangeError("cost must be a positive finite number");
    }

    if (cost > capacity) {
      throw new RangeError("cost cannot exceed capacity");
    }

    this.cost = cost;
  }

  async check(context: RateLimitContext): Promise<RateLimitResult> {
    return this.storage.consumeTokenBucket({
      key: context.key,
      capacity: this.options.capacity,
      refillRatePerSecond: this.options.refillRatePerSecond,
      cost: this.cost,
      now: context.now,
    });
  }
}
