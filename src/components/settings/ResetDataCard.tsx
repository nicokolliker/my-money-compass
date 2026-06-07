import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';

const TABLES_TO_WIPE = [
  'transaction_tags',
  'transaction_splits',
  'recurring_instances',
  'transactions',
  'recurring_expenses',
  'budgets',
  'pending_credits',
  'installment_debts',
  'import_log',
  'wise_sync_log',
  'account_reconciliations',
] as const;

export function ResetDataCard() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const qc = useQueryClient();

  const handleReset = async () => {
    setRunning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      for (const table of TABLES_TO_WIPE) {
        const { error } = await supabase.from(table as any).delete().eq('user_id', user.id);
        if (error) throw new Error(`Failed to wipe ${table}: ${error.message}`);
      }

      const { error: accErr } = await supabase
        .from('accounts')
        .update({ opening_balance: 0 })
        .eq('user_id', user.id);
      if (accErr) throw new Error(`Failed to reset balances: ${accErr.message}`);

      qc.invalidateQueries();
      toast.success('Reset to clean state. All transactional data cleared.');
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Reset failed');
    }
    setRunning(false);
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Reset to clean state
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Deletes all transactions, recurring expenses & instances, budgets, pending credits,
          installment debts, import logs, Wise sync logs, and account reconciliations. Resets
          all account opening balances to 0. Categories, merchants, rules, accounts, and
          settings are kept.
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={running}
        >
          Reset all data
        </Button>
      </CardContent>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to clean state?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all your transactions, recurring data, budgets,
              debts, import history, and reconciliations, and reset every account's opening
              balance to 0. Your categories, merchants, rules, accounts, and settings will be
              kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReset();
              }}
              disabled={running}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Yes, reset everything'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
