import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealerTarget, DealerTargetLine, DealerTargetProposal } from "@/types/db";

export type TargetWithLines = DealerTarget & { lines: DealerTargetLine[] };

/** One dealer's target for a year (null when none). */
export async function getTargetFor(
  supabase: SupabaseClient,
  companyId: string,
  year: number
): Promise<TargetWithLines | null> {
  const { data: t } = await supabase
    .from("dealer_targets")
    .select("*")
    .eq("company_id", companyId)
    .eq("year", year)
    .maybeSingle();
  if (!t) return null;
  const { data: lines } = await supabase
    .from("dealer_target_lines")
    .select("*")
    .eq("target_id", t.id);
  return { ...(t as DealerTarget), lines: (lines as DealerTargetLine[] | null) ?? [] };
}

/** All targets of a year keyed by company id (lists, dashboard). */
export async function targetsForYear(
  supabase: SupabaseClient,
  year: number
): Promise<Map<string, TargetWithLines>> {
  const { data: ts } = await supabase
    .from("dealer_targets")
    .select("*")
    .eq("year", year)
    .limit(5000);
  const targets = (ts as DealerTarget[] | null) ?? [];
  const map = new Map<string, TargetWithLines>();
  for (const t of targets) map.set(t.company_id, { ...t, lines: [] });
  const ids = targets.map((t) => t.id);
  const byId = new Map(Array.from(map.values()).map((t) => [t.id, t]));
  for (let i = 0; i < ids.length; i += 300) {
    const { data: lines } = await supabase
      .from("dealer_target_lines")
      .select("*")
      .in("target_id", ids.slice(i, i + 300));
    for (const l of (lines as DealerTargetLine[] | null) ?? [])
      byId.get(l.target_id)?.lines.push(l);
  }
  return map;
}

export type TargetRevisionView = {
  id: string;
  changed_at: string;
  changed_by_name: string | null;
  reason: string | null;
  before: Record<string, { target_qty: number; monthly_qty: number[] | null }>;
  after: Record<string, { target_qty: number; monthly_qty: number[] | null }>;
};

/** Change history of one target (newest first). */
export async function getTargetRevisions(
  supabase: SupabaseClient,
  targetId: string
): Promise<TargetRevisionView[]> {
  const { data } = await supabase
    .from("dealer_target_revisions")
    .select("id, changed_at, reason, before, after, changed_by, profiles:changed_by(full_name)")
    .eq("target_id", targetId)
    .order("changed_at", { ascending: false })
    .limit(50);
  return ((data as unknown as {
    id: string;
    changed_at: string;
    reason: string | null;
    before: TargetRevisionView["before"];
    after: TargetRevisionView["after"];
    profiles: { full_name: string } | { full_name: string }[] | null;
  }[] | null) ?? []).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      changed_at: r.changed_at,
      changed_by_name: p?.full_name ?? null,
      reason: r.reason,
      before: r.before ?? {},
      after: r.after ?? {},
    };
  });
}

export type TargetProposalView = DealerTargetProposal & { proposed_by_name: string | null };

type ProposalRow = DealerTargetProposal & {
  profiles: { full_name: string } | { full_name: string }[] | null;
};
const toView = (r: ProposalRow): TargetProposalView => {
  const { profiles, ...rest } = r;
  const p = Array.isArray(profiles) ? profiles[0] : profiles;
  return { ...rest, lines: rest.lines ?? {}, proposed_by_name: p?.full_name ?? null };
};
const PROPOSAL_SELECT = "*, profiles:proposed_by(full_name)";

/** Newest proposal for a dealer-year (optionally only one rep's). */
export async function latestProposalFor(
  supabase: SupabaseClient,
  companyId: string,
  year: number,
  proposedBy?: string
): Promise<TargetProposalView | null> {
  let q = supabase
    .from("dealer_target_proposals")
    .select(PROPOSAL_SELECT)
    .eq("company_id", companyId)
    .eq("year", year)
    .order("created_at", { ascending: false })
    .limit(1);
  if (proposedBy) q = q.eq("proposed_by", proposedBy);
  const { data } = await q.maybeSingle();
  return data ? toView(data as unknown as ProposalRow) : null;
}

/** The proposal awaiting a manager's decision for a dealer-year, if any. */
export async function pendingProposalFor(
  supabase: SupabaseClient,
  companyId: string,
  year: number
): Promise<TargetProposalView | null> {
  const { data } = await supabase
    .from("dealer_target_proposals")
    .select(PROPOSAL_SELECT)
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("status", "bekliyor")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toView(data as unknown as ProposalRow) : null;
}

/** All pending proposals of a year (list page, dashboard). */
export async function pendingProposalsForYear(
  supabase: SupabaseClient,
  year: number
): Promise<TargetProposalView[]> {
  const { data } = await supabase
    .from("dealer_target_proposals")
    .select(PROPOSAL_SELECT)
    .eq("year", year)
    .eq("status", "bekliyor")
    .order("created_at", { ascending: false })
    .limit(500);
  return ((data as unknown as ProposalRow[] | null) ?? []).map(toView);
}
