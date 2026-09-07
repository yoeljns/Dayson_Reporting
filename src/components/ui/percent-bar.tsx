/** Inline horizontal percent bar with the number next to it. */
export function PercentBar({
  pct,
  width = "w-24",
}: {
  pct: number;
  width?: string;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 ${width} shrink-0 overflow-hidden rounded-full bg-muted`}>
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${safe}%` }}
        />
      </div>
      <span className="text-sm font-medium tabular-nums">%{safe}</span>
    </div>
  );
}
