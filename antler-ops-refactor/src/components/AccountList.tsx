import React, { useMemo, useState } from "react";
import type { Account } from "../types";
import styles from "./AccountList.module.css";

interface AccountListProps {
  accounts: Account[];
  /**
   * Handler invoked when a user selects an account.  Receives the
   * selected account as its argument.
   */
  onSelectAccount: (account: Account) => void;
}

/**
 * Render a searchable list of accounts.  The list filters accounts
 * client‑side based on the search string.  Each account is presented as
 * a button with accessible labels so that screen readers convey
 * meaningful information.
 */
export default function AccountList({ accounts, onSelectAccount }: AccountListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => {
      const name = (a.name ?? "").toLowerCase();
      const id = a.account_id.toLowerCase();
      const st = (a.status ?? "").toLowerCase();
      return name.includes(q) || id.includes(q) || st.includes(q);
    });
  }, [query, accounts]);

  return (
    <div className={styles.container}>
      <div className={styles.searchBar}>
        <label htmlFor="account-search">Search accounts</label>
        <input
          id="account-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing account name, ID or status…"
        />
      </div>
      <ul className={styles.list} role="list">
        {filtered.map((account) => (
          <li key={account.account_id}>
            <button
              type="button"
              className={styles.accountButton}
              onClick={() => onSelectAccount(account)}
              aria-label={`Select account ${account.name || account.account_id}`}
            >
              <span className={styles.name}>{account.name || account.account_id}</span>
              <span className={styles.meta}>
                {account.account_id} – {account.status ?? "—"}
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li style={{ padding: "0.75rem", color: "#6b7280", fontSize: "0.9rem" }}>No matching accounts.</li>
        )}
      </ul>
    </div>
  );
}