import { hubspotClient } from './client.js';
import { config } from '../config.js';
import { createIdempotencyCache } from '../utils/idempotencyCache.js';

// Pipeline/stage configuration rarely changes — refetching on every single deal
// would be an unnecessary HubSpot API call per submission. Reuses the get/set-
// with-TTL cache from idempotencyCache.js as a plain memoized lookup (not for
// request dedup, just to avoid refetching); 1 hour is long enough to matter and
// short enough that a real pipeline change in HubSpot shows up without a restart.
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_KEY = 'deal-pipeline';
const pipelineCache = createIdempotencyCache(CACHE_TTL_MS);

function findByLabel(items, label) {
  const target = label.trim().toLowerCase();
  return items.find((item) => item.label.trim().toLowerCase() === target);
}

/**
 * Pure resolution logic, separated from the HubSpot API call so it's unit-testable
 * without a live portal or a mocked client. Given the full list of deal pipelines
 * (as returned by the Pipelines API) and the configured pipeline/stage labels,
 * returns { pipelineId, stageId } or throws if either label doesn't match anything
 * in the given list. An unset stageLabel resolves to the pipeline's first stage by
 * displayOrder.
 */
export function resolvePipelineAndStage(pipelines, pipelineLabel, stageLabel) {
  const pipeline = findByLabel(pipelines, pipelineLabel);
  if (!pipeline) {
    throw new Error(`HubSpot deal pipeline "${pipelineLabel}" not found in this portal`);
  }

  const stage = stageLabel
    ? findByLabel(pipeline.stages, stageLabel)
    : [...pipeline.stages].sort((a, b) => a.displayOrder - b.displayOrder)[0];

  if (!stage) {
    throw new Error(
      stageLabel
        ? `HubSpot deal stage "${stageLabel}" not found in pipeline "${pipelineLabel}"`
        : `HubSpot deal pipeline "${pipelineLabel}" has no stages`,
    );
  }

  return { pipelineId: pipeline.id, stageId: stage.id };
}

/**
 * Resolves config.hubspotDealPipeline (a pipeline label, e.g. "Sales Order
 * Pipeline") to its id and a stage id, so createDeal can put new deals directly
 * into the right pipeline instead of the account's default one. Ids are
 * portal-specific and resolved by name at runtime rather than hardcoded, since
 * this app now talks to more than one HubSpot portal (each sets its own
 * HUBSPOT_DEAL_PIPELINE to match its own pipeline's label).
 *
 * Throws if the configured pipeline/stage name doesn't exist in this portal —
 * callers should treat that as best-effort (log and create the deal without a
 * pipeline override, landing it in the account's default pipeline instead of
 * silently misfiling it with a made-up id).
 */
export async function getDealPipelineAndStage() {
  const cached = pipelineCache.get(CACHE_KEY);
  if (cached) return cached;

  const { results: pipelines } = await hubspotClient.crm.pipelines.pipelinesApi.getAll('deals');
  const result = resolvePipelineAndStage(pipelines, config.hubspotDealPipeline, config.hubspotDealStage);

  pipelineCache.set(CACHE_KEY, result);
  return result;
}
