import type { AuthConfig } from 'convex/server'

const clientId = process.env.WORKOS_CLIENT_ID

// Without a client ID, token verification would quietly use an `undefined` JWKS URL and audience.
if (clientId === undefined || clientId === '') {
  throw new Error('WORKOS_CLIENT_ID is required to deploy auth')
}

export default {
  providers: [
    {
      algorithm: 'RS256',
      applicationID: clientId,
      issuer: 'https://api.workos.com/',
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      type: 'customJwt',
    },
    {
      algorithm: 'RS256',
      // This issuer is specific to our WorkOS environment; these session tokens have no audience.
      issuer: `https://api.workos.com/user_management/${clientId}`,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      type: 'customJwt',
    },
  ],
} satisfies AuthConfig
