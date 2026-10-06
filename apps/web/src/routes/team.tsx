import { InviteRequestSchema, type Role } from "@pulse/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { RoleBadge } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useCan } from "@/hooks/use-can";
import { api, ApiRequestError } from "@/lib/api";
import { initials } from "@/lib/format";
import { qk } from "@/lib/query-client";
import { useSession } from "@/stores/session";

export function TeamPage() {
  const { token, tenant } = useSession();
  const canInvite = useCan("users:invite");
  const [params] = useSearchParams();
  const [showInvite, setShowInvite] = useState(params.get("invite") === "1");

  const { data, isPending } = useQuery({
    queryKey: qk.users(tenant.id),
    queryFn: () => api.users(token),
  });

  // Viewers see the button disabled (with a reason), not hidden: they learn
  // the action exists and who can do it. The server enforces it either way.
  const inviteButton = (
    <Button variant="primary" disabled={!canInvite} onClick={() => setShowInvite(true)}>
      <UserPlus /> Invite teammate
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Team"
        description={`People who can open ${tenant.name}'s dashboards`}
        actions={
          canInvite ? (
            inviteButton
          ) : (
            <Tooltip content="Only admins can invite people">
              {/* Disabled buttons don't fire pointer events; the span carries the tooltip. */}
              <span tabIndex={0}>{inviteButton}</span>
            </Tooltip>
          )
        }
      />

      {canInvite && showInvite && <InviteForm onDone={() => setShowInvite(false)} />}

      <Card>
        <ul className="divide-y divide-border">
          {isPending &&
            [0, 1].map((i) => (
              <li key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="size-9 rounded-full" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </li>
            ))}
          {data?.users.map((u) => (
            <li key={u.id} className="flex items-center gap-4 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg-muted">
                {initials(u.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
                <p className="truncate text-xs text-fg-subtle">{u.email}</p>
              </div>
              <RoleBadge role={u.role} />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const { token } = useSession();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const invite = useMutation({
    mutationFn: () => api.invite(token, InviteRequestSchema.parse({ email, role })),
    onSuccess: (inv) => {
      toast.success(`Invite sent to ${inv.email}`);
      onDone();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Couldn't send the invite"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = InviteRequestSchema.safeParse({ email, role });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    invite.mutate();
  }

  return (
    <Card className="mb-6 p-4">
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-[1fr_160px_auto] sm:items-start">
        <Label>
          Email
          <Input
            ref={inputRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error)}
            placeholder="name@company.com"
          />
          <FieldError>{error}</FieldError>
        </Label>
        <Label>
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-10 rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 text-sm text-fg"
          >
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </Label>
        <div className="flex gap-2 sm:mt-7">
          <Button type="submit" variant="primary" disabled={invite.isPending}>
            Send invite
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
