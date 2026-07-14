import { LandingNav } from "./_components/landing-nav";
import { HeroSection } from "./_components/hero-section";
import { FeaturesSection } from "./_components/features-section";
import { SecuritySection } from "./_components/security-section";
import { ComparisonSection } from "./_components/comparison-section";
import { BottomCtaSection } from "./_components/bottom-cta-section";
import { TrustClawBrand } from "./_components/trustclaw-brand";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "TrustClaw",
  description:
    "Self-hostable personal AI agent with vector memory, 500+ tool integrations, scheduled tasks, and a Telegram bot. Your keys, your data, your infrastructure.",
  applicationCategory: "Productivity",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  creator: {
    "@type": "Organization",
    name: "Composio",
  },
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <div className="bg-background relative flex min-h-screen flex-col overflow-x-hidden">
        <div
          className="ambient-glow pointer-events-none absolute inset-0 h-[820px]"
          aria-hidden
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <LandingNav />

        <main id="main-content" className="relative flex-1">
          <HeroSection />
          <FeaturesSection />
          <SecuritySection />
          <ComparisonSection />
          <BottomCtaSection />
        </main>

        <footer className="border-border relative border-t px-4 py-6">
          <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center gap-2 text-center text-xs">
            <TrustClawBrand size="sm" />
            <p>Self-hosted. Your keys, your data, your agent.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
