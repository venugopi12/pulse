import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="tabular text-sm text-fg-subtle">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page doesn't exist</h1>
        <p className="mt-2 text-sm text-fg-muted">Check the address, or go back to your dashboard.</p>
        <Button asChild variant="primary" className="mt-6">
          <Link to="/">Open dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
