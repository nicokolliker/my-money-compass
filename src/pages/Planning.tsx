import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { useDerivedInstances, useRefreshRecurringTracking } from '@/hooks/useRecurringInstances';
import { useTransactions } from '@/hooks/useTransactions';
import { useBudgets } from '@/hooks/useBudgets';
import { useNetWorth } from '@/hooks/useNetWorth';
import { useFxRates } from '@/hooks/useFxRates';
import { formatUSD, formatCurrency } from '@/lib/constants';
import { toUSD, isDerivedPaid, DERIVED_STATE_META, TONE_CLASS, type FxRateRow } from '@/lib/money';
import { Repeat, TrendingUp, Wallet, AlertCircle, CheckCircle2, Clock, RefreshCw, CalendarDays, Target } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { toast } from 'sonner';
import RecurringExpenses from './RecurringExpenses';
import CalendarPage from './Calendar';
import BudgetPage from './Budget';
import { PlanningShell } from '@/components/planning/PlanningShell';

type PlanningTab = 'overview' | 'recurring' | 'calendar' | 'budget';

const SECTION_META: Record<PlanningTab, { label: string; description: string }> = {
  overview: { label: 'Overview', description: 'Snapshot of recurring, calendar and budget' },
  recurring: { label: 'Recurring', description: 'Library of recurring items and tracking of expected vs actual' },
  calendar: { label: 'Calendar', description: 'Expected payments by day across the month' },
  budget: { label: 'Budget', description: 'Monthly limits per category and spending progress' },
};

export default function Planning({ initialTab }: { initialTab?: PlanningTab } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const tab: PlanningTab = initialTab || (location.state as any)?.tab || 'overview';
  const meta = SECTION_META[tab];

  const handleNavigate = (t: PlanningTab) => {
    const map: Record<PlanningTab, string> = {
      overview: '/planning',
      recurring: '/planning/recurring',
      calendar: '/planning/calendar',
      budget: '/planning/budget',
    };
    navigate(map[t], { replace: true });
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{meta.label}</h1>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      </div>

      {tab === 'overview' && <PlanningOverview onNavigate={handleNavigate} />}
      {tab === 'recurring' && <RecurringExpenses embedded />}
      {tab === 'calendar' && <CalendarPage embedded />}
      {tab === 'budget' && <BudgetPage embedded />}
    </div>
  );
}

function PlanningOverview({ onNavigate }: { onNavigate: (tab: PlanningTab) => void }) {
  const refresh = useRefreshRecurringTracking();
  const monthStart = startOfMonth(new Date()).toISOString().split('T')[0];
  const monthEnd = endOfMonth(new Date()).toISOString().split('T')[0];
  const nextMonthEnd = endOfMonth(addMonths(new Date(), 1)).toISOString().split('T')[0];

  const { data: instances, isLoading } = useDerivedInstances({ from: monthStart, to: nextMonthEnd });
  const { data: transactions } = useTransactions();
  const { data: budgets } = useBudgets(monthStart);
  const { liquidCashUsd } = useNetWorth();
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

  const missing = monthInstances.filter(i => i.derived === 'missing');
  const needsReview = monthInstances.filter(i => i.derived === 'needs_review');
  const upcomingMonth = monthInstances.filter(i => i.derived === 'upcoming');
  const paid = monthInstances.filter(i => isDerivedPaid(i.derived));

  const upcoming = useMemo(
    () => (instances || [])
      .filter(i => i.expected_date >= monthStart && (i.derived === 'upcoming' || i.derived === 'missing' || i.derived === 'needs_review'))
      .slice(0, 8),
    [instances, monthStart]
  );

  // Budget snapshot (totals across all category budgets for current month)
  const budgetSnapshot = useMemo(() => {
    if (!budgets || !transactions) return { total: 0, spent: 0, count: 0 };
    const spentByCat: Record<string, number> = {};
    transactions
      .filter(t => t.type === 'expense' && t.date >= monthStart && t.date <= monthEnd)
      .forEach(t => {
        const k = t.category_id || 'uncat';
        spentByCat[k] = (spentByCat[k] || 0) + Math.abs(Number(t.amount_usd));
      });
    let total = 0, spent = 0;
    budgets.forEach(b => {
      total += Number(b.amount);
      spent += spentByCat[b.category_id || ''] || 0;
    });
    return { total, spent, count: budgets.length };
  }, [budgets, transactions, monthStart, monthEnd]);

  const handleRefresh = async () => {
    try {
      const r = await refresh.mutateAsync();
      toast.success(`Refreshed: ${r.matched} matched, ${r.generated} instances`);
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const budgetPct = budgetSnapshot.total > 0 ? (budgetSnapshot.spent / budgetSnapshot.total) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refresh.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 shadow-elevated">
        <CardContent className="pt-6 pb-6">
          <p className="text-sm opacity-80 font-medium">{format(new Date(), 'MMMM yyyy')}</p>
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
              <p className="font-bold mt-0.5">{formatUSD(liquidCashUsd)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Missing', count: missing.length, cls: 'text-destructive', icon: AlertCircle, tab: 'recurring' as PlanningTab },
          { label: 'Review', count: needsReview.length, cls: 'text-amber-600', icon: Clock, tab: 'recurring' as PlanningTab },
          { label: 'Upcoming', count: upcomingMonth.length, cls: 'text-muted-foreground', icon: Clock, tab: 'calendar' as PlanningTab },
          { label: 'Paid', count: paid.length, cls: 'text-success', icon: CheckCircle2, tab: 'recurring' as PlanningTab },
        ].map(s => (
          <button key={s.label} onClick={() => onNavigate(s.tab)} className="text-left">
            <Card className="hover:bg-accent/50 transition-colors h-full">
              <CardContent className="pt-3 pb-3 text-center">
                <s.icon className={`h-4 w-4 mx-auto ${s.cls}`} />
                <p className="text-xl font-bold text-foreground mt-1">{s.count}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {(missing.length > 0 || needsReview.length > 0) && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" /> Needs attention
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate('recurring')}>View all</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...missing, ...needsReview].slice(0, 5).map(i => {
              const meta = DERIVED_STATE_META[i.derived];
              const cls = TONE_CLASS[meta.tone];
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
                    <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${cls}`}>{meta.label}</Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" /> Upcoming
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate('calendar')}>Calendar</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No upcoming expected payments</p>
          )}
          {upcoming.map(i => {
            const r = (i as any).recurring_expenses;
            const meta = DERIVED_STATE_META[i.derived];
            const cls = TONE_CLASS[meta.tone];
            return (
              <div key={i.id} className="flex items-center gap-3 py-1.5">
                <span className="text-base">{r?.categories?.icon || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r?.name}</p>
                  <p className="text-[10px] text-muted-foreground">{format(new Date(i.expected_date + 'T12:00:00'), 'MMM d')}{r?.accounts ? ` · ${r.accounts.name}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(Number(i.expected_amount), i.expected_currency)}</p>
                  <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${cls}`}>{meta.label}</Badge>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Budget snapshot */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" /> Budget snapshot
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate('budget')}>Open budget</Button>
        </CardHeader>
        <CardContent>
          {budgetSnapshot.count === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No budgets set this month</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-muted-foreground">{budgetSnapshot.count} categories</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatUSD(budgetSnapshot.spent)} <span className="text-muted-foreground font-normal">/ {formatUSD(budgetSnapshot.total)}</span>
                </p>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetPct > 100 ? 'bg-destructive' : budgetPct > 80 ? 'bg-amber-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">{Math.round(budgetPct)}% of monthly budget used</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
