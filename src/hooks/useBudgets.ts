import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type Budget = Tables<'budgets'>;

export function useBudgets(month?: string) {
  return useQuery({
    queryKey: ['budgets', month],
    queryFn: async () => {
      let q = supabase.from('budgets').select('*, categories(name, icon, color)').order('created_at');
      if (month) q = q.eq('month', month);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: TablesInsert<'budgets'>) => {
      const { data, error } = await supabase.from('budgets').upsert(item, { onConflict: 'category_id,month' }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('budgets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}
