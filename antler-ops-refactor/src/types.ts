// Centralised type definitions for accounts, tasks and communication logs.

export type AccountStatus = "unknown" | "active" | "churned" | "prospect" | "pending" | string;

export interface Account {
  /** Unique identifier for an account (e.g. ACC001) */
  account_id: string;
  /** Human‑friendly name of the customer */
  name: string | null;
  /** Current lifecycle status (e.g. active, churned) */
  status: AccountStatus | null;
  /** Email of the primary customer success manager */
  primary_csm_email: string | null;
  /** Timestamp of the next recommended follow‑up */
  next_follow_up?: string | null;
  /** Additional arbitrary fields returned from Supabase */
  [key: string]: unknown;
}

export interface Task {
  id: number;
  account_id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | string;
  assigned_to: string;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  completion_note: string | null;
  /** Additional arbitrary fields returned from Supabase */
  [key: string]: unknown;
}

export interface CommunicationLog {
  id: number;
  account_id: string;
  type: "call" | "email" | "meeting" | string;
  subject: string;
  notes: string | null;
  created_at: string;
  /** Additional arbitrary fields returned from Supabase */
  [key: string]: unknown;
}