import { api } from '../_generated/api'
import { ActionCtx } from '../_generated/server'
import { transformEndpoint } from '../transforms/endpoint'

export async function previewV2HttpHandler(ctx: ActionCtx) {
  const endpointsList = await ctx
    .runQuery(api.endpoints.list, { maxTimeUnavailable: 0 })
    .then((list) => list.filter((e) => !e.disabled))

  const models = Map.groupBy(endpointsList, (e) => e.model.slug)
    .values()
    .map((group) => {
      const model = group[0].model
      const providers = group.map(transformEndpoint)

      return {
        id: model.slug,
        version_id: model.version_slug,
        name: model.name,
        author_name: model.author_name,
        variant: model.variant,
        created_at: new Date(model.or_added_at).toISOString(),
        input_modalities: model.input_modalities,
        output_modalities: model.output_modalities,
        reasoning: model.reasoning,
        providers,
      }
    })
    .toArray()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const result = {
    updated_at: new Date(
      endpointsList.reduce((max, e) => Math.max(max, e.updated_at), 0),
    ).toISOString(),
    models,
  }

  return result
}
