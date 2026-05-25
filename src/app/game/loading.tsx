export default function GameHubLoading() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse">
      <div className="h-6 w-36 rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-lg bg-muted" />
        <div className="h-24 rounded-lg bg-muted" />
        <div className="h-24 rounded-lg bg-muted" />
        <div className="h-24 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
