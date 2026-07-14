"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "~/clients/trpc";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";

// Popup + poll connect flow (same shape as the onboarding integrations step):
// open the OAuth window without navigating the app away, poll connection
// status while waiting, then toast and refresh the grid when it lands.
export function useToolkitConnect(toolkit: string, name: string) {
  const utils = trpc.useUtils();
  const [isWaiting, setIsWaiting] = useState(false);
  // Minted auth link, kept so "reopen" doesn't create another connection
  // request in Composio.
  const authUrlRef = useRef<string | null>(null);

  const getAuthLink = trpc.toolkits.getAuthLink.useMutation({
    onError: trpcToastOnError,
  });

  const status = trpc.trustclaw.checkConnectionStatus.useQuery(
    { toolkits: [toolkit] },
    { enabled: isWaiting, refetchInterval: 5000 },
  );
  const connected =
    status.data?.statuses.some((s) => s.toolkit === toolkit && s.connected) ??
    false;

  useEffect(() => {
    if (isWaiting && connected) {
      setIsWaiting(false);
      authUrlRef.current = null;
      showSuccessToast(`${name} connected!`);
      void utils.toolkits.getToolkits.invalidate();
    }
  }, [isWaiting, connected, name, utils]);

  // Auth links are minted on click (status polling is side-effect free). The
  // tab must open synchronously in the click handler - opening after the
  // await would trip popup blockers - so open blank and steer it.
  const connect = async () => {
    const known = authUrlRef.current;
    if (known) {
      window.open(known, "_blank", "noopener,noreferrer");
      return;
    }
    const popup = window.open("about:blank", "_blank");
    setIsWaiting(true);
    try {
      const { redirectUrl } = await getAuthLink.mutateAsync({ toolkit });
      authUrlRef.current = redirectUrl;
      if (popup) popup.location.href = redirectUrl;
      else window.open(redirectUrl, "_blank", "noopener,noreferrer");
    } catch {
      popup?.close();
      setIsWaiting(false);
    }
  };

  return { connect, isMinting: getAuthLink.isPending, isWaiting };
}
