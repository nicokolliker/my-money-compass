import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useUserId } from '@/hooks/useAuthUser';

export type Category = Tables<'categories'>;
export type Subcategory = Tables<'subcategories'>;

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export function useCategories() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['categories', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order');
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useSubcategories(categoryId?: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['subcategories', userId, categoryId],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase.from('subcategories').select('*').order('name');
      if (categoryId) q = q.eq('category_id', categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Subcategory[];
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cat: TablesInsert<'categories'>) => {
      const user_id = await getUserId();
      const { data, error } = await supabase.from('categories').insert({ ...cat, user_id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesInsert<'categories'>>) => {
      const { data, error } = await supabase.from('categories').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}
