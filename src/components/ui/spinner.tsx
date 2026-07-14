import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "~/lib/utils";

const spinnerVariants = cva("animate-spin", {
  variants: {
    size: {
      sm: "size-3",
      default: "size-4",
      lg: "size-8",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

function Spinner({
  className,
  size,
  ...props
}: React.ComponentProps<typeof Loader2> & VariantProps<typeof spinnerVariants>) {
  return (
    <Loader2
      data-slot="spinner"
      aria-hidden="true"
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    />
  );
}

export { Spinner, spinnerVariants };
