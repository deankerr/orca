import { stringifySearchWith } from '@tanstack/react-router'
import type { SearchSerializer } from '@tanstack/react-router'
import { z } from 'zod'

/** Escapes URLSearchParams applies that a query value can carry literally. */
const READABLE = new Map([
  ['%2C', ','],
  ['%2F', '/'],
  ['%3A', ':'],
])

/** Text items without commas join losslessly. */
const TextList = z.array(z.string().regex(/^[^,]*$/u))

/** Lists of text become comma-joined values; other objects stay JSON, as the router's default. */
const stringifyJson = stringifySearchWith((value) => {
  const list = TextList.safeParse(value)

  return list.success ? list.data.join(',') : JSON.stringify(value)
}, JSON.parse)

/**
 * Compact, readable search strings: `?model=openai/gpt-5,openai/gpt-5:free` rather than
 * `?model=%5B%22openai%2Fgpt-5%22%5D`. Routes split comma lists in their search schemas.
 */
export const stringifySearch: SearchSerializer = (search) =>
  stringifyJson(search).replaceAll(
    /%2C|%2F|%3A/giu,
    (escape) => READABLE.get(escape.toUpperCase()) ?? escape,
  )
