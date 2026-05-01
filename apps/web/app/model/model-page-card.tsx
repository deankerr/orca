import type { ReactNode } from 'react'

import { Card, CardHeader, CardTitle } from '@/components/ui/card'
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
