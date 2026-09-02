import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Program, Statement } from '@oxc-project/types'
import { parseSync, Visitor } from 'oxc-parser'

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])
const SKIPPED_DIRECTORIES = new Set(['.git', '.next', 'dist', 'node_modules'])
const SPACED_STATEMENTS = new Set(['ExpressionStatement', 'VariableDeclaration'])

interface Edit {
  offset: number
}

export function addMultilineStatementSpacing(source: string, filename = 'input.ts'): string {
  const result = parseSync(filename, source)
  // oxlint-disable-next-line typescript/no-unsafe-enum-comparison -- Oxc exposes Severity as an ambient const enum, whose members cannot be accessed with verbatimModuleSyntax.
  if (result.errors.some((error) => error.severity === 'Error')) {
    throw new Error(result.errors.map((error) => error.message).join('\n'))
  }

  const edits = findEdits(result.program, source)
  const newline = source.includes('\r\n') ? '\r\n' : '\n'

  let formatted = source
  for (const edit of edits.toReversed()) {
    formatted = `${formatted.slice(0, edit.offset)}${newline}${formatted.slice(edit.offset)}`
  }
  return formatted
}

function findEdits(program: Program, source: string): Edit[] {
  const edits: Edit[] = []

  inspectStatements(program.body, source, edits)
  new Visitor({
    BlockStatement(node) {
      inspectStatements(node.body, source, edits)
    },
    SwitchCase(node) {
      inspectStatements(node.consequent, source, edits)
    },
  }).visit(program)

  return edits.toSorted((left, right) => left.offset - right.offset)
}

function inspectStatements(statements: Statement[], source: string, edits: Edit[]): void {
  for (let index = 1; index < statements.length; index += 1) {
    const previous = statements[index - 1]
    const current = statements[index]

    if (!(previous && current)) {
      continue
    }

    const gap = source.slice(previous.end, current.start)
    if (!/^\s+$/u.test(gap)) {
      continue
    }

    const previousEndLine = lineAt(source, previous.end)
    const currentStartLine = lineAt(source, current.start)
    const isMultiline =
      lineAt(source, previous.start) !== previousEndLine ||
      currentStartLine !== lineAt(source, current.end)
    const hasMultilineIf =
      (previous.type === 'IfStatement' && lineAt(source, previous.start) !== previousEndLine) ||
      (current.type === 'IfStatement' && currentStartLine !== lineAt(source, current.end))
    const hasAdjacentSpacedStatements = isSpacedStatement(previous) && isSpacedStatement(current)

    if (
      isMultiline &&
      (hasMultilineIf || hasAdjacentSpacedStatements) &&
      currentStartLine === previousEndLine + 1
    ) {
      edits.push({ offset: previous.end })
    }
  }
}

function isSpacedStatement(statement: Statement): boolean {
  return SPACED_STATEMENTS.has(statement.type)
}

function lineAt(source: string, offset: number): number {
  let line = 0
  for (let index = 0; index < offset; index += 1) {
    if (source.codePointAt(index) === 10) {
      line += 1
    }
  }
  return line
}

async function sourceFiles(paths: string[]): Promise<string[]> {
  const files: string[] = []

  for (const filePath of paths) {
    const absolutePath = path.resolve(filePath)
    const pathStat = await stat(absolutePath)
    if (pathStat.isFile()) {
      if (SOURCE_EXTENSIONS.has(path.extname(absolutePath))) {
        files.push(absolutePath)
      }
      continue
    }

    if (pathStat.isDirectory()) {
      const entries = await readdir(absolutePath, { withFileTypes: true })
      const children = entries
        .filter((entry) => !SKIPPED_DIRECTORIES.has(entry.name))
        .map((entry) => path.resolve(absolutePath, entry.name))
      files.push(...(await sourceFiles(children)))
    }
  }

  return files
}

async function main(): Promise<void> {
  const write = Bun.argv.includes('--write')
  const paths = Bun.argv.slice(2).filter((argument) => argument !== '--write')
  if (paths.length === 0) {
    throw new Error('Usage: bun space-multiline-statements.ts [--write] <file-or-directory> [...]')
  }

  let changed = 0
  for (const filename of await sourceFiles(paths)) {
    const source = await readFile(filename, 'utf-8')
    const formatted = addMultilineStatementSpacing(source, filename)
    if (formatted === source) {
      continue
    }

    changed += 1
    if (write) {
      await writeFile(filename, formatted)
    }
    console.log(`${write ? 'updated' : 'would update'} ${filename}`)
  }

  console.log(`${write ? 'updated' : 'found'} ${changed} file${changed === 1 ? '' : 's'}`)
}

if (import.meta.main) {
  await main()
}
