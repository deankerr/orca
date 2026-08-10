# Agent observability index

Tools for inspecting Cloudflare / Alchemy deployments and runtime. Prefer **read** operations unless
mutation is explicitly requested.

**Start with the Alchemy CLI.** It is stack- and stage-aware: resolve the relevant resource names and
Cloudflare IDs first, then target MCP tools with those IDs. Do not search the whole account for
project resources when Alchemy state already names them.

Related: Alchemy + Effect coding notes in `notes/reports/alchemy.md`.

---

## Alchemy CLI (entry point)

**Entry:** from the stack package (e.g. `apps/engine`): `bunx alchemy <cmd>`  
**Auth:** `~/.alchemy/profiles.json`, or `--profile` / `$ALCHEMY_PROFILE`  
**Default stage:** `dev_${USER}` (`--stage`)  
**Main file:** optional; defaults to `alchemy.run.ts`  
**Shared flags:** `--env-file`, `--profile`; state reads support `--local` (local `.alchemy/state`
instead of the remote state store)

### Targeting workflow

```text
state stacks | tree
  → state stages --stack S
  → state resources --stack S --stage T
  → state get --stack S --stage T --fqn ID
  → use attr / bindings IDs with Cloudflare MCPs and logs --filter
```

Hierarchy: **stacks → stages → resources** (logical IDs / FQNs).  
Examples: `Worker`, `Current`, `Endpoints`, `Worker/EndpointsConsumer` (namespaced under parent).

### State and plan

| Command                                  | Offers                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `state stacks`                           | Stack names in the configured state store                          |
| `state stages --stack S`                 | Stages for one stack                                               |
| `state resources --stack S --stage T`    | Logical resource IDs in a stage                                    |
| `state get --stack S --stage T --fqn ID` | Full JSON record for one resource                                  |
| `state tree`                             | All stacks → stages → resource IDs                                 |
| `plan`                                   | Diff local stack definition vs remote (create / update / noop / …) |

#### `state get` record fields

| Field                              | Meaning                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `status`                           | e.g. `created`, `updated`                                                                                                          |
| `fqn` / `logicalId` / `instanceId` | Identity in state                                                                                                                  |
| `resourceType`                     | e.g. `Cloudflare.Worker`, `Cloudflare.D1Database`, `Cloudflare.R2.Bucket`, `Cloudflare.Queues.Queue`, `Cloudflare.Queues.Consumer` |
| `props`                            | Desired inputs (migrations dir, consumer settings, worker main, …)                                                                 |
| `attr`                             | Provider outputs after apply (Cloudflare IDs, URLs, settings)                                                                      |
| `bindings`                         | Wiring into other resources (D1 / queue / R2 payloads, cron, …)                                                                    |
| `downstream`                       | Dependent resource FQNs                                                                                                            |
| `removalPolicy`                    | e.g. `destroy`                                                                                                                     |
| `providerMode`                     | e.g. `live` vs local                                                                                                               |

#### Useful `attr` / bindings by type

| Type               | Signals                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Worker**         | `workerId` / `workerName`, `url` / `urls`, `accountId`, `crons[]`, `logpush`, `routes[]`, `tags[]`, `hash.bundle` / `hash.metadata`, binding list (D1 id, queue name/id, R2 bucket) |
| **D1**             | `databaseId`, `databaseName`, `accountId`, `jurisdiction`, `migrationsDir`, `migrationsTable`, `migrationsHashes` (file → applied content hash), `importHashes`                     |
| **R2**             | `bucketName`, `accountId`, `storageClass`, `jurisdiction`, `location`, `lifecycleRules`, `cors`, `domains`                                                                          |
| **Queue**          | `queueId`, `queueName`, `accountId`                                                                                                                                                 |
| **Queue consumer** | `consumerId`, `queueId`, `scriptName`, `settings` (`batchSize`, `maxConcurrency`, `maxRetries`, …)                                                                                  |

### Logs

| Command                                                                   | Offers                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `logs [--stage T] [--filter ID1,ID2] [--since duration\|iso] [--limit N]` | Bounded pull of resource stdout / console (Workers Logs) |
| `tail [--stage T] [--filter ID1,ID2]`                                     | Live stream (blocking)                                   |

`--filter` takes comma-separated **logical resource IDs** (same FQNs as state), e.g. `Worker`.  
`--since`: relative (`1h`, `30m`) or absolute ISO. Application `console` / Effect logs appear when
emitted.

### Other CLI (mutate or account)

`deploy`, `dev`, `destroy`, `sync`, `login`, `profile`, `cloudflare`, `aws`, `unsafe`; state
`clear` (destructive).

---

## MCP: cloudflare-api

**Auth:** Cloudflare OAuth. This environment is typically **read-only**; fine-grained write scopes
can be granted when authorizing, and the OpenAPI still lists POST/PUT/PATCH/DELETE (visible via
`search` even if the token cannot call them).

**Scope:** account REST API. `execute` injects `accountId`. Resolve Worker names, queue ids, D1 ids
from Alchemy `state get` first.

| Tool      | Offers                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| `search`  | Query the Cloudflare OpenAPI (path, method, schema)                              |
| `execute` | JS with `cloudflare.request({ method, path, query, body })` against the live API |
| `docs`    | Cloudflare documentation search                                                  |

Discover endpoints with `search`, then call with `execute`. High-value GET patterns once IDs are
known:

| Area                   | Path pattern                            | Offers                                                                                                   |
| ---------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Worker settings        | `…/workers/scripts/{name}/settings`     | Live bindings, compatibility, tags, observability config, logpush                                        |
| Cron                   | `…/workers/scripts/{name}/schedules`    | Cron expressions                                                                                         |
| Deployments / versions | `…/deployments`, `…/versions`           | Version id, % rollout, author, timestamps                                                                |
| Subdomain              | `…/workers/subdomain`, script subdomain | Account `*.workers.dev` root; per-script enabled                                                         |
| Queue                  | `…/queues/{id}`                         | Retention, producers/consumers, consumer settings                                                        |
| Queue metrics          | `…/queues/{id}/metrics`                 | `backlog_count`, backlog bytes, oldest message timestamp                                                 |
| D1                     | `…/d1/database/{id}`                    | Size, region, table meta                                                                                 |
| R2 bucket              | `…/r2/buckets/{name}`                   | Bucket meta (location, storage class, jurisdiction, created)                                             |
| R2 list objects        | `…/r2/buckets/{name}/objects`           | Keys, size, etag, last_modified, http/custom metadata; query `prefix`, `delimiter`, `cursor`, `per_page` |
| R2 get object          | `…/r2/buckets/{name}/objects/{key}`     | Object body (OpenAPI; S3/Worker binding also fine for heavy reads)                                       |
| R2 account metrics     | `…/r2/metrics`                          | Account-level object/payload/metadata sizes (Standard + Infrequent Access)                               |

---

## MCP: cloudflare-observability

**Auth:** Cloudflare Observability OAuth  
**Scope:** Workers runtime. Filter by `$metadata.service` = **workerName** from Alchemy Worker attr.

| Tool                                  | Offers                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `workers_list` / `workers_get_worker` | Worker names, ids, modified times                                       |
| `workers_get_worker_code`             | Bundled Worker source                                                   |
| `observability_keys`                  | Field names present in a time window                                    |
| `observability_values`                | Distinct values for a key (e.g. services)                               |
| `query_worker_observability`          | **events** · **calculations** (count / avg / p99 / …) · **invocations** |

Typical fields: `$metadata.service`, `.trigger`, `.origin`, `.message`, `.level`, `.requestId`,
`.error`; request path/method/status; `cpuTimeMs` / `wallTimeMs`; ray id; outcome.  
Filters: eq / includes / regex / exists / … on keys verified via keys/values.

---

## MCP: cloudflare-bindings

**Auth:** Cloudflare OAuth (scopes may include write).  
**Scope:** data-plane resources. Prefer ids from Alchemy state over listing the whole account.

| Tool                                                              | Offers                                        |
| ----------------------------------------------------------------- | --------------------------------------------- |
| `workers_list` / `workers_get_worker` / `workers_get_worker_code` | Worker identity and bundled code              |
| `d1_databases_list` / `d1_database_get`                           | DB name, uuid, size, region, table count meta |
| `d1_database_query`                                               | SQL against a D1 uuid                         |
| `r2_buckets_list` / `r2_bucket_get`                               | Bucket name, location, storage class, created |
| `kv_namespaces_list` / `kv_namespace_get`                         | KV namespaces                                 |
| `hyperdrive_configs_list` / `hyperdrive_config_get`               | Hyperdrive configs                            |
| D1 / R2 / KV / Hyperdrive create, delete, edit                    | Mutations when token allows                   |

---

## MCP: cloudflare-builds

**Auth:** Cloudflare Workers Builds OAuth  
**Scope:** Git-connected **Workers Builds** (GitHub/GitLab CI → deploy). Alchemy/API uploads show as
Worker versions (cloudflare-api), not Builds history.

| Tool                                  | Offers                                              |
| ------------------------------------- | --------------------------------------------------- |
| `workers_list` / `workers_get_worker` | Worker names and **id** (tag UUID)                  |
| `workers_get_worker_code`             | Bundled source                                      |
| `workers_builds_list_builds`          | Paginated builds for a **workerId**                 |
| `workers_builds_get_build`            | Build detail: status, timing, build/deploy commands |
| `workers_builds_get_build_logs`       | Logs for a **buildUUID**                            |

---

## MCP: cloudflare-docs

| Tool                              | Offers                                       |
| --------------------------------- | -------------------------------------------- |
| `search_cloudflare_documentation` | Semantic search over Cloudflare product docs |
| `migrate_pages_to_workers_guide`  | Pages → Workers migration guide              |
