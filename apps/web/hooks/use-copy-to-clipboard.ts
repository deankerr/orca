'use client'

import { toast } from '@/components/ui/toast'

export function useCopyToClipboard() {
  return async (text: string, message = 'Copied to clipboard') => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy text:', error)
      toast.add({
        type: 'error',
        title: 'Unable to copy to clipboard',
        description: 'Select and copy the text manually.',
      })
      return
    }

    toast.add({ type: 'success', title: message })
  }
}
