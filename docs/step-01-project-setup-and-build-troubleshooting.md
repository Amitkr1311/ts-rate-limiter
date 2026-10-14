# Step 1 --- Project Setup and Build Pipeline Troubleshooting

**Project:** `ts-rate-limiter`\
**Status:** Step 1 complete --- JavaScript bundle and TypeScript
declaration generation succeed\
**Environment:** Windows PowerShell, Node.js `v22.18.0`, pnpm `10.19.0`

## 1. Goal of this step

The first milestone was to establish a working TypeScript package
skeleton before implementing rate-limiting algorithms. The project needs
to be able to:

-   compile its TypeScript entry point into an ES module;
-   generate TypeScript declaration files for package consumers;
-   run tests with Vitest; and
-   type-check the source and tests.

The important build command is:

``` powershell
pnpm build
```

It runs:

``` bash
tsup src/index.ts --format esm --dts
```

The `--format esm` option produces an ES module bundle. The `--dts`
option asks the build pipeline to generate `.d.ts` declaration files as
well.

## 2. Initial project configuration

### `package.json`

The relevant package configuration was set up with these scripts and
entry points:

``` json
{
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

The project uses ESM (`"type": "module"`). The package entry points
refer to generated files in `dist/`, rather than directly to source
files. The `build` script generates those files; the test and type-check
scripts validate the project independently.

The development tooling includes TypeScript, Vitest, tsup, and Node.js
type definitions. Fastify and Redis were also added as runtime
dependencies for planned integration and Redis-backed storage work; they
are not needed by the initial version constant itself.

### `tsconfig.json`

The TypeScript configuration was set up for modern Node.js ESM and
strict checking:

``` json
{
  "compilerOptions": {
    "outDir": "./dist",
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noUncheckedSideEffectImports": true,
    "moduleDetection": "force",
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

`noEmit: true` means `tsc` checks the project without writing compiled
output. tsup is responsible for producing the distributable bundle and
declarations. The `include` paths cover both implementation and tests,
and no `rootDir` was specified because those files live in separate
top-level directories.

### Initial source and test

`src/index.ts` initially contained only:

``` ts
export const VERSION = "0.1.0";
```

`tests/unit/index.test.ts` checked that the entry point exported the
expected version:

``` ts
import { describe, expect, it } from "vitest";
import { VERSION } from "../../src/index.js";

describe("package entry point", () => {
  it("exposes the current version", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
```

The `.js` extension in the import is intentional for TypeScript
configured with `NodeNext`: TypeScript can resolve it to the `.ts`
source during development, while emitted Node.js ESM imports
conventionally use `.js` extensions.

## 3. The first build failure

The initial tool versions were:

-   tsup `8.5.1`
-   TypeScript `7.0.2`

The command was:

``` powershell
pnpm build
```

The JavaScript stage succeeded and wrote `dist/index.js`, but
declaration generation crashed with an error resembling:

``` text
TypeError: Cannot read properties of undefined
(reading 'useCaseSensitiveFileNames')
```

The stack trace pointed into `rollup-plugin-dts`, the
declaration-generation plugin used by the build pipeline.

### What this told us

The failure was not in `src/index.ts`: tsup had already produced the
JavaScript bundle. The failure occurred in the second stage, which
needed TypeScript's compiler API to inspect the project and generate
`index.d.ts`.

We also checked the installed TypeScript version:

``` powershell
pnpm exec tsc --version
pnpm why typescript
pnpm list typescript
```

These commands confirmed that TypeScript `7.0.2` was installed. The
initial stack trace included an older `rollup-plugin-dts` package path,
so we updated tsup rather than assuming the application code was broken.

## 4. Upgrade tsup

The newer package versions were checked, and tsup was upgraded:

``` powershell
pnpm add -D tsup@9.0.0
pnpm exec tsup --version
pnpm why typescript
```

The installed tsup version was now `9.0.0`, but the build still failed
during declaration generation. The new message was more explicit:

``` text
rollup-plugin-dts requires the TypeScript compiler API.
The installed typescript@7.0.2 does not provide it,
and the @typescript/typescript6 fallback is not installed.
TypeScript 7 does not ship a compiler API.
```

This narrowed the cause: **TypeScript 7's compiler API change was
incompatible with the declaration-generation path unless its
compatibility mechanism was available.** Upgrading tsup updated the
plugin, but did not by itself make TypeScript 7's API available.

## 5. Try the TypeScript 7 compatibility package

Following the error message, we installed the suggested compatibility
package:

``` powershell
pnpm add -D @typescript/typescript6
```

The install succeeded, but the next build failed with:

``` text
TypeError: _typescript2.default.parseJsonConfigFileContent
is not a function
```

This showed that installing the fallback package did not make the
compiler API available in the form expected by the active
declaration-generation code. Continuing to change package versions
around this compatibility path would add uncertainty without improving
the immediate goal.

## 6. Switch to TypeScript 6

We then installed TypeScript 6:

``` powershell
pnpm add -D typescript@^6
```

pnpm resolved the installed version to `6.0.3`. We reran:

``` powershell
pnpm build
```

The build succeeded:

``` text
CLI tsup v9.0.0
ESM Build start
ESM dist\index.js 61.00 B
ESM ⚡️ Build success
DTS Build start
DTS ⚡️ Build success
DTS dist\index.d.ts 54.00 B
```

This was the first complete successful build: both the JavaScript bundle
and declaration file were generated.

## 7. Final resolution

The working combination established during this troubleshooting step is:

  Component       Working version / setting
  --------------- ----------------------------------------
  Node.js         `22.18.0`
  pnpm            `10.19.0`
  tsup            `9.0.0`
  TypeScript      `6.0.3`
  Module format   ESM
  Build command   `tsup src/index.ts --format esm --dts`

The output includes:

``` text
dist/
  index.js
  index.d.ts
```

`index.js` is the runtime JavaScript entry point. `index.d.ts` describes
the exported types for TypeScript consumers.

**Why TypeScript 6 worked:** the declaration-generation pipeline could
access the compiler API it expected. TypeScript 7 did not provide that
API through the normal `typescript` package, and the attempted
compatibility-package route still failed in this setup.

This is a tooling compatibility issue, not a rate-limiter implementation
bug. No algorithm code needed to change to resolve it.

## 8. A separate pnpm warning

During package installation, pnpm displayed:

``` text
Ignored build scripts: esbuild.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

This warning is separate from the TypeScript compiler API failure. The
successful build shows that it did not prevent this build from
completing. Do not treat it as the cause of the declaration-generation
errors.

If a later dependency or command reports that esbuild's install script
or binary is unavailable, review pnpm's build-script approval settings
and approve only dependencies you trust.

## 9. Optional dependency cleanup

The compatibility package was installed during the TypeScript 7
investigation. Since the build now succeeds with TypeScript 6.0.3, it
may no longer be needed.

To test a cleaner dependency tree, remove it and rebuild:

``` powershell
pnpm remove -D @typescript/typescript6
pnpm build
```

This cleanup is a follow-up action, not part of the already confirmed
successful build. Keep the package only if the resulting dependency
setup genuinely requires it.

## 10. Validation checklist

The build command has already succeeded. Run the remaining checks to
validate the initial project skeleton:

``` powershell
pnpm exec tsc --noEmit
pnpm test
```

Expected outcomes:

-   `pnpm build` --- produces `dist/index.js` and `dist/index.d.ts`;
-   `pnpm exec tsc --noEmit` --- reports no TypeScript errors;
-   `pnpm test` --- passes the entry-point version test.

Do not mark type checking and tests as passed until those commands have
actually been run successfully.

## 11. What was completed in Step 1

-   Established the Node.js/TypeScript package structure and ESM entry
    points.
-   Added a minimal source export and a Vitest entry-point test.
-   Configured strict TypeScript checking.
-   Added a reproducible build command.
-   Investigated a declaration-generation failure using version and
    dependency diagnostics.
-   Upgraded tsup, tested the recommended TypeScript 7 compatibility
    package, and isolated the remaining issue to the compiler API path.
-   Switched to TypeScript `6.0.3` and confirmed that both JavaScript
    and declaration generation succeed.

## 12. Next milestone

Once type checking and tests pass, begin the library's core
abstractions:

1.  Define shared rate-limit options and result types.
2.  Define the storage interface independently of any algorithm.
3.  Implement in-memory storage.
4.  Implement and test Fixed Window before adding more complex
    algorithms.

This keeps the first implementation small and makes each subsequent
algorithm easier to test against a stable interface.
