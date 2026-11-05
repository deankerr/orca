const ORIGIN = 'https://openrouter.ai'

/** Percent-encode each path segment, keeping the `:` of a variant suffix readable. */
function path(slug: string): string {
  return slug
    .split('/')
    .map((segment) => encodeURIComponent(segment).replaceAll('%3A', ':'))
    .join('/')
}

/** A model's page on OpenRouter: `https://openrouter.ai/moonshotai/kimi-k3:free`. */
export function modelPageUrl(modelId: string): string {
  return `${ORIGIN}/${path(modelId)}`
}

/** A provider's page on OpenRouter, by ORCA's normalized provider slug. */
export function providerPageUrl(providerId: string): string {
  return `${ORIGIN}/provider/${path(providerId)}`
}

/** A Hugging Face repository page from its `owner/name` slug. */
export function huggingFaceUrl(slug: string): string {
  return `https://huggingface.co/${path(slug)}`
}
