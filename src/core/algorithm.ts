
import type {
  AlgorithmName,
  RateLimitContext,
  RateLimitResult,
} from "./types.js";

/**
 * Contract that every rate-limiting algorithm must implement.
 */
export interface RateLimitAlgorithm<
  TOptions,
> {
  readonly name: AlgorithmName;

  check(
    context: RateLimitContext,
    options: TOptions,
  ): Promise<RateLimitResult>;
}

