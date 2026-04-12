import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import { formatUSD, formatCurrency, ASSET_TYPES, LIABILITY_TYPES } from '@/lib/constants';
import { getCategoryColor, getCategoryHex } from '@/lib/categoryColors';
import { getCategoryIcon } from '@/lib/brandLogos';
import { TrendingUp, TrendingDown, ArrowUpDown, DollarSign, ArrowUp, ArrowDown, CalendarDays, Repeat, Building, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBlueDollarRate } from '@/hooks/useBlueDollar';
import { Badge } from '@/components/ui/badge';
import { isBefore } from 'date-fns';
import { DemoDataBanner } from '@/components/DemoDataBanner';

export default function Dashboard() {
  const { data: accountBalances, isLoading } = useAccountBalances();
  const { data: transactions } = useTransactions();
  const { data: blueDollar } = useBlueDollarRate();
  const { data: recurringItems } = useRecurringExpenses();

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ['profile-demo-flag'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('profiles').select('has_demo_data').eq('user_id', user.id).single();
      return data;
    },
  });

  const { data: snapshots } = useQuery({
    queryKey: ['net-worth-snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase.from('net_worth_snapshots').select('*').order('date');
      if (error) throw error;
      return data;
    },
  });

  const assets = accountBalances?.filter(a => ASSET_TYPES.includes(a.type)) || [];
  const liabilities = accountBalances?.filter(a => LIABILITY_TYPES.includes(a.type)) || [];

  const totalAssets = assets.reduce((s, a) => s + (a.currency === 'USD' ? a.computed_balance : a.computed_balance_usd), 0);
  const totalLiabilities = Math.abs(liabilities.reduce((s, a) => s + (a.currency === 'USD' ? a.computed_balance : a.computed_balance_usd), 0));
  const netWorth = totalAssets - totalLiabilities;

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const prevMonthStart = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12-01`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}-01`;

  const monthExpenses = transactions?.filter(t => t.type === 'expense' && t.date >= monthStart) || [];
  const prevMonthExpenses = transactions?.filter(t => t.type === 'expense' && t.date >= prevMonthStart && t.date < monthStart) || [];
  const totalMonthSpending = Math.abs(monthExpenses.reduce((s, t) => s + Number(t.amount_usd), 0));
  const totalPrevMonthSpending = Math.abs(prevMonthExpenses.reduce((s, t) => s + Number(t.amount_usd), 0));
  const momChange = totalPrevMonthSpending > 0 ? ((totalMonthSpending - totalPrevMonthSpending) / totalPrevMonthSpending) * 100 : 0;

  const monthIncome = Math.abs(transactions?.filter(t => t.type === 'income' && t.date >= monthStart).reduce((s, t) => s + Number(t.amount_usd), 0) || 0);
  const savingsRate = monthIncome > 0 ? ((monthIncome - totalMonthSpending) / monthIncome) * 100 : 0;

  const topCategories = useMemo(() => {
    const map: Record<string, { name: string; total: number; icon: string | null; color: string | null }> = {};
    monthExpenses.forEach(t => {
      const cat = (t as any).categories;
      const catName = cat?.name || 'Uncategorized';
      if (!map[catName]) map[catName] = { name: catName, total: 0, icon: cat?.icon || null, color: cat?.color || null };
      map[catName].total += Math.abs(Number(t.amount_usd));
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [monthExpenses]);

  const maxCatSpend = topCategories[0]?.total || 1;

  const subsData = useMemo(() => {
    const subs = new Set<string>();
    let subTotal = 0;
    transactions?.filter(t => t.is_subscription && t.type === 'expense').forEach(t => {
      const key = (t.merchant || t.description || '').toLowerCase();
      if (!subs.has(key)) { subs.add(key); subTotal += Math.abs(Number(t.amount_usd)); }
    });
    const pct = totalMonthSpending > 0 ? (subTotal / totalMonthSpending * 100) : 0;
    return { count: subs.size, total: subTotal, pct };
  }, [transactions, totalMonthSpending]);

  // Recurring intelligence
  const recurringInsights = useMemo(() => {
    if (!recurringItems) return { monthlyTotal: 0, overdue: 0, upcoming: [] as any[], fixedPct: 0 };
    const active = recurringItems.filter(i => i.is_active);
    let monthlyTotal = 0;
    active.forEach(i => {
      const amt = Math.abs(Number(i.amount));
      switch (i.frequency) {
        case 'weekly': monthlyTotal += amt * 4.33; break;
        case 'quarterly': monthlyTotal += amt / 3; break;
        case 'yearly': monthlyTotal += amt / 12; break;
        default: monthlyTotal += amt;
      }
    });
    const overdue = active.filter(i => i.next_due_date && isBefore(new Date(i.next_due_date), new Date()) && i.status !== 'paid').length;
    const upcoming = active
      .filter(i => i.next_due_date)
      .sort((a, b) => new Date(a.next_due_date!).getTime() - new Date(b.next_due_date!).getTime())
      .slice(0, 3);
    const fixedPct = totalMonthSpending > 0 ? (monthlyTotal / totalMonthSpending * 100) : 0;
    return { monthlyTotal, overdue, upcoming, fixedPct };
  }, [recurringItems, totalMonthSpending]);

  const byCurrency: Record<string, number> = {};
  accountBalances?.forEach(a => { byCurrency[a.currency] = (byCurrency[a.currency] || 0) + a.computed_balance; });

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      {profile?.has_demo_data && (
        <DemoDataBanner onCleared={() => refetchProfile()} />
      )}
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Net Worth */}
      <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 shadow-elevated">
        <CardContent className="pt-6 pb-6">
          <p className="text-sm opacity-80 font-medium">Total Net Worth</p>
          <p className="text-4xl font-extrabold mt-1 tracking-tight">{formatUSD(netWorth)}</p>
          <p className="text-xs opacity-60 mt-1">Updated today</p>
          <div className="flex gap-6 mt-4 text-sm">
            <div className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /><span>Assets: {formatUSD(totalAssets)}</span></div>
            <div className="flex items-center gap-1.5"><TrendingDown className="h-4 w-4" /><span>Debt: {formatUSD(totalLiabilities)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-success/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-success text-xs font-medium mb-1"><TrendingUp className="h-3.5 w-3.5" /> Assets</div>
            <p className="text-lg font-bold text-foreground">{formatUSD(totalAssets)}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-destructive text-xs font-medium mb-1"><TrendingDown className="h-3.5 w-3.5" /> Liabilities</div>
            <p className="text-lg font-bold text-foreground">{formatUSD(totalLiabilities)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium mb-1"><ArrowUpDown className="h-3.5 w-3.5" /> This Month</div>
            <p className="text-lg font-bold text-foreground">{formatUSD(totalMonthSpending)}</p>
            {momChange !== 0 && (
              <p className={`text-[10px] flex items-center gap-0.5 mt-0.5 font-medium ${momChange > 0 ? 'text-destructive' : 'text-success'}`}>
                {momChange > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(momChange).toFixed(0)}% vs last month
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] text-muted-foreground font-medium">Savings Rate</p>
            <p className="text-lg font-bold text-foreground">{savingsRate.toFixed(0)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] text-muted-foreground font-medium">Subscriptions</p>
            <p className="text-lg font-bold text-foreground">{subsData.count}</p>
            <p className="text-[10px] text-muted-foreground">{subsData.pct.toFixed(0)}% of expenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] text-muted-foreground font-medium">Top Category</p>
            {topCategories[0] ? (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-base">{getCategoryIcon(topCategories[0].name, topCategories[0].icon)}</span>
                <span className="text-sm font-bold text-foreground truncate">{topCategories[0].name}</span>
              </div>
            ) : (
              <p className="text-sm font-bold text-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Intelligence Insights */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Insights</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {recurringInsights.fixedPct > 0 && (
            <p className="text-xs text-muted-foreground">💡 <span className="font-medium text-foreground">{recurringInsights.fixedPct.toFixed(0)}%</span> of your spending is fixed/recurring ({formatUSD(recurringInsights.monthlyTotal)}/mo)</p>
          )}
          {momChange > 10 && (
            <p className="text-xs text-muted-foreground">📈 Spending is <span className="font-medium text-destructive">up {momChange.toFixed(0)}%</span> vs last month</p>
          )}
          {momChange < -10 && (
            <p className="text-xs text-muted-foreground">📉 Spending is <span className="font-medium text-success">down {Math.abs(momChange).toFixed(0)}%</span> vs last month</p>
          )}
          {topCategories[0] && totalMonthSpending > 0 && (topCategories[0].total / totalMonthSpending) > 0.3 && (
            <p className="text-xs text-muted-foreground">⚠️ <span className="font-medium text-foreground">{topCategories[0].name}</span> is {((topCategories[0].total / totalMonthSpending) * 100).toFixed(0)}% of your spending</p>
          )}
          {recurringInsights.overdue > 0 && (
            <p className="text-xs text-destructive">🔴 <span className="font-medium">{recurringInsights.overdue} overdue</span> recurring payment{recurringInsights.overdue > 1 ? 's' : ''}</p>
          )}
          {recurringInsights.fixedPct === 0 && momChange <= 10 && momChange >= -10 && recurringInsights.overdue === 0 && (
            <p className="text-xs text-muted-foreground">✅ Everything looks good this month</p>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Payments */}
      {recurringInsights.upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /> Upcoming Payments</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recurringInsights.upcoming.map((item: any) => {
              const cat = item.categories;
              const acc = item.accounts;
              const dueDate = item.next_due_date ? new Date(item.next_due_date + 'T12:00:00') : null;
              const daysUntil = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
              return (
                <div key={item.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-lg">{cat?.icon || '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">{acc?.name || ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(Math.abs(Number(item.amount)), item.currency)}</p>
                    {daysUntil !== null && (
                      <Badge variant={daysUntil < 0 ? 'destructive' : daysUntil <= 3 ? 'secondary' : 'outline'} className="text-[9px] h-4 px-1.5">
                        {daysUntil < 0 ? 'Overdue' : daysUntil === 0 ? 'Today' : `${daysUntil}d`}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Blue Dollar */}
      {blueDollar && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">ARS/USD (Blue)</p>
              <p className="text-lg font-bold text-foreground">
                1 USD = {blueDollar.blue_avg ? Math.round(blueDollar.blue_avg).toLocaleString() : Math.round(1 / blueDollar.rate).toLocaleString()} ARS
              </p>
              <p className="text-[10px] text-muted-foreground">
                Updated: {new Date(blueDollar.updated_at).toLocaleString()}
                {blueDollar.cached && ' (cached)'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Spending */}
      {topCategories.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Top Spending This Month</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topCategories.map(cat => {
              const colors = getCategoryColor(cat.name, cat.color);
              const pct = totalMonthSpending > 0 ? (cat.total / totalMonthSpending * 100) : 0;
              const barPct = (cat.total / maxCatSpend) * 100;
              return (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{getCategoryIcon(cat.name, cat.icon)}</span>
                      <span className="font-medium text-foreground">{cat.name}</span>
                      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                    </div>
                    <span className="font-semibold text-foreground tabular-nums">{formatUSD(cat.total)}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barPct}%`, backgroundColor: colors.hex }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Net Worth Trend */}
      {snapshots && snapshots.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Net Worth Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={snapshots}>
                  <defs>
                    <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
                  <Tooltip formatter={(v: number) => formatUSD(v)} labelFormatter={d => new Date(d).toLocaleDateString()} />
                  <Area type="monotone" dataKey="net_worth_usd" stroke="hsl(var(--primary))" fill="url(#nwGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* By Currency */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">By Currency</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(byCurrency).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([currency, balance]) => (
            <div key={currency} className="flex justify-between items-center text-sm py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-base">{currency === 'USD' ? '🇺🇸' : currency === 'ARS' ? '🇦🇷' : currency === 'EUR' ? '🇪🇺' : currency === 'GBP' ? '🇬🇧' : '💱'}</span>
                <span className="text-muted-foreground font-medium">{currency}</span>
              </div>
              <span className="font-bold text-foreground tabular-nums">{formatCurrency(balance, currency)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
