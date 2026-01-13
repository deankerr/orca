import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'

import { api } from '@/convex/_generated/api'

import { SheetHeader, SheetTitle } from '@/components/ui/sheet'

import { ActionLink } from '../shared/action-link'
import { DataList, DataListItem, DataListLabel, DataListValue } from '../shared/data-list'
import { ExternalLink } from '../shared/external-link'
import { EntityChanges } from './entity-changes'
import { EntitySheetHeader, EntitySheetSection } from './entity-sheet-components'
import { useFindAllEndpoints } from './use-find-all-endpoints'

export function ModelSheet({ slug }: { slug: string }) {
  const findEndpoints = useFindAllEndpoints()

  const { data: model, isPending: modelPending } = useQuery(
    convexQuery(api.models.getBySlug, { slug }),
  )

  const { data: changes, isPending: changesPending } = useQuery(
    convexQuery(api.changes.getModelChanges, { modelSlug: slug, limit: 20 }),
  )

  if (modelPending) {
    return (
      <>
        <SheetTitle className="sr-only">Loading Model</SheetTitle>
        <div className="flex items-center justify-center p-8">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </>
    )
  }

  if (!model) {
    return (
      <>
        <SheetTitle className="sr-only">Model Not Found</SheetTitle>
        <div className="flex items-center justify-center p-8">
          <div className="text-muted-foreground">Model not found</div>
        </div>
      </>
    )
  }

  return (
    <>
      <SheetTitle className="sr-only">{model.name}</SheetTitle>
      {/* Header */}
      <SheetHeader className='pb-0'>
        <EntitySheetHeader type="model" slug={model.slug} name={model.name} />
      </SheetHeader>

      <div className="flex flex-col gap-6 pb-6 text-sm">
        {/* External Links */}
        <div className="flex flex-col items-end gap-1 px-4 text-right">
          <ExternalLink href={`https://openrouter.ai/${model.slug}`} />
          {model.hugging_face_id && (
            <ExternalLink href={`https://huggingface.co/${model.hugging_face_id}`} />
          )}
        </div>

        {/* Details Section */}
        <EntitySheetSection title="Details">
          <DataList>
            <DataListItem>
              <DataListLabel>Author</DataListLabel>
              <DataListValue>{model.author_name}</DataListValue>
            </DataListItem>

            <DataListItem>
              <DataListLabel>Input Modalities</DataListLabel>
              <DataListValue>{model.input_modalities.join(', ')}</DataListValue>
            </DataListItem>

            <DataListItem>
              <DataListLabel>Output Modalities</DataListLabel>
              <DataListValue>{model.output_modalities.join(', ')}</DataListValue>
            </DataListItem>

            <DataListItem>
              <DataListLabel>Reasoning</DataListLabel>
              <DataListValue>{model.reasoning ? 'Yes' : 'No'}</DataListValue>
            </DataListItem>

            {model.tokenizer && (
              <DataListItem>
                <DataListLabel>Tokenizer</DataListLabel>
                <DataListValue>{model.tokenizer}</DataListValue>
              </DataListItem>
            )}

            {model.instruct_type && (
              <DataListItem>
                <DataListLabel>Instruct Type</DataListLabel>
                <DataListValue>{model.instruct_type}</DataListValue>
              </DataListItem>
            )}
          </DataList>
        </EntitySheetSection>

        {/* Related Endpoints Section */}
        <EntitySheetSection
          title="Providers"
          action={
            <ActionLink onClick={() => findEndpoints(model.slug)}>Find all Endpoints</ActionLink>
          }
        />

        {/* Change History Section */}
        <EntityChanges changes={changes} isPending={changesPending} />
      </div>
    </>
  )
}
