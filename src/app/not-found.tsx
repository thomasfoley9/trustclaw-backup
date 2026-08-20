import Link from "next/link";
import { TrustClawBrand } from "./_components/trustclaw-brand";
import { Button } from "~/components/ui/button";

// Branded, theme-aware 404. Reached by prospect demo links with a wrong slug
// (e.g. /Ford) and any unknown route; the framework default is an unstyled
// white page, jarring on the dark theme.
export default function NotFound() {
  return (
    <div className="bg-background relative flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <div
        className="ambient-glow pointer-events-none absolute inset-0"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-6">
        <TrustClawBrand size="lg" logoLink="/" />
        <div className="space-y-1.5">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Page not found
          </h1>
          <p className="text-muted-foreground text-sm">
            This track doesn&apos;t go anywhere. Let&apos;s get you back on the
            rails.
          </p>
        </div>
        <Button asChild className="rounded-2xl">
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </div>
  );
}
