# dean's notes

- OpenRouter's API endpoints are cached by Cloudflare, have extremely heavy and wasteful data structures, and are pinged constantly while you're on their website. They do not notice or care how often you're hitting them.

- We can only know if an endpoint is no longer available by querying for endpoints of that model, successfully retrieving a result and comparing it with our current knowledge of existing endpoints. If we fail to fetch a result, we have to explicitly declare it as such, otherwise it can look like those endpoints are gone when performing a simple diff of the total collected endpoints dataset vs existing. This is issue is further complicated by the fact that if a model has 0 endpoints, the endpoints endpoint returns a 404 error.

- `crawl_id` shouldn't continue as a concept, and I'm tired of looking at UNIX timestamps which are opaque to me. ISO timestamps are preferrable.

- Don't design for compability with the previous `backend` systems - we have full, raw API outputs as our back catalogue. Design the best system for now and the future.

- There is no guarentee that an observation will be present at specific time, or capture interval.
