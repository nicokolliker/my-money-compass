import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type Rule = Tables<'rules'>;

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

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
      const user_id = await getUserId();
      const { data, error } = await supabase.from('rules').insert({ ...rule, user_id }).select().single();
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
