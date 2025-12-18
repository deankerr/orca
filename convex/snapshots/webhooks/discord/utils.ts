import { getEnv } from '../../../lib/env'
import { getLogo } from '../../../shared/logos'

// * Icon URL builders

export function getColorIconUrl(model_slug: string): string | undefined {
  const { colorPath } = getLogo(model_slug)
  if (!colorPath) return undefined

  const baseUrl = getEnv('ORCA_PUBLIC_URL')
  return `${baseUrl}/_next/image?url=${colorPath}&w=32&q=75`
}

// * Link builders

export function buildLinks(model_slug: string, hugging_face_id?: string): string {
  const baseUrl = getEnv('ORCA_PUBLIC_URL')
  const links = [
    `[⚪ ORCA](${baseUrl}/?q=${model_slug})`,
    `[🔀 OpenRouter](https://openrouter.ai/${model_slug})`,
  ]

  if (hugging_face_id) {
    links.push(`[🤗 Hugging Face](https://huggingface.co/${hugging_face_id})`)
  }

  return links.join(' ・ ')
}

export function mono(value: unknown) {
  return `\`${String(value)}\``
}
