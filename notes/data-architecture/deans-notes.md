# dean's notes

- OpenRouter's API endpoints are cached by Cloudflare, have extremely heavy and wasteful data structures, and are pinged constantly while you're on their website. They do not notice or care how often you're hitting them.

- We can only know if an endpoint is no longer available by querying for endpoints of that model, successfully retrieving a result and comparing it with our current knowledge of existing endpoints. If we fail to fetch a result, we have to explicitly declare it as such, otherwise it can look like those endpoints are gone when performing a simple diff of the total collected endpoints dataset vs existing. This is issue is further complicated by the fact that if a model has 0 endpoints, the endpoints endpoint returns a 404 error.

- `crawl_id` shouldn't continue as a concept, and I'm tired of looking at UNIX timestamps which are opaque to me. ISO timestamps are preferrable.

- Don't design for compability with the previous `backend` systems - we have full, raw API outputs as our back catalogue. Design the best system for now and the future.

- There is no guarentee that an observation will be present at specific time, or capture interval.

## OR Endpoints

```
from my significant lived experience of analysing this artifact: it's critical that the deduping process happen in the worker, before any eyes are laid upon the data. we could do this via the /raw/<captured_at> route (or something else), leaving raw forms still accessible to be requested directly by filename is we need them (we won't).

* any differences between a record and nested/embedded/duplicated copy are not significant - just artifacts of the OR's careless backend/API hygiene
* it's extremely distracting
* it reduces the amount of data we need to consider from ~16MB to ~5MB
* we need single, stable versions of each entity

the provider list must be deduped globally across the observation set. each endpoints groups can recover their model from the embedded version each of them carry. unbundled.ts flattens model and endpoint lists for the json-diff-ts demonstration, but it's reasonable to keep the related pairs clustered together.

the raw model API output data is mostly useless for us here, but curiously it contains OR's entire model catalog history, including models that have long since been deprecated and have no endpoints (e.g. openai/gpt-3.5-turbo-0125, anthropic/claude-instant-1). we're not dealing with historical models at this time and there's is nothing really interesting here about them. however this list can be turned into something useful: a map of model slug to a boolean which is false if the model's endpoint field was null, or true if it was not null. if the model has an endpoint, use `endpoint.model_variant_slug` as its key.
```

- (/models) slugs with a `~` prefix, e.g. `~openai/gpt-latest, ~anthropic/claude-fable-latest` are pointers and their permaslug does not yield endpoints.
