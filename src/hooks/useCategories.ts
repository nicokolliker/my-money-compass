import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type Category = Tables<'categories'>;
export type Subcategory = Tables<'subcategories'>;

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order');
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useSubcategories(categoryId?: string) {
  return useQuery({
    queryKey: ['subcategories', categoryId],
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
      const { data, error } = await supabase.from('categories').insert(cat).select().single();
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
