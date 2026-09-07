import type { DocumentRefTable } from "@/lib/enums";

export type OpKind = "visit" | "visit.photos" | "form";
export type FormKind = "sikayet" | "rakip" | "stok" | "anket" | "firma";

export interface VisitOpPayload {
  visitId: string;
  /** true when the draft itself was created offline (createDraftVisit replay). */
  create: boolean;
  companyId: string;
  visitType: "telefon" | "yuz_yuze";
  visitDate: string;
  answers: Array<{
    questionId: string;
    valueText?: string | null;
    valueNumber?: number | null;
    valueDate?: string | null;
    valueDetail?: string | null;
  }>;
  selections: Array<{
    categoryId: string;
    brandId?: string | null;
    supplyKind?: "brand" | "own_production" | "export";
  }>;
  contactId: string | null;
  /** Skip products/contact/answers (bare draft from the new-visit screen). */
  bare?: boolean;
  complete: boolean;
}

export interface PhotosOpPayload {
  refTable: DocumentRefTable;
  refId: string;
  documentIds: string[];
  /** Already uploaded + attached (partial progress survives a crash). */
  done: string[];
  /** Already in Storage before the form failed — only need attaching. */
  uploaded?: { documentId: string; path: string; mime: string; sizeBytes: number }[];
}

export interface FormOpPayload {
  form: FormKind;
  input: Record<string, unknown>;
}

export interface Op {
  id: string;
  kind: OpKind;
  /** Short human label for the sync badge ("Ziyaret · Aksa Bayi"). */
  label: string;
  /** Ops sharing a key replace each other (latest wins, first createdAt kept). */
  coalesceKey?: string;
  /** Owner (auth user id) — ops of another user are never replayed. */
  ownerId: string;
  payload: VisitOpPayload | PhotosOpPayload | FormOpPayload;
  createdAt: number;
  tries: number;
  error?: string;
}

export interface QueuedPhoto {
  documentId: string;
  refTable: DocumentRefTable;
  refId: string;
  blob: Blob;
  mime: string;
  ownerId: string;
  createdAt: number;
}

export const MAX_TRIES = 3;
export const QUEUE_EVENT = "dayson:offline-queue";
export const OWNER_KEY = "dayson:offline-owner";
