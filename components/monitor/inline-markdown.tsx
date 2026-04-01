const inlinePattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s)\]]+)/g

export function InlineMarkdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))

    if (match[1] != null) {
      parts.push(
        <code key={match.index} className="rounded-xs bg-muted px-1 py-0.5 font-mono">
          {match[1]}
        </code>,
      )
    } else if (match[2] != null && match[3] != null) {
      parts.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
        >
          {match[2]}
        </a>,
      )
    } else if (match[4] != null) {
      parts.push(
        <a
          key={match.index}
          href={match[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
        >
          {match[4]}
        </a>,
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))

  return <>{parts}</>
}
