import { join, resolve } from 'node:path'

const PACKAGE_ROOT = resolve(import.meta.dirname, '../..')

export function packagePath(relativePath: string): string {
  return join(PACKAGE_ROOT, relativePath)
}

export function displayPath(absolutePath: string): string {
  return absolutePath.replace(`${PACKAGE_ROOT}/`, '')
}
