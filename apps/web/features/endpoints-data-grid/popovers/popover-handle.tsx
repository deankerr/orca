import { Popover } from '@base-ui/react/popover'

import { AttributeBadgePopoverContent } from '../attributes/attribute-badge'
import { EndpointUuidPopoverContent } from './endpoint-uuid'
import { PopoverCard } from './popover-card'

// --- Payload types (derived from content component props + discriminator) ---

type AttributeBadgePayload = { type: 'attribute' } & React.ComponentProps<
  typeof AttributeBadgePopoverContent
>

type EndpointUuidPayload = { type: 'endpoint-uuid' } & React.ComponentProps<
  typeof EndpointUuidPopoverContent
>

type DataGridPopoverPayload = AttributeBadgePayload | EndpointUuidPayload

// --- Shared handle ---

export const dataGridPopoverHandle = Popover.createHandle<DataGridPopoverPayload>()

// --- Provider: one Root for the entire data grid ---

export function DataGridPopoverProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PopoverCard handle={dataGridPopoverHandle}>
        {({ payload }) => {
          if (payload?.type === 'attribute') {
            return <AttributeBadgePopoverContent {...payload} />
          }

          if (payload?.type === 'endpoint-uuid') {
            return <EndpointUuidPopoverContent {...payload} />
          }

          return null
        }}
      </PopoverCard>
    </>
  )
}
