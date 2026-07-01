"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  COMPLAINT_TRANSITIONS,
  COMPLAINT_STATUS_LABELS,
  type ComplaintStatus,
} from "@/lib/enums";
import { changeComplaintStatus } from "@/app/(app)/sikayet/actions";

export function ComplaintStatusChanger({
  complaintId,
  current,
  canReopen = false,
}: {
  complaintId: string;
  current: ComplaintStatus;
  /** Managers may reopen a closed complaint (cozuldu/iptal → islemde). */
  canReopen?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const closed = COMPLAINT_TRANSITIONS[current].length === 0;
  const next: ComplaintStatus[] =
    closed && canReopen ? ["islemde"] : COMPLAINT_TRANSITIONS[current];
  const [toStatus, setToStatus] = useState<ComplaintStatus | "">(
    next[0] ?? ""
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // After a transition router.refresh() changes `current` without remounting;
  // re-derive the selection or the Select goes stale/blank.
  useEffect(() => {
    setToStatus(next[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, canReopen]);

  if (next.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Bu şikayet kapanmış. Durum değişikliği yapılamaz.
      </p>
    );
  }

  function submit() {
    setError(null);
    if (!toStatus) return;
    if (!note.trim()) {
      setError("Açıklama (not) zorunludur.");
      return;
    }
    startTransition(async () => {
      const res = await changeComplaintStatus({
        complaintId,
        toStatus: toStatus as ComplaintStatus,
        note,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="toStatus">Yeni durum</Label>
        <Select
          id="toStatus"
          value={toStatus}
          onChange={(e) => setToStatus(e.target.value as ComplaintStatus)}
        >
          {next.map((s) => (
            <option key={s} value={s}>
              {COMPLAINT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Yapılan işlem / açıklama *</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Ne yapıldığını yazın…"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={pending} onClick={submit} className="w-full">
        Durumu Güncelle
      </Button>
    </div>
  );
}
