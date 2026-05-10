/**
 * useAccountReconciliation — generic version of useArqReconciliation.
 *
 * Tracks transfers from an upstream account (e.g. ARQ/DolarApp) into a
 * destination account (e.g. MercadoPago, Galicia) so that when the user
 * imports the destination account's statement we can close the loop.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserId } from '@/hooks/useAuthUser';

export interface AccountReconciliation {
  id: string;
  user_id: string;
  from_account_id: string;
  to_account_id: string;
  transfer_tx_id: string | null;
  transfer_amount_usd: number;
  transfer_date: string;
  transfer_description: string | null;
  period: string | null;
  status: 'pending' | 'reconciled';
  import_log_id: string | null;
  total_spent_usd: number | null;
  balance_after_usd: number | null;
  reconciled_at: string | null;
  last_import_date: string | null;
  created_at: string;
  updated_at: string;
}

/** Pending (unreconciled) transfers landing on a destination account. */
export function usePendingReconciliations(toAccountId: string | null | undefined) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['account-reconciliations', 'pending', userId, toAccountId],
    enabled: !!userId && !!toAccountId,
    queryFn: async (): Promise<AccountReconciliation[]> => {
      const { data, error } = await supabase
        .from('account_reconciliations')
        .select('*')
        .eq('to_account_id', toAccountId!)
        .eq('status', 'pending')
        .order('transfer_date', { ascending: false });
      if (error) throw error;
      return (data || []) as AccountReconciliation[];
    },
  });
}

/** Last 24 reconciliations for the destination account. */
export function useReconciliationHistory(toAccountId: string | null | undefined) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['account-reconciliations', 'history', userId, toAccountId],
    enabled: !!userId && !!toAccountId,
    queryFn: async (): Promise<AccountReconciliation[]> => {
      const { data, error } = await supabase
        .from('account_reconciliations')
        .select('*')
        .eq('to_account_id', toAccountId!)
        .order('transfer_date', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data || []) as AccountReconciliation[];
    },
  });
}

export function useInvalidateAccountReconciliations() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['account-reconciliations'] });
  };
}
