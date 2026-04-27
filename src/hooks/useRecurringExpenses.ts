import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useUserId } from '@/hooks/useAuthUser';

export type RecurringExpense = Tables<'recurring_expenses'>;

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export function useRecurringExpenses() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['recurring-expenses', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*, categories(name, icon, color), accounts(name, currency, type), payment_methods(name, type, icon)')
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
      const user_id = await getUserId();
      const { data, error } = await supabase.from('recurring_expenses').insert({ ...item, user_id }).select().single();
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
