/**
 * useArqReconciliation — hooks for the ARQ reconciliation flow.
 *
 * Each Wise → ARQ/DolarApp transfer creates a pending ArqReconciliation.
 * When the user imports the ARQ statement that covers that period, the
 * reconciliation is closed and stamped with the summary (spent / balance).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserId } from '@/hooks/useAuthUser';

export interface ArqReconciliation {
  id: string;
  user_id: string;
  wise_tx_id: string | null;
  wise_amount_usd: number;
  wise_date: string;          // YYYY-MM-DD
  wise_description: string | null;
  import_log_id: string | null;
  period: string | null;      // 'YYYY-MM'
  status: 'pending' | 'reconciled';
  reconciled_at: string | null;
  total_spent_usd: number | null;
  balance_after_usd: number | null;
  last_import_date: string | null;
  created_at: string;
  updated_at: string;
}

/** Returns all pending (unreconciled) ARQ deposits. */
export function useArqPendingReconciliations() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['arq-reconciliations', 'pending', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ArqReconciliation[]> => {
      const { data, error } = await supabase
        .from('arq_reconciliations')
        .select('*')
        .eq('status', 'pending')
        .order('wise_date', { ascending: false });
      if (error) throw error;
      return (data || []) as ArqReconciliation[];
    },
  });
}

/** Returns the last 24 reconciliations (any status) for history view. */
export function useArqReconciliationHistory() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['arq-reconciliations', 'history', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ArqReconciliation[]> => {
      const { data, error } = await supabase
        .from('arq_reconciliations')
        .select('*')
        .order('wise_date', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data || []) as ArqReconciliation[];
    },
  });
}

/** Invalidate both query keys — call after any mutation. */
export function useInvalidateArqReconciliations() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['arq-reconciliations'] });
  };
}
