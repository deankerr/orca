/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as catalog_endpoints_commit from "../catalog/endpoints/commit.js";
import type * as catalog_endpoints_index from "../catalog/endpoints/index.js";
import type * as catalog_endpoints_queries from "../catalog/endpoints/queries.js";
import type * as catalog_index from "../catalog/index.js";
import type * as catalog_models_commit from "../catalog/models/commit.js";
import type * as catalog_models_index from "../catalog/models/index.js";
import type * as catalog_models_queries from "../catalog/models/queries.js";
import type * as catalog_providers_commit from "../catalog/providers/commit.js";
import type * as catalog_providers_index from "../catalog/providers/index.js";
import type * as catalog_providers_queries from "../catalog/providers/queries.js";
import type * as collection_parsers_endpoint from "../collection/parsers/endpoint.js";
import type * as collection_parsers_model from "../collection/parsers/model.js";
import type * as collection_parsers_provider from "../collection/parsers/provider.js";
import type * as collection_workflow from "../collection/workflow.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as endpoints from "../endpoints.js";
import type * as lib_functionSpec from "../lib/functionSpec.js";
import type * as lib_hash from "../lib/hash.js";
import type * as models from "../models.js";
import type * as providers from "../providers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "catalog/endpoints/commit": typeof catalog_endpoints_commit;
  "catalog/endpoints/index": typeof catalog_endpoints_index;
  "catalog/endpoints/queries": typeof catalog_endpoints_queries;
  "catalog/index": typeof catalog_index;
  "catalog/models/commit": typeof catalog_models_commit;
  "catalog/models/index": typeof catalog_models_index;
  "catalog/models/queries": typeof catalog_models_queries;
  "catalog/providers/commit": typeof catalog_providers_commit;
  "catalog/providers/index": typeof catalog_providers_index;
  "catalog/providers/queries": typeof catalog_providers_queries;
  "collection/parsers/endpoint": typeof collection_parsers_endpoint;
  "collection/parsers/model": typeof collection_parsers_model;
  "collection/parsers/provider": typeof collection_parsers_provider;
  "collection/workflow": typeof collection_workflow;
  crons: typeof crons;
  dev: typeof dev;
  endpoints: typeof endpoints;
  "lib/functionSpec": typeof lib_functionSpec;
  "lib/hash": typeof lib_hash;
  models: typeof models;
  providers: typeof providers;
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
