// Route-group loading skeleton: every page here is dynamic (cookies), so this
// streams instantly while the server round trip completes — without it, taps
// on mobile data feel frozen.
export default function Loading() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-16 w-full animate-pulse rounded-lg border bg-muted/60"
          />
        ))}
      </div>
    </div>
  );
}
