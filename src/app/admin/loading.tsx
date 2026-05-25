export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page heading */}
      <div className="h-8 w-48 rounded-md bg-muted" />

      {/* Content card */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-5/6 rounded bg-muted" />
          <div className="h-4 w-4/6 rounded bg-muted" />
        </div>
      </div>

      {/* Second content block */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-20 rounded-md bg-muted" />
          <div className="h-20 rounded-md bg-muted" />
          <div className="h-20 rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}
