import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabDef = { key: string; label: string; count?: number | null };

/**
 * URL-driven tabs (`?tab=`) — works as a server component, keeps the active
 * tab in the address bar so back/refresh land on the same view.
 */
export function Tabs({
  tabs,
  active,
  hrefFor,
}: {
  tabs: TabDef[];
  active: string;
  hrefFor: (key: string) => string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b print:hidden">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            scroll={false}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              on
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-foreground">
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
