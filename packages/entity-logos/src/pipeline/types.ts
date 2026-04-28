export type LogoSource = 'avatar' | 'lobehub' | 'curated' | 'remote'

export type LogoAsset = {
  key: string
  source: LogoSource
  sourcePath: string
}

export type CatalogLogo = {
  key: string
  avatar?: LogoAsset
  color?: LogoAsset
}

export type LogoSourceSummary = {
  source: LogoSource
  total: number
  used: number
  unused: number
  unusedPaths: string[]
}

export type LogoCatalog = {
  logos: CatalogLogo[]
  avatarSourceSummaries: LogoSourceSummary[]
  colorSourceSummaries: LogoSourceSummary[]
}
