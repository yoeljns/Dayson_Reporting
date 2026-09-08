/**
 * Hand-maintained row types mirroring the Postgres schema.
 * For full generated types run: supabase gen types typescript --project-id <id>
 */
import type {
  UserRole,
  Segment,
  DebtStatus,
  CompanyKind,
  VisitType,
  VisitStatus,
  ComplaintType,
  ComplaintStatus,
  ComplaintOwnerDept,
  ImportStatus,
  PlanStatus,
  AssignmentRole,
  SurveyStatus,
  SurveyInputType,
  TargetStatus,
  DocumentRefTable,
} from "@/lib/enums";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  /** Manager/admin UI preference; null = role default (see lib/ui-mode.ts). */
  management_mode?: boolean | null;
}

export interface Company {
  id: string;
  kind: CompanyKind;
  name: string;
  logo_code: string | null;
  segment: Segment | null;
  debt_status: DebtStatus | null;
  city: string | null;
  phone: string | null;
  notes: string | null;
  /** 2-digit il plaka kodu; used for survey targeting. */
  plate_code: string | null;
  /** Sub-dealer buys through this dealer ("X üzerinden alıyor"). */
  buys_from_company_id: string | null;
  created_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  company_id: string;
  salesperson_id: string;
  role: AssignmentRole;
  created_at: string;
}

export type QuestionInputType =
  | "select"
  | "multiselect"
  | "boolean"
  | "number"
  | "date"
  | "text";

export interface Question {
  id: string;
  code: string;
  label_tr: string;
  input_type: QuestionInputType;
  applies_to: VisitType[] | null;
  applies_to_kind: CompanyKind[] | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  value: string;
  label_tr: string;
  sort_order: number;
}

export interface QuestionWithOptions extends Question {
  question_options: QuestionOption[];
}

export interface Visit {
  id: string;
  company_id: string;
  salesperson_id: string;
  visit_type: VisitType;
  status: VisitStatus;
  visit_date: string;
  completed_at: string | null;
  contact_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyContact {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  role: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SupplyKind = "brand" | "own_production" | "export";

export interface ProductCategory {
  id: string;
  code: string;
  label_tr: string;
  note: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductBrand {
  id: string;
  name: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ProductCategoryBrand {
  id: string;
  category_id: string;
  brand_id: string;
  is_own: boolean;
  sort_order: number;
  salesperson_id: string | null;
  created_at: string;
}

export interface VisitProductAnswer {
  id: string;
  visit_id: string;
  category_id: string;
  brand_id: string | null;
  custom_name: string | null;
  supply_kind: SupplyKind;
  created_at: string;
}

export interface VisitAnswer {
  id: string;
  visit_id: string;
  question_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_detail: string | null;
}

export interface VisitPlan {
  id: string;
  salesperson_id: string;
  week_start: string;
  status: PlanStatus;
  note: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  decided_at: string | null;
  manager_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisitPlanItem {
  id: string;
  plan_id: string;
  company_id: string;
  planned_date: string | null;
  visit_type: VisitType | null;
  note: string | null;
  created_at: string;
}

export interface Complaint {
  id: string;
  company_id: string | null;
  complainant_name: string | null;
  complainant_phone: string | null;
  reported_by: string;
  visit_id: string | null;
  product_category_id: string | null;
  type: ComplaintType;
  owner_dept: ComplaintOwnerDept;
  assignee_id: string | null;
  status: ComplaintStatus;
  title: string;
  description: string;
  priority: number;
  due_date: string | null;
  detected_at: string | null;
  extras: Record<string, string | number | boolean | null>;
  resolved_at: string | null;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComplaintEvent {
  id: string;
  complaint_id: string;
  actor_id: string;
  from_status: ComplaintStatus | null;
  to_status: ComplaintStatus | null;
  note: string | null;
  created_at: string;
}

export interface Competitor {
  id: string;
  name: string;
  is_active: boolean;
}

export interface CompetitorProduct {
  id: string;
  competitor_id: string;
  category_id: string | null;
  name: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface CompetitorObservation {
  id: string;
  competitor_id: string;
  competitor_product_id: string | null;
  company_id: string | null;
  salesperson_id: string;
  visit_id: string | null;
  product_name: string;
  observed_price: number | null;
  currency: string;
  /** true = KDV dahil, false = hariç, null = bilinmiyor */
  price_includes_vat: boolean | null;
  observed_at: string;
  city: string | null;
  note: string | null;
  extras: Record<string, string | number | boolean | null>;
  is_draft: boolean;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  uploaded_by: string;
  filename: string;
  row_count: number | null;
  inserted_count: number | null;
  updated_count: number | null;
  error_count: number | null;
  status: ImportStatus;
  error_detail: ImportRowError[] | null;
  created_at: string;
}

export interface ImportRowError {
  row: number;
  logo_code?: string;
  message: string;
}

export interface Document {
  id: string;
  kind: "photo" | "file";
  storage_path: string;
  mime: string;
  size_bytes: number | null;
  company_id: string | null;
  ref_table: DocumentRefTable;
  ref_id: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface Survey {
  id: string;
  name: string;
  description: string | null;
  status: SurveyStatus;
  valid_from: string | null;
  valid_to: string | null;
  target_kinds: CompanyKind[] | null;
  target_plates: string[] | null;
  target_reps: string[] | null;
  allow_repeat: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  sort_order: number;
  prompt: string;
  input_type: SurveyInputType;
  /** select: [{value,label}] · scale: {min,max} */
  options: unknown;
  is_required: boolean;
  created_at: string;
}

export interface SurveyAnswer {
  id: string;
  survey_id: string;
  company_id: string;
  visit_id: string | null;
  salesperson_id: string;
  answered_at: string;
  answers: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
}

export interface Sku {
  id: string;
  code: string;
  name_tr: string;
  category_id: string | null;
  units_per_box: number | null;
  in_stock_count: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface StockCount {
  id: string;
  company_id: string;
  visit_id: string | null;
  salesperson_id: string;
  counted_at: string;
  note: string | null;
  extras: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
}

export interface StockCountLine {
  id: string;
  stock_count_id: string;
  sku_id: string;
  pallets: number;
}

export interface DealerTarget {
  id: string;
  company_id: string;
  year: number;
  status: TargetStatus;
  agreed_at: string | null;
  agreed_with: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealerTargetLine {
  id: string;
  target_id: string;
  category_id: string;
  target_qty: number;
  target_eur: number;
  actual_qty: number;
  actual_eur: number;
}
