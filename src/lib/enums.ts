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

/** Kinds shown in the UI. `sub_dealer` / `competitor_point` are retired enum
 *  members (migrated to "other"); they stay in the type so old rows still typecheck. */
export const COMPANY_KINDS = ["distributor", "non_customer", "other"] as const;
export type CompanyKind =
  | (typeof COMPANY_KINDS)[number]
  | "sub_dealer"
  | "competitor_point";
export const COMPANY_KIND_LABELS: Record<CompanyKind, string> = {
  distributor: "Bayi / Distribütör",
  non_customer: "Potansiyel Bayi",
  other: "Diğer",
  sub_dealer: "Diğer",
  competitor_point: "Diğer",
};
/** Kinds a salesperson may register from the field (dealers are opened by the office). */
export const FIELD_REGISTRABLE_KINDS = ["non_customer", "other"] as const;

export const ASSIGNMENT_ROLES = ["owner", "backup"] as const;
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];
export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  owner: "Sorumlu",
  backup: "Yedek",
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

export const PLAN_STATUSES = [
  "taslak",
  "gonderildi",
  "onaylandi",
  "reddedildi",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  taslak: "Taslak",
  gonderildi: "Onay bekliyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};
export const PLAN_STATUS_BADGE: Record<
  PlanStatus,
  "warning" | "default" | "success" | "destructive"
> = {
  taslak: "warning",
  gonderildi: "default",
  onaylandi: "success",
  reddedildi: "destructive",
};

export const SURVEY_STATUSES = ["taslak", "aktif", "kapandi"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];
export const SURVEY_STATUS_LABELS: Record<SurveyStatus, string> = {
  taslak: "Taslak",
  aktif: "Aktif",
  kapandi: "Kapandı",
};
export const SURVEY_INPUT_TYPES = [
  "boolean",
  "select",
  "number",
  "text",
  "scale",
] as const;
export type SurveyInputType = (typeof SURVEY_INPUT_TYPES)[number];
export const SURVEY_INPUT_TYPE_LABELS: Record<SurveyInputType, string> = {
  boolean: "Evet / Hayır",
  select: "Seçenekli",
  number: "Sayı",
  text: "Metin",
  scale: "Puan (1-5)",
};

export const TARGET_STATUSES = ["taslak", "mutabik", "iptal"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];
export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  taslak: "Taslak",
  mutabik: "Mutabık",
  iptal: "İptal",
};
export const PACE_LABELS = {
  onde: "Önde",
  yolunda: "Yolunda",
  geride: "Geride",
} as const;
export type Pace = keyof typeof PACE_LABELS;

export const DOCUMENT_REF_TABLES = [
  "visit",
  "complaint",
  "competitor_observation",
  "stock_count",
] as const;
export type DocumentRefTable = (typeof DOCUMENT_REF_TABLES)[number];
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
/** PDF attachments (price lists etc.) — stored in the same bucket, kind = "file". */
export const PDF_MIME = "application/pdf";
export const PDF_MAX_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = [...PHOTO_MIME_TYPES, PDF_MIME] as const;
export const isPdfMime = (mime: string) => mime === PDF_MIME;
/** Per-mime size ceiling used by the upload ticket and the bucket limit. */
export const maxBytesForMime = (mime: string) => (isPdfMime(mime) ? PDF_MAX_BYTES : PHOTO_MAX_BYTES);
export const PHOTO_BUCKET = "field-photos";

export const SUPPLY_KINDS = ["brand", "own_production", "export"] as const;
export type SupplyKind = (typeof SUPPLY_KINDS)[number];
export const SUPPLY_KIND_LABELS: Record<SupplyKind, string> = {
  brand: "Marka",
  own_production: "Kendi üretimi",
  export: "İhracat",
};

/** Suggested roles for a company contact (görüşülen kişi). */
export const CONTACT_ROLES = [
  "sahip",
  "satin_alma",
  "depo",
  "muhasebe",
  "diger",
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];
export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  sahip: "Firma sahibi",
  satin_alma: "Satın alma",
  depo: "Depo",
  muhasebe: "Muhasebe",
  diger: "Diğer",
};

export const IMPORT_STATUSES = ["basarili", "kismi", "hata"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];
export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  basarili: "Başarılı",
  kismi: "Kısmi",
  hata: "Hata",
};
