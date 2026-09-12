import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTACT_ROLES, CONTACT_ROLE_LABELS } from "@/lib/enums";
import type { QuestionWithOptions } from "@/types/db";
import type { VoiceAlias, VoiceDictionary } from "@/lib/voice/parse-tr";

/** Words of a SKU name worth matching on: no brand, numbers or units. */
export function skuKey(name: string): string {
  return name
    .split(/[\s./x×-]+/)
    .filter((w) => w && !/^\d+([.,]\d+)?$/.test(w) && !/^(ml|mm|m|lt|kg|gr|adet|wf|k|x)$/i.test(w) && !/^\d+(ml|mm|m)$/i.test(w) && !/^dayson$/i.test(w))
    .join(" ");
}

/**
 * Builds the parser dictionary for one visit from what the visit page already
 * knows (applicable questions, category → brand chips, contacts) plus the
 * competitor / SKU catalogs and the learned aliases.
 */
export async function loadVoiceDictionary(
  supabase: SupabaseClient,
  input: {
    questions: QuestionWithOptions[];
    categories: { id: string; label_tr: string; brands: { brandId: string; name: string }[] }[];
    contacts: { id: string; name: string }[];
  }
): Promise<VoiceDictionary> {
  const [{ data: comps }, { data: cprods }, { data: skus }, { data: aliases }] = await Promise.all([
    supabase.from("competitors").select("id, name").eq("is_active", true).limit(500),
    supabase.from("competitor_products").select("id, competitor_id, name").eq("is_active", true).limit(2000),
    supabase.from("skus").select("id, name_tr").eq("is_active", true).eq("in_stock_count", true).limit(500),
    supabase.from("voice_aliases").select("heard, target_kind, target_id").limit(2000),
  ]);
  const brandMap = new Map<string, string>();
  for (const c of input.categories) for (const b of c.brands) brandMap.set(b.brandId, b.name);
  return {
    brands: Array.from(brandMap, ([id, label]) => ({ id, label })),
    categories: input.categories.map((c) => ({ id: c.id, label: c.label_tr, brandIds: c.brands.map((b) => b.brandId) })),
    competitors: ((comps as { id: string; name: string }[] | null) ?? []).map((c) => ({ id: c.id, label: c.name })),
    competitorProducts: ((cprods as { id: string; competitor_id: string; name: string }[] | null) ?? []).map((p) => ({
      id: p.id,
      competitorId: p.competitor_id,
      label: p.name,
    })),
    skus: ((skus as { id: string; name_tr: string }[] | null) ?? []).map((s) => ({ id: s.id, label: s.name_tr, key: skuKey(s.name_tr) })),
    questions: input.questions
      .filter((q) => q.is_active)
      .map((q) => ({
        id: q.id,
        code: q.code,
        label: q.label_tr,
        input_type: q.input_type,
        options: (q.question_options ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((o) => ({ value: o.value, label: o.label_tr })),
      })),
    contacts: input.contacts.map((c) => ({ id: c.id, label: c.name })),
    contactRoles: CONTACT_ROLES.map((r) => ({ value: r, label: CONTACT_ROLE_LABELS[r] })),
    aliases: ((aliases as { heard: string; target_kind: VoiceAlias["kind"]; target_id: string }[] | null) ?? []).map((a) => ({
      heard: a.heard,
      kind: a.target_kind,
      targetId: a.target_id,
    })),
  };
}

/**
 * Company-independent dictionary for the driving mode: every active question,
 * the global Raf Bilgisi matrix (plus the rep's own "Diğer" brands),
 * competitors, SKUs and aliases. Contacts are unknown until a company is chosen.
 */
export async function loadGlobalVoiceDictionary(supabase: SupabaseClient, repId: string): Promise<VoiceDictionary> {
  const [{ data: questions }, { data: cats }, { data: pcb }] = await Promise.all([
    supabase.from("questions").select("*, question_options(*)").eq("is_active", true).order("sort_order"),
    supabase.from("product_categories").select("id, label_tr").eq("is_active", true).order("sort_order"),
    supabase
      .from("product_category_brands")
      .select("category_id, brand_id, product_brands!inner(name)")
      .eq("product_brands.is_active", true)
      .or(`salesperson_id.is.null,salesperson_id.eq.${repId}`),
  ]);
  const byCat = new Map<string, { brandId: string; name: string }[]>();
  for (const r of (pcb as unknown as { category_id: string; brand_id: string; product_brands: { name: string } | { name: string }[] | null }[] | null) ?? []) {
    const b = Array.isArray(r.product_brands) ? r.product_brands[0] : r.product_brands;
    if (!b) continue;
    (byCat.get(r.category_id) ?? byCat.set(r.category_id, []).get(r.category_id)!).push({ brandId: r.brand_id, name: b.name });
  }
  return loadVoiceDictionary(supabase, {
    questions: (questions as QuestionWithOptions[] | null) ?? [],
    categories: ((cats as { id: string; label_tr: string }[] | null) ?? []).map((c) => ({
      id: c.id,
      label_tr: c.label_tr,
      brands: byCat.get(c.id) ?? [],
    })),
    contacts: [],
  });
}
