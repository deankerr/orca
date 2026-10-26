export function analyticsConfig({
  environment = 'development',
  key,
  developmentEnabled,
}: {
  environment?: string | undefined
  key?: string | undefined
  developmentEnabled?: string | undefined
}) {
  const ingestionKey = key?.trim()

  const enabledEnvironment =
    environment === 'production' ||
    environment === 'preview' ||
    (environment === 'development' && developmentEnabled === 'true')

  return {
    environment,
    key:
      enabledEnvironment && ingestionKey !== undefined && ingestionKey !== ''
        ? ingestionKey
        : undefined,
  }
}
