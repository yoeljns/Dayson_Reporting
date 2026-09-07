import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StockCountForm, type LastCount, type StockSku } from "@/components/stock-count-form";

export default async function NewStockCountPage({
  searchParams,
}: {
  searchParams: { company?: string; visit?: string; return?: string };
}) {
  await requireProfile();
  const supabase = createClient();

  const [{ data: skus }, companyRes, visitRes] = await Promise.all([
    supabase
      .from("skus")
      .select("id, code, name_tr, product_categories(label_tr)")
      .eq("is_active", true)
      .eq("in_stock_count", true)
      .order("sort_order")
      .order("created_at"),
    searchParams.company
      ? supabase
          .from("companies")
          .select("id, name, kind")
          .eq("id", searchParams.company)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    searchParams.visit
      ? supabase.from("visits").select("visit_date").eq("id", searchParams.visit).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const company =
    companyRes.data && companyRes.data.kind === "distributor"
      ? { id: companyRes.data.id as string, name: companyRes.data.name as string }
      : null;
  const notDealer = Boolean(companyRes.data) && !company;

  // Latest count per SKU for the preset dealer ("son sayım 2,5 (05.09.2026)").
  const lastByCompany: Record<string, LastCount> = {};
  if (company) {
    const { data: last } = await supabase
      .from("stock_counts")
      .select("id, counted_at")
      .eq("company_id", company.id)
      .order("counted_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) {
      const { data: lines } = await supabase
        .from("stock_count_lines")
        .select("sku_id, pallets")
        .eq("stock_count_id", last.id);
      for (const l of lines ?? [])
        lastByCompany[l.sku_id] = { pallets: Number(l.pallets), countedAt: last.counted_at };
    }
  }

  const list: StockSku[] = ((skus as unknown as {
    id: string;
    code: string;
    name_tr: string;
    product_categories: { label_tr: string } | { label_tr: string }[] | null;
  }[] | null) ?? []).map((s) => {
    const c = Array.isArray(s.product_categories)
      ? s.product_categories[0]
      : s.product_categories;
    return { id: s.id, code: s.code, name_tr: s.name_tr, category: c?.label_tr ?? null };
  });

  const back = searchParams.return || "/";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link
        href={back}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {searchParams.return ? "Ziyarete dön" : "Ana sayfa"}
      </Link>
      <div>
        <h1 className="text-lg font-semibold">Stok Durumu</h1>
        <p className="text-sm text-muted-foreground">
          Bayideki ürünleri palet olarak say (0,5 adımlı).
        </p>
      </div>
      {notDealer ? (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">
          Stok sayımı yalnızca bayi / distribütör için girilebilir.
        </p>
      ) : (
        <StockCountForm
          skus={list}
          company={company}
          visitId={searchParams.visit ?? null}
          visitDate={(visitRes.data?.visit_date as string | null) ?? null}
          lastByCompany={lastByCompany}
          returnTo={searchParams.return ?? null}
        />
      )}
    </div>
  );
}
