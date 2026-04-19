const QUERY_SEPARATOR_RE = /\s+/g
const SLUG_BOUNDARY_CHARS = new Set(['/', '-', ':'])

/** A single slug-like field to be indexed for one record. */
interface SlugSearchField {
  name: string
  value: string
}

/** A single query token matched against one indexed token. */
interface SlugSearchMatch {
  field: string
  queryToken: string
  matchedToken: string
  kind: 'exact' | 'prefix'
}

/** Coarse ranking buckets used to keep result ordering stable. */
interface SlugSearchRank {
  exactFieldMatchCount: number
  exactMatchCount: number
  prefixMatchCount: number
}

/** Result returned by the generic slug search engine. */
interface SlugSearchResult<T> {
  record: T
  score: number
}

/** Normalize indexed values and user input into a consistent comparison form. */
function normalizeSearchText(value: string) {
  return value.toLowerCase().normalize('NFKC').replaceAll(/\s+/g, ' ').trim()
}

/** Split a query into space-delimited tokens without altering slug punctuation. */
function tokenizeQuery(value: string) {
  return normalizeSearchText(value).split(QUERY_SEPARATOR_RE).filter(Boolean)
}

/** Expand a slug into searchable whole-slug, boundary-suffix, and segment tokens. */
function tokenizeSlugField(value: string) {
  // Normalize
  const normalized = normalizeSearchText(value)
  if (!normalized) {
    return []
  }

  const tokens = new Set<string>()

  // Index each slug-like token separately
  for (const slug of normalized.split(QUERY_SEPARATOR_RE).filter(Boolean)) {
    tokens.add(slug)

    // Add suffixes that begin immediately after a slug boundary
    for (let index = 1; index < slug.length; index += 1) {
      if (SLUG_BOUNDARY_CHARS.has(slug[index - 1])) {
        tokens.add(slug.slice(index))
      }
    }

    // Add plain segments between boundaries
    let currentSegment = ''
    for (const character of slug) {
      if (SLUG_BOUNDARY_CHARS.has(character)) {
        if (currentSegment) {
          tokens.add(currentSegment)
          currentSegment = ''
        }
        continue
      }

      currentSegment += character
    }

    if (currentSegment) {
      tokens.add(currentSegment)
    }
  }

  return [...tokens]
}

/** Prefer exact matches, then shorter matching tokens, then lexical order. */
function compareMatches(left: SlugSearchMatch, right: SlugSearchMatch) {
  if (left.kind !== right.kind) {
    return left.kind === 'exact' ? -1 : 1
  }

  const tokenLengthDifference = left.matchedToken.length - right.matchedToken.length
  if (tokenLengthDifference !== 0) {
    return tokenLengthDifference
  }

  return left.matchedToken.localeCompare(right.matchedToken)
}

/** Rank exact full-field hits above exact-token hits above prefix-token hits. */
function compareRanks(left: SlugSearchRank, right: SlugSearchRank) {
  return (
    right.exactFieldMatchCount - left.exactFieldMatchCount ||
    right.exactMatchCount - left.exactMatchCount ||
    right.prefixMatchCount - left.prefixMatchCount
  )
}

/** Encode the rank buckets as a single numeric score for observability. */
function encodeScore(rank: SlugSearchRank) {
  return rank.exactFieldMatchCount * 1_000_000 + rank.exactMatchCount * 1000 + rank.prefixMatchCount
}

/**
 * Create a reusable slug searcher over arbitrary records.
 *
 * Callers provide the records, a projection of the slug-like fields to index,
 * and optionally a domain-specific comparison function for equally-scored
 * results.
 */
export function createSlugSearcher<T>(
  records: readonly T[],
  {
    getFields,
    compareItems,
  }: {
    getFields: (record: T) => readonly SlugSearchField[]
    compareItems?: (left: T, right: T) => number
  },
) {
  // Build the in-memory index once for the provided records
  const index = records.map((record, position) => ({
    position,
    record,
    fields: getFields(record).map((field) => {
      const exact = normalizeSearchText(field.value)
      return {
        name: field.name,
        exact,
        tokens: tokenizeSlugField(exact),
      }
    }),
  }))

  return {
    /** Search the indexed records and return ranked results with observability data. */
    search(query: string): SlugSearchResult<T>[] {
      // Normalize the query
      const normalizedQuery = normalizeSearchText(query)
      const queryTokens = tokenizeQuery(query)

      // Return all records unchanged for an empty query
      if (!normalizedQuery || queryTokens.length === 0) {
        return index.map(({ record }) => ({
          record,
          score: 0,
        }))
      }

      return index
        .flatMap((item) => {
          // Find the best match for each query token
          const matches: SlugSearchMatch[] = []

          const findBestMatch = (queryToken: string) => {
            let bestMatch: SlugSearchMatch | null = null

            for (const field of item.fields) {
              for (const indexToken of field.tokens) {
                if (indexToken !== queryToken && !indexToken.startsWith(queryToken)) {
                  continue
                }

                const candidate: SlugSearchMatch = {
                  field: field.name,
                  queryToken,
                  matchedToken: indexToken,
                  kind: indexToken === queryToken ? 'exact' : 'prefix',
                }

                if (!bestMatch || compareMatches(candidate, bestMatch) < 0) {
                  bestMatch = candidate
                }
              }
            }

            return bestMatch
          }

          for (const queryToken of queryTokens) {
            const match = findBestMatch(queryToken)
            if (!match) {
              return []
            }

            matches.push(match)
          }

          // Count exact vs prefix matches for ranking
          let exactMatchCount = 0
          let prefixMatchCount = 0

          for (const match of matches) {
            if (match.kind === 'exact') {
              exactMatchCount += 1
            } else {
              prefixMatchCount += 1
            }
          }

          const rank = {
            exactFieldMatchCount: Number(
              item.fields.some((field) => field.exact === normalizedQuery),
            ),
            exactMatchCount,
            prefixMatchCount,
          } satisfies SlugSearchRank

          // Build the result payload for this indexed record
          return [
            {
              position: item.position,
              rank,
              result: {
                record: item.record,
                score: encodeScore(rank),
              } satisfies SlugSearchResult<T>,
            },
          ]
        })
        .toSorted((left, right) => {
          // Sort by search score first, then by consumer-provided ordering
          const rankDifference = compareRanks(left.rank, right.rank)
          if (rankDifference !== 0) {
            return rankDifference
          }

          const itemDifference = compareItems?.(left.result.record, right.result.record) ?? 0
          if (itemDifference !== 0) {
            return itemDifference
          }

          return left.position - right.position
        })
        .map(({ result }) => result)
    },
  }
}
