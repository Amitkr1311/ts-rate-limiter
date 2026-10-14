export { MemoryStorage } from "./storage/memory.js";
export { FixedWindowAlgorithm } from "./algorithms/fixed-window.js";
export { SlidingWindowAlgorithm } from "./algorithms/sliding-window.js";
export type { TokenBucketOptions } from "./core/types.js";
export { TokenBucketAlgorithm } from "./algorithms/token-bucket.js";
export const VERSION = "0.1.0";

export type {
  RateLimitStorage,
  FixedWindowInput,
  SlidingWindowInput,
  TokenBucketInput,
} from "./storage/storage.js";
