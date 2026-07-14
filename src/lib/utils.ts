import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teach tailwind-merge the design-system motion tokens (declared in
// globals.css) so e.g. a variant's `duration-base` correctly replaces a base
// `duration-fast` instead of both classes surviving the merge.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      duration: ["duration-fast", "duration-base", "duration-slow"],
      ease: ["ease-out-quad", "ease-spring"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
