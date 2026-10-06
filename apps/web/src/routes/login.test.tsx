import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { renderWithProviders, signIn } from "@/test/utils";
import { LoginPage } from "./login";

afterEach(() => vi.restoreAllMocks());

describe("Login page", () => {
  it("validates with the shared schema before calling the API", async () => {
    const user = userEvent.setup();
    signIn(null);
    const login = vi.spyOn(api, "login");
    renderWithProviders(<LoginPage />, { route: "/login" });

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("shows the server's message when sign-in fails", async () => {
    const user = userEvent.setup();
    signIn(null);
    const { ApiRequestError } = await import("@/lib/api");
    vi.spyOn(api, "login").mockRejectedValue(new ApiRequestError(401, "UNAUTHORIZED", "Invalid email or password"));
    renderWithProviders(<LoginPage />, { route: "/login" });

    // Demo account buttons fill the form.
    await user.click(screen.getAllByRole("button", { name: "Viewer" })[0]!);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });
});
