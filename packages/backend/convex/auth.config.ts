import type { AuthConfig } from 'convex/server'

const clientId = process.env.WORKOS_CLIENT_ID

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
