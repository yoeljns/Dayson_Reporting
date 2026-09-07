import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SurveyCreateForm } from "@/components/survey-builder";
import { formatTRDate } from "@/lib/week";
import {
  SURVEY_STATUS_LABELS,
  COMPANY_KIND_LABELS,
  type SurveyStatus,
} from "@/lib/enums";
import type { Survey } from "@/types/db";

const STATUS_BADGE: Record<SurveyStatus, "warning" | "success" | "secondary"> = {
  taslak: "warning",
  aktif: "success",
  kapandi: "secondary",
};

type Row = Survey & {
  survey_questions: { count: number }[];
  survey_answers: { count: number }[];
};

export default async function SurveysPage() {
  await requireManager();
  const supabase = createClient();
  const { data } = await supabase
    .from("surveys")
    .select("*, survey_questions(count), survey_answers(count)")
    .order("status")
    .order("updated_at", { ascending: false })
    .limit(200);
  const rows = (data as Row[] | null) ?? [];
  const order: SurveyStatus[] = ["aktif", "taslak", "kapandi"];
  rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Özel Raporlar</h1>
        <p className="text-sm text-muted-foreground">
          Sahaya özel soru listeleri (anketler). Yayınlanan rapor, hedeflenen
          firma türü / il / pazarlamacı için ziyaret sihirbazında ve Ana
          Sayfa&apos;da görünür; cevaplar burada özetlenir.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <SurveyCreateForm />
        </CardContent>
      </Card>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Henüz özel rapor yok.
          </p>
        ) : (
          rows.map((s) => (
            <Link key={s.id} href={`/admin/anketler/${s.id}`}>
              <Card className="hover:bg-accent">
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{s.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.survey_questions?.[0]?.count ?? 0} soru ·{" "}
                      {s.survey_answers?.[0]?.count ?? 0} cevap
                      {s.valid_from || s.valid_to
                        ? ` · ${s.valid_from ? formatTRDate(s.valid_from) : "…"} – ${
                            s.valid_to ? formatTRDate(s.valid_to) : "…"
                          }`
                        : ""}
                      {s.target_kinds && s.target_kinds.length > 0
                        ? ` · ${s.target_kinds.map((k) => COMPANY_KIND_LABELS[k]).join(", ")}`
                        : ""}
                    </div>
                  </div>
                  <Badge variant={STATUS_BADGE[s.status]}>
                    {SURVEY_STATUS_LABELS[s.status]}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
