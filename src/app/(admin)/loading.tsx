// Route-group loading skeleton for the admin area (see (app)/loading.tsx).
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-56 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border bg-muted/60"
          />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-14 w-full animate-pulse rounded-lg border bg-muted/60"
          />
        ))}
      </div>
    </div>
  );
}
