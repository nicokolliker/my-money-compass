import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { deriveInstanceState, type DerivedInstanceState } from '@/lib/money';

export type RecurringInstance = {
  id: string;
  user_id: string;
  recurring_id: string;
  expected_date: string;
  expected_amount: number;
  expected_currency: string;
  expected_account_id: string | null;
  status: 'expected' | 'due_soon' | 'matched' | 'paid_manual' | 'overdue' | 'needs_review' | 'mismatch' | 'skipped';
  matched_transaction_id: string | null;
  match_confidence: number | null;
  matched_at: string | null;
  notes: string | null;
  recurring_expenses?: {
    id: string;
    name: string;
    type: string;
    frequency: string;
    category_id: string | null;
    categories?: { name: string; icon: string | null; color: string | null } | null;
    accounts?: { name: string; currency: string } | null;
  } | null;
  transactions?: {
    id: string;
    date: string;
    amount: number;
    currency: string;
    description: string | null;
    merchant: string | null;
  } | null;
};

/** Recurring instance with the canonical derived UI state attached. */
export type DerivedRecurringInstance = RecurringInstance & { derived: DerivedInstanceState };

/**
 * Canonical hook — returns instances already enriched with `derived`.
 * Every UI consumer MUST use this (never read `status` directly for grouping).
 */
export function useDerivedInstances(filters?: { from?: string; to?: string }) {
  const q = useRecurringInstances(filters);
  return {
    ...q,
    data: (q.data || []).map(i => ({ ...i, derived: deriveInstanceState(i) })) as DerivedRecurringInstance[],
  };
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export function useRecurringInstances(filters?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['recurring-instances', filters],
    queryFn: async () => {
      let q = (supabase as any)
        .from('recurring_instances')
        .select(`
          *,
          recurring_expenses!inner(id, name, type, frequency, category_id,
            categories(name, icon, color),
            accounts!recurring_expenses_account_id_fkey(name, currency)
          ),
          transactions(id, date, amount, currency, description, merchant)
        `)
        .order('expected_date', { ascending: true });
      if (filters?.from) q = q.gte('expected_date', filters.from);
      if (filters?.to) q = q.lte('expected_date', filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return data as RecurringInstance[];
    },
  });
}

export function useRefreshRecurringTracking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const user_id = await getUserId();
      const { data, error } = await (supabase as any).rpc('refresh_recurring_tracking', { p_user_id: user_id });
      if (error) throw error;
      return data as { generated: number; matched: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-instances'] });
      qc.invalidateQueries({ queryKey: ['recurring-expenses'] });
    },
  });
}

export function useMarkInstancePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any)
        .from('recurring_instances')
        .update({ status: 'paid_manual', matched_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-instances'] }),
  });
}

export function useUnmatchInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('recurring_instances')
        .update({ matched_transaction_id: null, status: 'expected', match_confidence: null, matched_at: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-instances'] }),
  });
}

export function useLinkInstanceToTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, transaction_id }: { id: string; transaction_id: string }) => {
      const { error } = await (supabase as any)
        .from('recurring_instances')
        .update({
          matched_transaction_id: transaction_id,
          status: 'matched',
          match_confidence: 1,
          matched_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-instances'] }),
  });
}
