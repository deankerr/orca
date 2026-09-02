import type { ModelEndpointsV1 } from '../model-endpoints-v1.ts'

type ModelEntry = ModelEndpointsV1['data'][number]
type Endpoint = NonNullable<ModelEntry['endpoints']>[number]

export type NormalizedModelEntry = Omit<ModelEntry, 'endpoints'> & {
  endpoints: Record<string, Endpoint> | null
}

export type NormalizedModelEndpointsV1 = Omit<ModelEndpointsV1, 'data'> & {
  data: Record<string, NormalizedModelEntry>
}

export const NORMALIZATION_POLICY_VERSION = 'orca-model-endpoint-object-maps-v1'

export function normalizeBundleToObjectMaps(
  bundle: ModelEndpointsV1,
  source = bundle.crawl_id,
): NormalizedModelEndpointsV1 {
  const data = createDictionary<NormalizedModelEntry>()

  for (const entry of bundle.data) {
    assertSafeUniqueKey(data, entry.model_id, `model_id in ${source}`)
    const endpoints =
      entry.endpoints === null
        ? null
        : toEndpointDictionary(entry.endpoints, entry.model_id, source)
    data[entry.model_id] = { ...entry, endpoints }
  }

  return { ...bundle, data }
}

function toEndpointDictionary(
  endpoints: readonly Endpoint[],
  modelId: string,
  source: string,
): Record<string, Endpoint> {
  const result = createDictionary<Endpoint>()
  for (const endpoint of endpoints) {
    assertSafeUniqueKey(result, endpoint.id, `endpoint id for ${modelId} in ${source}`)
    result[endpoint.id] = endpoint
  }
  return result
}

function createDictionary<T>(): Record<string, T> {
  const dictionary: Record<string, T> = {}
  Object.setPrototypeOf(dictionary, null)
  return dictionary
}

function assertSafeUniqueKey(
  dictionary: Record<string, unknown>,
  key: string,
  description: string,
): void {
  if (Object.hasOwn(dictionary, key)) {
    throw new Error(`Duplicate ${description}: ${key}`)
  }
}
