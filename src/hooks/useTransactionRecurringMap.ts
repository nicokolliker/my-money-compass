import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns a map: transaction_id → { recurring_id, recurring_name, instance_id }
 * Built from the canonical recurring_instances table — no client-side fuzzy matching.
 */
export function useTransactionRecurringMap() {
  return useQuery({
    queryKey: ['transaction-recurring-map'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('recurring_instances')
        .select('id, matched_transaction_id, recurring_id, recurring_expenses(name)')
        .not('matched_transaction_id', 'is', null);
      if (error) throw error;
      const map: Record<string, { recurring_id: string; recurring_name: string; instance_id: string }> = {};
      (data || []).forEach((row: any) => {
        if (row.matched_transaction_id) {
          map[row.matched_transaction_id] = {
            recurring_id: row.recurring_id,
            recurring_name: row.recurring_expenses?.name || 'Recurring',
            instance_id: row.id,
          };
        }
      });
      return map;
    },
  });
}
