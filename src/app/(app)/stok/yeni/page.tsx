import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFormFields, type Extras } from "@/lib/form-fields";
import {
  StockCountForm,
  type LastCount,
  type StockFormInitial,
  type StockSku,
} from "@/components/stock-count-form";

type SkuRow = {
  id: string;
  code: string;
  name_tr: string;
  product_categories: { label_tr: string } | { label_tr: string }[] | null;
};

const toSku = (s: SkuRow): StockSku => {
  const c = Array.isArray(s.product_categories) ? s.product_categories[0] : s.product_categories;
  return { id: s.id, code: s.code, name_tr: s.name_tr, category: c?.label_tr ?? null };
};

/** New stock count, or edit of an existing one (`?edit=`, owner only). */
export default async function NewStockCountPage({
  searchParams,
}: {
  searchParams: { company?: string; visit?: string; edit?: string; return?: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();
  const editId = searchParams.edit || null;

  const [fields, { data: skus }, companyRes, visitRes, existingRes] = await Promise.all([
    loadFormFields(supabase, "stok"),
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
    editId
      ? supabase
          .from("stock_counts")
          .select(
            "id, salesperson_id, company_id, visit_id, counted_at, note, extras, companies(name), stock_count_lines(sku_id, pallets)"
          )
          .eq("id", editId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const list: StockSku[] = ((skus as unknown as SkuRow[] | null) ?? []).map(toSku);

  // Edit mode: ownership + existing pallets (SKUs since removed from the list
  // are appended so the count can still be corrected).
  const ex = existingRes.data;
  let initial: StockFormInitial | null = null;
  let blocked: string | null = null;
  if (editId) {
    if (!ex) blocked = "Sayım bulunamadı.";
    else if (ex.salesperson_id !== profile.id) blocked = "Yalnızca kendi sayımınızı düzenleyebilirsiniz.";
    else {
      const co = Array.isArray(ex.companies) ? ex.companies[0] : ex.companies;
      const lines = (ex.stock_count_lines as { sku_id: string; pallets: number }[] | null) ?? [];
      const pallets: Record<string, number> = {};
      for (const l of lines) pallets[l.sku_id] = Number(l.pallets);
      const missingIds = lines.map((l) => l.sku_id).filter((id) => !list.some((s) => s.id === id));
      if (missingIds.length > 0) {
        const { data: extra } = await supabase
          .from("skus")
          .select("id, code, name_tr, product_categories(label_tr)")
          .in("id", missingIds);
        for (const s of (extra as unknown as SkuRow[] | null) ?? []) list.push(toSku(s));
      }
      initial = {
        id: ex.id as string,
        company: { id: ex.company_id as string, name: (co as { name: string } | null)?.name ?? "Bayi" },
        pallets,
        note: (ex.note as string | null) ?? "",
        extras: (ex.extras as Extras | null) ?? {},
        visitId: (ex.visit_id as string | null) ?? null,
        countedAt: ex.counted_at as string,
      };
    }
  }

  const company =
    !initial && companyRes.data && companyRes.data.kind === "distributor"
      ? { id: companyRes.data.id as string, name: companyRes.data.name as string }
      : null;
  const notDealer = !initial && Boolean(companyRes.data) && !company;

  // Latest other count per SKU for the dealer ("son sayım 2,5 (05.09.2026)").
  const lastByCompany: Record<string, LastCount> = {};
  const hintCompanyId = initial?.company.id ?? company?.id ?? null;
  if (hintCompanyId) {
    let q = supabase
      .from("stock_counts")
      .select("id, counted_at")
      .eq("company_id", hintCompanyId)
      .order("counted_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    if (initial) q = q.neq("id", initial.id);
    const { data: last } = await q.maybeSingle();
    if (last) {
      const { data: lines } = await supabase
        .from("stock_count_lines")
        .select("sku_id, pallets")
        .eq("stock_count_id", last.id);
      for (const l of lines ?? [])
        lastByCompany[l.sku_id] = { pallets: Number(l.pallets), countedAt: last.counted_at };
    }
  }

  const back = searchParams.return || (initial ? `/stok/${initial.id}` : "/");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link
        href={back}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />{" "}
        {searchParams.return ? "Ziyarete dön" : initial ? "Sayıma dön" : "Ana sayfa"}
      </Link>
      <div>
        <h1 className="text-lg font-semibold">{initial ? "Stok Sayımını Düzenle" : "Stok Durumu"}</h1>
        <p className="text-sm text-muted-foreground">
          Bayideki ürünleri palet olarak say (0,5 adımlı).
        </p>
      </div>
      {blocked ? (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">{blocked}</p>
      ) : notDealer ? (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">
          Stok sayımı yalnızca bayi / distribütör için girilebilir.
        </p>
      ) : (
        <StockCountForm
          key={editId ?? "new"}
          skus={list}
          fields={fields}
          initial={initial}
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
