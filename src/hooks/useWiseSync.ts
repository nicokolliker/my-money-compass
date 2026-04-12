import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

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
    mutationFn: () => callWise('get-profiles'),
  });
}

export function useWiseBalances() {
  return useMutation({
    mutationFn: (profileId: number) => callWise('get-balances', { profileId }),
  });
}

export function useWiseSyncTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      profileId: number;
      balanceId: number;
      accountId: string;
      currency: string;
      intervalStart: string;
      intervalEnd: string;
    }) => callWise('sync-transactions', params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
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
