import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PendingCredit {
  id: string;
  user_id: string;
  amount_ars: number;
  amount_usd: number;
  source: string;
  expected_via_account_id: string | null;
  settlement_month: string | null;
  status: string;
  matched_transaction_id: string | null;
  notes: string | null;
  created_at: string;
}

export function usePendingCredits() {
  return useQuery({
    queryKey: ['pending-credits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_credits' as any)
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any as PendingCredit[]) || [];
    },
  });
}

export function useResolvePendingCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, transactionId }: { id: string; transactionId?: string | null }) => {
      const update: any = { status: 'matched' };
      if (transactionId) update.matched_transaction_id = transactionId;
      const { error } = await supabase
        .from('pending_credits' as any)
        .update(update)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-credits'] });
    },
  });
}
