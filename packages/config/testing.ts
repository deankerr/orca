import { vi } from 'vitest'

/**
 * Let each scheduled Convex invocation finish before advancing to later deadlines.
 * Handlers that await fake-timer sleeps need their clocks driven explicitly instead.
 */
export async function drainScheduledFunctions(t: {
  finishInProgressScheduledFunctions: () => Promise<void>
}) {
  for (let turns = 0; vi.getTimerCount() > 0; turns += 1) {
    if (turns >= 1000) {
      throw new Error('Scheduled functions did not settle within 1000 timer turns')
    }

    vi.advanceTimersToNextTimer()
    await t.finishInProgressScheduledFunctions()
  }
}
