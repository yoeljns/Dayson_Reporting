import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPPLY_KIND_LABELS } from "@/lib/enums";

/**
 * "Daysona / Daysondan dönüş" — brand switching per dealer.
 *
 * Every completed visit records, per product category, which brand(s) the
 * dealer is supplied by. Read chronologically that is a state timeline: a
 * dealer either carries one of our own brands in a category, or it doesn't.
 * Each point where that state flips is a transition:
 *   competitor → ours  = kazanım (won back / switched to us)
 *   ours → competitor  = kayıp   (lost to a competitor)
 * We scan the WHOLE history and collect every flip, not just the last two
 * visits, so a dealer that went out and came back shows both events.
 */

const FETCH_CAP = 20000;

export type BrandTransition = {
  date: string; // visit_date of the observation that completed the flip
  companyId: string;
  companyName: string;
  categoryLabel: string;
  fromLabel: string;
  toLabel: string;
  salesperson: string;
  won: boolean; // true = kazanım, false = kayıp
};

export type CategoryShare = {
  categoryLabel: string;
  sortOrder: number;
  oursDealers: number;
  totalDealers: number;
  /** Most frequent competitor brands right now, biggest first. */
  topCompetitors: { name: string; dealers: number }[];
};

export type BrandSwitchResult = {
  transitions: BrandTransition[];
  share: CategoryShare[];
};

type ObsRow = {
  visit_id: string;
  category_id: string;
  brand_id: string | null;
  custom_name: string | null;
  supply_kind: string;
};

/** One dealer's state in one category at one point in time. */
type Snapshot = {
  date: string;
  /** created_at of the visit — tiebreak when a dealer is visited twice a day. */
  seq: string;
  /** Brands of ours seen in this visit, and everything else, both sorted. */
  ownLabels: string[];
  otherLabels: string[];
  salesperson: string;
};

/** A dealer "has us" in a category when any of our own brands was recorded. */
function isOurs(s: Snapshot): boolean {
  return s.ownLabels.length > 0;
}

/** What to print for a snapshot: our brands when we're in, else the rivals. */
function labelOf(s: Snapshot): string {
  const list = isOurs(s) ? s.ownLabels : s.otherLabels;
  return list.length > 0 ? list.join(", ") : "—";
}

function one<T>(r: T | T[] | null | undefined): T | null {
  return Array.isArray(r) ? r[0] ?? null : r ?? null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * @param start/@param end  ISO dates bounding which TRANSITIONS are reported.
 *   History before `start` is still read — a flip is only meaningful against
 *   the previous observation, however old it is.
 */
export async function analyzeBrandSwitch(
  supabase: SupabaseClient,
  start: string,
  end: string
): Promise<BrandSwitchResult> {
  // 1) Catalog: which (category, brand) pairs are ours + display labels.
  const [{ data: cats }, { data: brands }, { data: links }] = await Promise.all([
    supabase
      .from("product_categories")
      .select("id, label_tr, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("product_brands").select("id, name"),
    supabase
      .from("product_category_brands")
      .select("category_id, brand_id, is_own")
      .is("salesperson_id", null),
  ]);

  const catLabel = new Map(
    ((cats ?? []) as { id: string; label_tr: string; sort_order: number }[]).map(
      (c) => [c.id, c]
    )
  );
  const brandName = new Map(
    ((brands ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name])
  );
  const isOwn = new Map(
    (
      (links ?? []) as {
        category_id: string;
        brand_id: string;
        is_own: boolean;
      }[]
    ).map((l) => [`${l.category_id}|${l.brand_id}`, l.is_own])
  );

  // 2) Completed visits up to `end`, newest first so that hitting FETCH_CAP
  //    drops ANCIENT history rather than the period we are reporting on.
  //    Deleted dealers are excluded (!inner + deleted_at is null).
  const { data: visitRows } = await supabase
    .from("visits")
    .select(
      "id, visit_date, created_at, company_id, companies!inner(name, deleted_at), salesperson:salesperson_id(full_name)"
    )
    .eq("status", "tamamlandi")
    .is("deleted_at", null)
    .is("companies.deleted_at", null)
    .lte("visit_date", end)
    .order("visit_date", { ascending: false })
    .limit(FETCH_CAP);

  type VisitRow = {
    id: string;
    visit_date: string;
    created_at: string;
    company_id: string;
    companies: { name: string } | { name: string }[] | null;
    salesperson: { full_name: string } | { full_name: string }[] | null;
  };
  const visits = new Map(
    ((visitRows ?? []) as VisitRow[]).map((v) => [v.id, v])
  );
  const visitIds = [...visits.keys()];
  if (visitIds.length === 0) return { transitions: [], share: [] };

  // 3) Product answers for those visits.
  const obs: ObsRow[] = [];
  for (const ids of chunk(visitIds, 500)) {
    const { data } = await supabase
      .from("visit_product_answers")
      .select("visit_id, category_id, brand_id, custom_name, supply_kind")
      .in("visit_id", ids);
    obs.push(...((data ?? []) as ObsRow[]));
  }

  // 4) Collapse to one snapshot per (company, category, visit): a dealer counts
  //    as "ours" if ANY of that visit's brands in the category is our own.
  const byKeyVisit = new Map<string, Snapshot>();
  for (const o of obs) {
    const v = visits.get(o.visit_id);
    if (!v) continue;
    const ours =
      o.supply_kind === "brand" &&
      o.brand_id != null &&
      isOwn.get(`${o.category_id}|${o.brand_id}`) === true;
    const label =
      o.supply_kind !== "brand"
        ? SUPPLY_KIND_LABELS[
            o.supply_kind as keyof typeof SUPPLY_KIND_LABELS
          ] ?? o.supply_kind
        : (o.brand_id ? brandName.get(o.brand_id) : null) ??
          o.custom_name ??
          "—";

    const key = `${v.company_id}|${o.category_id}|${o.visit_id}`;
    let snap = byKeyVisit.get(key);
    if (!snap) {
      snap = {
        date: v.visit_date,
        seq: v.created_at,
        ownLabels: [],
        otherLabels: [],
        salesperson: one(v.salesperson)?.full_name ?? "",
      };
      byKeyVisit.set(key, snap);
    }
    // A category can hold several brands in one visit. Collect them into stable
    // sorted buckets so the rendered labels never depend on row order.
    const bucket = ours ? snap.ownLabels : snap.otherLabels;
    if (!bucket.includes(label)) {
      bucket.push(label);
      bucket.sort((a, b) => a.localeCompare(b, "tr"));
    }
  }

  // 5) Group snapshots into per (company × category) timelines.
  const timelines = new Map<string, Snapshot[]>();
  for (const [key, snap] of byKeyVisit) {
    const [companyId, categoryId] = key.split("|");
    const k = `${companyId}|${categoryId}`;
    const arr = timelines.get(k) ?? [];
    arr.push(snap);
    timelines.set(k, arr);
  }

  const transitions: BrandTransition[] = [];
  // categoryId -> current state per company, for the share table
  const currentByCat = new Map<string, Map<string, Snapshot>>();

  for (const [k, snapsRaw] of timelines) {
    const [companyId, categoryId] = k.split("|");
    const cat = catLabel.get(categoryId);
    if (!cat) continue; // inactive/removed category
    // Oldest first; same-day visits are ordered by created_at so the direction
    // of a same-day flip is deterministic rather than a coin flip.
    const snaps = snapsRaw.sort(
      (a, b) => a.date.localeCompare(b.date) || a.seq.localeCompare(b.seq)
    );

    // Every state flip along the timeline is a transition point.
    for (let i = 1; i < snaps.length; i++) {
      const prev = snaps[i - 1];
      const cur = snaps[i];
      if (isOurs(prev) === isOurs(cur)) continue;
      if (cur.date < start || cur.date > end) continue; // outside the period
      transitions.push({
        date: cur.date,
        companyId,
        companyName: "", // filled in below from the visit rows
        categoryLabel: cat.label_tr,
        fromLabel: labelOf(prev),
        toLabel: labelOf(cur),
        salesperson: cur.salesperson,
        won: isOurs(cur),
      });
    }

    // Latest snapshot = today's state, used for the share table.
    const latest = snaps[snaps.length - 1];
    const m = currentByCat.get(categoryId) ?? new Map<string, Snapshot>();
    m.set(companyId, latest);
    currentByCat.set(categoryId, m);
  }

  // Company names for the transition rows.
  const companyName = new Map<string, string>();
  for (const v of visits.values()) {
    if (!companyName.has(v.company_id))
      companyName.set(v.company_id, one(v.companies)?.name ?? "");
  }
  for (const t of transitions) t.companyName = companyName.get(t.companyId) ?? "";
  // Newest first, with stable tiebreaks so the list never reshuffles.
  transitions.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.companyName.localeCompare(b.companyName, "tr") ||
      a.categoryLabel.localeCompare(b.categoryLabel, "tr")
  );

  // 6) Current share per category.
  const share: CategoryShare[] = [];
  for (const [categoryId, perCompany] of currentByCat) {
    const cat = catLabel.get(categoryId);
    if (!cat) continue;
    let oursDealers = 0;
    const competitor = new Map<string, number>();
    for (const snap of perCompany.values()) {
      if (isOurs(snap)) oursDealers++;
      else
        for (const name of snap.otherLabels)
          competitor.set(name, (competitor.get(name) ?? 0) + 1);
    }
    share.push({
      categoryLabel: cat.label_tr,
      sortOrder: cat.sort_order,
      oursDealers,
      totalDealers: perCompany.size,
      topCompetitors: [...competitor.entries()]
        .map(([name, dealers]) => ({ name, dealers }))
        .sort((a, b) => b.dealers - a.dealers)
        .slice(0, 3),
    });
  }
  share.sort((a, b) => a.sortOrder - b.sortOrder);

  return { transitions, share };
}
