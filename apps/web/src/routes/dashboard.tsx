import type { WidgetConfig } from "@pulse/shared";
import { LayoutGrid, Plus, Zap } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { FilterBar } from "@/features/ai-filter/filter-bar";
import { DashboardSkeleton } from "@/features/dashboard/dashboard-skeleton";
import { EditableGrid } from "@/features/dashboard/edit/editable-grid";
import { TEMPLATES, countPreset, newWidgetId, type Preset } from "@/features/dashboard/edit/presets";
import { usePrimaryDashboard } from "@/features/dashboard/queries";
import { useSaveDashboard } from "@/features/dashboard/use-save-dashboard";
import { useSimulateIncident } from "@/features/dashboard/use-simulate-incident";
import { WidgetFrame } from "@/features/dashboard/widget-frame";
import { LiveRate } from "@/features/dashboard/widgets/live-rate";
import { useCan } from "@/hooks/use-can";
import { formatRelative } from "@/lib/format";
import { useLiveStore } from "@/stores/live";
import { useSession } from "@/stores/session";

const MAX_WIDGETS = 24;

export function DashboardPage() {
  const { dashboard, isPending, isEmpty, error } = usePrimaryDashboard();
  const { tenant } = useSession();
  const canEdit = useCan("dashboard:write");
  const canSimulate = useCan("incidents:simulate");
  const simulate = useSimulateIncident();
  const save = useSaveDashboard(dashboard);
  const [params, setParams] = useSearchParams();

  /** null = viewing; an array = editing this draft. */
  const [draft, setDraft] = useState<WidgetConfig[] | null>(null);

  // ⌘K "Edit dashboard layout" navigates to /?edit=1.
  useEffect(() => {
    if (params.get("edit") === "1" && dashboard && canEdit && draft === null) {
      setDraft(dashboard.widgets);
      setParams({}, { replace: true });
    }
  }, [params, dashboard, canEdit, draft, setParams]);

  if (isPending) return <DashboardSkeleton />;
  if (error) {
    return (
      <Card className="p-6">
        <h1 className="font-medium">Couldn't load this dashboard</h1>
        <p className="mt-1 text-sm text-fg-muted">{error.message}</p>
      </Card>
    );
  }
  if (isEmpty || !dashboard) {
    return <PageHeader title="No dashboards yet" description="An admin can create one for this organization." />;
  }

  if (draft) {
    const add = (p: Preset) => setDraft([...draft, p.make(newWidgetId())]);
    return (
      <>
        <PageHeader
          title={`Editing ${dashboard.name}`}
          description={`Drag cards to reorder. Saved changes appear for everyone in ${tenant.name}.`}
          actions={
            <>
              <AddWidgetMenu onAdd={add} disabled={draft.length >= MAX_WIDGETS} />
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={save.isPending}
                onClick={() => save.mutate(draft, { onSuccess: () => setDraft(null) })}
              >
                {save.isPending ? "Saving" : "Save layout"}
              </Button>
            </>
          }
        />
        {draft.length === 0 ? (
          <Card className="grid place-items-center p-12 text-center">
            <p className="text-sm text-fg-muted">This dashboard is empty. Use Add widget to start.</p>
          </Card>
        ) : (
          <EditableGrid widgets={draft} onChange={setDraft} />
        )}
      </>
    );
  }

  const editButton = (
    <Button variant="secondary" disabled={!canEdit} onClick={() => setDraft(dashboard.widgets)}>
      <LayoutGrid /> Edit layout
    </Button>
  );

  return (
    <>
      <PageHeader
        title={dashboard.name}
        description={`Version ${dashboard.version}, edited ${formatRelative(dashboard.updatedAt)}`}
        actions={
          <>
            <span className="mr-2 hidden sm:inline">
              <LiveRate />
            </span>
            {canSimulate && (
              <Button variant="ghost" disabled={simulate.isPending} onClick={() => simulate.mutate()}>
                <Zap /> Simulate incident
              </Button>
            )}
            {canEdit ? (
              editButton
            ) : (
              <Tooltip content="Only admins can change the layout">
                <span tabIndex={0}>{editButton}</span>
              </Tooltip>
            )}
          </>
        }
      />
      <FilterBar />
      <WidgetGrid>
        {dashboard.widgets.map((w) => (
          <WidgetFrame key={w.id} widget={w} />
        ))}
      </WidgetGrid>
    </>
  );
}

/**
 * The page-load sequence: cards stagger in 40ms apart. It's the one
 * orchestrated entrance in the app, and it plays once per visit: coming back
 * to Overview later is already animated by the page fade-through, and
 * replaying the stagger on top would just slow you down.
 * LayoutGroup lets cards animate to new positions when the layout changes.
 */
let introPlayed = false;

function WidgetGrid({ children }: { children: ReactNode }) {
  const [playIntro] = useState(() => !introPlayed);
  useEffect(() => {
    introPlayed = true;
  }, []);
  return (
    <LayoutGroup>
      <motion.div
        className="grid auto-rows-[minmax(140px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        initial={playIntro ? "hidden" : false}
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.04 } } }}
      >
        {children}
      </motion.div>
    </LayoutGroup>
  );
}

function AddWidgetMenu({ onAdd, disabled }: { onAdd: (p: Preset) => void; disabled: boolean }) {
  const [types, setTypes] = useState<string[]>([]);
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        // Offer "count of X" for the event types this tenant actually sends.
        if (!open) return;
        const seen = new Set<string>();
        for (const bucket of useLiveStore.getState().rollups.values()) for (const c of bucket.values()) seen.add(c.type);
        setTypes([...seen].sort());
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" disabled={disabled}>
          <Plus /> Add widget
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
        <DropdownMenuLabel>Templates</DropdownMenuLabel>
        {TEMPLATES.map((p) => (
          <DropdownMenuItem key={p.label} onSelect={() => onAdd(p)}>
            {p.label}
          </DropdownMenuItem>
        ))}
        {types.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Count one event type</DropdownMenuLabel>
            {types.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => onAdd(countPreset(t))}>
                {t}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
