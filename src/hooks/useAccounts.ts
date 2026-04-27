import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { computeBalance, computeBalanceUsd, type FxRateRow } from '@/lib/money';
import { useUserId } from '@/hooks/useAuthUser';

export type Account = Tables<'accounts'>;

export function useAccounts() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['accounts', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data as Account[];
    },
  });
}

export function useAccountBalances() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['account-balances', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [accountsRes, txRes, fxRes] = await Promise.all([
        supabase.from('accounts').select('*, account_groups(name, icon, sort_order)').eq('is_active', true).order('sort_order').order('name'),
        supabase.from('transactions').select('account_id, amount, amount_usd'),
        supabase.from('fx_rates').select('from_currency, to_currency, rate, date').order('date', { ascending: false }),
      ]);
      if (accountsRes.error) throw accountsRes.error;
      if (txRes.error) throw txRes.error;
      if (fxRes.error) throw fxRes.error;

      const accounts = accountsRes.data || [];
      const txs = txRes.data || [];
      const rates = (fxRes.data || []) as FxRateRow[];

      return accounts.map((a) => ({
        ...a,
        computed_balance: computeBalance(a, txs),
        computed_balance_usd: computeBalanceUsd(a, txs, rates),
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
