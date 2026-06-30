import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VISIT_TYPE_LABELS, VISIT_STATUS_LABELS, type VisitType, type VisitStatus } from "@/lib/enums";

export default async function DeletedVisitsPage() {
  await requireManager();
  const supabase = createClient();

  const { data: visits } = await supabase
    .from("visits")
    .select(
      "id, visit_type, status, visit_date, deleted_at, companies(name), salesperson:salesperson_id(full_name), remover:deleted_by(full_name)"
    )
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Silinen Ziyaretler</h1>
        <p className="text-sm text-muted-foreground">
          Silinen taslak/ziyaretler burada kayıtlı tutulur.
        </p>
      </div>

      <div className="space-y-2">
        {!visits || visits.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Silinen kayıt yok.
          </p>
        ) : (
          visits.map((v) => {
            const company = Array.isArray(v.companies)
              ? v.companies[0]
              : (v.companies as { name: string } | null);
            const sp = Array.isArray(v.salesperson)
              ? v.salesperson[0]
              : (v.salesperson as { full_name: string } | null);
            const remover = Array.isArray(v.remover)
              ? v.remover[0]
              : (v.remover as { full_name: string } | null);
            return (
              <Card key={v.id}>
                <CardContent className="flex items-center justify-between gap-2 p-3 text-sm">
                  <div>
                    <div className="font-medium">{company?.name ?? "Firma"}</div>
                    <div className="text-xs text-muted-foreground">
                      {VISIT_TYPE_LABELS[v.visit_type as VisitType]} ·{" "}
                      {v.visit_date} · {sp?.full_name}
                      {remover ? ` · silen: ${remover.full_name}` : ""}
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {VISIT_STATUS_LABELS[v.status as VisitStatus]}
                  </Badge>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
