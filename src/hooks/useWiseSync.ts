import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function callWise(action: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('wise-sync', {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message || 'Wise sync failed');
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useWiseProfiles() {
  return useMutation({
    mutationFn: (apiToken?: string) =>
      callWise('get-profiles', apiToken ? { apiToken } : {}),
  });
}

export function useWiseBalances() {
  return useMutation({
    mutationFn: (profileId: number) => callWise('get-balances', { profileId }),
  });
}

export interface WiseSyncResult {
  imported: number;
  skipped: number;
  total_fetched: number;
  official_balance: number | null;
  sum_imported: number;
  tx_count: number;
  date_range: { start: string | null; end: string | null };
  reconciled: boolean | null;
  status: 'success' | 'partial' | 'failed';
  diagnostics: string[];
}

export function useWiseSyncTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      profileId: number;
      balanceId: number;
      accountId: string;
      currency: string;
    }): Promise<WiseSyncResult> => callWise('sync-transactions', params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['wise-sync-log'] });
    },
  });
}

export function useWiseSyncLog() {
  return useQuery({
    queryKey: ['wise-sync-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wise_sync_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}
