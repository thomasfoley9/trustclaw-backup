import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { AnimateOnView } from "~/components/core/animate-on-view";

export function BottomCtaSection() {
  return (
    <section className="border-border relative overflow-hidden border-t px-4 py-16 md:px-6 md:py-24 lg:py-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_70%)]" />
      <Image
        src="/images/elements/cube.svg"
        alt=""
        aria-hidden
        width={151}
        height={139}
        priority={false}
        className="pointer-events-none absolute -right-6 bottom-10 hidden h-20 w-20 opacity-15 md:right-20 md:h-28 md:w-28 dark:block"
      />

      <AnimateOnView className="relative z-10 mx-auto flex max-w-4xl flex-col items-start gap-6">
        <h2 className="text-foreground text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
          Run your own agent.
        </h2>
        <p className="text-muted-foreground max-w-[65ch] text-base md:text-lg">
          Sign up, add your own key or start on the free house models, and
          hand Claw its first job tonight.
        </p>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Button
            asChild
            size="lg"
            variant="brand"
            className="h-12 px-7 text-base"
          >
            <Link href="/login?tab=register">
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-fast ease-out-quad"
          >
            Already aboard? Log in →
          </Link>
        </div>
      </AnimateOnView>
    </section>
  );
}
