"use client";

import { PropsWithChildren, useEffect, useState } from "react";
import { isMockMode } from "@/lib/mock-mode";

export function MockModeProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(!isMockMode());

  useEffect(() => {
    if (!isMockMode()) {
      setIsReady(true);
      return;
    }

    const start = async () => {
      const { worker } = await import("@/mocks/browser");
      await worker.start({
        onUnhandledRequest: "bypass",
        serviceWorker: {
          url: "/mockServiceWorker.js",
        },
      });
      console.info("[MOCK MODE] active");
      setIsReady(true);
    };

    void start();
  }, []);

  if (!isReady) {
    return <div className="p-4 text-sm text-slate-600">Starting mock mode...</div>;
  }

  return <>{children}</>;
}
