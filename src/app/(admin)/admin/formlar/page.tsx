import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FormFieldManager } from "@/components/form-field-manager";
import { FORM_KEYS, FORM_LABELS, loadFormFields, type FormKey } from "@/lib/form-fields";
import { cn } from "@/lib/utils";

export default async function FormFieldsPage({
  searchParams,
}: {
  searchParams: { form?: string };
}) {
  await requireAdmin();
  const form: FormKey = (FORM_KEYS as readonly string[]).includes(searchParams.form ?? "")
    ? (searchParams.form as FormKey)
    : "sikayet";
  const fields = await loadFormFields(createAdminClient(), form, { includeInactive: true });

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Form Alanları</h1>
        <p className="text-sm text-muted-foreground">
          Şikayet, rakip bilgisi ve stok sayımı formlarındaki alanlar. Alanı
          pasife alınca sahada görünmez; zorunlu yapınca boş kayıt reddedilir.
          &quot;Yeni alan&quot; ile eklenen alanların cevabı kaydın detayında ve
          Excel&apos;de görünür.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FORM_KEYS.map((k) => (
          <Link
            key={k}
            href={`/admin/formlar?form=${k}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              k === form ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {FORM_LABELS[k]}
          </Link>
        ))}
      </div>
      <FormFieldManager key={form} form={form} fields={fields} />
    </div>
  );
}
