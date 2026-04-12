import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTransactions } from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { formatUSD } from '@/lib/constants';
import { getCategoryColor, getCategoryHex } from '@/lib/categoryColors';
import { getCategoryIcon, getBrandLogo, getInitialsColor } from '@/lib/brandLogos';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ArrowUp, ArrowDown } from 'lucide-react';

type Period = 'this_month' | 'last_month' | 'last_3' | 'ytd' | 'all';

function getPeriodDates(period: Period): { from: string; to: string; prevFrom: string; prevTo: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.toISOString().split('T')[0];

  switch (period) {
    case 'this_month': {
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const prevFrom = m === 0 ? `${y - 1}-12-01` : `${y}-${String(m).padStart(2, '0')}-01`;
      return { from, to: today, prevFrom, prevTo: from };
    }
    case 'last_month': {
      const from = m === 0 ? `${y - 1}-12-01` : `${y}-${String(m).padStart(2, '0')}-01`;
      const to = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const prevM = m <= 1 ? (m === 0 ? 11 : 0) : m - 1;
      const prevY = m <= 1 ? y - 1 : y;
      const prevFrom = `${prevY}-${String(prevM + 1).padStart(2, '0')}-01`;
      return { from, to, prevFrom, prevTo: from };
    }
    case 'last_3': {
      const d = new Date(y, m - 2, 1);
      const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const d2 = new Date(y, m - 5, 1);
      const prevFrom = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-01`;
      return { from, to: today, prevFrom, prevTo: from };
    }
    case 'ytd': {
      const from = `${y}-01-01`;
      const prevFrom = `${y - 1}-01-01`;
      const prevTo = `${y - 1}-${String(m + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      return { from, to: today, prevFrom, prevTo };
    }
    default:
      return { from: '2000-01-01', to: today, prevFrom: '1990-01-01', prevTo: '2000-01-01' };
  }
}

export default function Analytics() {
  const { data: allTransactions, isLoading } = useTransactions();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();

  const [period, setPeriod] = useState<Period>('this_month');
  const [accountFilter, setAccountFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const dates = useMemo(() => getPeriodDates(period), [period]);

  // Build category lookup for DB icon/color
  const catMap = useMemo(() => {
    const m: Record<string, { icon: string | null; color: string | null }> = {};
    categories?.forEach(c => { m[c.name] = { icon: c.icon, color: c.color }; });
    return m;
  }, [categories]);

  const transactions = useMemo(() => {
    if (!allTransactions) return [];
    return allTransactions.filter(t => {
      if (t.date < dates.from || t.date > dates.to) return false;
      if (accountFilter !== 'all' && t.account_id !== accountFilter) return false;
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return false;
      return true;
    });
  }, [allTransactions, dates, accountFilter, categoryFilter]);

  const prevTransactions = useMemo(() => {
    if (!allTransactions) return [];
    return allTransactions.filter(t => {
      if (t.date < dates.prevFrom || t.date >= dates.prevTo) return false;
      if (accountFilter !== 'all' && t.account_id !== accountFilter) return false;
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return false;
      return true;
    });
  }, [allTransactions, dates, accountFilter, categoryFilter]);

  const expenses = useMemo(() => transactions.filter(t => t.type === 'expense'), [transactions]);
  const incomes = useMemo(() => transactions.filter(t => t.type === 'income'), [transactions]);
  const prevExpenses = useMemo(() => prevTransactions.filter(t => t.type === 'expense'), [prevTransactions]);

  const byCategory = useMemo(() => {
    const map: Record<string, { name: string; total: number; icon: string | null; color: string | null }> = {};
    expenses.forEach(t => {
      const cat = (t as any).categories;
      const catName = cat?.name || 'Uncategorized';
      if (!map[catName]) map[catName] = { name: catName, total: 0, icon: cat?.icon || null, color: cat?.color || null };
      map[catName].total += Math.abs(Number(t.amount_usd));
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const totalExpenses = Math.abs(expenses.reduce((s, t) => s + Number(t.amount_usd), 0));
  const prevTotalExpenses = Math.abs(prevExpenses.reduce((s, t) => s + Number(t.amount_usd), 0));
  const momChange = prevTotalExpenses > 0 ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses * 100) : 0;

  const monthly = useMemo(() => {
    if (!allTransactions) return [];
    const expMap: Record<string, number> = {};
    const incMap: Record<string, number> = {};
    allTransactions.filter(t => {
      if (accountFilter !== 'all' && t.account_id !== accountFilter) return false;
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return false;
      return true;
    }).forEach(t => {
      const month = t.date.substring(0, 7);
      if (t.type === 'expense') expMap[month] = (expMap[month] || 0) + Math.abs(Number(t.amount_usd));
      if (t.type === 'income') incMap[month] = (incMap[month] || 0) + Number(t.amount_usd);
    });
    const months = new Set([...Object.keys(expMap), ...Object.keys(incMap)]);
    return Array.from(months).sort().slice(-12).map(month => ({
      month,
      expenses: expMap[month] || 0,
      income: incMap[month] || 0,
      savings: (incMap[month] || 0) - (expMap[month] || 0),
    }));
  }, [allTransactions, accountFilter, categoryFilter]);

  const topMerchants = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(t => {
      const merchant = t.merchant || t.description || 'Unknown';
      map[merchant] = (map[merchant] || 0) + Math.abs(Number(t.amount_usd));
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total }));
  }, [expenses]);

  const incomeTotal = incomes.reduce((s, t) => s + Number(t.amount_usd), 0);
  const savingsRate = incomeTotal > 0 ? ((incomeTotal - totalExpenses) / incomeTotal * 100) : 0;
  const maxMerchant = topMerchants[0]?.total || 1;

  const subExpenses = Math.abs(expenses.filter(t => t.is_subscription).reduce((s, t) => s + Number(t.amount_usd), 0));
  const fixedPct = totalExpenses > 0 ? (subExpenses / totalExpenses * 100) : 0;

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Analytics</h1>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={period} onValueChange={v => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px] h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="last_3">Last 3 Months</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[140px] h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px] h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories?.map(c => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-1.5">
                  <span>{getCategoryIcon(c.name, c.icon)}</span>
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Income vs Expenses + Savings */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-success/20">
          <CardContent className="pt-4 pb-4">
            <p className="text-[10px] text-muted-foreground font-medium">Income</p>
            <p className="text-lg font-bold text-success tabular-nums">{formatUSD(incomeTotal)}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20">
          <CardContent className="pt-4 pb-4">
            <p className="text-[10px] text-muted-foreground font-medium">Expenses</p>
            <p className="text-lg font-bold text-destructive tabular-nums">{formatUSD(totalExpenses)}</p>
            {momChange !== 0 && (
              <p className={`text-[9px] flex items-center gap-0.5 mt-0.5 font-medium ${momChange > 0 ? 'text-destructive' : 'text-success'}`}>
                {momChange > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                {Math.abs(momChange).toFixed(0)}% vs prev
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-[10px] text-muted-foreground font-medium">Savings Rate</p>
            <p className={`text-lg font-bold tabular-nums ${savingsRate >= 0 ? 'text-success' : 'text-destructive'}`}>{savingsRate.toFixed(0)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Fixed vs Variable */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Fixed vs Variable</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Subscriptions (Fixed)</span>
                <span className="font-bold">{fixedPct.toFixed(0)}%</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${fixedPct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{formatUSD(subExpenses)}</span>
                <span>{formatUSD(totalExpenses - subExpenses)} variable</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Overview */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Overview</CardTitle></CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={m => { const [yy, mo] = m.split('-'); return new Date(+yy, +mo - 1).toLocaleString('en', { month: 'short' }); }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v: number) => formatUSD(v)} />
                <Bar dataKey="income" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 justify-center mt-2">
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="w-2.5 h-2.5 rounded-sm bg-success" /> Income</span>
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="w-2.5 h-2.5 rounded-sm bg-destructive" /> Expenses</span>
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
                  label={({ name, percent }) => `${getCategoryIcon(name, catMap[name]?.icon)} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {byCategory.map(c => <Cell key={c.name} fill={getCategoryHex(c.name, c.color)} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatUSD(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {byCategory.map(c => {
              const pct = totalExpenses > 0 ? (c.total / totalExpenses * 100) : 0;
              return (
                <div key={c.name} className="flex items-center justify-between text-sm py-1 px-2 rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{getCategoryIcon(c.name, c.icon)}</span>
                    <span className="text-foreground font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
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
          {topMerchants.map(m => {
            const brand = getBrandLogo(m.name);
            const initials = getInitialsColor(m.name);
            return (
              <div key={m.name} className="flex items-center gap-3">
                {brand ? (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${brand.bg}`}>
                    {brand.icon}
                  </div>
                ) : (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${initials.bg} ${initials.text}`}>
                    {m.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground font-medium truncate">{m.name}</span>
                    <span className="font-bold text-foreground tabular-nums shrink-0">{formatUSD(m.total)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(m.total / maxMerchant) * 100}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
