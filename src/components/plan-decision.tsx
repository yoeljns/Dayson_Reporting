"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { decidePlan } from "@/app/(admin)/admin/planlar/actions";
import type { PlanStatus } from "@/lib/enums";

/** Manager approve / reject controls for a submitted weekly plan. */
export function PlanDecision({
  planId,
  status,
}: {
  planId: string;
  status: PlanStatus;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (status === "taslak") {
    return (
      <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        Bu plan henüz gönderilmedi; pazarlamacı gönderdiğinde onaylayabilirsiniz.
      </p>
    );
  }

  function decide(decision: "onaylandi" | "reddedildi") {
    setErr(null);
    startTransition(async () => {
      const res = await decidePlan({ planId, decision, note: note.trim() || null });
      if (res.error) {
        setErr(res.error);
        return;
      }
      toast(decision === "onaylandi" ? "Plan onaylandı" : "Plan reddedildi", "ok");
      setMode("idle");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="text-sm font-medium">
          {status === "gonderildi"
            ? "Plan onayınızı bekliyor"
            : "Kararı değiştirebilirsiniz"}
        </div>
        {mode === "reject" ? (
          <div className="space-y-2">
            <Textarea
              rows={3}
              placeholder="Ret nedeni (pazarlamacı görecek) — zorunlu"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={pending}
                onClick={() => setMode("idle")}
              >
                Vazgeç
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={pending || !note.trim()}
                onClick={() => decide("reddedildi")}
              >
                <X className="mr-1 h-4 w-4" /> Reddet
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              rows={2}
              placeholder="Not (isteğe bağlı)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              {status !== "reddedildi" && (
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => setMode("reject")}
                >
                  <X className="mr-1 h-4 w-4" /> Reddet
                </Button>
              )}
              {status !== "onaylandi" && (
                <Button
                  className="flex-1"
                  disabled={pending}
                  onClick={() => decide("onaylandi")}
                >
                  <Check className="mr-1 h-4 w-4" /> Onayla
                </Button>
              )}
            </div>
          </div>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </CardContent>
    </Card>
  );
}
