# Provider identity and catalog shape

**The user-facing choice remains model plus provider tag.** UUIDs are useful for joining research
history, but they are not a product distinction OpenRouter users can address.

The rebuilt population contains 1,267 current endpoint records but 1,257 model/tag choices. There are
ten current same-model/same-tag collision groups. Nine have identical effective pricing; one differs.
The differing group is `qwen/qwen3-235b-a22b-2507` on `google-vertex/us-south1`, with two prompt rates
of `0.00000025` and `0.00000022`, and completion rates of `0.000001` and `0.00000088`.

The nine identical groups belong to BaseTen. This is a small identity/data presentation issue rather
than a reason to expose all endpoint UUIDs or ask users to resolve internal records. Current ranking
calculations collapse identical meter maps and exclude conflicting ones. The CSV preserves both
underlying records so the conflict is reviewable.

Across retained history, 82 model/tag groups map to multiple UUIDs. This is a count using **latest
retained labels**, not proof of tag churn or renaming. Pricing/listing history does not carry a full
historical identity snapshot. Sequential UUIDs under one tag can be replacements; concurrent UUIDs
can be duplicates; neither inference is established by the label alone.

Provider-tag content is not parsed for capabilities, service quality, region or quantization.
Organization-level comparisons use explicit provider-name metadata. The data does not justify a
permanent “stable provider” or “chaotic provider” category: pricing behavior varies by model and time.
See [activity](activity.md) for the measured concentration within organizations.

For the chart, historical breadth can matter even when only a subset is listed now. GLM 5.2 has 48
historical tags and 31 current choices, while Opus 4.8 has twelve historical tags and eleven current
choices. User-controlled slicing should have access to that history without inventing additional
user identities from UUIDs.

Sources: [current collisions](data/current_collisions.csv), [historical UUID reuse](data/identity_reuse.csv),
[model breadth](data/models.csv), [methods](methods.md).
