import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThresholdDialog } from "./threshold-dialog";

function setup(initial?: Parameters<typeof ThresholdDialog>[0]["initial"]) {
  const onApply = vi.fn();
  render(<ThresholdDialog open onOpenChange={() => {}} title="Errors (5m)" initial={initial} onApply={onApply} />);
  return { onApply, user: userEvent.setup() };
}

describe("Threshold dialog", () => {
  it("rejects a critical limit that isn't beyond the warning limit", async () => {
    const { onApply, user } = setup();
    await user.type(screen.getByRole("textbox", { name: "Warning" }), "300");
    await user.type(screen.getByRole("textbox", { name: "Critical" }), "200");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("critical must be beyond warn in the alert direction")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("applies valid thresholds as numbers", async () => {
    const { onApply, user } = setup();
    await user.type(screen.getByRole("textbox", { name: "Warning" }), "250");
    await user.type(screen.getByRole("textbox", { name: "Critical" }), "450");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith({ direction: "above", warn: 250, critical: 450 });
  });

  it("can remove existing thresholds", async () => {
    const { onApply, user } = setup({ direction: "above", warn: 1 });
    await user.click(screen.getByRole("button", { name: "Remove thresholds" }));
    expect(onApply).toHaveBeenCalledWith(undefined);
  });
});
