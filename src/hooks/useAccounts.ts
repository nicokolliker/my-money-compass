import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type Account = Tables<'accounts'>;

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data as Account[];
    },
  });
}

export function useAccountBalances() {
  return useQuery({
    queryKey: ['account-balances'],
    queryFn: async () => {
      const { data: accounts, error: aErr } = await supabase.from('accounts').select('*, account_groups(name, icon, sort_order)').eq('is_active', true).order('sort_order').order('name');
      if (aErr) throw aErr;
      const { data: txSums, error: tErr } = await supabase.from('transactions').select('account_id, amount, amount_usd');
      if (tErr) throw tErr;

      const sumsByAccount: Record<string, { native: number; usd: number }> = {};
      for (const tx of txSums || []) {
        if (!sumsByAccount[tx.account_id]) sumsByAccount[tx.account_id] = { native: 0, usd: 0 };
        sumsByAccount[tx.account_id].native += Number(tx.amount);
        sumsByAccount[tx.account_id].usd += Number(tx.amount_usd);
      }

      return (accounts || []).map((a) => ({
        ...a,
        computed_balance: a.opening_balance + (sumsByAccount[a.id]?.native || 0),
        computed_balance_usd: (a.currency === 'USD' ? a.opening_balance : 0) + (sumsByAccount[a.id]?.usd || 0),
        group: (a as any).account_groups as { name: string; icon: string | null; sort_order: number } | null,
      }));
    },
  });
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (account: TablesInsert<'accounts'>) => {
      const user_id = await getUserId();
      const { data, error } = await supabase.from('accounts').insert({ ...account, user_id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); qc.invalidateQueries({ queryKey: ['account-balances'] }); },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<'accounts'> & { id: string }) => {
      const { data, error } = await supabase.from('accounts').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); qc.invalidateQueries({ queryKey: ['account-balances'] }); },
  });
}
