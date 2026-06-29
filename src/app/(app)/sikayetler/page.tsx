import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_STATUS_LABELS,
  type ComplaintStatus,
} from "@/lib/enums";

const statusVariant: Record<
  ComplaintStatus,
  "warning" | "default" | "success" | "secondary"
> = {
  acik: "warning",
  islemde: "default",
  cozuldu: "success",
  iptal: "secondary",
};

export default async function ComplaintsListPage() {
  await requireProfile();
  const supabase = createClient();

  const { data: complaints } = await supabase
    .from("complaints")
    .select(
      "id, title, type, status, created_at, complainant_name, companies(name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Şikayetler</h1>
        <Link href="/sikayet/yeni">
          <Button size="sm">Yeni</Button>
        </Link>
      </div>

      <div className="space-y-2">
        {!complaints || complaints.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Şikayet bulunamadı.
          </p>
        ) : (
          complaints.map((c) => {
            const company = Array.isArray(c.companies)
              ? c.companies[0]
              : (c.companies as { name: string } | null);
            return (
              <Link key={c.id} href={`/sikayet/${c.id}`}>
                <Card className="hover:bg-accent">
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <div className="font-medium">{c.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {company?.name || c.complainant_name || "—"} ·{" "}
                        {COMPLAINT_TYPE_LABELS[c.type as keyof typeof COMPLAINT_TYPE_LABELS]}
                      </div>
                    </div>
                    <Badge variant={statusVariant[c.status as ComplaintStatus]}>
                      {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus]}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
