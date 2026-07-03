"use client";

import { Button } from "~/components/ui/button";
import Link from "next/link";
import { ThemeToggle } from "~/components/core/theme-toggle";
import { TrustClawBrand } from "./trustclaw-brand";

export function LandingNav() {
  return (
    <header className="border-border bg-background/70 supports-[backdrop-filter]:bg-background/50 fixed top-0 right-0 left-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
        <TrustClawBrand size="md" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            asChild
            size="sm"
            className="bg-accent-gradient rounded-xl border-0 text-white shadow-md transition-transform hover:scale-105"
          >
            <Link href="/login?tab=register">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
