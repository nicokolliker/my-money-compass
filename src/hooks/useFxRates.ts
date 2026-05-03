import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type FxRate = Tables<'fx_rates'>;

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export function useFxRates() {
  return useQuery({
    queryKey: ['fx-rates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fx_rates').select('*').order('date', { ascending: false });
      if (error) throw error;
      return data as FxRate[];
    },
  });
}

const FALLBACK_TO_USD: Record<string, number> = {
  ARS: 1 / 1390,
  EUR: 1.08,
  GBP: 1.27,
};

export function useLatestFxRate(fromCurrency: string, toCurrency = 'USD') {
  const { data: rates } = useFxRates();
  if (fromCurrency === toCurrency) return 1;
  if (!rates) return FALLBACK_TO_USD[fromCurrency] ?? 1;
  const rate = rates.find(r => r.from_currency === fromCurrency && r.to_currency === toCurrency);
  return rate?.rate ?? FALLBACK_TO_USD[fromCurrency] ?? 1;
}

export function useCreateFxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rate: TablesInsert<'fx_rates'>) => {
      const user_id = await getUserId();
      const { data, error } = await supabase.from('fx_rates').insert({ ...rate, user_id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fx-rates'] }),
  });
}

export function useDeleteFxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fx_rates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fx-rates'] }),
  });
}
