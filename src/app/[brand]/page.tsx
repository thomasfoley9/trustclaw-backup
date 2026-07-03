import { notFound } from "next/navigation";
import { type Metadata } from "next";
import { BrandLanding } from "../_components/brand-landing";
import { BRAND_KEYS, getBrand } from "~/lib/brands";

// Per-prospect demo landing skins at /ford, /gm, /honda, /toyota, /bmw, /volvo,
// /rivian. Same shared app behind every one - only the landing skin + favicon
// change. Unknown slug -> 404. Static routes (/login, etc.) take precedence over
// this dynamic segment, so they are never shadowed.
export function generateStaticParams() {
  return BRAND_KEYS.map((brand) => ({ brand }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand: string }>;
}): Promise<Metadata> {
  const { brand: key } = await params;
  const brand = getBrand(key);
  if (!brand) return {};
  return {
    title: `Claw - by ${brand.name}`,
    icons: [
      { rel: "icon", url: `/${brand.key}-icon.svg`, type: "image/svg+xml" },
      { rel: "icon", url: `/${brand.key}-favicon.ico`, sizes: "any" },
      { rel: "apple-touch-icon", url: `/${brand.key}-apple-icon.png` },
    ],
  };
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: key } = await params;
  const brand = getBrand(key);
  if (!brand) notFound();
  return <BrandLanding brand={brand} />;
}
