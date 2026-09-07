import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SkuManager } from "@/components/sku-manager";
import type { Sku } from "@/types/db";

export default async function SkusPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: skus }, { data: cats }] = await Promise.all([
    admin.from("skus").select("*").order("sort_order").order("created_at"),
    admin
      .from("product_categories")
      .select("id, label_tr")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ürünler (Stok Sayımı)</h1>
        <p className="text-sm text-muted-foreground">
          Pazarlamacıların bayide palet olarak saydığı ürünler. &quot;Sayım&quot;
          işareti kaldırılan ürün sahadaki listede görünmez; ürün matrisi
          (marka rekabeti) ayrı ekrandadır.
        </p>
      </div>
      <SkuManager
        skus={(skus as Sku[] | null) ?? []}
        categories={(cats as { id: string; label_tr: string }[] | null) ?? []}
      />
    </div>
  );
}
