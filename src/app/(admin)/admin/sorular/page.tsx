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
    .order("sort_order");

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Ziyaret Soru Kataloğu</h1>
      <p className="text-sm text-muted-foreground">
        Ziyaret formundaki alanlar. Çoktan seçmeli alanlarda seçenekler analiz
        edilebilir kalması için kod + etiket olarak tutulur.
      </p>
      <QuestionManager
        questions={(questions as QuestionWithOptions[]) ?? []}
      />
    </div>
  );
}
