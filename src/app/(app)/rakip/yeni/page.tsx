import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFormFields, type Extras } from "@/lib/form-fields";
import { CompetitorForm, type CompetitorFormInitial } from "@/components/competitor-form";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/** New observation, resumed draft (?draft=) or edit (?edit=). */
export default async function NewCompetitorObservationPage({
  searchParams,
}: {
  searchParams: { company?: string; visit?: string; draft?: string; edit?: string; return?: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();
  const editId = searchParams.edit || searchParams.draft || null;

  const [fields, presetRes, visitRes, existingRes] = await Promise.all([
    loadFormFields(supabase, "rakip"),
    searchParams.company
      ? supabase.from("companies").select("id, name, city").eq("id", searchParams.company).maybeSingle()
      : Promise.resolve({ data: null }),
    searchParams.visit
      ? supabase.from("visits").select("visit_date").eq("id", searchParams.visit).maybeSingle()
      : Promise.resolve({ data: null }),
    editId
      ? supabase
          .from("competitor_observations")
          .select(
            "id, salesperson_id, is_draft, product_name, observed_price, price_includes_vat, city, note, extras, visit_id, observed_at, competitor_id, competitor_product_id, company_id, competitors(name), companies(name), competitor_products(id, name)"
          )
          .eq("id", editId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ex = existingRes.data;
  let initial: CompetitorFormInitial | null = null;
  let blocked: string | null = null;
  if (editId) {
    if (!ex) blocked = "Kayıt bulunamadı.";
    else if (ex.salesperson_id !== profile.id) blocked = "Yalnızca kendi kaydınızı düzenleyebilirsiniz.";
    else {
      const comp = one(ex.competitors as { name: string } | { name: string }[] | null);
      const co = one(ex.companies as { name: string } | { name: string }[] | null);
      const cp = one(ex.competitor_products as { id: string; name: string } | { id: string; name: string }[] | null);
      initial = {
        id: ex.id as string,
        isDraft: Boolean(ex.is_draft),
        competitor: ex.competitor_id && comp ? { id: ex.competitor_id as string, name: comp.name } : null,
        product: cp ? { id: cp.id, name: cp.name } : null,
        productName: cp ? "" : ((ex.product_name as string | null) ?? ""),
        company: ex.company_id && co ? { id: ex.company_id as string, name: co.name } : null,
        price: ex.observed_price == null ? "" : String(ex.observed_price),
        priceIncludesVat: (ex.price_includes_vat as boolean | null) ?? null,
        city: (ex.city as string | null) ?? "",
        note: (ex.note as string | null) ?? "",
        extras: (ex.extras as Extras | null) ?? {},
        visitId: (ex.visit_id as string | null) ?? null,
        observedAt: (ex.observed_at as string | null) ?? null,
      };
    }
  }
  const back = searchParams.return || (initial && !initial.isDraft ? `/rakip/${initial.id}` : "/rakip");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Geri
      </Link>
      <h1 className="text-lg font-semibold">
        {initial ? (initial.isDraft ? "Rakip Bilgisi Taslağı" : "Rakip Bilgisini Düzenle") : "Rakip Bilgisi"}
      </h1>
      {blocked ? (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">{blocked}</p>
      ) : (
        <CompetitorForm
          key={editId ?? "new"}
          fields={fields}
          initial={initial}
          presetCompany={presetRes.data ? { id: presetRes.data.id as string, name: presetRes.data.name as string } : null}
          presetCity={(presetRes.data?.city as string | null) ?? null}
          visitId={searchParams.visit ?? null}
          visitDate={(visitRes.data?.visit_date as string | null) ?? null}
          returnTo={searchParams.return ?? null}
        />
      )}
    </div>
  );
}
