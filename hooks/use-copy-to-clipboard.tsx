import { useCallback } from 'react'
import { toast } from 'sonner'

export function useCopyToClipboard() {
  return useCallback(async (text: string, message = 'Copied to clipboard') => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(message)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }, [])
}
