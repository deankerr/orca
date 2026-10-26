/**
 * The backend values the web app may bundle; each must stay free of Convex server runtime imports.
 * Other modules import backend types directly, and functions through `@orca/backend/api`.
 */

export { entityLogoUrl } from '@orca/backend/entity-logo'

export { formatPrice } from '@orca/backend/numbers'

export { priceMeters } from '@orca/backend/price-meters'

export { OrcaPublicApiV2Schema } from '@orca/backend/public-api/v2/schema'

export {
  findFact,
  fieldLabel,
  formatQuantity,
  isBlockText,
  isQuantity,
  presentChange,
  priceFields,
  priceUnit,
} from '@orca/backend/alerts/present'
