import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProductMatrixManager } from "@/components/product-matrix-manager";

type PcbRow = {
  id: string;
  category_id: string;
  brand_id: string;
  is_own: boolean;
  sort_order: number;
  product_brands: { name: string } | { name: string }[] | null;
};

export default async function ProductCompetitionPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: cats }, { data: links }] = await Promise.all([
    admin
      .from("product_categories")
      .select("id, code, label_tr, is_active, sort_order")
      .order("sort_order"),
    admin
      .from("product_category_brands")
      .select("id, category_id, brand_id, is_own, sort_order, product_brands(name)")
      .is("salesperson_id", null),
  ]);

  const linksByCat = new Map<string, PcbRow[]>();
  for (const l of (links as PcbRow[] | null) ?? []) {
    const arr = linksByCat.get(l.category_id) ?? [];
    arr.push(l);
    linksByCat.set(l.category_id, arr);
  }

  const categories = ((cats as {
    id: string;
    code: string;
    label_tr: string;
    is_active: boolean;
  }[] | null) ?? []).map((c) => ({
    ...c,
    links: (linksByCat.get(c.id) ?? [])
      .sort((a, b) => Number(b.is_own) - Number(a.is_own) || a.sort_order - b.sort_order)
      .map((l) => {
        const b = Array.isArray(l.product_brands)
          ? l.product_brands[0]
          : l.product_brands;
        return { id: l.id, brandId: l.brand_id, name: b?.name ?? "?", isOwn: l.is_own };
      }),
  }));

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ürün Rekabeti</h1>
        <p className="text-sm text-muted-foreground">
          Ziyaret sihirbazındaki ürün/marka matrisi. Kategori ve marka ekle,
          markayı &quot;Biz / Rakip&quot; işaretle.
        </p>
      </div>
      <ProductMatrixManager categories={categories} />
    </div>
  );
}
