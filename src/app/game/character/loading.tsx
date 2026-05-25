export default function CharacterLoading() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse">
      {/* Character header */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-muted" />
        <div className="space-y-1.5">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-4 w-20 rounded bg-muted" />
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        <div className="h-8 w-20 rounded-md bg-muted" />
        <div className="h-8 w-20 rounded-md bg-muted" />
        <div className="h-8 w-24 rounded-md bg-muted" />
      </div>
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-5 w-10 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
