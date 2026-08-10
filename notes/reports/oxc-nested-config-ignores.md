# oxfmt / oxlint: nested config vs ignorePatterns

Vendored trees under `repos/` must not be formatted or linted by the root toolchain. Two separate issues get in the way.

## `ignorePatterns` does not fence config discovery

`ignorePatterns` only filters **source files processed by the config that owns them**. It does **not** stop oxfmt/oxlint from discovering nested configs (`.oxfmtrc*`, `.oxlintrc*`, `oxlint.config.*`) under those paths.

- Nested config discovery is path-based (“nearest config wins”), independent of the parent’s ignores.
- Once a nested config is found, that subtree is governed by **its** config — the parent’s `ignorePatterns` no longer apply to those files (oxfmt).
- Oxlint may still **load and validate** nested configs in ignored dirs even when no sources there are linted (can hard-fail on missing plugins or root-only options).

Known upstream: [oxc#20752](https://github.com/oxc-project/oxc/issues/20752), [discussion #21959](https://github.com/oxc-project/oxc/discussions/21959).

## Ultracite only forwards flags to oxlint

`ultracite check|fix --disable-nested-config …` spawns:

| Tool   | Receives unknown options?                                  |
| ------ | ---------------------------------------------------------- |
| oxfmt  | no — always `oxfmt --check .` / fix equivalent             |
| oxlint | yes — gets `--disable-nested-config`, `--type-aware`, etc. |

So the script flag successfully disables nested oxlint configs (and skips Effect/Alchemy’s `.oxlintrc`), but does nothing for oxfmt. Alchemy’s nested `.oxfmtrc.json` still re-owns `repos/alchemy/**`.

## Workarounds in this repo

| Layer                            | Mechanism                                                   |
| -------------------------------- | ----------------------------------------------------------- |
| Global (oxfmt)                   | `.prettierignore` → `repos` (global ignore; always applies) |
| Config (both)                    | `repos/**` in root `ignorePatterns`                         |
| CLI (oxlint only, via ultracite) | `--disable-nested-config`                                   |

Global ignores (`.prettierignore`, `--ignore-path`, CLI `!paths`) are the only reliable “do not enter this tree” for oxfmt while nested lookup remains on. `--disable-nested-config` is the blunt fix when you do not need nested monorepo configs at all.

## Why Effect vs Alchemy differed

| Tree            | Nested oxfmt | Nested oxlint     | Default oxfmt                      | Default oxlint        |
| --------------- | ------------ | ----------------- | ---------------------------------- | --------------------- |
| `repos/effect`  | no           | yes (plugin deps) | root ignore works                  | config load can fail  |
| `repos/alchemy` | yes          | yes               | nested config bypasses root ignore | config load attempted |

As of the workaround, format is fenced by `.prettierignore`; lint relies on ultracite passing `--disable-nested-config` to oxlint.
