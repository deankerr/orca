/** One shared identity for local agents and nonproduction admin smoke checks. */
export const developmentAuth = {
  account: {
    email: 'admin@orca.test',
    emailVerified: true,
    externalId: 'orca-development-admin',
    firstName: 'ORCA',
    lastName: 'Development',
  },
  clientId: 'client_01M41R06GBGE6K7FC2NX1EXFC7',
  environmentId: 'environment_01M41R065TB5P1NN7FXF4500A5',
  project: 'deankerr:orca-b8162',
} as const

/** Refuse production, a different WorkOS pool, and credentials that override CLI selection. */
export function setupDeployment(env: Record<string, string | undefined>): string {
  if (
    [env.CONVEX_DEPLOY_KEY, env.CONVEX_DEPLOYMENT_TOKEN, env.CONVEX_SELF_HOSTED_URL].some(
      (value) => value !== undefined && value !== '',
    )
  ) {
    throw new Error('Remove Convex credential overrides before running auth:setup.')
  }

  if (
    env.WORKOS_CLIENT_ID !== developmentAuth.clientId ||
    env.WORKOS_ENVIRONMENT_ID !== developmentAuth.environmentId
  ) {
    throw new Error(
      'auth:setup only supports the configured shared nonproduction WorkOS environment.',
    )
  }

  const match = /^dev:(?<deployment>[a-z0-9-]+)$/.exec(env.CONVEX_DEPLOYMENT ?? '')

  const deployment = match?.groups?.deployment

  if (deployment === undefined) {
    throw new Error('auth:setup requires a selected cloud dev deployment.')
  }

  return deployment
}
