import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDemoData() {
  const qc = useQueryClient();

  const { data: hasDemoData, refetch } = useQuery({
    queryKey: ['profile-demo-flag'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase.from('profiles').select('has_demo_data').eq('user_id', user.id).single();
      return data?.has_demo_data ?? false;
    },
  });

  const onCleared = () => {
    refetch();
    qc.invalidateQueries();
  };

  return { hasDemoData: !!hasDemoData, onCleared };
}
