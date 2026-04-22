/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as catalog_components from "../catalog/components.js";
import type * as catalog_endpoints_index from "../catalog/endpoints/index.js";
import type * as catalog_endpoints_ingest from "../catalog/endpoints/ingest.js";
import type * as catalog_endpoints_queries from "../catalog/endpoints/queries.js";
import type * as catalog_hash from "../catalog/hash.js";
import type * as catalog_index from "../catalog/index.js";
import type * as catalog_models_index from "../catalog/models/index.js";
import type * as catalog_models_ingest from "../catalog/models/ingest.js";
import type * as catalog_models_queries from "../catalog/models/queries.js";
import type * as catalog_providers_index from "../catalog/providers/index.js";
import type * as catalog_providers_ingest from "../catalog/providers/ingest.js";
import type * as catalog_providers_queries from "../catalog/providers/queries.js";
import type * as collection_parsers_endpoint from "../collection/parsers/endpoint.js";
import type * as collection_parsers_model from "../collection/parsers/model.js";
import type * as collection_parsers_provider from "../collection/parsers/provider.js";
import type * as collection_workflow from "../collection/workflow.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as endpoints from "../endpoints.js";
import type * as lib_functionSpec from "../lib/functionSpec.js";
import type * as models from "../models.js";
import type * as providers from "../providers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "catalog/components": typeof catalog_components;
  "catalog/endpoints/index": typeof catalog_endpoints_index;
  "catalog/endpoints/ingest": typeof catalog_endpoints_ingest;
  "catalog/endpoints/queries": typeof catalog_endpoints_queries;
  "catalog/hash": typeof catalog_hash;
  "catalog/index": typeof catalog_index;
  "catalog/models/index": typeof catalog_models_index;
  "catalog/models/ingest": typeof catalog_models_ingest;
  "catalog/models/queries": typeof catalog_models_queries;
  "catalog/providers/index": typeof catalog_providers_index;
  "catalog/providers/ingest": typeof catalog_providers_ingest;
  "catalog/providers/queries": typeof catalog_providers_queries;
  "collection/parsers/endpoint": typeof collection_parsers_endpoint;
  "collection/parsers/model": typeof collection_parsers_model;
  "collection/parsers/provider": typeof collection_parsers_provider;
  "collection/workflow": typeof collection_workflow;
  crons: typeof crons;
  dev: typeof dev;
  endpoints: typeof endpoints;
  "lib/functionSpec": typeof lib_functionSpec;
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
