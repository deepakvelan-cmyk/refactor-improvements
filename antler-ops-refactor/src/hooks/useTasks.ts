import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { withRetry, withSupabaseTimeout } from "../lib/withSupabaseTimeout";
import type { Task } from "../types";

/**
 * Fetch tasks for a given account.  Pass `undefined` or an empty string
 * to skip the query.  The returned tasks are sorted by due date
 * ascending.
 */
export function useTasks(accountId: string | undefined) {
  return useQuery<Task[], Error>({
    queryKey: ["tasks", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await withRetry(() =>
        withSupabaseTimeout(
          supabase
            .from("tasks")
            .select("*")
            .eq("account_id", accountId)
            .order("due_date", { ascending: true })
        )
      );
      if (error) throw new Error(error.message);
      return (data as Task[]) ?? [];
    },
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Create a mutation for updating a task.  When called, the mutation
 * automatically invalidates the associated tasks query to refresh the
 * list.  Adjust the payload shape to match your Supabase schema.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (update: Partial<Task> & { id: number }) => {
      const { data, error } = await withRetry(() =>
        withSupabaseTimeout(
          supabase
            .from("tasks")
            .update(update)
            .eq("id", update.id)
            .select()
            .single()
        )
      );
      if (error) throw new Error(error.message);
      return data as Task;
    },
    onSuccess: (_, variables) => {
      // Invalidate queries for the account this task belongs to
      queryClient.invalidateQueries({ queryKey: ["tasks", variables.account_id] });
    },
  });
}