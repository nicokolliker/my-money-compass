import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type Transaction = Tables<'transactions'>;

export function useTransactions(filters?: { accountId?: string; categoryId?: string; type?: string; search?: string; dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      let q = supabase.from('transactions').select('*, accounts!inner(name, currency), categories(name, icon, color)').order('date', { ascending: false }).order('created_at', { ascending: false });
      if (filters?.accountId) q = q.eq('account_id', filters.accountId);
      if (filters?.categoryId) q = q.eq('category_id', filters.categoryId);
      if (filters?.type) q = q.eq('type', filters.type);
      if (filters?.dateFrom) q = q.gte('date', filters.dateFrom);
      if (filters?.dateTo) q = q.lte('date', filters.dateTo);
      if (filters?.search) q = q.or(`description.ilike.%${filters.search}%,merchant.ilike.%${filters.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tx: TablesInsert<'transactions'>) => {
      const { data, error } = await supabase.from('transactions').insert(tx).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['account-balances'] }); },
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { fromAccountId: string; toAccountId: string; amount: number; fromCurrency: string; toCurrency: string; fxRate: number; toAmount: number; date: string; description?: string }) => {
      const { data: fromTx, error: e1 } = await supabase.from('transactions').insert({
        date: params.date,
        description: params.description || `Transfer to account`,
        amount: -params.amount,
        currency: params.fromCurrency,
        fx_rate: params.fromCurrency === 'USD' ? 1 : params.fxRate,
        amount_usd: params.fromCurrency === 'USD' ? -params.amount : -params.amount * params.fxRate,
        account_id: params.fromAccountId,
        type: 'transfer' as const,
      }).select().single();
      if (e1) throw e1;

      const { data: toTx, error: e2 } = await supabase.from('transactions').insert({
        date: params.date,
        description: params.description || `Transfer from account`,
        amount: params.toAmount,
        currency: params.toCurrency,
        fx_rate: params.toCurrency === 'USD' ? 1 : params.fxRate,
        amount_usd: params.toCurrency === 'USD' ? params.toAmount : params.toAmount * params.fxRate,
        account_id: params.toAccountId,
        type: 'transfer' as const,
        linked_transfer_id: fromTx.id,
      }).select().single();
      if (e2) throw e2;

      await supabase.from('transactions').update({ linked_transfer_id: toTx.id }).eq('id', fromTx.id);
      return { fromTx, toTx };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['account-balances'] }); },
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesInsert<'transactions'>>) => {
      const { data, error } = await supabase.from('transactions').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['account-balances'] }); },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['account-balances'] }); },
  });
}
