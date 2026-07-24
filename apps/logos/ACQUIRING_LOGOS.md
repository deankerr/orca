# Acquiring Missing Logos

This runbook turns a missing public logo key into reviewable source assets for the entity logo
service. It is written for coding agents, but the same evidence and checks apply to manual work.

## Definition of Done

A logo key is fulfilled when:

- every public group (`light`, `dark`, and `avatar`) resolves to an intentional asset;
- every generated asset has a transparent 128×128 canvas;
- the files identify the requested entity, use the exact public key as their filename, and build
  successfully;
- the generated WebP files remain legible at the sizes used by ORCA;
- the developer review includes the source provenance and any transformations without committing
  that review metadata to the repository; and
- the logo build, logo tests, and repository formatter/checker pass.

## 1. Confirm the Key

Logo keys come from the lowercased author or provider segment of an OpenRouter slug. Preserve
punctuation: `x-ai` and `black-forest-labs` are valid keys.

Before acquiring anything:

1. Search `sources/`, `sources/aliases.json`, and the installed LobeHub packages for the key and
   obvious spelling variants.
2. Confirm that the requested entity is the one represented by the slug. Do not guess from a
   similar company name.
3. Prefer an alias when the service already has the same entity under another key.

## 2. Choose an Authoritative Source

Use the first viable source in this order:

1. an owner-published brand or press kit;
2. an asset referenced by the owner's current website, structured metadata, documentation, or
   official application;
3. an asset in the owner's official source repository;
4. a reputable third-party catalog only when it identifies its upstream source and the owner does
   not publish a usable asset.

Image search results and logo-download sites are discovery aids, not provenance. Never recreate a
trademark with image generation or trace a raster image when an official vector or adequate raster
exists.

Start by looking for square or nearly square assets. High-resolution app icons, Apple touch icons,
social avatars, and standalone logomarks are especially useful. A desirable avatar usually has a
solid-color square background because its bounds and contrast remain clear without relying on the
surrounding UI.

Useful SVGs are not always linked as files. Inspect the page HTML for embedded SVG elements,
especially in the header or among the first elements rendered on the page, and extract an embedded
mark when it is authoritative and self-contained.

Check that the asset is current, belongs to the intended entity, and is suitable for third-party
identification. If the owner's usage terms prohibit the intended use or permission is unclear,
record the issue and escalate it rather than silently substituting another source.

## 3. Classify the Available Artwork

Never collect or publish a wordmark. ORCA displays logos in small, near-square containers where
wordmarks become illegible.

- `light/` is artwork for a light surface, usually the dark or full-color mark.
- `dark/` is artwork for a dark surface, usually the white or light mark.
- `avatar/` is the compact, color-independent or owner-published app/avatar icon.
- `base/` supplies the same best-effort asset to all three groups.

Choose the strategy that matches the available artwork.

### Monochrome Theme Pair

Light and dark monochrome variants must have identical geometry, sizing, and viewBox. Their only
artwork difference is the inversion between pure black (`#000000`) and pure white (`#ffffff`). If
the owner publishes only one pure black or white SVG on a transparent background, create the
inverted theme variant; otherwise one mode will make the mark invisible. Add a separate avatar when
the owner publishes a more suitable app icon or solid-background square.

### Single Color or Complex Asset

Many brands publish only one usable mark, and it may be colorful, detailed, or unsuitable for
black/white inversion. Put that asset in `base/`; the build intentionally copies it across
`light`, `dark`, and `avatar` as a best effort. This is usually acceptable, but the review sheet
must show all three resolved outputs so contrast problems remain visible.

### Composite Logo and Wordmark

When no standalone square mark is available, look for a vector that combines a logo with a
wordmark. The logo portion can usually be extracted safely by retaining only its paths and
normalizing the resulting viewBox. Do not retain the wordmark paths. Composite logo SVGs commonly
appear near the top of a page or inline in its initial HTML.

Use group-specific files when the owner publishes real variants. A build warning for a manual key
means the quest is incomplete unless the missing groups are already supplied upstream.

Prefer SVG, then a transparent raster at least 128 px on its shortest useful dimension. Avoid
screenshots, tiny favicons, excessive transparent padding, and artwork that relies on external
fonts or URLs. A deliberate solid-color app-icon background is useful, not a baked-in background
to remove. Preserve owner-published path geometry instead of redrawing it. It is safe to adjust an
SVG's width, height, and viewBox to create a square canvas, isolate a logo from a wordmark, or make
a consistent theme pair. If a source must be cropped, extracted, recolored beyond black/white
inversion, or otherwise normalized, document the transformation in the developer review.

## 4. Inspect Before Check-in

For SVG files, inspect the text and reject active or remote content such as scripts, event
handlers, external references, and linked fonts. Confirm that the `viewBox` encloses the artwork
and that fills will rasterize to the intended colors.

For raster files, confirm the format, dimensions, alpha channel, useful-pixel bounds, and visual
quality. Do not upscale a low-resolution source merely to satisfy a nominal dimension.

Add the selected files as:

```txt
sources/base/{key}.{ext}
sources/light/{key}.{ext}
sources/dark/{key}.{ext}
sources/avatar/{key}.{ext}
```

Only create the files that match the selected variant strategy.

## 5. Prepare the Developer Review

Present provenance with the generated review sheet. For every acquired source, include:

- the resolved group and repository-relative source file;
- the direct upstream URL;
- the owner page or repository that established the asset's authority when it is not obvious from
  the direct URL;
- the UTC retrieval date;
- the original format and dimensions when relevant; and
- every extraction, viewBox adjustment, crop, background decision, or color transformation.

Provenance belongs in the developer review or handoff only. Do not commit a provenance catalog,
downloaded source page, review note, or generated review sheet to the repository. The review
evidence does not grant trademark or copyright permission.

## 6. Build and Review

From the repository root:

```sh
bun run --cwd apps/logos build
bun run --cwd apps/logos test
bun run --cwd apps/logos review {key}
```

Inspect `apps/logos/dist/v1/manifest.json` and confirm the key has all three groups, the expected
manual source paths, no alias, a 128×128 canvas in every group, and no coverage warning. Review the
generated sheet: light must use pure white, dark must use pure black, and avatar transparency must
be visible through the pure black/white alpha grid. Also inspect the assets at the small UI sizes
used by ORCA.

Finish with the repository-required check:

```sh
bun run fix
```

Review every file changed by that command before handing off.

## Known Process Gaps

These defaults make acquisition repeatable, but the service does not yet enforce all of them:

- the `avatar` contract does not specify how to resolve an icon that works poorly in one UI theme;
- provenance intentionally lives in developer-review history rather than the codebase;
- there is no freshness policy or owner for detecting rebrands; and
- trademark/usage review has no project-level escalation policy.

Until those are resolved, agents should follow this runbook, state any exception explicitly, and
avoid making irreversible artwork changes.
