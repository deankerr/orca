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
import type * as catalog_changes from "../catalog/changes.js";
import type * as catalog_endpoints_ingest from "../catalog/endpoints/ingest.js";
import type * as catalog_endpoints_query from "../catalog/endpoints/query.js";
import type * as catalog_endpoints_table from "../catalog/endpoints/table.js";
import type * as catalog_metadata from "../catalog/metadata.js";
import type * as catalog_models_ingest from "../catalog/models/ingest.js";
import type * as catalog_models_query from "../catalog/models/query.js";
import type * as catalog_models_table from "../catalog/models/table.js";
import type * as catalog_project from "../catalog/project.js";
import type * as catalog_providers_ingest from "../catalog/providers/ingest.js";
import type * as catalog_providers_query from "../catalog/providers/query.js";
import type * as catalog_providers_table from "../catalog/providers/table.js";
import type * as catalog_refresh from "../catalog/refresh.js";
import type * as catalog_source from "../catalog/source.js";
import type * as catalog_stats_ingest from "../catalog/stats/ingest.js";
import type * as catalog_stats_query from "../catalog/stats/query.js";
import type * as catalog_stats_table from "../catalog/stats/table.js";
import type * as catalogNew_entities from "../catalogNew/entities.js";
import type * as catalogNew_pricing from "../catalogNew/pricing.js";
import type * as catalogNew_tables_current from "../catalogNew/tables/current.js";
import type * as catalogNew_tables_events from "../catalogNew/tables/events.js";
import type * as catalogNew_tables_listings from "../catalogNew/tables/listings.js";
import type * as catalogNew_tables_observations from "../catalogNew/tables/observations.js";
import type * as catalogNew_tables_pricing from "../catalogNew/tables/pricing.js";
import type * as catalogNew_tables_stats from "../catalogNew/tables/stats.js";
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
import type * as ingestionNew_currentEndpoints from "../ingestionNew/currentEndpoints.js";
import type * as ingestionNew_currentModels from "../ingestionNew/currentModels.js";
import type * as ingestionNew_currentProviders from "../ingestionNew/currentProviders.js";
import type * as ingestionNew_currentStats from "../ingestionNew/currentStats.js";
import type * as ingestionNew_events from "../ingestionNew/events.js";
import type * as ingestionNew_lenses from "../ingestionNew/lenses.js";
import type * as ingestionNew_listingHistory from "../ingestionNew/listingHistory.js";
import type * as ingestionNew_observations from "../ingestionNew/observations.js";
import type * as ingestionNew_pool from "../ingestionNew/pool.js";
import type * as ingestionNew_pricingHistory from "../ingestionNew/pricingHistory.js";
import type * as ingestionNew_progress from "../ingestionNew/progress.js";
import type * as ingestionNew_refresh from "../ingestionNew/refresh.js";
import type * as ingestionNew_run from "../ingestionNew/run.js";
import type * as ingestionNew_source from "../ingestionNew/source.js";
import type * as ingestionNew_state from "../ingestionNew/state.js";
import type * as ingestionNew_statsHistory from "../ingestionNew/statsHistory.js";
import type * as ingestionNew_table from "../ingestionNew/table.js";
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
import type * as products_discord_delivery from "../products/discord/delivery.js";
import type * as products_discord_frequency from "../products/discord/frequency.js";
import type * as products_discord_prepare from "../products/discord/prepare.js";
import type * as products_discord_render from "../products/discord/render.js";
import type * as products_discord_renderers_batchCards from "../products/discord/renderers/batchCards.js";
import type * as products_discord_renderers_card from "../products/discord/renderers/card.js";
import type * as products_discord_renderers_display from "../products/discord/renderers/display.js";
import type * as products_discord_renderers_endpointCard from "../products/discord/renderers/endpointCard.js";
import type * as products_discord_renderers_fields from "../products/discord/renderers/fields.js";
import type * as products_discord_renderers_index from "../products/discord/renderers/index.js";
import type * as products_discord_renderers_modelCard from "../products/discord/renderers/modelCard.js";
import type * as products_discord_renderers_pricing from "../products/discord/renderers/pricing.js";
import type * as products_discord_renderers_providerCard from "../products/discord/renderers/providerCard.js";
import type * as products_entity_overview_endpoints from "../products/entity_overview/endpoints.js";
import type * as products_entity_overview_models from "../products/entity_overview/models.js";
import type * as products_entity_overview_providers from "../products/entity_overview/providers.js";
import type * as products_feed_http from "../products/feed/http.js";
import type * as products_feed_query from "../products/feed/query.js";
import type * as products_feed_render from "../products/feed/render.js";
import type * as products_feed_text from "../products/feed/text.js";
import type * as products_grid_endpoints from "../products/grid/endpoints.js";
import type * as products_grid_stats from "../products/grid/stats.js";
import type * as products_monitor_query from "../products/monitor/query.js";
import type * as products_pricing_history_listings from "../products/pricing_history/listings.js";
import type * as products_pricing_history_pricing from "../products/pricing_history/pricing.js";
import type * as products_shared_alerts_batch from "../products/shared/alerts/batch.js";
import type * as products_shared_alerts_curate from "../products/shared/alerts/curate.js";
import type * as products_shared_alerts_decode from "../products/shared/alerts/decode.js";
import type * as products_shared_alerts_facts from "../products/shared/alerts/facts.js";
import type * as products_shared_alerts_filter from "../products/shared/alerts/filter.js";
import type * as products_shared_alerts_interpret from "../products/shared/alerts/interpret.js";
import type * as products_shared_alerts_prepare from "../products/shared/alerts/prepare.js";
import type * as products_shared_alerts_pricing from "../products/shared/alerts/pricing.js";
import type * as products_shared_alerts_read from "../products/shared/alerts/read.js";
import type * as products_shared_alerts_select from "../products/shared/alerts/select.js";
import type * as products_shared_clock from "../products/shared/clock.js";
import type * as products_shared_endpoint from "../products/shared/endpoint.js";
import type * as products_shared_pagination from "../products/shared/pagination.js";
import type * as products_stats_history_query from "../products/stats_history/query.js";
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
import type * as scanNew_access from "../scanNew/access.js";
import type * as scanNew_extract from "../scanNew/extract.js";
import type * as scanNew_model from "../scanNew/model.js";
import type * as scanNew_provider from "../scanNew/provider.js";
import type * as scanNew_reader from "../scanNew/reader.js";
import type * as scanNew_stats from "../scanNew/stats.js";
import type * as scan_analysis_index from "../scan_analysis/index.js";
import type * as scan_analysis_profile from "../scan_analysis/profile.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "catalog/changes": typeof catalog_changes;
  "catalog/endpoints/ingest": typeof catalog_endpoints_ingest;
  "catalog/endpoints/query": typeof catalog_endpoints_query;
  "catalog/endpoints/table": typeof catalog_endpoints_table;
  "catalog/metadata": typeof catalog_metadata;
  "catalog/models/ingest": typeof catalog_models_ingest;
  "catalog/models/query": typeof catalog_models_query;
  "catalog/models/table": typeof catalog_models_table;
  "catalog/project": typeof catalog_project;
  "catalog/providers/ingest": typeof catalog_providers_ingest;
  "catalog/providers/query": typeof catalog_providers_query;
  "catalog/providers/table": typeof catalog_providers_table;
  "catalog/refresh": typeof catalog_refresh;
  "catalog/source": typeof catalog_source;
  "catalog/stats/ingest": typeof catalog_stats_ingest;
  "catalog/stats/query": typeof catalog_stats_query;
  "catalog/stats/table": typeof catalog_stats_table;
  "catalogNew/entities": typeof catalogNew_entities;
  "catalogNew/pricing": typeof catalogNew_pricing;
  "catalogNew/tables/current": typeof catalogNew_tables_current;
  "catalogNew/tables/events": typeof catalogNew_tables_events;
  "catalogNew/tables/listings": typeof catalogNew_tables_listings;
  "catalogNew/tables/observations": typeof catalogNew_tables_observations;
  "catalogNew/tables/pricing": typeof catalogNew_tables_pricing;
  "catalogNew/tables/stats": typeof catalogNew_tables_stats;
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
  "ingestionNew/currentEndpoints": typeof ingestionNew_currentEndpoints;
  "ingestionNew/currentModels": typeof ingestionNew_currentModels;
  "ingestionNew/currentProviders": typeof ingestionNew_currentProviders;
  "ingestionNew/currentStats": typeof ingestionNew_currentStats;
  "ingestionNew/events": typeof ingestionNew_events;
  "ingestionNew/lenses": typeof ingestionNew_lenses;
  "ingestionNew/listingHistory": typeof ingestionNew_listingHistory;
  "ingestionNew/observations": typeof ingestionNew_observations;
  "ingestionNew/pool": typeof ingestionNew_pool;
  "ingestionNew/pricingHistory": typeof ingestionNew_pricingHistory;
  "ingestionNew/progress": typeof ingestionNew_progress;
  "ingestionNew/refresh": typeof ingestionNew_refresh;
  "ingestionNew/run": typeof ingestionNew_run;
  "ingestionNew/source": typeof ingestionNew_source;
  "ingestionNew/state": typeof ingestionNew_state;
  "ingestionNew/statsHistory": typeof ingestionNew_statsHistory;
  "ingestionNew/table": typeof ingestionNew_table;
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
  "products/discord/delivery": typeof products_discord_delivery;
  "products/discord/frequency": typeof products_discord_frequency;
  "products/discord/prepare": typeof products_discord_prepare;
  "products/discord/render": typeof products_discord_render;
  "products/discord/renderers/batchCards": typeof products_discord_renderers_batchCards;
  "products/discord/renderers/card": typeof products_discord_renderers_card;
  "products/discord/renderers/display": typeof products_discord_renderers_display;
  "products/discord/renderers/endpointCard": typeof products_discord_renderers_endpointCard;
  "products/discord/renderers/fields": typeof products_discord_renderers_fields;
  "products/discord/renderers/index": typeof products_discord_renderers_index;
  "products/discord/renderers/modelCard": typeof products_discord_renderers_modelCard;
  "products/discord/renderers/pricing": typeof products_discord_renderers_pricing;
  "products/discord/renderers/providerCard": typeof products_discord_renderers_providerCard;
  "products/entity_overview/endpoints": typeof products_entity_overview_endpoints;
  "products/entity_overview/models": typeof products_entity_overview_models;
  "products/entity_overview/providers": typeof products_entity_overview_providers;
  "products/feed/http": typeof products_feed_http;
  "products/feed/query": typeof products_feed_query;
  "products/feed/render": typeof products_feed_render;
  "products/feed/text": typeof products_feed_text;
  "products/grid/endpoints": typeof products_grid_endpoints;
  "products/grid/stats": typeof products_grid_stats;
  "products/monitor/query": typeof products_monitor_query;
  "products/pricing_history/listings": typeof products_pricing_history_listings;
  "products/pricing_history/pricing": typeof products_pricing_history_pricing;
  "products/shared/alerts/batch": typeof products_shared_alerts_batch;
  "products/shared/alerts/curate": typeof products_shared_alerts_curate;
  "products/shared/alerts/decode": typeof products_shared_alerts_decode;
  "products/shared/alerts/facts": typeof products_shared_alerts_facts;
  "products/shared/alerts/filter": typeof products_shared_alerts_filter;
  "products/shared/alerts/interpret": typeof products_shared_alerts_interpret;
  "products/shared/alerts/prepare": typeof products_shared_alerts_prepare;
  "products/shared/alerts/pricing": typeof products_shared_alerts_pricing;
  "products/shared/alerts/read": typeof products_shared_alerts_read;
  "products/shared/alerts/select": typeof products_shared_alerts_select;
  "products/shared/clock": typeof products_shared_clock;
  "products/shared/endpoint": typeof products_shared_endpoint;
  "products/shared/pagination": typeof products_shared_pagination;
  "products/stats_history/query": typeof products_stats_history_query;
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
  "scanNew/access": typeof scanNew_access;
  "scanNew/extract": typeof scanNew_extract;
  "scanNew/model": typeof scanNew_model;
  "scanNew/provider": typeof scanNew_provider;
  "scanNew/reader": typeof scanNew_reader;
  "scanNew/stats": typeof scanNew_stats;
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
  ingestionPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"ingestionPool">;
};
