import { useQuery } from '@tanstack/react-query';

const KEY = 'eur_usd_cache_v1';

export function useEurUsdRate() {
  return useQuery({
    queryKey: ['eur-usd-rate'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
        if (!res.ok) throw new Error('bad status');
        const data = await res.json();
        const rate = data?.rates?.USD;
        if (!rate) throw new Error('no rate');
        const payload = { rate, updated_at: new Date().toISOString(), cached: false };
        localStorage.setItem(KEY, JSON.stringify({ ...payload, cached: true }));
        return payload;
      } catch {
        const cached = localStorage.getItem(KEY);
        if (cached) return JSON.parse(cached) as { rate: number; updated_at: string; cached: boolean };
        return null;
      }
    },
  });
}
