import type { ReactNode } from "react";
import { LiveIndicatorView } from "@/components/shell/live-indicator";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A living reference of the design system, rendered with the real tokens and
 * components. Switch tenant or theme and every swatch here updates.
 */
export function DesignPage() {
  return (
    <>
      <PageHeader
        title="Design system"
        description="Tokens and components, rendered live in the current theme and organization accent."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Surfaces" note="Depth comes from lighter layers and a 1px top highlight, not shadows.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {["bg", "surface-1", "surface-2", "surface-3"].map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </div>
        </Section>

        <Section title="Text and status" note="Every text colour passes WCAG AA on surface-1.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {["fg", "fg-muted", "fg-subtle", "border-strong", "success", "warning", "danger"].map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </div>
        </Section>

        <Section
          title="Organization accent"
          note="One typed CSS property (--accent). Everything below is derived from it with color-mix, so a tenant switch morphs all of it at once."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {["accent", "accent-fg", "accent-soft", "accent-glow"].map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </div>
        </Section>

        <Section title="Numbers" note="KPIs and timestamps use Geist Mono with tabular figures, so digits don't shift as values change.">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="mb-2 text-xs text-fg-subtle">Proportional</p>
              <p className="text-2xl font-medium">111,111</p>
              <p className="text-2xl font-medium">888,888</p>
            </div>
            <div>
              <p className="mb-2 text-xs text-fg-subtle">Tabular</p>
              <p className="tabular text-2xl font-medium">111,111</p>
              <p className="tabular text-2xl font-medium">888,888</p>
            </div>
          </div>
        </Section>

        <Section title="Type scale" note="Plus Jakarta Sans for the interface, Geist Mono for numbers. Sizes step 12, 14, 17, 24, 32.">
          <div className="grid gap-2">
            <p className="text-[32px] leading-tight font-semibold tracking-tight">Dashboard title</p>
            <p className="text-2xl font-semibold tracking-tight">Page heading</p>
            <p className="text-[17px] font-medium">Section heading</p>
            <p className="text-sm text-fg-muted">Body and controls, 14px, for dense data screens.</p>
            <p className="text-xs text-fg-subtle">Captions and helper text, 12px.</p>
          </div>
        </Section>

        <Section title="Controls" note="Pressed buttons scale to 98%. Focus rings use the accent with a soft glow.">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Save changes</Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Remove</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge>Viewer</Badge>
            <Badge tone="accent">Admin</Badge>
            <Badge tone="success">Healthy</Badge>
            <Badge tone="warning">warn</Badge>
            <Badge tone="danger">error</Badge>
            <span className="ml-2 flex gap-1">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </div>
          <Input className="mt-4" placeholder="Text input" aria-label="Example input" />
        </Section>

        <Section title="Connection status" note="Breathes while live; amber with a countdown while reconnecting.">
          <div className="flex flex-wrap gap-2">
            <LiveIndicatorView status="live" />
            <LiveIndicatorView status="connecting" />
            <LiveIndicatorView status="reconnecting" retryAt={Date.now() + 8000} />
            <LiveIndicatorView status="offline" />
          </div>
        </Section>

        <Section title="Loading" note="Skeletons match the shape of what's coming. The shimmer moves with transform only.">
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardBody className="grid gap-3">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-40" />
            </CardBody>
          </Card>
        </Section>
      </div>
    </>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="block">
        <CardTitle className="text-[17px] text-fg">{title}</CardTitle>
        <p className="mt-1 text-sm text-fg-muted">{note}</p>
      </CardHeader>
      <CardBody className="pt-5">{children}</CardBody>
    </Card>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <div>
      <div className="h-14 rounded-[var(--radius-control)] border border-border" style={{ background: `var(--${token})` }} />
      <p className="tabular mt-2 truncate text-xs text-fg-muted">--{token}</p>
    </div>
  );
}
