import type { ReactNode } from 'react'

import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export function ModelPageCard({
  title,
  children,
  className,
  ...props
}: {
  title: string
  children: ReactNode
} & React.ComponentProps<typeof Card>) {
  return (
    <Card className={cn('rounded-none bg-card/50', className)} {...props}>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {children}
    </Card>
  )
}

export function ModelPageCardLoading({ title, label }: { title: string; label: string }) {
  return (
    <ModelPageCard title={title} aria-busy="true">
      <output className="flex min-h-72 items-center justify-center text-muted-foreground">
        <Spinner />
        <span className="sr-only">{label}</span>
      </output>
    </ModelPageCard>
  )
}
