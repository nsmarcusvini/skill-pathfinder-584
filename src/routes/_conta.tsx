import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AccountShell } from "@/components/app/account-shell";
import { ProtectedRoute } from "@/components/auth/protected-route";

export const Route = createFileRoute("/_conta")({
  ssr: false,
  component: () => (
    <ProtectedRoute requireAccount requireOnboarding>
      <AccountShell>
        <Outlet />
      </AccountShell>
    </ProtectedRoute>
  ),
});
