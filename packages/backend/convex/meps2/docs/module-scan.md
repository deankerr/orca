# Module: Scan

`scan` fetches OpenRouter and serializes one scan artifact. Failures throw; a failed
fetch returns no file. The caller assigns `scan_at` and stores the result.

Catalog and endpoint-page shape: `docs/openrouter`. `~` aliases are dropped.

## Artifact

UTF-8 JSONL, one model group per line. Schema: `scanArtifactRowSchema`. Extra keys
kept. `path` is `scan`. `artifact_id` is `scan.{scan_at}.jsonl`.

- Nested catalog `endpoint` is a fetch signal. Copy `model_variant_slug` onto
  `model_id` and `variant` onto the envelope, then strip it. Missing nested
  `endpoint`: `model_id` is `slug`, `variant` is `standard`, `endpoints` is `null`.
- Nested `model` on each stats-page endpoint is stripped. Endpoints keep
  `model_variant_slug`. The join is the row.
- ⚠️ `endpoints: null` is “we did not look.” `[]` is “we looked, and the page was
  empty.”
- ⚠️ Variant is the envelope field, not a `:suffix` on `model_id`.
- Duplicate `model_id` or endpoint `id` in the file is kept. Explode last-wins.
- Text-in/text-out filtering is `projections`.

Any fetch error fails the whole scan. A 404 on a non-`~` endpoint page fails the
scan (upstream 404 can mean “no endpoints now”; we still require a complete
observation).
