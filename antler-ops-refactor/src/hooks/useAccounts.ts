import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { withRetry, withSupabaseTimeout } from "../lib/withSupabaseTimeout";
import type { Account } from "../types";

/**
 * Fetch the list of accounts from Supabase.  Uses TanStack Query to cache
 * results and revalidate when the query key or arguments change.  If the
 * request fails, an error is thrown which can be caught by the caller to
 * display a friendly message.
 */
export function useAccounts() {
  return useQuery<Account[], Error>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await withRetry(() =>
        withSupabaseTimeout(supabase.from("accounts").select("*"))
      );
      if (error) throw new Error(error.message);
      return (data as Account[]) ?? [];
    },
    // Mark data as stale after 5 minutes.  Adjust based on how frequently
    // account data changes in your application.
    staleTime: 5 * 60 * 1000,
  });
}