import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'

export function ActionLink({
  children,
  className,
  icon: Icon = Search,
  ...props
}: React.ComponentProps<'button'> & { icon?: React.ElementType }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-mono text-xs text-primary uppercase underline decoration-primary/40 decoration-dashed underline-offset-3 hover:decoration-solid',
        className,
      )}
      {...props}
    >
      {children}
      <Icon className="size-3" />
    </button>
  )
}
