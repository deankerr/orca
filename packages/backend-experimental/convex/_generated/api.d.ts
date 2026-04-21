/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as catalog_endpoints_index from "../catalog/endpoints/index.js";
import type * as catalog_endpoints_ingest from "../catalog/endpoints/ingest.js";
import type * as catalog_endpoints_queries from "../catalog/endpoints/queries.js";
import type * as catalog_endpoints_table from "../catalog/endpoints/table.js";
import type * as catalog_hash from "../catalog/hash.js";
import type * as catalog_models_index from "../catalog/models/index.js";
import type * as catalog_models_queries from "../catalog/models/queries.js";
import type * as catalog_models_table from "../catalog/models/table.js";
import type * as catalog_providers_index from "../catalog/providers/index.js";
import type * as catalog_providers_queries from "../catalog/providers/queries.js";
import type * as catalog_providers_table from "../catalog/providers/table.js";
import type * as catalog_shared from "../catalog/shared.js";
import type * as catalog_versions_index from "../catalog/versions/index.js";
import type * as catalog_versions_queries from "../catalog/versions/queries.js";
import type * as catalog_versions_table from "../catalog/versions/table.js";
import type * as crons from "../crons.js";
import type * as endpoints from "../endpoints.js";
import type * as ingest from "../ingest.js";
import type * as ingestion_collect from "../ingestion/collect.js";
import type * as ingestion_endpoint from "../ingestion/endpoint.js";
import type * as ingestion_index from "../ingestion/index.js";
import type * as ingestion_model from "../ingestion/model.js";
import type * as ingestion_provider from "../ingestion/provider.js";
import type * as ingestion_shared from "../ingestion/shared.js";
import type * as lib_functionSpec from "../lib/functionSpec.js";
import type * as models from "../models.js";
import type * as providers from "../providers.js";
import type * as wipe from "../wipe.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "catalog/endpoints/index": typeof catalog_endpoints_index;
  "catalog/endpoints/ingest": typeof catalog_endpoints_ingest;
  "catalog/endpoints/queries": typeof catalog_endpoints_queries;
  "catalog/endpoints/table": typeof catalog_endpoints_table;
  "catalog/hash": typeof catalog_hash;
  "catalog/models/index": typeof catalog_models_index;
  "catalog/models/queries": typeof catalog_models_queries;
  "catalog/models/table": typeof catalog_models_table;
  "catalog/providers/index": typeof catalog_providers_index;
  "catalog/providers/queries": typeof catalog_providers_queries;
  "catalog/providers/table": typeof catalog_providers_table;
  "catalog/shared": typeof catalog_shared;
  "catalog/versions/index": typeof catalog_versions_index;
  "catalog/versions/queries": typeof catalog_versions_queries;
  "catalog/versions/table": typeof catalog_versions_table;
  crons: typeof crons;
  endpoints: typeof endpoints;
  ingest: typeof ingest;
  "ingestion/collect": typeof ingestion_collect;
  "ingestion/endpoint": typeof ingestion_endpoint;
  "ingestion/index": typeof ingestion_index;
  "ingestion/model": typeof ingestion_model;
  "ingestion/provider": typeof ingestion_provider;
  "ingestion/shared": typeof ingestion_shared;
  "lib/functionSpec": typeof lib_functionSpec;
  models: typeof models;
  providers: typeof providers;
  wipe: typeof wipe;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
