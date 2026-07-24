# Entity Logo Service

## Missing Logo Quests

Before acquiring or replacing a manual logo, read and follow
[`ACQUIRING_LOGOS.md`](./ACQUIRING_LOGOS.md).

Treat the requested logo key as a public API value. Check existing LobeHub assets and aliases
before adding files, prefer owner-published artwork, and fulfill all three public groups
intentionally. Include source provenance and transformations in the developer review, but never
commit provenance metadata or generated review sheets.

Validate logo changes with:

```sh
bun run --cwd apps/logos build
bun run --cwd apps/logos test
bun run --cwd apps/logos review {key}
bun run fix
```
