'use client'

import { CopyIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

export function CopyToClipboardButton({
  value,
  children,
  ...props
}: { value: string } & React.ComponentProps<typeof Button>) {
  const copy = useCopyToClipboard()
  const hasChildren = children !== undefined && children !== null && children !== false
  const ariaLabel = props['aria-label'] ?? (hasChildren ? undefined : 'Copy to clipboard')

  return (
    <Button
      onClick={() => {
        void copy(value, 'Copied API URL')
      }}
      aria-label={ariaLabel}
      {...props}
    >
      <CopyIcon data-icon="inline-start" />
      {children}
    </Button>
  )
}
