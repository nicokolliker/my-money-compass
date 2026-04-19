import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  useRecurringInstances,
  useRefreshRecurringTracking,
  useMarkInstancePaid,
  useUnmatchInstance,
} from '@/hooks/useRecurringInstances';
import { formatCurrency, formatUSD } from '@/lib/constants';
import { toUSD, INSTANCE_STATUS_META, TONE_CLASS, isPaidStatus, type FxRateRow } from '@/lib/money';
import { useFxRates } from '@/hooks/useFxRates';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import {
  ChevronLeft, ChevronRight, RefreshCw, CheckCircle2, AlertCircle, Clock,
  Link2, X, ArrowUpDown,
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_META = Object.fromEntries(
  Object.entries(INSTANCE_STATUS_META).map(([k, v]) => [k, { label: v.label, cls: TONE_CLASS[v.tone] }])
) as Record<string, { label: string; cls: string }>;

export default function RecurringTracking() {
  const [month, setMonth] = useState(new Date());
  const [filter, setFilter] = useState<string>('all');
  const monthStart = startOfMonth(month).toISOString().split('T')[0];
  const monthEnd = endOfMonth(month).toISOString().split('T')[0];

  const { data: instances, isLoading } = useRecurringInstances({ from: monthStart, to: monthEnd });
  const { data: fxRates } = useFxRates();
  const refresh = useRefreshRecurringTracking();
  const markPaid = useMarkInstancePaid();
  const unmatch = useUnmatchInstance();

  const filtered = useMemo(() => {
    if (!instances) return [];
    if (filter === 'all') return instances;
    if (filter === 'paid') return instances.filter(i => isPaidStatus(i.status));
    if (filter === 'pending') return instances.filter(i => ['expected', 'due_soon', 'overdue', 'needs_review'].includes(i.status));
    return instances.filter(i => i.status === filter);
  }, [instances, filter]);

  const totals = useMemo(() => {
    if (!instances) return { expected: 0, paid: 0, pending: 0, overdue: 0 };
    let expected = 0, paid = 0, pending = 0, overdue = 0;
    instances.forEach(i => {
      const usd = toUSD(Number(i.expected_amount), i.expected_currency, fxRates as FxRateRow[] | undefined);
      expected += usd;
      if (isPaidStatus(i.status)) paid += usd;
      else if (i.status === 'overdue') { overdue += usd; pending += usd; }
      else pending += usd;
    });
    return { expected, paid, pending, overdue };
  }, [instances, fxRates]);

  const handleRefresh = async () => {
    try {
      const r = await refresh.mutateAsync();
      toast.success(`Generated ${r.generated}, matched ${r.matched}`);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      {/* Month switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-semibold w-32 text-center">{format(month, 'MMMM yyyy')}</p>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refresh.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-4 gap-2">
        <Card><CardContent className="pt-3 pb-3"><p className="text-[10px] text-muted-foreground">Expected</p><p className="text-base font-bold">{formatUSD(totals.expected)}</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-3"><p className="text-[10px] text-success">Paid</p><p className="text-base font-bold">{formatUSD(totals.paid)}</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-3"><p className="text-[10px] text-amber-600">Pending</p><p className="text-base font-bold">{formatUSD(totals.pending)}</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-3"><p className="text-[10px] text-destructive">Overdue</p><p className="text-base font-bold">{formatUSD(totals.overdue)}</p></CardContent></Card>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[
          { v: 'all', label: 'All' },
          { v: 'pending', label: 'Pending' },
          { v: 'paid', label: 'Paid' },
          { v: 'overdue', label: 'Overdue' },
          { v: 'matched', label: 'Matched' },
          { v: 'mismatch', label: 'Mismatch' },
        ].map(f => (
          <Button key={f.v} variant={filter === f.v ? 'default' : 'outline'} size="sm" className="h-7 text-xs shrink-0"
            onClick={() => setFilter(f.v)}>{f.label}</Button>
        ))}
      </div>

      {/* Instance list */}
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No instances. Click Refresh to generate.</p>
          </div>
        )}
        {filtered.map(i => {
          const r = (i as any).recurring_expenses;
          const tx = (i as any).transactions;
          const meta = STATUS_META[i.status];
          const isPaid = i.status === 'matched' || i.status === 'paid_manual';
          const diff = tx ? Math.abs(Number(tx.amount)) - Number(i.expected_amount) : 0;
          return (
            <Card key={i.id} className={
              i.status === 'overdue' ? 'border-destructive/30' :
              isPaid ? 'border-success/30' :
              i.status === 'due_soon' ? 'border-amber-500/30' : ''
            }>
              <CardContent className="py-3">
                <div className="flex items-center gap-3">
                  <div className="text-center shrink-0 w-12">
                    <p className="text-[10px] text-muted-foreground uppercase">{format(new Date(i.expected_date + 'T12:00:00'), 'MMM')}</p>
                    <p className="text-lg font-bold">{format(new Date(i.expected_date + 'T12:00:00'), 'd')}</p>
                  </div>
                  <div className="w-px h-10 bg-border" />
                  <span className="text-lg shrink-0">{r?.categories?.icon || '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{r?.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r?.categories?.name || '—'}{r?.accounts ? ` · ${r.accounts.name}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums">{formatCurrency(Number(i.expected_amount), i.expected_currency)}</p>
                    <Badge variant="outline" className={`text-[9px] h-4 px-1.5 mt-0.5 ${meta.cls}`}>{meta.label}</Badge>
                  </div>
                </div>
                {tx && (
                  <div className="mt-2 ml-15 pl-3 border-l-2 border-success/30 text-[11px] flex items-center gap-1.5 text-muted-foreground">
                    <Link2 className="h-3 w-3 text-success" />
                    Linked: {format(new Date(tx.date + 'T12:00:00'), 'MMM d')} · {formatCurrency(Math.abs(Number(tx.amount)), tx.currency)}
                    {Math.abs(diff) > 0.01 && (
                      <span className={diff > 0 ? 'text-destructive' : 'text-success'}>
                        ({diff > 0 ? '+' : ''}{formatCurrency(diff, i.expected_currency)})
                      </span>
                    )}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  {!isPaid && (
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                      onClick={() => markPaid.mutateAsync(i.id).then(() => toast.success('Marked paid'))}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Mark paid
                    </Button>
                  )}
                  {tx && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => unmatch.mutateAsync(i.id).then(() => toast.success('Unlinked'))}>
                      <X className="h-3 w-3 mr-1" /> Unlink
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
