import { describe, expect, test } from 'bun:test'

import { addMultilineStatementSpacing } from './space-multiline-statements'

describe('addMultilineStatementSpacing', () => {
  test('separates adjacent declarations when either is multiline', () => {
    const source = `const one = call(
  1,
)
const two = 2
const three = call(
  3,
)
const four = 4
`

    expect(addMultilineStatementSpacing(source)).toBe(`const one = call(
  1,
)

const two = 2

const three = call(
  3,
)

const four = 4
`)
  })

  test('works within nested blocks and is idempotent', () => {
    const source = `function run() {
  const one = call(
    1,
  )

  const two = 2
}
`

    expect(addMultilineStatementSpacing(addMultilineStatementSpacing(source))).toBe(source)
  })

  test('separates multiline if statements from surrounding statements', () => {
    const source = `function run(value: number) {
  const doubled = value * 2
  if (doubled > 2) {
    use(doubled)
  }
  return doubled
}
`

    expect(addMultilineStatementSpacing(source)).toBe(`function run(value: number) {
  const doubled = value * 2

  if (doubled > 2) {
    use(doubled)
  }

  return doubled
}
`)
  })

  test('leaves comments and compact if statements alone', () => {
    const source = `const one = call(
  1,
)
// Kept attached without guessing where spacing belongs.
const two = 2
if (two) use(two)
const three = 3
`

    expect(addMultilineStatementSpacing(source)).toBe(source)
  })

  test('preserves CRLF line endings', () => {
    const source = 'const one = call(\r\n  1,\r\n)\r\nconst two = 2\r\n'

    expect(addMultilineStatementSpacing(source)).toBe(
      'const one = call(\r\n  1,\r\n)\r\n\r\nconst two = 2\r\n',
    )
  })
})
