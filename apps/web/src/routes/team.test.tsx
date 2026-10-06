import { InviteSchema, UserIdSchema } from "@pulse/shared";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { makeSession, renderWithProviders, signIn } from "@/test/utils";
import { TeamPage } from "./team";

const members = () => {
  const admin = makeSession("admin").user;
  const viewer = makeSession("viewer").user;
  return { users: [admin, { ...viewer, id: UserIdSchema.parse("usr_acme_viewer") }] };
};

afterEach(() => vi.restoreAllMocks());

describe("Team page: role-based UI", () => {
  it("lists members of the current tenant", async () => {
    signIn(makeSession("viewer"));
    vi.spyOn(api, "users").mockResolvedValue(members());
    renderWithProviders(<TeamPage />);
    expect(await screen.findByText("Priya Raman")).toBeInTheDocument();
    expect(screen.getByText("admin@acme.test")).toBeInTheDocument();
  });

  it("disables Invite for viewers (the server enforces it too)", async () => {
    signIn(makeSession("viewer"));
    vi.spyOn(api, "users").mockResolvedValue(members());
    renderWithProviders(<TeamPage />);
    expect(screen.getByRole("button", { name: /invite teammate/i })).toBeDisabled();
  });

  it("lets admins open the invite form and send an invite", async () => {
    const user = userEvent.setup();
    const session = makeSession("admin");
    signIn(session);
    vi.spyOn(api, "users").mockResolvedValue(members());
    const invite = vi.spyOn(api, "invite").mockResolvedValue(
      InviteSchema.parse({
        id: "inv_1",
        tenantId: session.tenant.id,
        email: "new@acme.test",
        role: "viewer",
        invitedBy: session.user.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000,
      }),
    );
    renderWithProviders(<TeamPage />);

    await user.click(screen.getByRole("button", { name: /invite teammate/i }));
    await user.type(screen.getByRole("textbox", { name: /email/i }), "New@Acme.test");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    // The shared Zod schema normalised the email before it was sent.
    expect(invite).toHaveBeenCalledWith(session.token, { email: "new@acme.test", role: "viewer" });
  });
});
