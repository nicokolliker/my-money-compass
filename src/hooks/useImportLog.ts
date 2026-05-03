import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ImportLogRow {
  id: string;
  user_id: string;
  source: string;
  month: string; // YYYY-MM
  imported_at: string;
  transaction_count: number;
}

export function useImportLog() {
  return useQuery({
    queryKey: ['import-log'],
    queryFn: async (): Promise<ImportLogRow[]> => {
      const { data, error } = await supabase
        .from('import_log')
        .select('*')
        .order('month', { ascending: false });
      if (error) throw error;
      return (data || []) as ImportLogRow[];
    },
  });
}

export function useInvalidateImportLog() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['import-log'] });
}
