# Branding

Scope: the ORCA mark and wordmark in `apps/start`. It does not apply to `apps/web`, which keeps its own legacy marks.

## The mark

- The mark is an orca's head: a dark disc with a light, tilted ellipse for the white eye patch.
- Polarity is fixed: the head is dark and the patch is light. Never invert it.
- On a dark UI the head sits on a light rounded tile with no rim or stroke; `apps/start` is dark-only for now.
- On a light surface the bare head is the whole mark and needs no tile.

## Geometry and colours

The artwork lives in a 64×64 viewBox.

| Part  | Shape                                                                       | Fill      |
| ----- | --------------------------------------------------------------------------- | --------- |
| Tile  | rect 64×64, rx 16                                                           | `#fafafa` |
| Head  | circle cx 32, cy 32, r 32, in `<g transform="translate(8 8) scale(0.75)">`  | `#0a0a0a` |
| Patch | ellipse rx 13, ry 6, `transform="translate(39 24) rotate(-33)"`, same group | `#fafafa` |

## Wordmark

- "ORCA" in uppercase Geist sans, 15px, line-height 20px, weight 650, tracking 0.06em.
- It sits beside a 24px mark with a 10px gap.

## Rules

- The mark never stands in for a letter, such as an orb replacing the O in "ORCA".
- No rim or outline versions of the mark.
- No lowercase wordmark.

## Assets

- `OrbMark` in `apps/start/src/app/orb-mark.tsx` is the source of truth; `header-bar.tsx` pairs it with the wordmark.
- `apps/start/public/favicon.svg` repeats the same geometry and colours; update it with `OrbMark`.
- `apps/start/public/logo.png` is a 512×512 render of the favicon with transparent corners outside the tile.
- Regenerate it after any favicon change, from the repository root:

```sh
rsvg-convert -w 512 -h 512 apps/start/public/favicon.svg -o apps/start/public/logo.png
```

## Fallback avatars

- The fallback entity artwork in `apps/logos` is a separate concern with its own palette, outside this document.
- Its source is `apps/logos/src/orb-ring-mark.svg`, and `fallback-image.ts` recolours it per asset group.
