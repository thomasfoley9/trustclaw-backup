"use client";

import Link from "next/link";
import { OpenClawLogo } from "./openclaw-logo";

interface TrustClawBrandProps {
  size?: "sm" | "md" | "lg";
  logoLink?: string;
}

const SIZES = {
  sm: { logo: 20, text: "text-xs", by: "text-[8px]", gap: "gap-1.5", tagline: "max-w-[180px]" },
  md: { logo: 24, text: "text-lg", by: "text-[9px]", gap: "gap-2", tagline: "max-w-[260px]" },
  lg: { logo: 48, text: "text-2xl", by: "text-[10px]", gap: "gap-3", tagline: "max-w-[360px]" },
} as const;

export function TrustClawBrand({ size = "md", logoLink }: TrustClawBrandProps) {
  const s = SIZES[size];

  const logo = <OpenClawLogo size={s.logo} />;

  return (
    <div className={`flex min-w-0 items-center ${s.gap}`}>
      {logoLink ? (
        <Link href={logoLink} className="transition-transform hover:scale-105">
          {logo}
        </Link>
      ) : (
        logo
      )}
      <div className="flex min-w-0 flex-col leading-tight">
        <span
          className={`${s.text} text-gradient font-heading truncate font-bold`}
        >
          Thomas Claw
        </span>
        <span
          className={`${s.by} ${s.tagline} text-muted-foreground truncate font-medium`}
        >
          Brought to you by Cracked Cookies
        </span>
      </div>
    </div>
  );
}
