import { ErrorBoundary } from "~/components/core/error-boundary";
import { TooltipProvider } from "~/components/ui/tooltip";
import { DashboardNavbar } from "./_components/dashboard-navbar";
import { ComposioKeyBanner } from "./_components/composio-key-banner";
import { AnthropicKeyBanner } from "./_components/anthropic-key-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      {/* h-dvh (not h-screen/100vh): iOS Safari's 100vh includes the browser
          chrome and, with the on-screen keyboard up, keeps the composer
          hidden below the fold. dvh tracks the actual visible viewport. */}
      <div className="flex h-dvh flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <ErrorBoundary>
          <DashboardNavbar />
        </ErrorBoundary>
        <ErrorBoundary>
          <AnthropicKeyBanner />
        </ErrorBoundary>
        <ErrorBoundary>
          <ComposioKeyBanner />
        </ErrorBoundary>
        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
