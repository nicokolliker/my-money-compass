import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserId } from '@/hooks/useAuthUser';

export interface MonotributoConfig {
  vigencia: string;
  cat_actual: string;
  cuota_actual: number;
}

export interface UserSettings {
  user_id: string;
  wise_token: string | null;
  wise_last_sync: string | null;
  wise_profile_id: string | null;
  binance_api_key?: string | null;
  binance_api_secret?: string | null;
  binance_last_sync?: string | null;
  binance_balances?: any[] | null;
  monotributo_config?: MonotributoConfig | null;
  ignored_suggestion_ids?: string[] | null;
}

export function useUserSettings() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['user-settings', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as UserSettings | null;
    },
  });
}

export function useUpsertUserSettings() {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      if (!userId) throw new Error('Not authenticated');
      const { data, error } = await (supabase as any)
        .from('user_settings')
        .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-settings', userId] }),
  });
}
