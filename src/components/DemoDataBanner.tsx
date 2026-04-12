import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sparkles, Trash2, Loader2 } from 'lucide-react';

interface Props {
  onCleared: () => void;
}

export function DemoDataBanner({ onCleared }: Props) {
  const [clearing, setClearing] = useState(false);
  const qc = useQueryClient();

  const clearDemoData = async () => {
    setClearing(true);
    try {
      // Delete in dependency order
      await supabase.from('transaction_tags').delete().neq('transaction_id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('transaction_splits').delete().neq('transaction_id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('recurring_expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('budgets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('merchants').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('subcategories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // Mark demo data as cleared
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ has_demo_data: false }).eq('user_id', user.id);
      }

      qc.invalidateQueries();
      toast.success('Demo data cleared. Start fresh!');
      onCleared();
    } catch (err: any) {
      toast.error('Failed to clear demo data: ' + err.message);
    }
    setClearing(false);
  };

  return (
    <Alert className="border-primary/30 bg-primary/5 mb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm text-foreground">
            This is <strong>sample data</strong> to help you explore. You can delete it anytime.
          </AlertDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={clearDemoData}
          disabled={clearing}
          className="shrink-0"
        >
          {clearing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
          Clear demo data
        </Button>
      </div>
    </Alert>
  );
}
