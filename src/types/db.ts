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
} from "@/lib/enums";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
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
  created_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  company_id: string;
  salesperson_id: string;
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
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisitAnswer {
  id: string;
  visit_id: string;
  question_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
}

export interface Complaint {
  id: string;
  company_id: string | null;
  complainant_name: string | null;
  complainant_phone: string | null;
  reported_by: string;
  visit_id: string | null;
  type: ComplaintType;
  owner_dept: ComplaintOwnerDept;
  assignee_id: string | null;
  status: ComplaintStatus;
  title: string;
  description: string;
  priority: number;
  due_date: string | null;
  resolved_at: string | null;
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

export interface CompetitorObservation {
  id: string;
  competitor_id: string;
  company_id: string | null;
  salesperson_id: string;
  visit_id: string | null;
  product_name: string;
  observed_price: number | null;
  currency: string;
  observed_at: string;
  city: string | null;
  note: string | null;
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
