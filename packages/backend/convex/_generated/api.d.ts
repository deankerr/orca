/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as alerts_discord_delivery from "../alerts/discord/delivery.js";
import type * as alerts_discord_frequency from "../alerts/discord/frequency.js";
import type * as alerts_discord_prepare from "../alerts/discord/prepare.js";
import type * as alerts_discord_render from "../alerts/discord/render.js";
import type * as alerts_discord_renderers_batchCards from "../alerts/discord/renderers/batchCards.js";
import type * as alerts_discord_renderers_card from "../alerts/discord/renderers/card.js";
import type * as alerts_discord_renderers_display from "../alerts/discord/renderers/display.js";
import type * as alerts_discord_renderers_endpointCard from "../alerts/discord/renderers/endpointCard.js";
import type * as alerts_discord_renderers_fields from "../alerts/discord/renderers/fields.js";
import type * as alerts_discord_renderers_index from "../alerts/discord/renderers/index.js";
import type * as alerts_discord_renderers_modelCard from "../alerts/discord/renderers/modelCard.js";
import type * as alerts_discord_renderers_pricing from "../alerts/discord/renderers/pricing.js";
import type * as alerts_discord_renderers_providerCard from "../alerts/discord/renderers/providerCard.js";
import type * as alerts_feed_http from "../alerts/feed/http.js";
import type * as alerts_feed_query from "../alerts/feed/query.js";
import type * as alerts_feed_render from "../alerts/feed/render.js";
import type * as alerts_feed_text from "../alerts/feed/text.js";
import type * as alerts_monitor_query from "../alerts/monitor/query.js";
import type * as alerts_shared_batch from "../alerts/shared/batch.js";
import type * as alerts_shared_curate from "../alerts/shared/curate.js";
import type * as alerts_shared_decode from "../alerts/shared/decode.js";
import type * as alerts_shared_facts from "../alerts/shared/facts.js";
import type * as alerts_shared_filter from "../alerts/shared/filter.js";
import type * as alerts_shared_prepare from "../alerts/shared/prepare.js";
import type * as alerts_shared_pricing from "../alerts/shared/pricing.js";
import type * as alerts_shared_read from "../alerts/shared/read.js";
import type * as alerts_shared_select from "../alerts/shared/select.js";
import type * as catalog_changes from "../catalog/changes.js";
import type * as catalog_endpoints_ingest from "../catalog/endpoints/ingest.js";
import type * as catalog_endpoints_query from "../catalog/endpoints/query.js";
import type * as catalog_endpoints_table from "../catalog/endpoints/table.js";
import type * as catalog_models_ingest from "../catalog/models/ingest.js";
import type * as catalog_models_query from "../catalog/models/query.js";
import type * as catalog_models_table from "../catalog/models/table.js";
import type * as catalog_project from "../catalog/project.js";
import type * as catalog_providers_ingest from "../catalog/providers/ingest.js";
import type * as catalog_providers_query from "../catalog/providers/query.js";
import type * as catalog_providers_table from "../catalog/providers/table.js";
import type * as catalog_stats_ingest from "../catalog/stats/ingest.js";
import type * as catalog_stats_query from "../catalog/stats/query.js";
import type * as catalog_stats_table from "../catalog/stats/table.js";
import type * as clock from "../clock.js";
import type * as collectors_analytics from "../collectors/analytics.js";
import type * as collectors_scan from "../collectors/scan.js";
import type * as collectors_topApps from "../collectors/topApps.js";
import type * as compare from "../compare.js";
import type * as crons from "../crons.js";
import type * as entities from "../entities.js";
import type * as entityLogo from "../entityLogo.js";
import type * as events_ingest from "../events/ingest.js";
import type * as events_prepare from "../events/prepare.js";
import type * as events_table from "../events/table.js";
import type * as fields from "../fields.js";
import type * as history_listings_ingest from "../history/listings/ingest.js";
import type * as history_listings_query from "../history/listings/query.js";
import type * as history_listings_table from "../history/listings/table.js";
import type * as history_pagination from "../history/pagination.js";
import type * as history_pricing_ingest from "../history/pricing/ingest.js";
import type * as history_pricing_query from "../history/pricing/query.js";
import type * as history_pricing_table from "../history/pricing/table.js";
import type * as history_stats_ingest from "../history/stats/ingest.js";
import type * as history_stats_query from "../history/stats/query.js";
import type * as history_stats_table from "../history/stats/table.js";
import type * as http from "../http.js";
import type * as ingest from "../ingest.js";
import type * as ingestion_baseline from "../ingestion/baseline.js";
import type * as ingestion_initialization from "../ingestion/initialization.js";
import type * as ingestion_progress from "../ingestion/progress.js";
import type * as ingestion_release from "../ingestion/release.js";
import type * as ingestion_table from "../ingestion/table.js";
import type * as ingestion_work from "../ingestion/work.js";
import type * as init from "../init.js";
import type * as isodatetime from "../isodatetime.js";
import type * as json from "../json.js";
import type * as numbers from "../numbers.js";
import type * as objects_backend from "../objects/backend.js";
import type * as objects_bytes from "../objects/bytes.js";
import type * as objects_client from "../objects/client.js";
import type * as objects_local from "../objects/local.js";
import type * as objects_locators from "../objects/locators.js";
import type * as objects_protocol from "../objects/protocol.js";
import type * as objects_r2 from "../objects/r2.js";
import type * as objects_remote from "../objects/remote.js";
import type * as objects_remove from "../objects/remove.js";
import type * as objects_storage from "../objects/storage.js";
import type * as objects_table from "../objects/table.js";
import type * as priceMeters from "../priceMeters.js";
import type * as public_api_v2_cache from "../public_api/v2/cache.js";
import type * as public_api_v2_compatibility from "../public_api/v2/compatibility.js";
import type * as public_api_v2_http from "../public_api/v2/http.js";
import type * as public_api_v2_snapshot from "../public_api/v2/snapshot.js";
import type * as public_api_v2_table from "../public_api/v2/table.js";
import type * as retry from "../retry.js";
import type * as scan_access from "../scan/access.js";
import type * as scan_collected from "../scan/collected.js";
import type * as scan_model from "../scan/model.js";
import type * as scan_provider from "../scan/provider.js";
import type * as scan_reader from "../scan/reader.js";
import type * as scan_analysis_index from "../scan_analysis/index.js";
import type * as scan_analysis_profile from "../scan_analysis/profile.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "alerts/discord/delivery": typeof alerts_discord_delivery;
  "alerts/discord/frequency": typeof alerts_discord_frequency;
  "alerts/discord/prepare": typeof alerts_discord_prepare;
  "alerts/discord/render": typeof alerts_discord_render;
  "alerts/discord/renderers/batchCards": typeof alerts_discord_renderers_batchCards;
  "alerts/discord/renderers/card": typeof alerts_discord_renderers_card;
  "alerts/discord/renderers/display": typeof alerts_discord_renderers_display;
  "alerts/discord/renderers/endpointCard": typeof alerts_discord_renderers_endpointCard;
  "alerts/discord/renderers/fields": typeof alerts_discord_renderers_fields;
  "alerts/discord/renderers/index": typeof alerts_discord_renderers_index;
  "alerts/discord/renderers/modelCard": typeof alerts_discord_renderers_modelCard;
  "alerts/discord/renderers/pricing": typeof alerts_discord_renderers_pricing;
  "alerts/discord/renderers/providerCard": typeof alerts_discord_renderers_providerCard;
  "alerts/feed/http": typeof alerts_feed_http;
  "alerts/feed/query": typeof alerts_feed_query;
  "alerts/feed/render": typeof alerts_feed_render;
  "alerts/feed/text": typeof alerts_feed_text;
  "alerts/monitor/query": typeof alerts_monitor_query;
  "alerts/shared/batch": typeof alerts_shared_batch;
  "alerts/shared/curate": typeof alerts_shared_curate;
  "alerts/shared/decode": typeof alerts_shared_decode;
  "alerts/shared/facts": typeof alerts_shared_facts;
  "alerts/shared/filter": typeof alerts_shared_filter;
  "alerts/shared/prepare": typeof alerts_shared_prepare;
  "alerts/shared/pricing": typeof alerts_shared_pricing;
  "alerts/shared/read": typeof alerts_shared_read;
  "alerts/shared/select": typeof alerts_shared_select;
  "catalog/changes": typeof catalog_changes;
  "catalog/endpoints/ingest": typeof catalog_endpoints_ingest;
  "catalog/endpoints/query": typeof catalog_endpoints_query;
  "catalog/endpoints/table": typeof catalog_endpoints_table;
  "catalog/models/ingest": typeof catalog_models_ingest;
  "catalog/models/query": typeof catalog_models_query;
  "catalog/models/table": typeof catalog_models_table;
  "catalog/project": typeof catalog_project;
  "catalog/providers/ingest": typeof catalog_providers_ingest;
  "catalog/providers/query": typeof catalog_providers_query;
  "catalog/providers/table": typeof catalog_providers_table;
  "catalog/stats/ingest": typeof catalog_stats_ingest;
  "catalog/stats/query": typeof catalog_stats_query;
  "catalog/stats/table": typeof catalog_stats_table;
  clock: typeof clock;
  "collectors/analytics": typeof collectors_analytics;
  "collectors/scan": typeof collectors_scan;
  "collectors/topApps": typeof collectors_topApps;
  compare: typeof compare;
  crons: typeof crons;
  entities: typeof entities;
  entityLogo: typeof entityLogo;
  "events/ingest": typeof events_ingest;
  "events/prepare": typeof events_prepare;
  "events/table": typeof events_table;
  fields: typeof fields;
  "history/listings/ingest": typeof history_listings_ingest;
  "history/listings/query": typeof history_listings_query;
  "history/listings/table": typeof history_listings_table;
  "history/pagination": typeof history_pagination;
  "history/pricing/ingest": typeof history_pricing_ingest;
  "history/pricing/query": typeof history_pricing_query;
  "history/pricing/table": typeof history_pricing_table;
  "history/stats/ingest": typeof history_stats_ingest;
  "history/stats/query": typeof history_stats_query;
  "history/stats/table": typeof history_stats_table;
  http: typeof http;
  ingest: typeof ingest;
  "ingestion/baseline": typeof ingestion_baseline;
  "ingestion/initialization": typeof ingestion_initialization;
  "ingestion/progress": typeof ingestion_progress;
  "ingestion/release": typeof ingestion_release;
  "ingestion/table": typeof ingestion_table;
  "ingestion/work": typeof ingestion_work;
  init: typeof init;
  isodatetime: typeof isodatetime;
  json: typeof json;
  numbers: typeof numbers;
  "objects/backend": typeof objects_backend;
  "objects/bytes": typeof objects_bytes;
  "objects/client": typeof objects_client;
  "objects/local": typeof objects_local;
  "objects/locators": typeof objects_locators;
  "objects/protocol": typeof objects_protocol;
  "objects/r2": typeof objects_r2;
  "objects/remote": typeof objects_remote;
  "objects/remove": typeof objects_remove;
  "objects/storage": typeof objects_storage;
  "objects/table": typeof objects_table;
  priceMeters: typeof priceMeters;
  "public_api/v2/cache": typeof public_api_v2_cache;
  "public_api/v2/compatibility": typeof public_api_v2_compatibility;
  "public_api/v2/http": typeof public_api_v2_http;
  "public_api/v2/snapshot": typeof public_api_v2_snapshot;
  "public_api/v2/table": typeof public_api_v2_table;
  retry: typeof retry;
  "scan/access": typeof scan_access;
  "scan/collected": typeof scan_collected;
  "scan/model": typeof scan_model;
  "scan/provider": typeof scan_provider;
  "scan/reader": typeof scan_reader;
  "scan_analysis/index": typeof scan_analysis_index;
  "scan_analysis/profile": typeof scan_analysis_profile;
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
  discordSender: import("@orca/discord-sender/_generated/component.js").ComponentApi<"discordSender">;
};
