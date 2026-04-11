import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type Rule = Tables<'rules'>;

export function useRules() {
  return useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rules').select('*, categories(name)').order('keyword');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: TablesInsert<'rules'>) => {
      const { data, error } = await supabase.from('rules').insert(rule).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesInsert<'rules'>>) => {
      const { data, error } = await supabase.from('rules').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}
