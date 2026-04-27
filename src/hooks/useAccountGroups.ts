import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useUserId } from '@/hooks/useAuthUser';

export type AccountGroup = Tables<'account_groups'>;

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export function useAccountGroups() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['account-groups', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('account_groups').select('*').order('sort_order');
      if (error) throw error;
      return data as AccountGroup[];
    },
  });
}

export function useCreateAccountGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (group: TablesInsert<'account_groups'>) => {
      const user_id = await getUserId();
      const { data, error } = await supabase.from('account_groups').insert({ ...group, user_id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account-groups'] }),
  });
}

export function useUpdateAccountGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesInsert<'account_groups'>>) => {
      const { data, error } = await supabase.from('account_groups').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account-groups'] }),
  });
}

export function useDeleteAccountGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('account_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['account-groups'] }); qc.invalidateQueries({ queryKey: ['account-balances'] }); },
  });
}
