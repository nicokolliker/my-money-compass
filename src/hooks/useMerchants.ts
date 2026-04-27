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

export function useMerchantTransactions(merchantId: string | null) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['merchant-transactions', userId, merchantId],
    enabled: !!userId && !!merchantId,
    queryFn: async () => {
      if (!merchantId) return [];
      const { data, error } = await supabase
        .from('transactions')
        .select('*, accounts!inner(name, currency), categories(name, icon, color)')
        .eq('merchant_id', merchantId)
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}
