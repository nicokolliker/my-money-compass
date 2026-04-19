import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRecurringInstances, useRefreshRecurringTracking } from '@/hooks/useRecurringInstances';
import { useTransactions } from '@/hooks/useTransactions';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useFxRates } from '@/hooks/useFxRates';
import { formatUSD, formatCurrency, ASSET_TYPES } from '@/lib/constants';
import { toUSD, isPaidStatus, type FxRateRow } from '@/lib/money';
import { Repeat, TrendingUp, TrendingDown, Wallet, AlertCircle, CheckCircle2, Clock, RefreshCw, CalendarDays } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { toast } from 'sonner';

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
  matched:     { label: 'Matched',    cls: 'bg-success/10 text-success border-success/30',           icon: CheckCircle2 },
  paid_manual: { label: 'Paid',       cls: 'bg-success/10 text-success border-success/30',           icon: CheckCircle2 },
  due_soon:    { label: 'Due soon',   cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30',     icon: Clock },
  overdue:     { label: 'Overdue',    cls: 'bg-destructive/10 text-destructive border-destructive/30', icon: AlertCircle },
  expected:    { label: 'Expected',   cls: 'bg-muted text-muted-foreground border-border',           icon: Clock },
  mismatch:    { label: 'Mismatch',   cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30',     icon: AlertCircle },
  skipped:     { label: 'Skipped',    cls: 'bg-muted text-muted-foreground border-border',           icon: Clock },
};

export default function Planning() {
  const navigate = useNavigate();
  const refresh = useRefreshRecurringTracking();
  const monthStart = startOfMonth(new Date()).toISOString().split('T')[0];
  const monthEnd = endOfMonth(new Date()).toISOString().split('T')[0];
  const nextMonthEnd = endOfMonth(addMonths(new Date(), 1)).toISOString().split('T')[0];

  const { data: instances, isLoading } = useRecurringInstances({ from: monthStart, to: nextMonthEnd });
  const { data: transactions } = useTransactions();
  const { data: balances } = useAccountBalances();
  const { data: fxRates } = useFxRates();

  const monthIncome = useMemo(() => {
    if (!transactions) return 0;
    return Math.abs(transactions
      .filter(t => t.type === 'income' && t.date >= monthStart && t.date <= monthEnd)
      .reduce((s, t) => s + Number(t.amount_usd), 0));
  }, [transactions, monthStart, monthEnd]);

  const monthInstances = useMemo(
    () => (instances || []).filter(i => i.expected_date >= monthStart && i.expected_date <= monthEnd),
    [instances, monthStart, monthEnd]
  );

  const expectedRecurring = useMemo(
    () => monthInstances.reduce((s, i) => s + toUSD(Number(i.expected_amount), i.expected_currency, fxRates as FxRateRow[] | undefined), 0),
    [monthInstances, fxRates]
  );

  const liquidCash = useMemo(() => {
    if (!balances) return 0;
    return balances
      .filter(a => ASSET_TYPES.includes(a.type))
      .reduce((s, a) => s + (a.currency === 'USD' ? a.computed_balance : a.computed_balance_usd), 0);
  }, [balances]);

  const overdue = monthInstances.filter(i => i.status === 'overdue');
  const dueSoon = monthInstances.filter(i => i.status === 'due_soon');
  const expected = monthInstances.filter(i => i.status === 'expected');
  const paid = monthInstances.filter(i => isPaidStatus(i.status));

  const upcoming = useMemo(
    () => (instances || [])
      .filter(i => i.expected_date >= monthStart && (i.status === 'expected' || i.status === 'due_soon' || i.status === 'overdue'))
      .slice(0, 8),
    [instances, monthStart]
  );

  const handleRefresh = async () => {
    try {
      const r = await refresh.mutateAsync();
      toast.success(`Refreshed: ${r.matched} matched, ${r.generated} instances`);
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planning</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), 'MMMM yyyy')} projection</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refresh.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Monthly projection */}
      <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 shadow-elevated">
        <CardContent className="pt-6 pb-6">
          <p className="text-sm opacity-80 font-medium">This month</p>
          <p className="text-4xl font-extrabold mt-1 tracking-tight">{formatUSD(monthIncome - expectedRecurring)}</p>
          <p className="text-xs opacity-70 mt-1">expected available after recurring</p>
          <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
            <div>
              <div className="flex items-center gap-1 opacity-80"><TrendingUp className="h-3.5 w-3.5" /> Income</div>
              <p className="font-bold mt-0.5">{formatUSD(monthIncome)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1 opacity-80"><Repeat className="h-3.5 w-3.5" /> Recurring</div>
              <p className="font-bold mt-0.5">{formatUSD(expectedRecurring)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1 opacity-80"><Wallet className="h-3.5 w-3.5" /> Cash</div>
              <p className="font-bold mt-0.5">{formatUSD(liquidCash)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status grid */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Overdue', count: overdue.length, cls: 'text-destructive', icon: AlertCircle },
          { label: 'Due soon', count: dueSoon.length, cls: 'text-amber-600', icon: Clock },
          { label: 'Expected', count: expected.length, cls: 'text-muted-foreground', icon: Clock },
          { label: 'Paid', count: paid.length, cls: 'text-success', icon: CheckCircle2 },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-3 pb-3 text-center">
              <s.icon className={`h-4 w-4 mx-auto ${s.cls}`} />
              <p className="text-xl font-bold text-foreground mt-1">{s.count}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Needs attention */}
      {(overdue.length > 0 || dueSoon.length > 0) && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" /> Needs attention
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/recurring')}>View all</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...overdue, ...dueSoon].slice(0, 5).map(i => {
              const meta = STATUS_META[i.status];
              const r = (i as any).recurring_expenses;
              return (
                <div key={i.id} className="flex items-center gap-3 py-1.5">
                  <div className="text-center shrink-0 w-10">
                    <p className="text-[10px] text-muted-foreground uppercase">{format(new Date(i.expected_date + 'T12:00:00'), 'MMM')}</p>
                    <p className="text-base font-bold">{format(new Date(i.expected_date + 'T12:00:00'), 'd')}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r?.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{r?.accounts?.name || ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{formatCurrency(Number(i.expected_amount), i.expected_currency)}</p>
                    <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${meta.cls}`}>{meta.label}</Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Upcoming list */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" /> Upcoming
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/calendar')}>Calendar</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No upcoming expected payments</p>
          )}
          {upcoming.map(i => {
            const r = (i as any).recurring_expenses;
            const meta = STATUS_META[i.status];
            return (
              <div key={i.id} className="flex items-center gap-3 py-1.5">
                <span className="text-base">{r?.categories?.icon || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r?.name}</p>
                  <p className="text-[10px] text-muted-foreground">{format(new Date(i.expected_date + 'T12:00:00'), 'MMM d')}{r?.accounts ? ` · ${r.accounts.name}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(Number(i.expected_amount), i.expected_currency)}</p>
                  <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${meta.cls}`}>{meta.label}</Badge>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
