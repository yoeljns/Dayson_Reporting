/**
 * Central catalog of enum values + their Turkish labels.
 * These mirror the Postgres enums in the migration. Keep both in sync.
 */

export const USER_ROLES = ["salesperson", "manager", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  salesperson: "Pazarlamacı",
  manager: "Yönetici",
  admin: "Yönetici (Admin)",
};

export const SEGMENTS = ["A", "B", "C", "D"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const DEBT_STATUSES = ["temiz", "riskli", "gecikmis", "bloke"] as const;
export type DebtStatus = (typeof DEBT_STATUSES)[number];
export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = {
  temiz: "Temiz",
  riskli: "Riskli",
  gecikmis: "Gecikmiş",
  bloke: "Bloke",
};

export const COMPANY_KINDS = ["distributor", "non_customer"] as const;
export type CompanyKind = (typeof COMPANY_KINDS)[number];
export const COMPANY_KIND_LABELS: Record<CompanyKind, string> = {
  distributor: "Bayi / Distribütör",
  non_customer: "Distribütör Dışı",
};

export const VISIT_TYPES = ["telefon", "yuz_yuze"] as const;
export type VisitType = (typeof VISIT_TYPES)[number];
export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  telefon: "Telefon",
  yuz_yuze: "Yüz Yüze",
};

export const VISIT_STATUSES = ["taslak", "tamamlandi"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  taslak: "Taslak",
  tamamlandi: "Tamamlandı",
};

export const COMPLAINT_TYPES = [
  "urun_hatasi",
  "fiyat_fatura_hatasi",
  "servis_hatasi",
  "teslimat",
  "diger",
] as const;
export type ComplaintType = (typeof COMPLAINT_TYPES)[number];
export const COMPLAINT_TYPE_LABELS: Record<ComplaintType, string> = {
  urun_hatasi: "Ürün Hatası",
  fiyat_fatura_hatasi: "Fiyat / Fatura Hatası",
  servis_hatasi: "Servis Hatası",
  teslimat: "Teslimat",
  diger: "Diğer",
};

export const COMPLAINT_STATUSES = [
  "acik",
  "islemde",
  "cozuldu",
  "iptal",
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  acik: "Açık",
  islemde: "İşlemde",
  cozuldu: "Çözüldü",
  iptal: "İptal",
};

/** Allowed status transitions — enforced again in the DB RPC. */
export const COMPLAINT_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> =
  {
    acik: ["islemde", "iptal"],
    islemde: ["cozuldu", "iptal"],
    cozuldu: [],
    iptal: [],
  };

export const COMPLAINT_OWNER_DEPTS = [
  "kalite_uretim",
  "muhasebe",
  "lojistik",
  "satis",
  "yonetim",
] as const;
export type ComplaintOwnerDept = (typeof COMPLAINT_OWNER_DEPTS)[number];
export const COMPLAINT_OWNER_DEPT_LABELS: Record<ComplaintOwnerDept, string> = {
  kalite_uretim: "Kalite / Üretim",
  muhasebe: "Muhasebe",
  lojistik: "Lojistik",
  satis: "Satış",
  yonetim: "Yönetim",
};

export const COMPLAINT_PRIORITIES = [1, 2, 3] as const;
export const COMPLAINT_PRIORITY_LABELS: Record<number, string> = {
  1: "Yüksek",
  2: "Orta",
  3: "Düşük",
};

export const PLAN_STATUSES = ["taslak", "gonderildi"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  taslak: "Taslak",
  gonderildi: "Gönderildi",
};

export const IMPORT_STATUSES = ["basarili", "kismi", "hata"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];
export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  basarili: "Başarılı",
  kismi: "Kısmi",
  hata: "Hata",
};
