import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useUserId } from '@/hooks/useAuthUser';

export type Merchant = Tables<'merchants'>;

export function useMerchants() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['merchants', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merchants')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateMerchant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<'merchants'> & { id: string }) => {
      const { data, error } = await supabase.from('merchants').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['merchants'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useDeleteMerchant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('merchants').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['merchants'] });
    },
  });
}

export function useMergeMerchants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ keepId, mergeId }: { keepId: string; mergeId: string }) => {
      // Reassign all transactions from mergeId to keepId
      const { error: txErr } = await supabase
        .from('transactions')
        .update({ merchant_id: keepId })
        .eq('merchant_id', mergeId);
      if (txErr) throw txErr;

      // Delete the merged merchant
      const { error: delErr } = await supabase.from('merchants').delete().eq('id', mergeId);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['merchants'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useMerchantTransactions(merchant: { id: string; name: string } | null) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['merchant-transactions', userId, merchant?.id],
    enabled: !!userId && !!merchant,
    queryFn: async () => {
      if (!merchant) return [];
      // Importers store the merchant NAME on transactions.merchant (text),
      // not merchant_id — so match by exact name (case-insensitive) and
      // include any legacy rows linked via merchant_id.
      const [byName, byId] = await Promise.all([
        supabase
          .from('transactions')
          .select('*, accounts!inner(name, currency), categories(name, icon, color)')
          .ilike('merchant', merchant.name)
          .order('date', { ascending: false })
          .limit(100),
        supabase
          .from('transactions')
          .select('*, accounts!inner(name, currency), categories(name, icon, color)')
          .eq('merchant_id', merchant.id)
          .order('date', { ascending: false })
          .limit(100),
      ]);
      if (byName.error) throw byName.error;
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const t of [...(byName.data || []), ...(byId.data || [])]) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        merged.push(t);
      }
      merged.sort((a, b) => (a.date < b.date ? 1 : -1));
      return merged;
    },
  });
}

/**
 * Batch: set the merchant's default category on ALL of its transactions
 * (matched by exact merchant name or legacy merchant_id link). Resolves the
 * Digital subcategory from the merchant name when applicable.
 */
export function useApplyMerchantCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ merchant, categoryId }: { merchant: { id: string; name: string }; categoryId: string }) => {
      const { fetchDigitalSubcatMap, resolveDigitalSubcategoryId } = await import('@/lib/applyRules');
      const digitalMap = await fetchDigitalSubcatMap();
      const subcategory_id = resolveDigitalSubcategoryId(categoryId, merchant.name, digitalMap);
      const updates = { category_id: categoryId, subcategory_id };
      const [r1, r2] = await Promise.all([
        supabase.from('transactions').update(updates).ilike('merchant', merchant.name).select('id'),
        supabase.from('transactions').update(updates).eq('merchant_id', merchant.id).select('id'),
      ]);
      if (r1.error) throw r1.error;
      const ids = new Set([...(r1.data || []), ...(r2.data || [])].map((t: any) => t.id));
      return ids.size;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['merchant-transactions'] });
    },
  });
}
