import React, { useState } from "react";
import type { Account } from "./types";
import { useAccounts } from "./hooks/useAccounts";
import AccountList from "./components/AccountList";
import AccountDetails from "./components/AccountDetails";
import ManagerDashboard from "./components/ManagerDashboard";
import TaskManager from "./components/TaskManager";
import styles from "./App.module.css";

/**
 * Top‑level component orchestrating the different views of the portal.  The
 * user can switch between CRM, Manager and Task creation.  Data is
 * fetched via hooks and passed down to child components.  This file
 * focuses on composition and high‑level state rather than fine‑grained
 * logic.
 */
export default function App() {
  const {
    data: accounts = [],
    isLoading,
    error,
  } = useAccounts();

  const [view, setView] = useState<"crm" | "manager" | "tasks">("crm");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // When the list of accounts updates, ensure the selected account still
  // exists; otherwise reset it to null.  This avoids showing stale
  // details if the account was removed or filtered out.
  React.useEffect(() => {
    if (selectedAccount) {
      const stillExists = accounts.some((a) => a.account_id === selectedAccount.account_id);
      if (!stillExists) {
        setSelectedAccount(null);
      }
    }
  }, [accounts, selectedAccount]);

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar} aria-label="Sidebar navigation">
        <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>Antler Ops</div>
        <nav aria-label="Primary">
          <button
            type="button"
            className={styles.navButton}
            aria-current={view === "crm" ? "page" : undefined}
            onClick={() => setView("crm")}
          >
            CRM
          </button>
          <button
            type="button"
            className={styles.navButton}
            aria-current={view === "manager" ? "page" : undefined}
            onClick={() => setView("manager")}
          >
            Manager
          </button>
          <button
            type="button"
            className={styles.navButton}
            aria-current={view === "tasks" ? "page" : undefined}
            onClick={() => setView("tasks")}
          >
            Tasks
          </button>
        </nav>
      </aside>
      <main className={styles.main}>
        {isLoading && <div className={styles.loading}>Loading accounts…</div>}
        {error && <div className={styles.error}>Failed to load accounts: {error.message}</div>}
        {!isLoading && !error && view === "crm" && (
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 300px", maxWidth: "400px" }}>
              <AccountList accounts={accounts} onSelectAccount={setSelectedAccount} />
            </div>
            <div style={{ flex: "2 1 400px" }}>
              <AccountDetails account={selectedAccount} />
            </div>
          </div>
        )}
        {!isLoading && !error && view === "manager" && (
          <ManagerDashboard accounts={accounts} />
        )}
        {!isLoading && !error && view === "tasks" && (
          <TaskManager accounts={accounts} />
        )}
      </main>
    </div>
  );
}