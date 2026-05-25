export default function TownLoading() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse">
      <div className="h-6 w-24 rounded-md bg-muted" />
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        <div className="h-8 w-20 rounded-md bg-muted" />
        <div className="h-8 w-20 rounded-md bg-muted" />
        <div className="h-8 w-24 rounded-md bg-muted" />
      </div>
      {/* Item list */}
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="h-10 w-10 rounded-md bg-muted shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
            <div className="h-8 w-20 rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
