import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CompetitorCatalogManager } from "@/components/competitor-catalog-manager";

export default async function CompetitorProductsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: competitors }, { data: products }, { data: cats }, { data: uses }] =
    await Promise.all([
      admin.from("competitors").select("id, name").eq("is_active", true).order("name"),
      admin
        .from("competitor_products")
        .select("id, competitor_id, name, category_id, is_active")
        .order("name"),
      admin.from("product_categories").select("id, label_tr").eq("is_active", true).order("sort_order"),
      admin
        .from("competitor_observations")
        .select("competitor_product_id")
        .not("competitor_product_id", "is", null),
    ]);
  const useCount = new Map<string, number>();
  for (const u of uses ?? [])
    if (u.competitor_product_id)
      useCount.set(u.competitor_product_id, (useCount.get(u.competitor_product_id) ?? 0) + 1);
  const byComp = new Map<string, { id: string; name: string; category_id: string | null; is_active: boolean; uses: number }[]>();
  for (const p of (products ?? []) as { id: string; competitor_id: string; name: string; category_id: string | null; is_active: boolean }[]) {
    (byComp.get(p.competitor_id) ?? byComp.set(p.competitor_id, []).get(p.competitor_id)!).push({
      id: p.id,
      name: p.name,
      category_id: p.category_id,
      is_active: p.is_active,
      uses: useCount.get(p.id) ?? 0,
    });
  }
  const list = ((competitors as { id: string; name: string }[] | null) ?? []).map((c) => ({
    ...c,
    products: byComp.get(c.id) ?? [],
  }));

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Rakip Ürünleri</h1>
        <p className="text-sm text-muted-foreground">
          Her rakibin ürün kataloğu. Sahada bu ürünler çip olarak çıkar; serbest
          yazılan ürünleri Rakip Bilgileri ekranından kataloğa eşleyebilirsiniz.
        </p>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz rakip yok; saha ilk rakibi eklediğinde burada görünür.</p>
      ) : (
        <CompetitorCatalogManager
          competitors={list}
          categories={(cats as { id: string; label_tr: string }[] | null) ?? []}
        />
      )}
    </div>
  );
}
