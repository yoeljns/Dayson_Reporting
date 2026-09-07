"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatTRDate, todayIso } from "@/lib/week";
import { updateVisitDate } from "@/app/(app)/ziyaret/actions";

/** Inline date editor in the visit header (owner only). */
export function VisitDateEditor({
  visitId,
  visitDate,
}: {
  visitId: string;
  visitDate: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const today = todayIso();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(visitDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(visitDate);
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded px-1 text-foreground underline decoration-dotted underline-offset-2 hover:bg-accent print:no-underline"
        title="Tarihi değiştir"
      >
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        {formatTRDate(visitDate)}
        <Pencil className="h-3 w-3 text-muted-foreground print:hidden" />
      </button>
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await updateVisitDate({ visitId, visitDate: value });
        if (res.error) return setError(res.error);
        toast("Ziyaret tarihi güncellendi", "ok");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Kaydedilemedi — bağlantı gelince tekrar deneyin.");
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 align-middle">
      <Input
        type="date"
        value={value}
        max={today}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-40"
        autoFocus
      />
      <Button size="sm" className="h-8" disabled={pending || !value || value === visitDate} onClick={save}>
        Kaydet
      </Button>
      <Button size="sm" variant="ghost" className="h-8" disabled={pending} onClick={() => setOpen(false)}>
        Vazgeç
      </Button>
      {value && value !== today && !error && (
        <span className="text-xs text-amber-600">Geçmiş tarihli ziyaret.</span>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
