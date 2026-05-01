'use client'

import { getErrorMessage } from '@orca/backend/shared/utils'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '../ui/button'

export function CopyToClipboardButton({
  value,
  children,
  ...props
}: { value: string } & React.ComponentProps<typeof Button>) {
  const [copied, setCopied] = useState(false)
  const hasChildren = children !== undefined && children !== null && children !== false
  const ariaLabel = props['aria-label'] ?? (hasChildren ? undefined : 'Copy to clipboard')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch (error) {
      toast.error(`Failed to copy text: ${getErrorMessage(error)}`)
    }
  }

  return (
    <Button
      onClick={() => {
        void handleCopy()
      }}
      aria-label={ariaLabel}
      {...props}
    >
      {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}{' '}
      {children}
    </Button>
  )
}
