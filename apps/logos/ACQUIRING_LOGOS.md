# Acquiring missing logos

A public logo key is complete when all three groups resolve to intentional, legible assets
for the requested entity and the build, tests, and repository checks pass.

## Confirm identity

Logo keys are the lowercased author or provider segment of an OpenRouter slug. Preserve punctuation
and use the exact public key as the filename: `x-ai` and `black-forest-labs` are valid keys.

Check `FAILED_LOGO_QUESTS.md` for earlier sourcing evidence, then search `sources/`,
`sources/aliases.json`, and installed LobeHub packages for the key and spelling variants.
Use an alias when the service already has the same entity under another key.

For a provider, inspect the current backend's `GET /providers` record before searching the web.
The `privacy_policy_url`, `terms_of_service_url`, and `status_page_url` fields can identify the
owner's domain when search coverage is sparse. A similar company name does not establish identity.

## Choose a source

Use the first viable source in this order:

1. Owner-published brand or press kit.
2. Artwork referenced by the owner's current website, metadata, documentation, or official application.
3. Artwork in the owner's official source repository.
4. A reputable third-party catalog with an identified upstream source, when the owner publishes no usable asset.

Image search and download sites are discovery aids, not provenance. Never generate a trademark
or trace raster artwork when an official vector or adequate raster exists. Record and escalate
unclear or prohibitive usage terms before publishing the artwork.

Prefer square marks, app icons, or social avatars. Inspect page HTML for self-contained inline SVGs,
including header artwork. Never collect or publish wordmarks: they become illegible in ORCA's small containers.
A composite SVG can supply a mark by retaining its logo paths and normalizing the viewBox.

Prefer SVG, then transparent raster artwork with at least 128 useful pixels on its shortest dimension.
Avoid screenshots, tiny favicons, excess padding, and external fonts or URLs. Preserve path geometry
and deliberate owner-published app-icon backgrounds. Prefer solid square backgrounds for avatars
when the owner supplies them: their bounds and contrast remain clear across UI surfaces.
Do not upscale a poor source to meet the size.

## Choose variants

| Source directory  | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `sources/light/`  | Artwork for a light surface, usually dark or full color       |
| `sources/dark/`   | Artwork for a dark surface, usually white or light            |
| `sources/avatar/` | Compact, color-independent or owner-published app/avatar icon |
| `sources/base/`   | One best-effort asset for every otherwise missing group       |

Monochrome light/dark variants must have identical geometry, sizing, and viewBox; only pure black
(`#000000`) and pure white (`#ffffff`) invert. If the owner publishes one such transparent SVG,
create the inverse so the mark remains visible in both modes. Use a separate owner-published avatar
when it is better suited to the compact display.

A colorful or complex mark can use `base/` when inversion is inappropriate. Review contrast in
all three resolved outputs. Create group-specific files only for intentional variants.

## Inspect source assets

For SVG, reject scripts, event handlers, remote references, and linked fonts. Check that the viewBox
encloses the artwork and that fills rasterize as intended. For raster files, inspect format,
dimensions, alpha, useful-pixel bounds, and visual quality.

Save only the selected variants as `sources/{group}/{key}.{ext}`.

## Build and review

Run from the repository root:

```sh
bun run --cwd apps/logos generate
bun run --cwd apps/logos test
bun run --cwd apps/logos review {key}
bun run fix
```

Inspect `apps/logos/dist/v1/manifest.json`: the key must resolve all groups with the expected source
paths and no alias for a newly acquired manual asset, with no coverage warning. Each generated canvas
must be transparent and use the dimensions recorded in `docs/orca/config.md`. Inspect the review
sheet and the assets at ORCA's small display sizes.
Review every file changed by formatting before handoff.

For every acquired source, include these facts with the generated review sheet:

- Resolved group and repository-relative source file.
- Direct upstream URL.
- Owner page or repository establishing authority when the direct URL is insufficient.
- UTC retrieval date.
- Original format and dimensions when relevant.
- Every extraction, viewBox adjustment, crop, background decision, or color transformation.

Do not commit provenance catalogs, downloaded source pages, review notes, or generated review sheets.
Review evidence does not grant trademark or copyright permission.

## Unresolved policy

The avatar contract has no rule for artwork that works poorly in one UI theme. There is no assigned
rebrand freshness policy or project-level trademark escalation process. State exceptions in the
review and preserve the original artwork so decisions remain reversible.
