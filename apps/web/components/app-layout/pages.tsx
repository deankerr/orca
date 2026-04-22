import { cn } from '@/lib/utils'

import { Spinner } from '../ui/spinner'

export function PageContainer({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-slot="page-container"
      className={cn('flex flex-1 flex-col gap-1.5 px-2 py-4', className)}
      {...props}
    />
  )
}

export function PageHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header"
      className={cn('flex shrink-0 flex-col gap-1 py-2 sm:px-4', className)}
      {...props}
    />
  )
}

// Page title and description components
export function PageTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    // oxlint-disable-next-line jsx-a11y/heading-has-content -- This wrapper forwards children via props spread, so the heading content is provided by callers.
    <h1 className={cn('flex items-center gap-3 font-medium sm:text-lg', className)} {...props} />
  )
}

export function PageLoading() {
  return <Spinner className="m-auto" />
}
