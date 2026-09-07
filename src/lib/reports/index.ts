import {
  buildZiyaret,
  buildPerformans,
  buildSikayet,
  buildRakip,
  buildKapsama,
  buildPlan,
  buildMarka,
  buildKazanim,
  type ReportBuilder,
} from "@/lib/reports/builders";
import { buildStok, buildAnket, buildHedef } from "@/lib/reports/builders-extra";

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
  | "category" // product category select
  | "survey" // survey select (anket)
  | "year"; // target year

export type ReportGroup =
  | "Ziyaret & Kapsama"
  | "Şikayet"
  | "Rakip & Marka"
  | "Plan"
  | "Performans"
  | "Stok"
  | "Anket"
  | "Hedef";

export type ReportDef = {
  /** Scans full history; excluded from the "all reports" bundle to keep it fast. */
  heavy?: boolean;
  label: string;
  /** "Bu rapor neyi cevaplar" — one plain sentence for managers. */
  question: string;
  group: ReportGroup;
  /** Shown next to the date filter so the default window is never a surprise. */
  defaultRangeText?: string;
  filenameBase: string;
  filters: FilterKind[];
  build: ReportBuilder;
};

export const REPORTS: Record<string, ReportDef> = {
  ziyaret: {
    label: "Ziyaret Raporu",
    question: "Kim, ne zaman, hangi firmayı ziyaret etti ve formda ne yazdı?",
    group: "Ziyaret & Kapsama",
    defaultRangeText: "Varsayılan: son 30 gün",
    filenameBase: "ziyaret-raporu",
    filters: ["range", "sp", "vstatus", "kind"],
    build: buildZiyaret,
  },
  performans: {
    label: "Pazarlamacı Performans Özeti",
    question: "Her pazarlamacı dönemde kaç ziyaret, şikayet ve rakip kaydı girdi?",
    group: "Performans",
    defaultRangeText: "Varsayılan: bu ay",
    filenameBase: "pazarlamaci-performans",
    filters: ["range"],
    build: buildPerformans,
  },
  sikayet: {
    label: "Şikayet Raporu",
    question: "Hangi şikayetler açıldı, kimde, hangi durumda ve gecikti mi?",
    group: "Şikayet",
    defaultRangeText: "Varsayılan: son 30 gün",
    filenameBase: "sikayet-raporu",
    filters: ["range", "cstatus", "dept"],
    build: buildSikayet,
  },
  rakip: {
    label: "Rakip Fiyat Raporu",
    question: "Rakipler hangi ürünü nerede kaça satıyor?",
    group: "Rakip & Marka",
    defaultRangeText: "Varsayılan: son 30 gün",
    filenameBase: "rakip-fiyat-raporu",
    filters: ["range", "competitor"],
    build: buildRakip,
  },
  kapsama: {
    label: "Bayi Kapsama / Son Ziyaret",
    question: "Hangi bayi kime atanmış, en son ne zaman ziyaret edilmiş?",
    group: "Ziyaret & Kapsama",
    filenameBase: "bayi-kapsama",
    filters: ["segment", "sp"],
    build: buildKapsama,
  },
  plan: {
    label: "Haftalık Plan Raporu",
    question: "Kim hangi haftaya hangi firmaları planladı, plan onaylandı mı?",
    group: "Plan",
    defaultRangeText: "Varsayılan: bu hafta",
    filenameBase: "haftalik-plan-raporu",
    filters: ["weekrange", "sp"],
    build: buildPlan,
  },
  marka: {
    label: "Marka Rekabeti",
    question: "Firmalar hangi kategoride hangi markayı kullanıyor; Dayson payı ne?",
    group: "Rakip & Marka",
    defaultRangeText: "Varsayılan: son 30 gün",
    filenameBase: "marka-rekabeti",
    filters: ["range", "category", "segment", "sp"],
    build: buildMarka,
  },
  kazanim: {
    label: "Daysona / Daysondan Dönüş",
    question: "Dönemde hangi firmalar Dayson'a geçti, hangileri rakibe kaydı?",
    group: "Rakip & Marka",
    defaultRangeText: "Varsayılan: bu ay",
    filenameBase: "kazanim-kayip",
    filters: ["range"],
    build: buildKazanim,
    heavy: true,
  },
  stok: {
    label: "Stok Durumu",
    question: "Her bayide son sayımda ürün başına kaç palet vardı, ne zaman sayıldı?",
    group: "Stok",
    filenameBase: "stok-durumu",
    filters: ["sp", "segment"],
    build: buildStok,
  },
  anket: {
    label: "Özel Rapor Cevapları",
    question: "Seçilen özel raporu kim, hangi firma için nasıl cevapladı?",
    group: "Anket",
    defaultRangeText: "Varsayılan: tüm tarihler",
    filenameBase: "ozel-rapor",
    filters: ["survey", "range", "sp"],
    build: buildAnket,
  },
  hedef: {
    label: "Hedef Gerçekleşme",
    question: "Bayiler yıllık hedefin neresinde; kim geride, kim önde?",
    group: "Hedef",
    filenameBase: "hedefler",
    filters: ["year"],
    build: buildHedef,
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
  "kazanim",
  "stok",
  "anket",
  "hedef",
];

export const REPORT_GROUPS: ReportGroup[] = [
  "Ziyaret & Kapsama",
  "Performans",
  "Plan",
  "Şikayet",
  "Rakip & Marka",
  "Stok",
  "Anket",
  "Hedef",
];
