import { posthog } from 'posthog-js'
import { afterEach, expect, it, vi } from 'vitest'

import { syncPostHogIdentity } from './posthog-identity'

const originalToken = posthog.config.token

afterEach(() => {
  vi.restoreAllMocks()
  posthog.config.token = originalToken
})

it('keeps anonymous sessions, identifies login, and clears identity on logout or account change', () => {
  posthog.config.token = 'test'

  let userId: string | undefined
  const user = { email: 'admin@example.com', id: 'workos-user', name: 'Admin' }

  const identify = vi.spyOn(posthog, 'identify').mockImplementation((id) => {
    userId = id
  })

  const reset = vi.spyOn(posthog, 'reset').mockImplementation(() => {
    userId = undefined
  })

  const register = vi.spyOn(posthog, 'register_for_session').mockImplementation(() => {})

  vi.spyOn(posthog, 'get_property').mockImplementation((key) =>
    key === '$user_id' ? userId : 'build-sha',
  )

  syncPostHogIdentity(null)
  expect(reset).not.toHaveBeenCalled()
  expect(identify).not.toHaveBeenCalled()

  syncPostHogIdentity(user)
  expect(identify).toHaveBeenLastCalledWith(user.id, { email: user.email, name: user.name })
  expect(reset).not.toHaveBeenCalled()

  syncPostHogIdentity(user)
  expect(reset).not.toHaveBeenCalled()

  syncPostHogIdentity({ ...user, id: 'another-user' })
  expect(reset).toHaveBeenCalledTimes(1)
  expect(userId).toBe('another-user')

  syncPostHogIdentity(null)
  expect(userId).toBeUndefined()
  expect(reset).toHaveBeenCalledTimes(2)
  expect(register).toHaveBeenLastCalledWith({ app_version: 'build-sha' })

  posthog.config.token = ''
  syncPostHogIdentity(user)
  expect(userId).toBeUndefined()
})
