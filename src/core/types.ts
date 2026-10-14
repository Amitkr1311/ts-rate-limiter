export interface WindowRateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

export interface RateLimitContext {
  /** Unique identifier for the client or resource being limited. */
  key: string;

  /** Current time as a Unix timestamp in milliseconds. */
  now: number;
}

export interface TokenBucketOptions {
  capacity: number;
  refillRatePerSecond: number;
  cost?: number;
}

export type AlgorithmName =
  | "fixed-window"
  | "sliding-window"
  | "token-bucket"
;

