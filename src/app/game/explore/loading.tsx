export default function ExploreLoading() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse">
      <div className="h-6 w-28 rounded-md bg-muted" />
      {/* Area selector */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-10 w-full rounded-md bg-muted" />
      </div>
      {/* Info panel */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 rounded-md bg-muted" />
          <div className="h-16 rounded-md bg-muted" />
        </div>
        <div className="h-10 w-full rounded-md bg-muted" />
      </div>
    </div>
  );
}
