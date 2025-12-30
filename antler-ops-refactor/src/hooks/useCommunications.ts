import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { withRetry, withSupabaseTimeout } from "../lib/withSupabaseTimeout";
import type { CommunicationLog } from "../types";

/**
 * Fetch communication logs for an account.  The query is disabled if
 * `accountId` is undefined.  Logs are ordered by creation time descending.
 */
export function useCommunications(accountId: string | undefined) {
  return useQuery<CommunicationLog[], Error>({
    queryKey: ["communications", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await withRetry(() =>
        withSupabaseTimeout(
          supabase
            .from("logs")
            .select("*")
            .eq("account_id", accountId)
            .order("created_at", { ascending: false })
        )
      );
      if (error) throw new Error(error.message);
      return (data as CommunicationLog[]) ?? [];
    },
  });
}

/**
 * Create a mutation for adding a communication log.  After a successful
 * insert, the communications query for the account is invalidated to
 * refresh the list.
 */
export function useAddCommunication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (log: Omit<CommunicationLog, "id" | "created_at">) => {
      const { data, error } = await withRetry(() =>
        withSupabaseTimeout(
          supabase
            .from("logs")
            .insert(log)
            .select()
            .single()
        )
      );
      if (error) throw new Error(error.message);
      return data as CommunicationLog;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["communications", data.account_id] });
    },
  });
}