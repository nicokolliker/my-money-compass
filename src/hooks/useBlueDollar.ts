import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BlueDollarRate {
  rate: number;
  blue_avg?: number;
  value_buy?: number;
  value_sell?: number;
  date: string;
  cached: boolean;
  fallback?: boolean;
  updated_at: string;
}

export function useBlueDollarRate() {
  return useQuery<BlueDollarRate>({
    queryKey: ['blue-dollar-rate'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-fx-rates', {
        body: {},
      });
      if (error) throw error;
      return data as BlueDollarRate;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });
}

export function useRefreshBlueDollar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-fx-rates', {
        body: { force: true },
      });
      if (error) throw error;
      return data as BlueDollarRate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blue-dollar-rate'] });
      qc.invalidateQueries({ queryKey: ['fx-rates'] });
    },
  });
}
