import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserId } from '@/hooks/useAuthUser';

export function useDemoData() {
  const qc = useQueryClient();
  const userId = useUserId();

  const { data: hasDemoData, refetch } = useQuery({
    queryKey: ['profile-demo-flag', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return false;
      const { data } = await supabase.from('profiles').select('has_demo_data').eq('user_id', userId).single();
      return data?.has_demo_data ?? false;
    },
  });

  const onCleared = () => {
    refetch();
    qc.invalidateQueries();
  };

  return { hasDemoData: !!hasDemoData, onCleared };
}
