import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { deriveInstanceState, type DerivedInstanceState } from '@/lib/money';
import { useUserId } from '@/hooks/useAuthUser';

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
  const userId = useUserId();
  return useQuery({
    queryKey: ['recurring-instances', userId, filters],
    enabled: !!userId,
    queryFn: async () => {
      // Step 1: fetch instances
      const { data: instances, error } = await (supabase as any)
        .from('recurring_instances')
        .select('*')
        .order('expected_date', { ascending: true });

      if (error) {
        console.error('recurring_instances error:', error);
        throw error;
      }

      if (!instances || instances.length === 0) return [];

      // Step 2: fetch related recurring_expenses for the ids we got
      const recurringIds = [...new Set(instances.map((i: any) => i.recurring_id as string))] as string[];
      const { data: recurringExpenses } = await supabase
        .from('recurring_expenses')
        .select('id, name, type, frequency, category_id, categories(name, icon, color), accounts(name, currency, type)')
        .in('id', recurringIds);

      const expenseMap = Object.fromEntries((recurringExpenses || []).map((r: any) => [r.id, r]));

      // Step 3: filter by date range and attach related data
      const filtered = filters?.from || filters?.to
        ? instances.filter((i: any) => {
            if (filters?.from && i.expected_date < filters.from) return false;
            if (filters?.to && i.expected_date > filters.to) return false;
            return true;
          })
        : instances;

      return filtered.map((i: any) => ({
        ...i,
        recurring_expenses: expenseMap[i.recurring_id] || null,
      })) as RecurringInstance[];
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
      invalidateRecurringQueries(qc);
    },
  });
}

/** Invalidate every query key that depends on instance state. */
function invalidateRecurringQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['recurring-instances'] });
  qc.invalidateQueries({ queryKey: ['recurring-expenses'] });
  qc.invalidateQueries({ queryKey: ['transaction-recurring-map'] });
  qc.invalidateQueries({ queryKey: ['transactions'] });
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
    onSuccess: () => invalidateRecurringQueries(qc),
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
    onSuccess: () => invalidateRecurringQueries(qc),
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
    onSuccess: () => invalidateRecurringQueries(qc),
  });
}
