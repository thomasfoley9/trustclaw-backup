import { ErrorBoundary } from "~/components/core/error-boundary";
import { TooltipProvider } from "~/components/ui/tooltip";
import { DashboardNavbar } from "./_components/dashboard-navbar";
import { ComposioKeyBanner } from "./_components/composio-key-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        <ErrorBoundary>
          <DashboardNavbar />
        </ErrorBoundary>
        <ErrorBoundary>
          <ComposioKeyBanner />
        </ErrorBoundary>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </TooltipProvider>
  );
}
