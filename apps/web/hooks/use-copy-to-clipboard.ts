'use client'

import { toast } from '@/components/ui/toast'

export function useCopyToClipboard() {
  return async (text: string, message = 'Copied to clipboard') => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy text:', error)
      toast.add({
        description: 'Select and copy the text manually.',
        title: 'Unable to copy to clipboard',
        type: 'error',
      })
      return
    }

    toast.add({ title: message, type: 'success' })
  }
}
