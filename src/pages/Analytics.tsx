import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTransactions } from '@/hooks/useTransactions';
import { formatUSD } from '@/lib/constants';
import { getCategoryColor, getCategoryHex } from '@/lib/categoryColors';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function Analytics() {
  const { data: transactions, isLoading } = useTransactions();

  const expenses = useMemo(() => transactions?.filter(t => t.type === 'expense') || [], [transactions]);

  const byCategory = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    expenses.forEach(t => {
      const cat = (t as any).categories?.name || 'Uncategorized';
      if (!map[cat]) map[cat] = { name: cat, total: 0 };
      map[cat].total += Math.abs(Number(t.amount_usd));
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const monthly = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(t => {
      const month = t.date.substring(0, 7);
      map[month] = (map[month] || 0) + Math.abs(Number(t.amount_usd));
    });
    return Object.entries(map).sort().map(([month, total]) => ({ month, total }));
  }, [expenses]);

  const topMerchants = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(t => {
      const merchant = t.merchant || t.description || 'Unknown';
      map[merchant] = (map[merchant] || 0) + Math.abs(Number(t.amount_usd));
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total }));
  }, [expenses]);

  const incomeTotal = useMemo(() => transactions?.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount_usd), 0) || 0, [transactions]);
  const expenseTotal = useMemo(() => Math.abs(expenses.reduce((s, t) => s + Number(t.amount_usd), 0)), [expenses]);
  const maxMerchant = topMerchants[0]?.total || 1;

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Analytics</h1>

      {/* Income vs Expenses */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-success/20">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium">Income</p>
            <p className="text-xl font-bold text-success tabular-nums">{formatUSD(incomeTotal)}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium">Expenses</p>
            <p className="text-xl font-bold text-destructive tabular-nums">{formatUSD(expenseTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Spending */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Spending</CardTitle></CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleString('en', { month: 'short' }); }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v: number) => formatUSD(v)} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">By Category</CardTitle></CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {byCategory.map((c) => (
                    <Cell key={c.name} fill={getCategoryHex(c.name)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatUSD(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {byCategory.map((c) => {
              const colors = getCategoryColor(c.name);
              return (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.hex }} />
                    <span className="text-foreground font-medium">{c.name}</span>
                  </div>
                  <span className="font-bold text-foreground tabular-nums">{formatUSD(c.total)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Merchants */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top Merchants</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {topMerchants.map((m, i) => (
            <div key={m.name} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-foreground font-medium">{i + 1}. {m.name}</span>
                <span className="font-bold text-foreground tabular-nums">{formatUSD(m.total)}</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${(m.total / maxMerchant) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
