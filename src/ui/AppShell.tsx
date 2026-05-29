import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { cleanupExpiredSessions } from "../storage/chatSessionStore";

export function AppShell({ children }: PropsWithChildren) {
  useEffect(() => {
    cleanupExpiredSessions();
  }, []);

  return (
    <main className="desktop-stage">
      <section className="app-shell" data-testid="mobile-shell">
        {children}
      </section>
    </main>
  );
}
