import React, { useState } from "react";
import type { Account } from "../types";
import {
  useTasks,
  useUpdateTask,
} from "../hooks/useTasks";
import {
  useCommunications,
  useAddCommunication,
} from "../hooks/useCommunications";
import styles from "./AccountDetails.module.css";

interface AccountDetailsProps {
  account: Account | null;
}

/**
 * Display details, tasks and communication logs for a selected account.  Tasks
 * and logs are fetched on demand using their respective hooks.  Users can
 * mark tasks as complete and add new communication logs.
 */
export default function AccountDetails({ account }: AccountDetailsProps) {
  const accountId = account?.account_id;
  const {
    data: tasks,
    isLoading: tasksLoading,
    error: tasksError,
  } = useTasks(accountId);
  const {
    data: logs,
    isLoading: logsLoading,
    error: logsError,
  } = useCommunications(accountId);

  const updateTask = useUpdateTask();
  const addComm = useAddCommunication();

  const [logType, setLogType] = useState<string>("call");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");

  if (!account) {
    return <div style={{ padding: "1rem", color: "#6b7280" }}>Select an account to see details.</div>;
  }

  async function handleComplete(taskId: number) {
    if (!accountId) return;
    // Send an update to mark the task as completed.  Provide a completion
    // timestamp.  Additional fields may be included as needed.
    await updateTask.mutateAsync({ id: taskId, status: "completed", completed_at: new Date().toISOString() } as any);
  }

  async function handleAddLog() {
    if (!accountId || !subject.trim()) return;
    await addComm.mutateAsync({
      account_id: accountId,
      type: logType,
      subject: subject.trim(),
      notes: notes.trim() || null,
      created_at: new Date().toISOString(),
    });
    setSubject("");
    setNotes("");
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>{account.name || account.account_id}</h2>
        <span>ID: {account.account_id}</span>
        <span>Status: {account.status ?? "—"}</span>
        <span>Primary CSM: {account.primary_csm_email ?? "—"}</span>
      </div>
      <div className={styles.section} aria-labelledby="tasks-heading">
        <h3 id="tasks-heading">Tasks</h3>
        {tasksLoading ? (
          <div>Loading tasks…</div>
        ) : tasksError ? (
          <div role="alert" style={{ color: "#b91c1c" }}>Failed to load tasks: {tasksError.message}</div>
        ) : tasks && tasks.length > 0 ? (
          tasks.map((task) => (
            <div key={task.id} className={styles.taskItem}>
              <span className={styles.taskTitle}>{task.title}</span>
              <span className={styles.taskMeta}>
                Due: {task.due_date ?? "—"} · Assigned to: {task.assigned_to ?? "—"}
              </span>
              {task.status !== "completed" && (
                <button
                  type="button"
                  className={styles.completeButton}
                  onClick={() => handleComplete(task.id)}
                  disabled={updateTask.isPending}
                  aria-label={`Mark task ${task.title} as completed`}
                >
                  {updateTask.isPending ? "Completing…" : "Mark completed"}
                </button>
              )}
            </div>
          ))
        ) : (
          <div style={{ color: "#6b7280" }}>No tasks for this account.</div>
        )}
      </div>
      <div className={styles.section} aria-labelledby="logs-heading">
        <h3 id="logs-heading">Communication Logs</h3>
        {logsLoading ? (
          <div>Loading logs…</div>
        ) : logsError ? (
          <div role="alert" style={{ color: "#b91c1c" }}>Failed to load logs: {logsError.message}</div>
        ) : logs && logs.length > 0 ? (
          logs.map((log) => (
            <div key={log.id} className={styles.logItem}>
              <span className={styles.taskTitle}>{log.subject}</span>
              <span className={styles.taskMeta}>
                {log.type} · {new Date(log.created_at).toLocaleDateString()}
              </span>
              {log.notes && <span style={{ fontSize: "0.8rem", color: "#374151" }}>{log.notes}</span>}
            </div>
          ))
        ) : (
          <div style={{ color: "#6b7280" }}>No logs yet for this account.</div>
        )}
        {/* Form to add a new log */}
        <div className={styles.formGroup} style={{ marginTop: "1rem" }}>
          <label htmlFor="log-type">Type</label>
          <select id="log-type" value={logType} onChange={(e) => setLogType(e.target.value)}>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="meeting">Meeting</option>
            <option value="other">Other</option>
          </select>
          <label htmlFor="log-subject">Subject</label>
          <input
            id="log-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject of the communication"
          />
          <label htmlFor="log-notes">Notes (optional)</label>
          <textarea
            id="log-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Additional details…"
          />
          <button
            type="button"
            className={styles.addButton}
            onClick={handleAddLog}
            disabled={addComm.isPending || !subject.trim()}
            aria-label="Add communication log"
          >
            {addComm.isPending ? "Saving…" : "Add Log"}
          </button>
        </div>
      </div>
    </div>
  );
}