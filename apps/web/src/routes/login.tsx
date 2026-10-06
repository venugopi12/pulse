import { LoginRequestSchema, type LoginRequest } from "@pulse/shared";
import { Activity, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { Backdrop } from "@/components/brand/backdrop";
import { LogoMark } from "@/components/brand/logo";
import { GlowBorder } from "@/components/fx/glow-border";
import { ShinyBadge } from "@/components/fx/shiny-badge";
import { TenantDot } from "@/components/shell/tenant-switcher";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { api, ApiRequestError } from "@/lib/api";
import { useActiveSession, useSessionStore } from "@/stores/session";
import { duration, ease } from "@/lib/motion";

/** Seeded demo accounts (see apps/server/src/seed-data.ts). */
const DEMO_PASSWORD = "pulse-demo-2026";
const DEMO_ORGS = [
  { name: "Acme Health", accent: "#2dd4bf", domain: "acme.test" },
  { name: "Nova Retail", accent: "#a78bfa", domain: "nova.test" },
  { name: "Orbit Logistics", accent: "#f59e0b", domain: "orbit.test" },
] as const;

type FieldErrors = Partial<Record<keyof LoginRequest, string>>;

const HIGHLIGHTS: { icon: LucideIcon; text: string }[] = [
  { icon: Activity, text: "Live over WebSockets, smooth at 100 events a second" },
  { icon: ShieldCheck, text: "Tenant isolation proven by tests, not promises" },
  { icon: Sparkles, text: "Ask in plain English: \u201cerrors from checkout today\u201d" },
];

export function LoginPage() {
  const session = useActiveSession();
  const addSession = useSessionStore((s) => s.addSession);
  const signedInCount = useSessionStore((s) => Object.keys(s.sessions).length);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const adding = params.get("add") === "1" && signedInCount > 0;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Already signed in and not adding another org: go to the app.
  // Not while a sign-in is in flight, though: signIn() navigates itself, and
  // letting the router do it (inside a transition) is what lets the logo
  // fly into the sidebar. The session store updates synchronously, so
  // without this check the page would unmount before the transition starts.
  if (session && !adding && !pending) return <Navigate to="/" replace />;

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  async function signIn(credentials: LoginRequest[]) {
    setPending(true);
    setFormError(null);
    try {
      // Each login returns its own tenant-scoped token.
      const results = await Promise.all(credentials.map((c) => api.login(c)));
      for (const r of [...results].reverse()) addSession(r); // first one ends up active
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError ? err.message : "Can't reach the server. Check that it's running on port 4000.",
      );
      setPending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Same Zod schema the server uses: instant feedback, no round trip.
    const parsed = LoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "password") errs[key] ??= issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    void signIn([parsed.data]);
  }

  return (
    <div className="relative isolate grid min-h-dvh place-items-center px-4 py-12">
      <Backdrop strong />
      <div className="relative grid w-full max-w-[1040px] items-center gap-12 lg:grid-cols-[1fr_420px]">
        {/* Brand side (desktop only): what Pulse is, in one glance. */}
        <motion.div
          className="hidden lg:block"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.out, delay: 0.08 }}
        >
          <ShinyBadge>
            <span className="relative flex size-2">
              <span className="animate-breathe absolute inset-0 rounded-full bg-success" />
              <span className="relative size-2 rounded-full bg-success" />
            </span>
            Real-time analytics for every team
          </ShinyBadge>
          <p className="text-ink mt-6 text-5xl leading-[1.05] font-bold tracking-tight text-balance">
            Every organization&rsquo;s pulse, live.
          </p>
          <p className="mt-5 max-w-md text-base leading-relaxed text-fg-muted">
            Live KPIs, charts and alerts for each tenant, strictly isolated, with natural-language filters on top.
          </p>
          <ul className="mt-8 grid max-w-md gap-3 text-sm text-fg-muted">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface-1/70 text-accent-fg">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          className="glass relative w-full rounded-[22px] border p-6 shadow-[var(--shadow-card)] sm:p-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.out }}
        >
          {/* A slow beam of the accent around the card (Border Beam). */}
          <GlowBorder
            variant="beam"
            duration={7}
            colors={["color-mix(in oklch, var(--accent) 30%, transparent)", "var(--accent)"]}
          />
          <LogoMark className="mb-6 size-10" />
          <h1 className="text-2xl font-bold tracking-tight">{adding ? "Add an organization" : "Sign in to Pulse"}</h1>
          <p className="mt-1 mb-8 text-sm text-fg-muted">
            {adding
              ? "You'll stay signed in to your current organizations."
              : "Use your work email to open your organization's dashboard."}
          </p>

          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <Label>
              Email
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              <FieldError>{fieldErrors.email}</FieldError>
            </Label>
            <Label>
              Password
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(fieldErrors.password)}
              />
              <FieldError>{fieldErrors.password}</FieldError>
            </Label>
            {formError && (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={pending} className="mt-2 h-11">
              {pending ? "Signing in" : "Sign in"}
            </Button>
            {adding && (
              <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            )}
          </form>

          <section aria-labelledby="demo-heading" className="mt-8 border-t border-border pt-6">
            <h2 id="demo-heading" className="text-sm font-semibold">
              Demo accounts
            </h2>
            <p className="mt-1 text-xs text-fg-subtle">Pick one to fill the form.</p>
            <ul className="mt-4 grid gap-1">
              {DEMO_ORGS.map((org) => (
                <li
                  key={org.domain}
                  className="flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-1 hover:bg-surface-3/50"
                >
                  <TenantDot color={org.accent} />
                  <span className="flex-1 truncate text-sm text-fg-muted">{org.name}</span>
                  {(["admin", "viewer"] as const).map((role) => (
                    <Button
                      key={role}
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setEmail(`${role}@${org.domain}`);
                        setPassword(DEMO_PASSWORD);
                      }}
                    >
                      {role === "admin" ? "Admin" : "Viewer"}
                    </Button>
                  ))}
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4 h-9 w-full"
              disabled={pending}
              onClick={() =>
                void signIn(DEMO_ORGS.map((o) => ({ email: `admin@${o.domain}`, password: DEMO_PASSWORD })))
              }
            >
              Sign in to all three as admin
            </Button>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
