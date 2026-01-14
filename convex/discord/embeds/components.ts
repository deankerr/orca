import { ORCA_PUBLIC_URL } from '../constants'
import type { LinkButton } from './utils'

// Build markdown links for embed fields
export function buildMarkdownLinks(links: LinkButton[]): string {
  return links.map((link) => `[${link.label}](${link.url})`).join(' · ')
}

// Generate standard entity links with emoji prefixes
export function buildEntityLinks(args: {
  model_slug: string
  hugging_face_id?: string
  provider_tag_slug?: string
}): LinkButton[] {
  const { model_slug, hugging_face_id, provider_tag_slug } = args

  const links: LinkButton[] = [
    { label: '⚪ ORCA', url: `${ORCA_PUBLIC_URL}/?q=${model_slug}` },
    { label: '🔀 Model', url: `https://openrouter.ai/${model_slug}` },
  ]

  if (provider_tag_slug) {
    links.push({ label: '🔀 Provider', url: `https://openrouter.ai/provider/${provider_tag_slug}` })
  }

  if (hugging_face_id) {
    links.push({ label: '🤗 HuggingFace', url: `https://huggingface.co/${hugging_face_id}` })
  }

  return links
}
