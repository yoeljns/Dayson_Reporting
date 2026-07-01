import {
  buildZiyaret,
  buildPerformans,
  buildSikayet,
  buildRakip,
  buildKapsama,
  buildPlan,
  buildMarka,
  type ReportBuilder,
} from "@/lib/reports/builders";

export type FilterKind =
  | "range" // start + end date
  | "weekrange" // start + end date, snapped to weeks
  | "sp" // salesperson select
  | "vstatus" // visit status select
  | "cstatus" // complaint status select
  | "dept" // complaint department select
  | "competitor" // competitor select
  | "segment" // segment select
  | "kind" // company kind select
  | "category"; // product category select

export type ReportDef = {
  label: string;
  filenameBase: string;
  filters: FilterKind[];
  build: ReportBuilder;
};

export const REPORTS: Record<string, ReportDef> = {
  ziyaret: {
    label: "Ziyaret Raporu",
    filenameBase: "ziyaret-raporu",
    filters: ["range", "sp", "vstatus", "kind"],
    build: buildZiyaret,
  },
  performans: {
    label: "Pazarlamacı Performans Özeti",
    filenameBase: "pazarlamaci-performans",
    filters: ["range"],
    build: buildPerformans,
  },
  sikayet: {
    label: "Şikayet Raporu",
    filenameBase: "sikayet-raporu",
    filters: ["range", "cstatus", "dept"],
    build: buildSikayet,
  },
  rakip: {
    label: "Rakip Fiyat Raporu",
    filenameBase: "rakip-fiyat-raporu",
    filters: ["range", "competitor"],
    build: buildRakip,
  },
  kapsama: {
    label: "Bayi Kapsama / Son Ziyaret",
    filenameBase: "bayi-kapsama",
    filters: ["segment", "sp"],
    build: buildKapsama,
  },
  plan: {
    label: "Haftalık Plan Raporu",
    filenameBase: "haftalik-plan-raporu",
    filters: ["weekrange", "sp"],
    build: buildPlan,
  },
  marka: {
    label: "Marka Rekabeti",
    filenameBase: "marka-rekabeti",
    filters: ["range", "category", "segment", "sp"],
    build: buildMarka,
  },
};

export type ReportType = keyof typeof REPORTS;
export const REPORT_ORDER: string[] = [
  "ziyaret",
  "performans",
  "sikayet",
  "rakip",
  "kapsama",
  "plan",
  "marka",
];
