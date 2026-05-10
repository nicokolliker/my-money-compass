import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useLinkInstanceToTransaction, useMarkInstancePaid, type RecurringInstance } from '@/hooks/useRecurringInstances';
import { formatCurrency } from '@/lib/constants';
import { format } from 'date-fns';
import { Link2, Search, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  instance: RecurringInstance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Strict candidate list:
 *   - transaction NOT already linked to ANY recurring_instance
 *   - same account_id IF the instance has expected_account_id set
 *   - within ±14 days of expected_date
 *   - sorted by closest date, then closest amount
 */
export default function ManualMatchDialog({ instance, open, onOpenChange }: Props) {
  const link = useLinkInstanceToTransaction();
  const markPaid = useMarkInstancePaid();

  const { data: candidates, isLoading } = useQuery({
    enabled: open && !!instance,
    queryKey: ['manual-match-candidates', instance?.id],
    queryFn: async () => {
      if (!instance) return [];
      const expected = new Date(instance.expected_date + 'T12:00:00');
      const from = new Date(expected); from.setDate(from.getDate() - 14);
      const to = new Date(expected); to.setDate(to.getDate() + 14);
      const fromISO = from.toISOString().split('T')[0];
      const toISO = to.toISOString().split('T')[0];

      // 1. fetch all already-linked transaction ids
      const { data: linkedRows, error: linkedErr } = await (supabase as any)
        .from('recurring_instances')
        .select('matched_transaction_id')
        .not('matched_transaction_id', 'is', null);
      if (linkedErr) throw linkedErr;
      const linkedIds = new Set<string>((linkedRows || []).map((r: any) => r.matched_transaction_id));

      // 2. fetch tx in window, optionally constrained by account
      let q = (supabase as any)
        .from('transactions')
        .select('id, date, amount, currency, description, merchant, account_id, accounts(name)')
        .gte('date', fromISO)
        .lte('date', toISO)
        .eq('type', 'expense');
      if (instance.expected_account_id) q = q.eq('account_id', instance.expected_account_id);
      const { data, error } = await q.limit(200);
      if (error) throw error;

      const expectedAmt = Number(instance.expected_amount);
      const expectedTime = expected.getTime();
      const recName = ((instance as any).recurring_expenses?.name || '').toLowerCase().trim();
      const recTokens = recName.split(/\s+/).filter((t: string) => t.length >= 3);
      const nameScore = (txStr: string): number => {
        const s = (txStr || '').toLowerCase();
        if (!recName) return 0;
        if (s.includes(recName)) return 100;
        let hits = 0;
        for (const t of recTokens) if (s.includes(t)) hits++;
        return hits * 25;
      };
      return (data || [])
        .filter((t: any) => !linkedIds.has(t.id))
        .map((t: any) => ({
          ...t,
          _dateDiff: Math.abs(new Date(t.date + 'T12:00:00').getTime() - expectedTime),
          _amtDiff: Math.abs(Math.abs(Number(t.amount)) - expectedAmt),
          _nameScore: Math.max(nameScore(t.merchant), nameScore(t.description)),
        }))
        .sort((a: any, b: any) => (b._nameScore - a._nameScore) || (a._dateDiff - b._dateDiff) || (a._amtDiff - b._amtDiff));
    },
  });

  const handleMarkPaidUnlinked = async () => {
    if (!instance) return;
    try {
      await markPaid.mutateAsync(instance.id);
      toast.success('Marcado como pagado');
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleLink = async (txId: string) => {
    if (!instance) return;
    try {
      await link.mutateAsync({ id: instance.id, transaction_id: txId });
      toast.success('Linked to transaction');
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link a transaction</DialogTitle>
          <DialogDescription>
            {instance && (
              <>Pick the transaction that paid <span className="font-medium text-foreground">{(instance as any).recurring_expenses?.name}</span> ({formatCurrency(Number(instance.expected_amount), instance.expected_currency)}, expected {format(new Date(instance.expected_date + 'T12:00:00'), 'MMM d')})</>
            )}
            <span className="block mt-1 text-xs text-muted-foreground">O marcá como pagado si ya lo hiciste por otro medio</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {isLoading && <p className="text-sm text-muted-foreground text-center py-6">Loading candidates...</p>}
          {!isLoading && (!candidates || candidates.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No unmatched transactions in the ±14 day window{instance?.expected_account_id ? ' for this account' : ''}.</p>
            </div>
          )}
          {candidates?.map((t: any) => {
            const txAmt = Math.abs(Number(t.amount));
            const expAmt = instance ? Number(instance.expected_amount) : 0;
            const diff = txAmt - expAmt;
            return (
              <button
                key={t.id}
                onClick={() => handleLink(t.id)}
                disabled={link.isPending}
                className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-primary/40 hover:bg-accent/50 transition-colors text-left disabled:opacity-50"
              >
                <div className="text-center shrink-0 w-12">
                  <p className="text-[10px] text-muted-foreground uppercase">{format(new Date(t.date + 'T12:00:00'), 'MMM')}</p>
                  <p className="text-base font-bold">{format(new Date(t.date + 'T12:00:00'), 'd')}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{t.merchant || t.description || 'Untitled'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{t.accounts?.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums">{formatCurrency(txAmt, t.currency)}</p>
                  {Math.abs(diff) > 0.01 && instance && (
                    <Badge variant="outline" className={`text-[9px] h-4 px-1.5 mt-0.5 ${diff > 0 ? 'text-destructive' : 'text-success'}`}>
                      {diff > 0 ? '+' : ''}{formatCurrency(diff, instance.expected_currency)}
                    </Badge>
                  )}
                </div>
                <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
