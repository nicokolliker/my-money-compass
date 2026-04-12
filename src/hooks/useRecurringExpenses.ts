import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type RecurringExpense = Tables<'recurring_expenses'>;

export function useRecurringExpenses() {
  return useQuery({
    queryKey: ['recurring-expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*, categories(name, icon, color), accounts(name, currency)')
        .order('next_due_date', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateRecurringExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: TablesInsert<'recurring_expenses'>) => {
      const { data, error } = await supabase.from('recurring_expenses').insert(item).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-expenses'] }),
  });
}

export function useUpdateRecurringExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesInsert<'recurring_expenses'>>) => {
      const { data, error } = await supabase.from('recurring_expenses').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-expenses'] }),
  });
}

export function useDeleteRecurringExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-expenses'] }),
  });
}
