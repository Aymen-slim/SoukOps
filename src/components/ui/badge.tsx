import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-5.5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/85",
        secondary:
          "bg-secondary text-secondary-foreground border-border/70 [a]:hover:bg-secondary/80",
        destructive:
          "bg-status-danger-bg text-status-danger-fg border-status-danger-border [a]:hover:bg-destructive/20",
        success:
          "bg-status-success-bg text-status-success-fg border-status-success-border",
        warning:
          "bg-status-warning-bg text-status-warning-fg border-status-warning-border",
        info:
          "bg-status-info-bg text-status-info-fg border-status-info-border",
        brand:
          "bg-brand-saffron/25 text-surface-ink border-brand-saffron/60 font-semibold",
        outline:
          "border-border bg-card/80 text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
