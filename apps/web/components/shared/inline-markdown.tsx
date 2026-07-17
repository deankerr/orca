const inlinePattern = /`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)\]]+/g

export function InlineMarkdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const [matchedText] = match

    if (matchedText.startsWith('`')) {
      parts.push(
        <code key={match.index} className="rounded-xs bg-muted px-1 py-0.5 font-mono">
          {matchedText.slice(1, -1)}
        </code>,
      )
    } else if (matchedText.startsWith('[')) {
      const linkSeparatorIndex = matchedText.indexOf('](')
      const linkText = matchedText.slice(1, linkSeparatorIndex)
      const linkHref = matchedText.slice(linkSeparatorIndex + 2, -1)

      parts.push(
        <a
          key={match.index}
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
        >
          {linkText}
        </a>,
      )
    } else {
      parts.push(
        <a
          key={match.index}
          href={matchedText}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
        >
          {matchedText}
        </a>,
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}
