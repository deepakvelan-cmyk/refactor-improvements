import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Account } from "../types";
import { supabase } from "../lib/supabase";
import { withRetry, withSupabaseTimeout } from "../lib/withSupabaseTimeout";
import styles from "./TaskManager.module.css";

interface TaskManagerProps {
  accounts: Account[];
}

const TASK_CATEGORIES = [
  "Onboarding",
  "Payment followup",
  "Design related",
  "Website related",
  "Customer data",
  "Hygiene call",
  "Integrations",
  "Reviews related",
  "Access lost",
  "Others",
];

function formatDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * A standalone component to create or assign tasks to an account.  It
 * presents a searchable account selector and exposes fields for task
 * category, title, description, due date and assignee.  Upon
 * submission, the task is inserted into the Supabase `tasks` table and
 * associated queries are invalidated.
 */
export default function TaskManager({ accounts }: TaskManagerProps) {
  const queryClient = useQueryClient();
  const [accountQuery, setAccountQuery] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const [category, setCategory] = useState(TASK_CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(formatDate(new Date()));

  // Filter accounts locally based on the query.  The user must type at
  // least two characters to trigger the search.
  const canSearch = useMemo(() => accountQuery.trim().length >= 2, [accountQuery]);
  const accountResults = useMemo(() => {
    if (!canSearch) return [] as Account[];
    const q = accountQuery.trim().toLowerCase();
    return accounts.filter((a) => {
      const name = (a.name ?? "").toLowerCase();
      const id = a.account_id.toLowerCase();
      const st = (a.status ?? "").toLowerCase();
      return name.includes(q) || id.includes(q) || st.includes(q);
    }).slice(0, 30);
  }, [accountQuery, accounts, canSearch]);

  const createTask = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) throw new Error("No account selected");
      if (!assignTo.trim()) throw new Error("Assign to email is required");
      const fullTitle = title.trim() ? `[${category}] ${title.trim()}` : `[${category}]`;
      const payload = {
        account_id: selectedAccount.account_id,
        title: fullTitle,
        description: description.trim() || null,
        status: "pending",
        due_date: dueDate || null,
        assigned_to: assignTo.trim().toLowerCase(),
        created_at: new Date().toISOString(),
        completed_at: null,
        completion_note: null,
      };
      const { error } = await withRetry(() =>
        withSupabaseTimeout(supabase.from("tasks").insert(payload))
      );
      if (error) throw new Error(error.message);
      return payload;
    },
    onSuccess: (_, variables, context) => {
      // Invalidate tasks queries for the selected account so that
      // downstream components refresh their state automatically.
      if (selectedAccount) {
        queryClient.invalidateQueries({ queryKey: ["tasks", selectedAccount.account_id] });
      }
      // Reset form fields
      setTitle("");
      setDescription("");
    },
  });

  function handleSelectAccount(a: Account) {
    setSelectedAccount(a);
    setAccountQuery(a.name ? a.name : a.account_id);
    setAssignTo((a.primary_csm_email ?? "").trim().toLowerCase());
  }

  return (
    <div className={styles.container}>
      <div className={styles.title}>Create or Assign Task</div>
      {/* Account selector */}
      <div className={styles.formGroup}>
        <label htmlFor="tm-account">Account name / ID</label>
        <input
          id="tm-account"
          type="text"
          value={accountQuery}
          onChange={(e) => {
            setAccountQuery(e.target.value);
            setSelectedAccount(null);
          }}
          placeholder="Type at least 2 letters…"
        />
        {canSearch && accountResults.length > 0 && !selectedAccount && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", maxHeight: "12rem", overflowY: "auto" }}>
            {accountResults.map((a) => (
              <button
                key={a.account_id}
                type="button"
                onClick={() => handleSelectAccount(a)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.5rem",
                  border: "none",
                  borderBottom: "1px solid #f3f4f6",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontWeight: 700 }}>{a.name || a.account_id}</span>
                <br />
                <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                  {a.account_id} · {a.status ?? "—"} · CSM: {a.primary_csm_email ?? "—"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Category */}
      <div className={styles.formGroup}>
        <label htmlFor="tm-category">Category *</label>
        <select id="tm-category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {TASK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {/* Title */}
      <div className={styles.formGroup}>
        <label htmlFor="tm-title">Custom title (optional)</label>
        <input
          id="tm-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add specifics…"
        />
      </div>
      {/* Description */}
      <div className={styles.formGroup}>
        <label htmlFor="tm-description">Description</label>
        <textarea
          id="tm-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What exactly should be done?"
        />
      </div>
      {/* Due date and assignee */}
      <div className={styles.formGroup}>
        <label htmlFor="tm-due">Due date</label>
        <input id="tm-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="tm-assign">Assign to (CSM email) *</label>
        <input
          id="tm-assign"
          type="email"
          value={assignTo}
          onChange={(e) => setAssignTo(e.target.value)}
          placeholder="csm@company.com"
        />
      </div>
      <button
        type="button"
        className={styles.submitButton}
        onClick={() => createTask.mutate()}
        disabled={createTask.isPending || !selectedAccount}
        aria-label="Create task"
      >
        {createTask.isPending ? "Creating…" : "Create Task"}
      </button>
      {createTask.isError && (
        <div role="alert" style={{ color: "#b91c1c", marginTop: "0.5rem", fontSize: "0.85rem" }}>
          Error: {(createTask.error as Error).message}
        </div>
      )}
      {createTask.isSuccess && (
        <div style={{ color: "#065f46", marginTop: "0.5rem", fontSize: "0.85rem" }}>
          Task created successfully.
        </div>
      )}
    </div>
  );
}