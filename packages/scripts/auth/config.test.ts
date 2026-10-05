import { expect, test } from 'bun:test'

import { developmentAuth, setupDeployment } from './config'

const dev = {
  CONVEX_DEPLOYMENT: 'dev:charming-warbler-670',
  WORKOS_CLIENT_ID: developmentAuth.clientId,
  WORKOS_ENVIRONMENT_ID: developmentAuth.environmentId,
}

test('auth provisioning refuses production and credential overrides even with dev selected', () => {
  expect(setupDeployment(dev)).toBe('charming-warbler-670')
  expect(() =>
    setupDeployment({ ...dev, CONVEX_DEPLOYMENT: 'prod:dependable-husky-550' }),
  ).toThrow()

  for (const key of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_SELF_HOSTED_URL']) {
    expect(() => setupDeployment({ ...dev, [key]: 'override' })).toThrow()
  }
})

test('auth provisioning refuses a different WorkOS environment', () => {
  expect(() => setupDeployment({ ...dev, WORKOS_CLIENT_ID: 'client_production' })).toThrow()
  expect(() => setupDeployment({ ...dev, WORKOS_ENVIRONMENT_ID: 'environment_other' })).toThrow()
})
