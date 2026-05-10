import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useUserId } from '@/hooks/useAuthUser';

export type Transaction = Tables<'transactions'>;

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export function useTransactions(filters?: { accountId?: string; categoryId?: string; type?: string; search?: string; dateFrom?: string; dateTo?: string }) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['transactions', userId, filters],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase.from('transactions').select('*, accounts(id, name, currency), categories(id, name, icon, color), subcategories:subcategory_id(id, name)').order('date', { ascending: false }).order('created_at', { ascending: false });
      if (filters?.accountId) q = q.eq('account_id', filters.accountId);
      if (filters?.categoryId) q = q.eq('category_id', filters.categoryId);
      if (filters?.type) q = q.eq('type', filters.type as 'expense' | 'income' | 'transfer' | 'adjustment');
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
      const user_id = await getUserId();
      const { data, error } = await supabase.from('transactions').insert({ ...tx, user_id }).select().single();
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
      const user_id = await getUserId();
      const { data: fromTx, error: e1 } = await supabase.from('transactions').insert({
        date: params.date,
        description: params.description || `Transfer to account`,
        amount: -params.amount,
        currency: params.fromCurrency,
        fx_rate: params.fromCurrency === 'USD' ? 1 : params.fxRate,
        amount_usd: params.fromCurrency === 'USD' ? -params.amount : -params.amount * params.fxRate,
        account_id: params.fromAccountId,
        type: 'transfer' as const,
        user_id,
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
        user_id,
      }).select().single();
      if (e2) throw e2;

      await supabase.from('transactions').update({ linked_transfer_id: toTx.id }).eq('id', fromTx.id);

      // ── Auto-create pending reconciliation if source = ARQ/DolarApp
      //    and destination = MercadoPago or Galicia.
      try {
        const { data: accs } = await supabase
          .from('accounts')
          .select('id, name')
          .in('id', [params.fromAccountId, params.toAccountId]);
        const fromAcc = accs?.find(a => a.id === params.fromAccountId);
        const toAcc = accs?.find(a => a.id === params.toAccountId);
        const fromName = (fromAcc?.name || '').toLowerCase();
        const toName = (toAcc?.name || '').toLowerCase();
        const sourceIsArq = /arq|dolarapp/.test(fromName);
        const destIsTracked = /mercado|galicia/.test(toName);
        if (sourceIsArq && destIsTracked) {
          const amountUsd = Math.abs(Number(toTx.amount_usd) || 0)
            || (params.toCurrency === 'USD' ? params.toAmount : params.toAmount * params.fxRate);
          await supabase.from('account_reconciliations').insert({
            user_id,
            from_account_id: params.fromAccountId,
            to_account_id: params.toAccountId,
            transfer_tx_id: toTx.id,
            transfer_amount_usd: amountUsd,
            transfer_date: params.date,
            transfer_description: params.description || `${fromAcc?.name} → ${toAcc?.name}`,
            status: 'pending',
          });
        }
      } catch (err) {
        // Non-fatal — transfer already saved
        console.warn('Failed to create pending account_reconciliation:', err);
      }

      return { fromTx, toTx };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
      qc.invalidateQueries({ queryKey: ['account-reconciliations'] });
    },
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
