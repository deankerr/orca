import { posthog } from 'posthog-js'

const clientId = crypto.randomUUID()

export function captureTiming(event: string, properties: Record<string, unknown>) {
  const payload = { ...properties, client_id: clientId, event_version: 1 }
  queueMicrotask(() => {
    if (posthog.config.token) {
      posthog.capture(event, payload)
    }
  })
}
