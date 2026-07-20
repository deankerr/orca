import json from '@shikijs/langs/json'
import githubDarkDefault from '@shikijs/themes/github-dark-default'
import githubLight from '@shikijs/themes/github-light'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

const highlighter = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  langs: [json],
  themes: [githubLight, githubDarkDefault],
})

export async function highlightJson(code: string) {
  const jsonHighlighter = await highlighter

  return jsonHighlighter.codeToHtml(code, {
    lang: 'json',
    themes: {
      light: 'github-light',
      dark: 'github-dark-default',
    },
  })
}
