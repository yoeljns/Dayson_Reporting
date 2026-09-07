"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Star } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ASSIGNMENT_ROLE_LABELS, type AssignmentRole } from "@/lib/enums";
import {
  upsertAssignment,
  removeAssignment,
} from "@/app/(admin)/admin/bayiler/actions";

type SP = { id: string; full_name: string };

/**
 * Owner + backup chips for one company. One Sorumlu at most; any number of
 * Yedek. Promoting a backup demotes the current owner.
 */
export function AssignmentEditor({
  companyId,
  owner,
  backups,
  salespeople,
  compact,
}: {
  companyId: string;
  owner: string | null;
  backups: string[];
  salespeople: SP[];
  /** Single-line layout for dense lists. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [pickRole, setPickRole] = useState<AssignmentRole>(
    owner ? "backup" : "owner"
  );

  const nameOf = (id: string) =>
    salespeople.find((s) => s.id === id)?.full_name ?? "Pasif kullanıcı";
  const assigned = new Set([...(owner ? [owner] : []), ...backups]);
  const available = salespeople.filter((s) => !assigned.has(s.id));

  function run(
    fn: () => Promise<{ ok?: boolean; error?: string }>,
    okMsg: string
  ) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast(res.error, "warn");
        return;
      }
      toast(okMsg, "ok");
      setAdding(false);
      setPick("");
      router.refresh();
    });
  }

  const chip = (id: string, role: AssignmentRole) => (
    <span
      key={id}
      className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs"
      title={ASSIGNMENT_ROLE_LABELS[role]}
    >
      {role === "owner" && (
        <Star className="h-3 w-3 fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" />
      )}
      <span className="font-medium">{nameOf(id)}</span>
      <span className="text-muted-foreground">
        · {ASSIGNMENT_ROLE_LABELS[role]}
      </span>
      {role === "backup" && (
        <button
          type="button"
          disabled={pending}
          title="Sorumlu yap"
          className="ml-0.5 text-muted-foreground hover:text-foreground"
          onClick={() =>
            run(
              () => upsertAssignment({ companyId, salespersonId: id, role: "owner" }),
              "Sorumlu değiştirildi"
            )
          }
        >
          <Star className="h-3 w-3" />
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        title="Çıkar"
        className="text-muted-foreground hover:text-destructive"
        onClick={() =>
          run(
            () => removeAssignment({ companyId, salespersonId: id }),
            "Atama kaldırıldı"
          )
        }
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );

  return (
    <div className={compact ? "flex flex-wrap items-center gap-1.5" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {owner ? chip(owner, "owner") : <Badge variant="warning">Atanmamış</Badge>}
        {backups.map((b) => chip(b, "backup"))}
      </div>
      {adding ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            className="h-8 w-auto text-xs"
            value={pick}
            disabled={pending}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Pazarlamacı seç…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
          <Select
            className="h-8 w-auto text-xs"
            value={pickRole}
            disabled={pending}
            onChange={(e) => setPickRole(e.target.value as AssignmentRole)}
          >
            <option value="owner">Sorumlu</option>
            <option value="backup">Yedek</option>
          </Select>
          <Button
            size="sm"
            className="h-8"
            disabled={pending || !pick}
            onClick={() =>
              run(
                () =>
                  upsertAssignment({ companyId, salespersonId: pick, role: pickRole }),
                "Pazarlamacı atandı"
              )
            }
          >
            Ekle
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={pending}
            onClick={() => setAdding(false)}
          >
            Vazgeç
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={pending || available.length === 0}
          onClick={() => {
            setPickRole(owner ? "backup" : "owner");
            setAdding(true);
          }}
        >
          <Plus className="mr-1 h-3 w-3" /> Pazarlamacı
        </Button>
      )}
    </div>
  );
}
