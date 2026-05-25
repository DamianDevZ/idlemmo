export default function SkillsLoading() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse">
      <div className="h-6 w-24 rounded-md bg-muted" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-muted" />
              <div className="h-5 w-24 rounded bg-muted" />
            </div>
            <div className="h-2 w-full rounded-full bg-muted" />
            <div className="h-3 w-20 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
