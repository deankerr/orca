import type { ConnectionState } from 'convex/browser'

export type ConnectionPhase = 'unobserved' | 'connecting' | 'connected' | 'reconnecting'

export type TimingMark = {
  at: number
  phase: ConnectionPhase
  setup: number
  reconnect: number
  connected: number
}

function connectionPhase(
  state: Pick<ConnectionState, 'isWebSocketConnected' | 'hasEverConnected'>,
): ConnectionPhase {
  if (state.isWebSocketConnected) {
    return 'connected'
  }
  return state.hasEverConnected ? 'reconnecting' : 'connecting'
}

/** Cumulative clocks allow overlapping query waits to be combined without double counting. */
export class ConnectionTimings {
  private phase: ConnectionPhase = 'unobserved'
  private changedAt: number
  private setup = 0
  private reconnect = 0
  private connected = 0
  private readonly now: () => number

  private readonly emit: (event: string, properties: Record<string, unknown>) => void

  constructor(
    now = () => performance.now(),
    emit: (event: string, properties: Record<string, unknown>) => void = () => undefined,
  ) {
    this.emit = emit
    this.now = now
    this.changedAt = now()
  }

  mark(): TimingMark {
    const at = this.now()
    const elapsed = at - this.changedAt

    return {
      at,
      phase: this.phase,
      setup: this.setup + (this.phase === 'connecting' ? elapsed : 0),
      reconnect: this.reconnect + (this.phase === 'reconnecting' ? elapsed : 0),
      connected: this.connected + (this.phase === 'connected' ? elapsed : 0),
    }
  }

  update(state: Pick<ConnectionState, 'isWebSocketConnected' | 'hasEverConnected'>) {
    const next = connectionPhase(state)

    if (next === this.phase) {
      return
    }

    const mark = this.mark()
    if (next === 'connected' && (this.phase === 'connecting' || this.phase === 'reconnecting')) {
      this.emit('convex connected', {
        connection_kind: this.phase === 'connecting' ? 'initial' : 'reconnect',
        duration_ms: mark.at - this.changedAt,
        started_at_ms: this.changedAt,
        completed_at_ms: mark.at,
      })
    }
    this.setup = mark.setup
    this.reconnect = mark.reconnect
    this.connected = mark.connected
    this.changedAt = mark.at
    this.phase = next
  }
}
