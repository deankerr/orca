import { posthog } from 'posthog-js'

const clientId = crypto.randomUUID()

export function captureTiming(event: string, properties: Record<string, unknown>) {
  const payload = { ...properties, event_version: 1, client_id: clientId }
  queueMicrotask(() => {
    if (posthog.config.token) {
      posthog.capture(event, payload)
    }
  })
}
