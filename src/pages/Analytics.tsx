import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTransactions } from '@/hooks/useTransactions';
import { formatUSD } from '@/lib/constants';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['hsl(0, 84%, 60%)', 'hsl(142, 71%, 45%)', 'hsl(210, 79%, 46%)', 'hsl(280, 68%, 50%)', 'hsl(330, 81%, 60%)', 'hsl(45, 93%, 58%)', 'hsl(160, 60%, 45%)', 'hsl(30, 80%, 55%)', 'hsl(250, 60%, 55%)', 'hsl(200, 18%, 46%)', 'hsl(350, 80%, 60%)', 'hsl(0, 0%, 60%)'];

export default function Analytics() {
  const { data: transactions, isLoading } = useTransactions();

  const expenses = useMemo(() => transactions?.filter(t => t.type === 'expense') || [], [transactions]);

  // By category
  const byCategory = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    expenses.forEach(t => {
      const cat = (t as any).categories?.name || 'Uncategorized';
      if (!map[cat]) map[cat] = { name: cat, total: 0 };
      map[cat].total += Math.abs(Number(t.amount_usd));
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses]);

  // Monthly spending
  const monthly = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(t => {
      const month = t.date.substring(0, 7);
      map[month] = (map[month] || 0) + Math.abs(Number(t.amount_usd));
    });
    return Object.entries(map).sort().map(([month, total]) => ({ month, total }));
  }, [expenses]);

  // Top merchants
  const topMerchants = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(t => {
      const merchant = t.merchant || t.description || 'Unknown';
      map[merchant] = (map[merchant] || 0) + Math.abs(Number(t.amount_usd));
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total }));
  }, [expenses]);

  // Income vs expense
  const incomeTotal = useMemo(() => transactions?.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount_usd), 0) || 0, [transactions]);
  const expenseTotal = useMemo(() => Math.abs(expenses.reduce((s, t) => s + Number(t.amount_usd), 0)), [expenses]);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Analytics</h1>

      {/* Income vs Expenses */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Income</p>
            <p className="text-lg font-semibold text-primary">{formatUSD(incomeTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Expenses</p>
            <p className="text-lg font-semibold text-destructive">{formatUSD(expenseTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Spending */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Monthly Spending</CardTitle></CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleString('en', { month: 'short' }); }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v: number) => formatUSD(v)} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">By Category</CardTitle></CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatUSD(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {byCategory.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-foreground">{c.name}</span>
                </div>
                <span className="font-medium text-foreground">{formatUSD(c.total)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Merchants */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Top Merchants</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {topMerchants.map((m, i) => (
            <div key={m.name} className="flex justify-between text-sm">
              <span className="text-foreground">{i + 1}. {m.name}</span>
              <span className="font-medium text-foreground">{formatUSD(m.total)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
