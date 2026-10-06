import { ThresholdsSchema, type Thresholds } from "@pulse/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";

const selectClass = "h-10 rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 text-sm text-fg";

/**
 * Edit a widget's thresholds. Validated with the SAME Zod schema the server
 * uses, so "critical must be beyond warn" is caught here, before saving.
 */
export function ThresholdDialog({
  open,
  onOpenChange,
  title,
  initial,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: Thresholds | undefined;
  onApply: (thresholds: Thresholds | undefined) => void;
}) {
  const [direction, setDirection] = useState<Thresholds["direction"]>(initial?.direction ?? "above");
  const [warn, setWarn] = useState(initial?.warn?.toString() ?? "");
  const [critical, setCritical] = useState(initial?.critical?.toString() ?? "");
  const [error, setError] = useState<string>();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = ThresholdsSchema.safeParse({
      direction,
      ...(warn.trim() !== "" ? { warn: Number(warn) } : {}),
      ...(critical.trim() !== "" ? { critical: Number(critical) } : {}),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    onApply(parsed.data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Thresholds for ${title}`} description="Alert when the value crosses these limits.">
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <Label>
          Alert when the value is
          <select value={direction} onChange={(e) => setDirection(e.target.value as Thresholds["direction"])} className={selectClass}>
            <option value="above">Above the limit</option>
            <option value="below">Below the limit</option>
          </select>
        </Label>
        <div className="grid grid-cols-2 gap-4">
          <Label>
            Warning
            <Input inputMode="decimal" value={warn} onChange={(e) => setWarn(e.target.value)} placeholder="None" />
          </Label>
          <Label>
            Critical
            <Input inputMode="decimal" value={critical} onChange={(e) => setCritical(e.target.value)} placeholder="None" />
          </Label>
        </div>
        <FieldError>{error}</FieldError>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {initial && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() => {
                onApply(undefined);
                onOpenChange(false);
              }}
            >
              Remove thresholds
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Apply
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
