import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

const badgeVariants = cva(
  'group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent text-[0.625rem] font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-2.5!',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-5 px-2 py-0.5',
        // A count on a control's corner: a circle for one digit, a pill for more.
        sm: 'h-4 min-w-4 px-1',
      },
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
        outline:
          'border-border bg-input/20 text-foreground dark:bg-input/30 [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
      },
    },
  },
)

function Badge({
  className,
  size: sizeProp,
  variant: variantProp,
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  const size = sizeProp === undefined ? 'default' : sizeProp
  const variant = variantProp === undefined ? 'default' : variantProp

  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ size, variant }), className),
      },
      props,
    ),
    render,
    state: {
      size,
      slot: 'badge',
      variant,
    },
  })
}

export { Badge, badgeVariants }
