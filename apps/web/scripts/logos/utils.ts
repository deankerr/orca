import { access } from 'node:fs/promises'

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export interface LogoStyle {
  slug: string
  title: string
  background: string
  scale: number
}

/**
 * Check if a color is white
 */
function isWhite(color: string): boolean {
  const normalized = color.toLowerCase()
  return normalized === '#fff' || normalized === '#ffffff' || normalized === 'white'
}

/**
 * Check if a color is black
 */
function isBlack(color: string): boolean {
  const normalized = color.toLowerCase()
  return normalized === '#000' || normalized === '#000000' || normalized === 'black'
}

/**
 * Check if a color needs tinting (not white or black)
 */
export function needsTint(color: string): boolean {
  return !isWhite(color) && !isBlack(color)
}

/**
 * Check if icon needs inversion
 * - Invert when icon color matches background (both black or both white)
 * - Invert when avatarColor is black (source logos are white, need to invert to black)
 */
export function needsInversion(
  avatarColor: string,
  background: string,
  useColor: boolean,
): boolean {
  // * If using color variant, no inversion needed
  if (useColor) {
    return false
  }

  const iconIsBlack = isBlack(avatarColor)
  const iconIsWhite = isWhite(avatarColor)
  const bgIsBlack = isBlack(background)
  const bgIsWhite = isWhite(background)

  // * Invert if colors match (low contrast)
  if ((iconIsBlack && bgIsBlack) || (iconIsWhite && bgIsWhite)) {
    return true
  }

  // * Invert if avatarColor is black (source logos are white, need black icon)
  if (iconIsBlack) {
    return true
  }

  return false
}

/**
 * Convert slug to title (capitalize words)
 */
export function slugToTitle(slug: string): string {
  return slug
    .split(/(?=[A-Z])|[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
