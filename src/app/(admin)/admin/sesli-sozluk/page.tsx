import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VoiceAliasManager, type AliasRow, type AliasTarget } from "@/components/voice-alias-manager";
import { skuKey } from "@/lib/voice/dictionary";

/** Admin: how products / competitors / brands are said in the field. */
export default async function VoiceDictionaryPage() {
  await requireAdmin();
  const supabase = createClient();
  const [{ data: aliases }, { data: brands }, { data: comps }, { data: cprods }, { data: cats }, { data: skus }] =
    await Promise.all([
      supabase
        .from("voice_aliases")
        .select("id, heard, target_kind, target_id, target_label, created_at, profiles:created_by(full_name)")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("product_brands").select("id, name").eq("is_active", true).order("name"),
      supabase.from("competitors").select("id, name").eq("is_active", true).order("name"),
      supabase.from("competitor_products").select("id, name, competitors(name)").eq("is_active", true).order("name"),
      supabase.from("product_categories").select("id, label_tr").eq("is_active", true).order("sort_order"),
      supabase.from("skus").select("id, name_tr").eq("is_active", true).eq("in_stock_count", true).order("sort_order"),
    ]);
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

  const targets: AliasTarget[] = [
    ...((brands as { id: string; name: string }[] | null) ?? []).map((b) => ({ kind: "brand" as const, id: b.id, label: b.name })),
    ...((comps as { id: string; name: string }[] | null) ?? []).map((c) => ({ kind: "competitor" as const, id: c.id, label: c.name })),
    ...((cprods as unknown as { id: string; name: string; competitors: { name: string } | { name: string }[] | null }[] | null) ?? []).map(
      (p) => ({ kind: "competitor_product" as const, id: p.id, label: `${one(p.competitors)?.name ?? "?"} — ${p.name}` })
    ),
    ...((cats as { id: string; label_tr: string }[] | null) ?? []).map((c) => ({ kind: "category" as const, id: c.id, label: c.label_tr })),
    ...((skus as { id: string; name_tr: string }[] | null) ?? []).map((s) => ({ kind: "sku" as const, id: s.id, label: s.name_tr, hint: skuKey(s.name_tr) })),
  ];
  const rows: AliasRow[] = ((aliases as unknown as {
    id: string;
    heard: string;
    target_kind: AliasRow["kind"];
    target_id: string;
    target_label: string;
    created_at: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  }[] | null) ?? []).map((a) => ({
    id: a.id,
    heard: a.heard,
    kind: a.target_kind,
    targetId: a.target_id,
    targetLabel: a.target_label,
    createdAt: a.created_at,
    by: one(a.profiles)?.full_name ?? null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sesli Sözlük</h1>
        <p className="text-sm text-muted-foreground">
          Sahada bir marka, rakip, ürün ya da kategori nasıl söyleniyorsa buraya yazın; sesli rapor o söyleyişi doğru
          kayda bağlar. Pazarlamacılar da onay ekranından &quot;hatırla&quot; ile ekleyebilir. Ürün adları için yalnız ayırt
          edici kelimeler yeter (marka, sayı ve birimler zaten atlanır).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Söyleyişler ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <VoiceAliasManager rows={rows} targets={targets} />
        </CardContent>
      </Card>
    </div>
  );
}
