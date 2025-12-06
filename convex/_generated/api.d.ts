/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_bundleSync from "../admin/bundleSync.js";
import type * as admin_postSyncMaintenance from "../admin/postSyncMaintenance.js";
import type * as analysis_changes from "../analysis/changes.js";
import type * as analysis_endpoints from "../analysis/endpoints.js";
import type * as analysis_stats from "../analysis/stats.js";
import type * as changes from "../changes.js";
import type * as crons from "../crons.js";
import type * as db_index from "../db/index.js";
import type * as db_or_sources from "../db/or/sources.js";
import type * as db_or_stats from "../db/or/stats.js";
import type * as db_or_views_changes from "../db/or/views/changes.js";
import type * as db_or_views_endpoints from "../db/or/views/endpoints.js";
import type * as db_or_views_models from "../db/or/views/models.js";
import type * as db_or_views_providers from "../db/or/views/providers.js";
import type * as db_snapshot_crawl_archives from "../db/snapshot/crawl/archives.js";
import type * as db_snapshot_crawl_config from "../db/snapshot/crawl/config.js";
import type * as db_webhook_subscriptions from "../db/webhook/subscriptions.js";
import type * as endpoints from "../endpoints.js";
import type * as feed from "../feed.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as lib_paginateAndProcess from "../lib/paginateAndProcess.js";
import type * as lib_utils from "../lib/utils.js";
import type * as lib_vTable from "../lib/vTable.js";
import type * as lib_validator from "../lib/validator.js";
import type * as models from "../models.js";
import type * as providers from "../providers.js";
import type * as public_api_preview_v1 from "../public_api/preview_v1.js";
import type * as public_api_preview_v2 from "../public_api/preview_v2.js";
import type * as shared_logos from "../shared/logos.js";
import type * as shared_pricing from "../shared/pricing.js";
import type * as shared_utils from "../shared/utils.js";
import type * as snapshots_crawl_main from "../snapshots/crawl/main.js";
import type * as snapshots_materialize_main from "../snapshots/materialize/main.js";
import type * as snapshots_materialize_output from "../snapshots/materialize/output.js";
import type * as snapshots_materialize_validators_endpoints from "../snapshots/materialize/validators/endpoints.js";
import type * as snapshots_materialize_validators_models from "../snapshots/materialize/validators/models.js";
import type * as snapshots_materialize_validators_providers from "../snapshots/materialize/validators/providers.js";
import type * as snapshots_materializedChanges_main from "../snapshots/materializedChanges/main.js";
import type * as snapshots_materializedChanges_output from "../snapshots/materializedChanges/output.js";
import type * as snapshots_materializedChanges_process from "../snapshots/materializedChanges/process.js";
import type * as snapshots_shared_bundle from "../snapshots/shared/bundle.js";
import type * as snapshots_shared_icons from "../snapshots/shared/icons.js";
import type * as snapshots_stats_main from "../snapshots/stats/main.js";
import type * as snapshots_webhooks_dev from "../snapshots/webhooks/dev.js";
import type * as snapshots_webhooks_discord_embeds from "../snapshots/webhooks/discord/embeds.js";
import type * as snapshots_webhooks_embeds from "../snapshots/webhooks/embeds.js";
import type * as snapshots_webhooks_inputs from "../snapshots/webhooks/inputs.js";
import type * as snapshots_webhooks_main from "../snapshots/webhooks/main.js";
import type * as snapshots_webhooks_send from "../snapshots/webhooks/send.js";
import type * as storage from "../storage.js";
import type * as transforms_changes from "../transforms/changes.js";
import type * as transforms_endpoint from "../transforms/endpoint.js";
import type * as transforms_endpointChange from "../transforms/endpointChange.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/bundleSync": typeof admin_bundleSync;
  "admin/postSyncMaintenance": typeof admin_postSyncMaintenance;
  "analysis/changes": typeof analysis_changes;
  "analysis/endpoints": typeof analysis_endpoints;
  "analysis/stats": typeof analysis_stats;
  changes: typeof changes;
  crons: typeof crons;
  "db/index": typeof db_index;
  "db/or/sources": typeof db_or_sources;
  "db/or/stats": typeof db_or_stats;
  "db/or/views/changes": typeof db_or_views_changes;
  "db/or/views/endpoints": typeof db_or_views_endpoints;
  "db/or/views/models": typeof db_or_views_models;
  "db/or/views/providers": typeof db_or_views_providers;
  "db/snapshot/crawl/archives": typeof db_snapshot_crawl_archives;
  "db/snapshot/crawl/config": typeof db_snapshot_crawl_config;
  "db/webhook/subscriptions": typeof db_webhook_subscriptions;
  endpoints: typeof endpoints;
  feed: typeof feed;
  http: typeof http;
  init: typeof init;
  "lib/paginateAndProcess": typeof lib_paginateAndProcess;
  "lib/utils": typeof lib_utils;
  "lib/vTable": typeof lib_vTable;
  "lib/validator": typeof lib_validator;
  models: typeof models;
  providers: typeof providers;
  "public_api/preview_v1": typeof public_api_preview_v1;
  "public_api/preview_v2": typeof public_api_preview_v2;
  "shared/logos": typeof shared_logos;
  "shared/pricing": typeof shared_pricing;
  "shared/utils": typeof shared_utils;
  "snapshots/crawl/main": typeof snapshots_crawl_main;
  "snapshots/materialize/main": typeof snapshots_materialize_main;
  "snapshots/materialize/output": typeof snapshots_materialize_output;
  "snapshots/materialize/validators/endpoints": typeof snapshots_materialize_validators_endpoints;
  "snapshots/materialize/validators/models": typeof snapshots_materialize_validators_models;
  "snapshots/materialize/validators/providers": typeof snapshots_materialize_validators_providers;
  "snapshots/materializedChanges/main": typeof snapshots_materializedChanges_main;
  "snapshots/materializedChanges/output": typeof snapshots_materializedChanges_output;
  "snapshots/materializedChanges/process": typeof snapshots_materializedChanges_process;
  "snapshots/shared/bundle": typeof snapshots_shared_bundle;
  "snapshots/shared/icons": typeof snapshots_shared_icons;
  "snapshots/stats/main": typeof snapshots_stats_main;
  "snapshots/webhooks/dev": typeof snapshots_webhooks_dev;
  "snapshots/webhooks/discord/embeds": typeof snapshots_webhooks_discord_embeds;
  "snapshots/webhooks/embeds": typeof snapshots_webhooks_embeds;
  "snapshots/webhooks/inputs": typeof snapshots_webhooks_inputs;
  "snapshots/webhooks/main": typeof snapshots_webhooks_main;
  "snapshots/webhooks/send": typeof snapshots_webhooks_send;
  storage: typeof storage;
  "transforms/changes": typeof transforms_changes;
  "transforms/endpoint": typeof transforms_endpoint;
  "transforms/endpointChange": typeof transforms_endpointChange;
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

export declare const components: {
  aggregateModelStatsByTime: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
};
