"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { loginPathWithNext } from "~/lib/login-redirect";

// Client-side "no session" redirect that preserves the deep link. The server
// layout can't build /login?next=<path> itself - App Router layouts have no
// access to the request pathname without middleware - so it renders this
// instead of a bare redirect("/login").
export function RedirectToLogin() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    const current = query ? `${pathname}?${query}` : pathname;
    router.replace(loginPathWithNext(current));
  }, [router, pathname, searchParams]);

  return null;
}
