# Objects

Named, insert-only source objects with one deployment-wide read source. Consumers receive logical
text; Objects owns storage locators, UTF-8, gzip, and transport.

## Source constraints

`ORCA_OBJECTS_SOURCE_DEPLOYMENT` redirects reads and discovery to a deployment name, not a URL.
Absent/empty reads locally. Source and consumer must share a nonempty `ORCA_OBJECTS_API_KEY`.
Project defaults already configure the source and matching key for new dev and preview deployments;
see [development data](../../../../docs/orca/development-data.md).

- Reads and discovery use the configured source; writes and deletion always target local objects.
- Keep the source fixed while a timeline exists or processor work is outstanding.
- Remote serving reads local storage directly, so requests remain one hop even if the server has a source override.
- Selecting the current deployment as its own source is rejected.
- Source/authentication failures propagate without silently falling back to local objects.
- Missing identities return null; an existing locator with a missing blob is an error.
- Batch results preserve requested identity order, including missing entries.

The source returns stored compressed bytes without recompression; decoding belongs to the consumer.

Discovery defaults to ascending names. `order: 'desc'` reverses the order before applying the limit;
`atOrAfter` remains an inclusive lower bound in either direction. An empty bound and limit of one
select the greatest name. Deploy the source's optional-order support before consumers request it.
