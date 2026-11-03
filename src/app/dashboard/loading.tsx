export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p className="sr-only">Loading</p>
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 animate-pulse rounded bg-tertiary" />
        <div className="h-8 w-56 max-w-full animate-pulse rounded bg-tertiary" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-tertiary" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-28 animate-pulse rounded-xl bg-tertiary" />
        <div className="h-28 animate-pulse rounded-xl bg-tertiary" />
        <div className="h-28 animate-pulse rounded-xl bg-tertiary" />
      </div>
    </div>
  );
}
