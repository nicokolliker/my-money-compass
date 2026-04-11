import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { formatUSD, formatCurrency, ASSET_TYPES, LIABILITY_TYPES } from '@/lib/constants';
import { TrendingUp, TrendingDown, Wallet, ArrowUpDown } from 'lucide-react';
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

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const assets = accountBalances?.filter(a => ASSET_TYPES.includes(a.type)) || [];
  const liabilities = accountBalances?.filter(a => LIABILITY_TYPES.includes(a.type)) || [];

  const totalAssets = assets.reduce((s, a) => s + (a.currency === 'USD' ? a.computed_balance : a.computed_balance_usd), 0);
  const totalLiabilities = Math.abs(liabilities.reduce((s, a) => s + (a.currency === 'USD' ? a.computed_balance : a.computed_balance_usd), 0));
  const netWorth = totalAssets - totalLiabilities;

  // Monthly spending (expenses only, current month)
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthExpenses = transactions?.filter(t => (t as any).type === 'expense' && t.date >= monthStart) || [];
  const totalMonthSpending = Math.abs(monthExpenses.reduce((s, t) => s + Number(t.amount_usd), 0));

  // Currency breakdown
  const byCurrency: Record<string, number> = {};
  accountBalances?.forEach(a => {
    byCurrency[a.currency] = (byCurrency[a.currency] || 0) + a.computed_balance;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Net Worth Card */}
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="pt-6">
          <p className="text-sm opacity-80">Total Net Worth</p>
          <p className="text-3xl font-bold mt-1">{formatUSD(netWorth)}</p>
          <div className="flex gap-6 mt-3 text-sm">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              <span>Assets: {formatUSD(totalAssets)}</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingDown className="h-4 w-4" />
              <span>Debt: {formatUSD(totalLiabilities)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <ArrowUpDown className="h-3 w-3" /> This Month
            </div>
            <p className="text-lg font-semibold text-foreground">{formatUSD(totalMonthSpending)}</p>
            <p className="text-xs text-muted-foreground">spent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Wallet className="h-3 w-3" /> Accounts
            </div>
            <p className="text-lg font-semibold text-foreground">{accountBalances?.length || 0}</p>
            <p className="text-xs text-muted-foreground">active</p>
          </CardContent>
        </Card>
      </div>

      {/* Net Worth Trend */}
      {snapshots && snapshots.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Worth Trend</CardTitle>
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
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Account Balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {accountBalances?.map(a => (
            <div key={a.id} className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.institution || a.type}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{formatCurrency(a.computed_balance, a.currency)}</p>
                {a.currency !== 'USD' && (
                  <p className="text-xs text-muted-foreground">≈ {formatUSD(a.computed_balance_usd)}</p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Currency Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">By Currency</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(byCurrency).map(([currency, balance]) => (
            <div key={currency} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{currency}</span>
              <span className="font-medium text-foreground">{formatCurrency(balance, currency)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
