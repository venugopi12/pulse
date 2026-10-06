import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the real bento layout (4 KPIs, 3+1, 2+2) so nothing jumps when the
 * data arrives: same grid, same spans, same heights.
 */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-8 h-4 w-64" />
      <div className="grid auto-rows-[minmax(140px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 1, 1, 1].map((_, i) => (
          <SkeletonCard key={`k${i}`} />
        ))}
        <SkeletonCard className="sm:col-span-2 lg:col-span-3 lg:row-span-2" tall />
        <SkeletonCard className="lg:row-span-2" tall />
        <SkeletonCard className="sm:col-span-2" />
        <SkeletonCard className="sm:col-span-2" />
      </div>
    </div>
  );
}

function SkeletonCard({ className = "", tall = false }: { className?: string; tall?: boolean }) {
  return (
    <div className={`surface flex flex-col gap-4 rounded-[var(--radius-card)] p-4 ${className}`}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className={tall ? "flex-1 min-h-[180px]" : "h-8 w-24"} />
      {!tall && <Skeleton className="mt-auto h-3 w-40" />}
    </div>
  );
}
