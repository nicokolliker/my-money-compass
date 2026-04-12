import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { formatUSD, formatCurrency, ASSET_TYPES, LIABILITY_TYPES } from '@/lib/constants';
import { getCategoryColor, getCategoryHex } from '@/lib/categoryColors';
import { TrendingUp, TrendingDown, Wallet, CreditCard, ArrowUpDown, Repeat } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function Dashboard() {
  const { data: accountBalances, isLoading } = useAccountBalances();
  const { data: transactions } = useTransactions();

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

  // Monthly spending
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthExpenses = transactions?.filter(t => t.type === 'expense' && t.date >= monthStart) || [];
  const totalMonthSpending = Math.abs(monthExpenses.reduce((s, t) => s + Number(t.amount_usd), 0));

  // Top spending categories this month
  const topCategories = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    monthExpenses.forEach(t => {
      const cat = (t as any).categories?.name || 'Uncategorized';
      if (!map[cat]) map[cat] = { name: cat, total: 0 };
      map[cat].total += Math.abs(Number(t.amount_usd));
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [monthExpenses]);

  const maxCatSpend = topCategories[0]?.total || 1;

  // Subscriptions count
  const subsCount = useMemo(() => {
    const subs = new Set<string>();
    transactions?.filter(t => t.is_subscription && t.type === 'expense').forEach(t => {
      subs.add((t.merchant || t.description || '').toLowerCase());
    });
    return subs.size;
  }, [transactions]);

  // Currency breakdown
  const byCurrency: Record<string, number> = {};
  accountBalances?.forEach(a => {
    byCurrency[a.currency] = (byCurrency[a.currency] || 0) + a.computed_balance;
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Net Worth Card */}
      <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 shadow-elevated">
        <CardContent className="pt-6 pb-6">
          <p className="text-sm opacity-80 font-medium">Total Net Worth</p>
          <p className="text-4xl font-extrabold mt-1 tracking-tight">{formatUSD(netWorth)}</p>
          <p className="text-xs opacity-60 mt-1">Updated today</p>
          <div className="flex gap-6 mt-4 text-sm">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" />
              <span>Assets: {formatUSD(totalAssets)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4" />
              <span>Debt: {formatUSD(totalLiabilities)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Asset / Liability / Spending cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-success/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-success text-xs font-medium mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Assets
            </div>
            <p className="text-lg font-bold text-foreground">{formatUSD(totalAssets)}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-destructive text-xs font-medium mb-1">
              <CreditCard className="h-3.5 w-3.5" /> Liabilities
            </div>
            <p className="text-lg font-bold text-foreground">{formatUSD(totalLiabilities)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium mb-1">
              <ArrowUpDown className="h-3.5 w-3.5" /> This Month
            </div>
            <p className="text-lg font-bold text-foreground">{formatUSD(totalMonthSpending)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Insights row */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Accounts</p>
              <p className="text-lg font-bold text-foreground">{accountBalances?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Repeat className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Subscriptions</p>
              <p className="text-lg font-bold text-foreground">{subsCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Spending Categories */}
      {topCategories.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Top Spending This Month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topCategories.map(cat => {
              const colors = getCategoryColor(cat.name);
              const pct = (cat.total / maxCatSpend) * 100;
              return (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full`} style={{ backgroundColor: colors.hex }} />
                      <span className="font-medium text-foreground">{cat.name}</span>
                    </div>
                    <span className="font-semibold text-foreground tabular-nums">{formatUSD(cat.total)}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: colors.hex }}
                    />
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
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Net Worth Trend</CardTitle>
          </CardHeader>
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

      {/* Account Balances */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Account Balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {accountBalances?.map(a => (
            <div key={a.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-accent/50 transition-colors">
              <div>
                <p className="text-sm font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.institution || a.type}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(a.computed_balance, a.currency)}</p>
                {a.currency !== 'USD' && (
                  <p className="text-xs text-muted-foreground tabular-nums">≈ {formatUSD(a.computed_balance_usd)}</p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Currency Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">By Currency</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(byCurrency).map(([currency, balance]) => (
            <div key={currency} className="flex justify-between text-sm py-1">
              <span className="text-muted-foreground font-medium">{currency}</span>
              <span className="font-bold text-foreground tabular-nums">{formatCurrency(balance, currency)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
