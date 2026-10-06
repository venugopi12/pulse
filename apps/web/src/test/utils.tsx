import { LoginResponseSchema, type LoginResponse, type Role } from "@pulse/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSessionStore } from "@/stores/session";

/** A valid session for a demo tenant, parsed through the real schema. */
export function makeSession(role: Role, tenant: "acme" | "nova" = "acme"): LoginResponse {
  const name = tenant === "acme" ? "Acme Health" : "Nova Retail";
  return LoginResponseSchema.parse({
    token: `test-token-${tenant}-${role}`,
    expiresAt: Date.now() + 3_600_000,
    user: {
      id: `usr_${tenant}_${role}`,
      tenantId: `tnt_${tenant}`,
      email: `${role}@${tenant}.test`,
      name: role === "admin" ? "Priya Raman" : "Daniel Okafor",
      role,
    },
    tenant: { id: `tnt_${tenant}`, slug: tenant, name, accent: "#2dd4bf" },
  });
}

/** Sign a session in (or out, with null) exactly like the login page does. */
export function signIn(session: LoginResponse | null) {
  useSessionStore.getState().signOutAll();
  if (session) useSessionStore.getState().addSession(session);
}

/** Render with the providers the app uses: query cache, router, tooltips. */
export function renderWithProviders(ui: ReactElement, { route = "/" }: { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <TooltipProvider>{ui}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
