'use client'

import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../ui/button'

export function CopyToClipboardButton({
  value,
  children,
  ...props
}: { value: string } & React.ComponentProps<typeof Button>) {
  const [copied, setCopied] = useState(false)
  const ariaLabel = props['aria-label'] ?? (!children ? 'Copy to clipboard' : undefined)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return (
    <Button onClick={handleCopy} aria-label={ariaLabel} {...props}>
      {copied ? <CheckIcon /> : <CopyIcon />} {children}
    </Button>
  )
}
