import { afterEach, expect, it, mock, spyOn } from 'bun:test'

import { posthog } from 'posthog-js'

import { syncPostHogIdentity } from './posthog-identity'

const originalToken = posthog.config.token

afterEach(() => {
  mock.restore()
  posthog.config.token = originalToken
})

it('keeps anonymous sessions, identifies login, and clears identity on logout or account change', () => {
  posthog.config.token = 'test'

  let userId: string | undefined
  const user = { id: 'workos-user', email: 'admin@example.com', name: 'Admin' }
  const identify = spyOn(posthog, 'identify').mockImplementation((id) => {
    userId = id
  })
  const reset = spyOn(posthog, 'reset').mockImplementation(() => {
    userId = undefined
  })
  const register = spyOn(posthog, 'register_for_session').mockImplementation(() => {})

  spyOn(posthog, 'get_property').mockImplementation((key) =>
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
