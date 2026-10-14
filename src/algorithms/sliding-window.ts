
import type { RateLimitAlgorithm } from "../core/algorithm.js";
import type {
  RateLimitContext,
  RateLimitResult,
  WindowRateLimitOptions,
} from "../core/types.js";
import type { RateLimitStorage } from "../storage/storage.js";

export class SlidingWindowAlgorithm implements RateLimitAlgorithm<WindowRateLimitOptions> {
  readonly name = "sliding-window" as const;

  constructor(
    private readonly storage: RateLimitStorage,
    private readonly options: WindowRateLimitOptions,
  ) {
    if (
      !Number.isSafeInteger(options.limit) ||
      options.limit <= 0
    ) {
      throw new RangeError("limit must be a positive integer");
    }

    if (
      !Number.isFinite(options.windowMs) ||
      options.windowMs <= 0
    ) {
      throw new RangeError(
        "windowMs must be a positive finite number",
      );
    }
  }

  async check(context: RateLimitContext): Promise<RateLimitResult> {
    return this.storage.consumeSlidingWindow({
      key: context.key,
      limit: this.options.limit,
      windowMs: this.options.windowMs,
      now: context.now,
    });
  }
}
