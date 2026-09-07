import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuestionManager } from "@/components/question-manager";
import type { QuestionWithOptions } from "@/types/db";

export default async function QuestionsPage() {
  await requireAdmin();
  const supabase = createClient();
  const { data: questions } = await supabase
    .from("questions")
    .select("*, question_options(*)")
    .order("sort_order")
    .order("created_at");

  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Ziyaret formundaki alanlar. Her soru için zorunluluk, hangi kanalda
        (telefon / yüz yüze) ve hangi firma türünde sorulacağı, seçenekler ve
        sıra &quot;Düzenle&quot; ile yönetilir. Kilit simgeli sorular sihirbazın
        sabit adımlarıdır; pasifleştirilemez ama zorunluluğu kaldırılabilir.
      </p>
      <QuestionManager
        questions={(questions as QuestionWithOptions[]) ?? []}
      />
    </div>
  );
}
