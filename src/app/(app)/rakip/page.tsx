import Link from "next/link";
import { Plus, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTRY } from "@/lib/utils";

type Row = {
  id: string;
  product_name: string;
  observed_price: number | null;
  price_includes_vat: boolean | null;
  observed_at: string;
  city: string | null;
  is_draft: boolean;
  competitors: { name: string } | { name: string }[] | null;
  companies: { name: string } | { name: string }[] | null;
};

export default async function CompetitorListPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  // RLS limits a salesperson to their own observations; managers see all. Show
  // finalized rows plus the viewer's own drafts (other drafts stay hidden).
  const { data } = await supabase
    .from("competitor_observations")
    .select(
      "id, product_name, observed_price, price_includes_vat, observed_at, city, is_draft, competitors(name), companies(name)"
    )
    .or(`is_draft.eq.false,salesperson_id.eq.${profile.id}`)
    .order("observed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data as Row[] | null) ?? [];

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rakip Bilgisi</h1>
        <Link href="/rakip/yeni">
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" /> Yeni
          </Button>
        </Link>
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Henüz rakip bilgisi girilmedi.
            </p>
            <Link href="/rakip/yeni" className="inline-block">
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Yeni Rakip Bilgisi
              </Button>
            </Link>
          </div>
        ) : (
          rows.map((o) => {
            const comp = Array.isArray(o.competitors)
              ? o.competitors[0]
              : o.competitors;
            const company = Array.isArray(o.companies)
              ? o.companies[0]
              : o.companies;
            const card = (
              <Card key={o.id} className="hover:bg-accent">
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <Swords className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">
                        {comp?.name ?? "Rakip"}
                        {o.product_name ? ` · ${o.product_name}` : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[company?.name, o.city, o.observed_at]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  {o.is_draft ? (
                    <Badge variant="secondary" className="shrink-0">
                      Taslak
                    </Badge>
                  ) : (
                    <span className="shrink-0 text-right">
                      <span className="block font-medium">{formatTRY(o.observed_price)}</span>
                      {o.observed_price != null && (
                        <span className="block text-[11px] text-muted-foreground">
                          {o.price_includes_vat === true ? "KDV dahil" : o.price_includes_vat === false ? "KDV hariç" : "KDV ?"}
                        </span>
                      )}
                    </span>
                  )}
                </CardContent>
              </Card>
            );
            // Drafts resume the form; finalized rows open the detail page.
            return (
              <Link key={o.id} href={o.is_draft ? `/rakip/yeni?draft=${o.id}` : `/rakip/${o.id}`}>
                {card}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
