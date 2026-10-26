import { posthog } from 'posthog-js'

const clientId = crypto.randomUUID()

/** Flat PostHog event properties. */
export interface TimingProperties {
  [name: string]: string | number | boolean | null | undefined
}

export type EmitTiming = (event: string, properties: TimingProperties) => void

export function captureTiming(event: string, properties: TimingProperties) {
  const payload = { ...properties, client_id: clientId, event_version: 1 }
  queueMicrotask(() => {
    if (posthog.config.token) {
      posthog.capture(event, payload)
    }
  })
}
