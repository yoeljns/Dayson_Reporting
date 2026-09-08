import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFormFields, type Extras } from "@/lib/form-fields";
import { ComplaintForm, type ComplaintFormInitial } from "@/components/complaint-form";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/**
 * New complaint, resumed draft (?draft=) or edit of a finalized complaint
 * (?edit=). Fields come from the admin-managed catalog.
 */
export default async function NewComplaintPage({
  searchParams,
}: {
  searchParams: { company?: string; visit?: string; draft?: string; edit?: string; return?: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();
  const editId = searchParams.edit || searchParams.draft || null;

  const [fields, { data: cats }, presetRes, visitRes, existingRes] = await Promise.all([
    loadFormFields(supabase, "sikayet"),
    supabase.from("product_categories").select("id, label_tr").eq("is_active", true).order("sort_order"),
    searchParams.company
      ? supabase.from("companies").select("id, name").eq("id", searchParams.company).maybeSingle()
      : Promise.resolve({ data: null }),
    searchParams.visit
      ? supabase.from("visits").select("visit_date").eq("id", searchParams.visit).maybeSingle()
      : Promise.resolve({ data: null }),
    editId
      ? supabase
          .from("complaints")
          .select(
            "id, reported_by, is_draft, company_id, complainant_name, complainant_phone, product_category_id, description, detected_at, extras, visit_id, companies(name)"
          )
          .eq("id", editId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ex = existingRes.data;
  let initial: ComplaintFormInitial | null = null;
  let blocked: string | null = null;
  if (editId) {
    if (!ex) blocked = "Şikayet bulunamadı.";
    else if (ex.reported_by !== profile.id) blocked = "Yalnızca kendi şikayetinizi düzenleyebilirsiniz.";
    else
      initial = {
        id: ex.id as string,
        isDraft: Boolean(ex.is_draft),
        company:
          ex.company_id && one(ex.companies as { name: string } | { name: string }[] | null)
            ? { id: ex.company_id as string, name: one(ex.companies as { name: string } | { name: string }[] | null)!.name }
            : null,
        complainantName: (ex.complainant_name as string | null) ?? "",
        complainantPhone: (ex.complainant_phone as string | null) ?? "",
        productCategoryId: (ex.product_category_id as string | null) ?? "",
        description: (ex.description as string | null) ?? "",
        detectedAt: (ex.detected_at as string | null) ?? "",
        extras: (ex.extras as Extras | null) ?? {},
      };
  }
  const visitId = searchParams.visit ?? (ex?.visit_id as string | null | undefined) ?? null;
  const back = searchParams.return || (initial && !initial.isDraft ? `/sikayet/${initial.id}` : "/sikayetler");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Geri
      </Link>
      <h1 className="text-lg font-semibold">
        {initial ? (initial.isDraft ? "Şikayet Taslağı" : "Şikayeti Düzenle") : "Yeni Şikayet"}
      </h1>
      {blocked ? (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">{blocked}</p>
      ) : (
        <ComplaintForm
          key={editId ?? "new"}
          fields={fields}
          categories={(cats as { id: string; label_tr: string }[] | null) ?? []}
          initial={initial}
          presetCompany={presetRes.data ? { id: presetRes.data.id as string, name: presetRes.data.name as string } : null}
          visitId={visitId}
          visitDate={(visitRes.data?.visit_date as string | null) ?? null}
          returnTo={searchParams.return ?? null}
        />
      )}
    </div>
  );
}
