
import type {
  RateLimitResult,
} from "../core/types.js";

/**
 * Input required by a Fixed Window storage operation.
 */
export interface FixedWindowInput {
  key: string;
  limit: number;
  windowMs: number;
  now: number;
}

/**
 * Input required by a Sliding Window storage operation.
 */
export interface SlidingWindowInput {
  key: string;
  limit: number;
  windowMs: number;
  now: number;
}

/**
 * Input required by a Token Bucket storage operation.
 */
export interface TokenBucketInput {
  key: string;
  capacity: number;
  refillRatePerSecond: number;
  cost: number;
  now: number;
}

/**
 * Storage contract for atomic rate-limit operations.
 */
export interface RateLimitStorage {
  readonly type: "memory" | "redis";

  consumeFixedWindow(
    input: FixedWindowInput,
  ): Promise<RateLimitResult>;

  consumeSlidingWindow(
    input: SlidingWindowInput,
  ): Promise<RateLimitResult>;

  consumeTokenBucket(
    input: TokenBucketInput,
  ): Promise<RateLimitResult>;

  close(): Promise<void>;
}
