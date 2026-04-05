import { useCallback } from 'react'
import { toast } from 'sonner'

export function useCopyToClipboard() {
  return useCallback((text: string, message = 'Copied to clipboard') => {
    void navigator.clipboard.writeText(text).then(() => {
      toast.success(message)
    })
  }, [])
}
