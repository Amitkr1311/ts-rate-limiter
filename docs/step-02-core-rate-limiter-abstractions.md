# Step 2 --- Core Rate-Limiter Abstractions

**Project:** `ts-rate-limiter`\
**Status:** Core contracts drafted; runtime rate-limiting behavior is
not implemented yet.

## 1. Goal

Step 2 establishes shared contracts for algorithm configuration, request
context, rate-limit results, and storage lifecycle before implementing
algorithms or storage backends.

The intended separation is:

-   **Rate limiter:** coordinates a rate-limit check and returns the
    outcome.
-   **Algorithm:** defines the policy for deciding whether an operation
    is allowed.
-   **Storage:** maintains state required by an algorithm.

This separation should allow multiple algorithms and storage
implementations to be combined without tight coupling.

## 2. Shared types --- `src/core/types.ts`

### `AlgorithmName`

``` ts
export type AlgorithmName =
  | "fixed-window"
  | "sliding-window"
  | "token-bucket";
```

This union restricts algorithm identifiers to the three planned names
and catches unsupported string literals at compile time.

### `WindowRateLimitOptions`

``` ts
export interface WindowRateLimitOptions {
  limit: number;
  windowMs: number;
}
```

-   `limit`: maximum requests permitted in a window.
-   `windowMs`: duration of the window in milliseconds.

These are compile-time types, not runtime validation. Implementation
code must reject invalid values such as zero or negative limits and
durations. Token Bucket should receive a dedicated options interface
because its configuration differs from window-based algorithms.

### `RateLimitResult`

``` ts
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}
```

-   `allowed`: whether the current request was permitted.
-   `limit`: configured maximum for the applicable policy.
-   `remaining`: number of requests still available.
-   `resetAt`: Unix timestamp in milliseconds representing the reset
    time.
-   `retryAfterMs`: duration in milliseconds before retrying is
    appropriate.

The exact semantics must be consistent across algorithms. Token Bucket
does not naturally have a fixed window reset boundary, so its reset and
retry semantics need to be specified when implemented.

### `RateLimitContext`

``` ts
export interface RateLimitContext {
  key: string;
  now: number;
}
```

`key` identifies the client or resource being limited. `now` is a Unix
timestamp in milliseconds. Passing time explicitly makes deterministic
tests easier because tests do not have to depend on the real system
clock.

## 3. Algorithm contract --- `src/core/algorithm.ts`

``` ts
import type {
  AlgorithmName,
  RateLimitContext,
  RateLimitResult,
} from "./types.js";

export interface RateLimitAlgorithm<TOptions> {
  readonly name: AlgorithmName;

  check(
    context: RateLimitContext,
    options: TOptions,
  ): Promise<RateLimitResult>;
}
```

The generic `TOptions` lets each algorithm use its own configuration
type while sharing a common result format. Fixed Window can use
`WindowRateLimitOptions`; Token Bucket can use a dedicated configuration
type.

The `.js` import extension is intentional for this project's TypeScript
`NodeNext` module-resolution setup.

**Design point to revisit:** options are currently passed to every
`check()` call. Before implementing algorithms, decide whether
configuration should instead be supplied when constructing the
algorithm. Constructor-time configuration can prevent a policy from
changing accidentally between requests.

## 4. Storage contract --- `src/storage/storage.ts`

``` ts
export interface StorageResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

export interface RateLimitStorage {
  readonly type: "memory" | "redis";

  close(): Promise<void>;
}
```

`StorageResult` describes a proposed storage-operation outcome.
`RateLimitStorage` identifies the backend and provides an asynchronous
lifecycle method for releasing resources.

This is deliberately incomplete: it does **not** expose operations to
read or update rate-limit state. That gap must be resolved before a
working limiter can be implemented.

### Atomicity requirement

A rate-limit operation must not be implemented as an unsafe `get()`
followed by `set()` when multiple requests can act on the same key
concurrently. Requests could read identical state and overwrite one
another.

The storage API needs atomic operations appropriate to each algorithm.
For Redis, this may involve a Lua script or another server-side atomic
operation. For in-memory storage, updates must be coordinated
appropriately within the Node.js execution model. Design this contract
alongside the first implementation rather than assuming the current
lifecycle-only interface guarantees atomicity.

## 5. Public exports --- `src/index.ts`

The entry point retains the version constant and exports the new public
types:

``` ts
export const VERSION = "0.1.0";

export type {
  AlgorithmName,
  WindowRateLimitOptions,
  RateLimitResult,
  RateLimitContext,
} from "./core/types.js";

export type { RateLimitAlgorithm } from "./core/algorithm.js";

export type {
  RateLimitStorage,
  StorageResult,
} from "./storage/storage.js";
```

`export type` makes it explicit that these exports are TypeScript types,
not runtime values. Interfaces and type aliases are erased during
compilation.

## 6. Why we do not need ordinary unit tests for these interfaces yet

The new code defines compile-time contracts rather than runtime
behavior. TypeScript interfaces and type aliases do not exist as
JavaScript objects at runtime, so ordinary runtime tests cannot directly
test their existence.

For this step, run:

``` powershell
pnpm exec tsc --noEmit
pnpm build
```

-   `pnpm exec tsc --noEmit` checks the source and included tests
    without emitting files.
-   `pnpm build` verifies that tsup can produce the JavaScript bundle
    and declaration files.

The existing `pnpm test` command only reruns the existing `VERSION`
test. It does not test the new interfaces. There is no need to run it as
evidence that these type-only changes work.

Compile-time contract tests can be added if needed to prove that
specific implementations conform to an interface. More useful behavioral
tests begin once storage and algorithms have executable behavior.

## 7. Validation status

Run:

``` powershell
pnpm exec tsc --noEmit
pnpm build
```

Record actual outcomes after running them:

-   Type-checking: **pending confirmation**
-   Build and declaration generation: **pending confirmation**
-   Runtime tests for Step 2 contracts: **not applicable yet; no new
    runtime behavior was added**

Do not mark commands as passed until their output confirms success.

## 8. Current limitations and open decisions

1.  **Storage operations:** Add concrete atomic operations for
    retrieving and updating algorithm state.
2.  **Configuration validation:** Types alone do not reject invalid
    limits or durations.
3.  **Result semantics:** Define `resetAt`, `remaining`, and
    `retryAfterMs` for every algorithm, especially Token Bucket.
4.  **Algorithm lifecycle:** Decide whether options are supplied per
    check or when the algorithm is created.
5.  **Storage ownership:** Clarify whether `close()` is always required
    and how memory storage handles it.
6.  **State model:** Avoid a storage API that works for Fixed Window but
    cannot represent Sliding Window or Token Bucket.

These are design tasks, not evidence that the build is broken.

## 9. Next step

Refine the storage state contract and implement in-memory storage. Once
code changes state at runtime, add unit tests for observable
behavior---state creation, updates, expiry, limit enforcement, and
concurrent access---before implementing Fixed Window on top.
