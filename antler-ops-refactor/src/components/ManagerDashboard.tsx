import React, { useMemo } from "react";
import type { Account } from "../types";
import styles from "./ManagerDashboard.module.css";

interface ManagerDashboardProps {
  accounts: Account[];
}

/**
 * Render a dashboard for managers showing counts of churned and unknown
 * accounts as well as lists of accounts needing follow‑ups or lacking
 * assigned customer success managers.  Computation is memoised to avoid
 * unnecessary recalculations on re-renders.
 */
export default function ManagerDashboard({ accounts }: ManagerDashboardProps) {
  const { churned, unknown, followUps, unassigned } = useMemo(() => {
    const churned = accounts.filter((a) => (a.status ?? "").toLowerCase() === "churned");
    const unknown = accounts.filter(
      (a) => !a.status || (a.status ?? "").toLowerCase() === "unknown"
    );
    const today = new Date().toISOString().split("T")[0];
    const followUps = accounts.filter(
      (a) => (a.next_follow_up ?? "") !== "" && String(a.next_follow_up) <= today
    );
    const unassigned = accounts.filter((a) => !a.primary_csm_email);
    return { churned, unknown, followUps, unassigned };
  }, [accounts]);

  return (
    <div className={styles.container}>
      <div className={styles.metrics}>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{accounts.length}</div>
          <div className={styles.metricLabel}>Total accounts</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{churned.length}</div>
          <div className={styles.metricLabel}>Churned</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{unknown.length}</div>
          <div className={styles.metricLabel}>Unknown status</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{followUps.length}</div>
          <div className={styles.metricLabel}>Follow‑ups due</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{unassigned.length}</div>
          <div className={styles.metricLabel}>Unassigned</div>
        </div>
      </div>
      {/* Follow‑ups list */}
      <div className={styles.listSection}>
        <h3>Follow‑ups due</h3>
        <ul className={styles.list} role="list">
          {followUps.length > 0 ? (
            followUps.map((a) => (
              <li key={a.account_id} className={styles.listItem}>
                {a.name || a.account_id} – due {a.next_follow_up}
              </li>
            ))
          ) : (
            <li className={styles.listItem} style={{ color: "#6b7280" }}>
              No accounts require follow‑up today.
            </li>
          )}
        </ul>
      </div>
      {/* Unassigned list */}
      <div className={styles.listSection}>
        <h3>Unassigned accounts</h3>
        <ul className={styles.list} role="list">
          {unassigned.length > 0 ? (
            unassigned.map((a) => (
              <li key={a.account_id} className={styles.listItem}>
                {a.name || a.account_id}
              </li>
            ))
          ) : (
            <li className={styles.listItem} style={{ color: "#6b7280" }}>
              All accounts have an assigned CSM.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}