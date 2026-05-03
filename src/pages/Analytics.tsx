import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTransactions } from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories, useSubcategories } from '@/hooks/useCategories';
import { useCategoryTree } from '@/hooks/useCategoryTree';
import { useBudgets } from '@/hooks/useBudgets';
import { formatUSD } from '@/lib/constants';
import { getCategoryHex } from '@/lib/categoryColors';
import { getCategoryIcon } from '@/lib/brandLogos';
import { MerchantLogo } from '@/components/MerchantLogo';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';

type Period = 'this_month' | 'last_month' | 'last_3' | 'ytd' | 'q1' | 'q2' | 'q3' | 'q4' | 'all';

function getPeriodDates(period: Period) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
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
    case 'q1': {
      return { from: `${y}-01-01`, to: `${y}-03-31`, prevFrom: `${y - 1}-01-01`, prevTo: `${y - 1}-03-31` };
    }
    case 'q2': {
      return { from: `${y}-04-01`, to: `${y}-06-30`, prevFrom: `${y - 1}-04-01`, prevTo: `${y - 1}-06-30` };
    }
    case 'q3': {
      return { from: `${y}-07-01`, to: `${y}-09-30`, prevFrom: `${y - 1}-07-01`, prevTo: `${y - 1}-09-30` };
    }
    case 'q4': {
      return { from: `${y}-10-01`, to: `${y}-12-31`, prevFrom: `${y - 1}-10-01`, prevTo: `${y - 1}-12-31` };
    }
    default:
      return { from: '2000-01-01', to: today, prevFrom: '1990-01-01', prevTo: '2000-01-01' };
  }
}

const CATEGORY_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316'];

export default function Analytics() {
  const { data: allTransactions, isLoading } = useTransactions();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: allSubcategories } = useSubcategories();
  const { data: budgets } = useBudgets();
  const { tree: categoryTree, totalRecurringMonthly } = useCategoryTree();
  const [period, setPeriod] = useState<Period>('this_month');
  const [accountFilter, setAccountFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [digitalExpanded, setDigitalExpanded] = useState(false);

  const dates = useMemo(() => getPeriodDates(period), [period]);
  const currentYear = new Date().getFullYear();

  const filterTx = (txs: any[], from: string, to: string) =>
    txs.filter(t => {
      if (t.date < from || t.date > to) return false;
      if (accountFilter !== 'all' && t.account_id !== accountFilter) return false;
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return false;
      return true;
    });

  const transactions = useMemo(() => filterTx(allTransactions || [], dates.from, dates.to), [allTransactions, dates, accountFilter, categoryFilter]);
  const prevTransactions = useMemo(() => filterTx(allTransactions || [], dates.prevFrom, dates.prevTo), [allTransactions, dates, accountFilter, categoryFilter]);

  const expenses = useMemo(() => transactions.filter(t => t.type === 'expense'), [transactions]);
  const incomes = useMemo(() => transactions.filter(t => t.type === 'income'), [transactions]);
  const prevExpenses = useMemo(() => prevTransactions.filter(t => t.type === 'expense'), [prevTransactions]);

  // If current month has no data, use previous month's data for display
  const showingPrevMonth = period === 'this_month' && expenses.length === 0 && prevTransactions.length > 0;
  const displayExpenses = showingPrevMonth ? prevTransactions.filter(t => t.type === 'expense') : expenses;
  const displayIncomes = showingPrevMonth ? prevTransactions.filter(t => t.type === 'income') : incomes;

  const subcatToParent = useMemo(() => {
    const m: Record<string, string> = {};
    (allSubcategories || []).forEach(s => { m[s.id] = s.category_id; });
    return m;
  }, [allSubcategories]);

  const byCategory = useMemo(() => {
    const totals: Record<string, number> = {};
    displayExpenses.forEach(t => {
      const cid = t.category_id as string | null;
      if (!cid) return;
      const parent = subcatToParent[cid] || cid;
      totals[parent] = (totals[parent] || 0) + Math.abs(Number(t.amount_usd));
    });
    return categoryTree
      .map(c => ({ id: c.id, name: c.name, total: totals[c.id] || 0, icon: c.icon, color: c.color, isDigital: c.isDigital, children: c.children }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [displayExpenses, categoryTree, subcatToParent]);

  const digitalBreakdown = useMemo(() => {
    const digital = categoryTree.find(c => c.isDigital);
    if (!digital) return [];
    const totals: Record<string, number> = {};
    displayExpenses.forEach(t => {
      const cid = t.category_id as string | null;
      if (!cid) return;
      if (subcatToParent[cid] === digital.id) {
        totals[cid] = (totals[cid] || 0) + Math.abs(Number(t.amount_usd));
      }
    });
    return digital.children.map(s => ({ id: s.id, name: s.name, total: totals[s.id] || 0 }))
      .sort((a, b) => b.total - a.total);
  }, [displayExpenses, categoryTree, subcatToParent]);

  const totalExpenses = Math.abs(displayExpenses.reduce((s, t) => s + Number(t.amount_usd), 0));
  const prevTotalExpenses = Math.abs(prevExpenses.reduce((s, t) => s + Number(t.amount_usd), 0));
  const momChange = prevTotalExpenses > 0 ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses * 100) : 0;
  const incomeTotal = displayIncomes.reduce((s, t) => s + Number(t.amount_usd), 0);
  const savingsRate = incomeTotal > 0 ? ((incomeTotal - totalExpenses) / incomeTotal * 100) : 0;

  const periodMonths = useMemo(() => {
    if (period === 'this_month' || period === 'last_month') return 1;
    if (period === 'last_3') return 3;
    if (period === 'ytd') return new Date().getMonth() + 1;
    if (period === 'q1' || period === 'q2' || period === 'q3' || period === 'q4') return 3;
    return 1;
  }, [period]);

  const fixedAmount = totalRecurringMonthly * (period === 'all' ? 1 : periodMonths);
  const variableAmount = Math.max(0, totalExpenses - fixedAmount);
  const fixedPct = totalExpenses > 0 ? Math.min((fixedAmount / totalExpenses) * 100, 100) : 0;

  const monthly = useMemo(() => {
    if (!allTransactions) return [];
    const expMap: Record<string, number> = {};
    const incMap: Record<string, number> = {};
    allTransactions.forEach(t => {
      if (accountFilter !== 'all' && t.account_id !== accountFilter) return;
      const month = t.date.substring(0, 7);
      if (t.type === 'expense') {
        if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return;
        expMap[month] = (expMap[month] || 0) + Math.abs(Number(t.amount_usd));
      } else if (t.type === 'income') {
        incMap[month] = (incMap[month] || 0) + Number(t.amount_usd);
      }
    });
    const months = new Set([...Object.keys(expMap), ...Object.keys(incMap)]);
    return Array.from(months).sort().slice(-12).map(month => ({
      month, expenses: expMap[month] || 0, income: incMap[month] || 0,
    }));
  }, [allTransactions, accountFilter, categoryFilter]);

  const categoryMonthly = useMemo(() => {
    if (!allTransactions || categoryTree.length === 0) return [];
    const now = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const catTotals: Record<string, Record<string, number>> = {};
    allTransactions
      .filter(t => t.type === 'expense'
        && (!accountFilter || accountFilter === 'all' || t.account_id === accountFilter)
        && (categoryFilter === 'all' || (subcatToParent[t.category_id] || t.category_id) === categoryFilter))
      .forEach(t => {
        const month = t.date.substring(0, 7);
        if (!months.includes(month)) return;
        const cid = t.category_id as string | null;
        if (!cid) return;
        const parent = subcatToParent[cid] || cid;
        if (!catTotals[parent]) catTotals[parent] = {};
        catTotals[parent][month] = (catTotals[parent][month] || 0) + Math.abs(Number(t.amount_usd));
      });
    return months.map(month => {
      const entry: Record<string, any> = {
        month,
        label: new Date(month + '-01').toLocaleString('es', { month: 'short' }),
      };
      categoryTree.forEach(cat => {
        entry[cat.id] = catTotals[cat.id]?.[month] || 0;
      });
      return entry;
    });
  }, [allTransactions, categoryTree, subcatToParent, accountFilter, categoryFilter]);

  const visibleCategoriesForChart = useMemo(
    () => categoryTree.filter(cat => categoryMonthly.some(m => (m[cat.id] || 0) > 0)),
    [categoryTree, categoryMonthly]
  );

  const budgetVsActual = useMemo(() => {
    if (!allTransactions) return [];
    const now = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months.map(month => {
      const actual = allTransactions
        .filter(t => t.type === 'expense' && t.date.startsWith(month))
        .reduce((s, t) => s + Math.abs(Number(t.amount_usd)), 0);
      const budgeted = (budgets || [])
        .filter(b => String(b.month).startsWith(month))
        .reduce((s, b) => s + Number(b.amount || 0), 0);
      const deviation = actual - budgeted;
      const pct = budgeted > 0 ? Math.round((deviation / budgeted) * 100) : 0;
      return {
        month,
        label: new Date(month + '-01').toLocaleString('es', { month: 'short' }),
        actual: Math.round(actual),
        budgeted: Math.round(budgeted),
        deviation: Math.round(deviation),
        pct,
      };
    });
  }, [allTransactions, budgets]);

  const topMerchants = useMemo(() => {
    const map: Record<string, number> = {};
    displayExpenses.forEach(t => {
      const merchant = t.merchant || t.description || 'Unknown';
      map[merchant] = (map[merchant] || 0) + Math.abs(Number(t.amount_usd));
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total }));
  }, [displayExpenses]);

  const maxMerchant = topMerchants[0]?.total || 1;

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Cargando...</div>;

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="text-left">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
      </div>

      {/* FILTERS */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={period} onValueChange={v => setPeriod(v as Period)}>
          <SelectTrigger className="w-[160px] h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">Este mes</SelectItem>
            <SelectItem value="last_month">Mes anterior</SelectItem>
            <SelectItem value="last_3">Últimos 3 meses</SelectItem>
            <SelectItem value="ytd">Este año</SelectItem>
            <SelectItem value="q1">Q1 {currentYear}</SelectItem>
            <SelectItem value="q2">Q2 {currentYear}</SelectItem>
            <SelectItem value="q3">Q3 {currentYear}</SelectItem>
            <SelectItem value="q4">Q4 {currentYear}</SelectItem>
            <SelectItem value="all">Todo el tiempo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[160px] h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las cuentas</SelectItem>
            {accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px] h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories?.map(c => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-1.5">
                  <span>{c.icon || '📌'}</span>
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showingPrevMonth && (
          <span className="text-[11px] text-muted-foreground italic">
            Mostrando mes anterior — sin datos este mes
          </span>
        )}
      </div>

      {/* SUMMARY — 3 big number cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium">Ingresos</p>
            <p className="text-lg font-bold text-emerald-600 tabular-nums">{formatUSD(incomeTotal)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {period === 'this_month' || period === 'last_month' ? 'este período' : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium">Gastos</p>
            <p className="text-lg font-bold text-destructive tabular-nums">{formatUSD(totalExpenses)}</p>
            {momChange !== 0 && (
              <p className={cn('text-xs flex items-center gap-0.5 mt-0.5 font-medium', momChange > 0 ? 'text-destructive' : 'text-emerald-600')}>
                {momChange > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                {Math.abs(momChange).toFixed(0)}% vs anterior
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium">Ahorro</p>
            <p className={cn('text-lg font-bold tabular-nums', savingsRate >= 0 ? 'text-emerald-600' : 'text-destructive')}>
              {savingsRate.toFixed(0)}%
            </p>
            {incomeTotal > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatUSD(Math.max(0, incomeTotal - totalExpenses))} guardado
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* EVOLUCIÓN MENSUAL */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Evolución mensual</CardTitle></CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10 }}
                  tickFormatter={m => { const [yy, mo] = m.split('-'); return new Date(+yy, +mo - 1).toLocaleString('es', { month: 'short' }); }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickCount={5}
                  allowDecimals={false}
                  tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                />
                <Tooltip
                  formatter={(v: number, key: string) => [formatUSD(v), key === 'income' ? 'Ingresos' : 'Gastos']}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                />
                <Area type="monotone" dataKey="income" stroke="hsl(var(--success, 142 71% 45%))" fill="hsl(var(--success, 142 71% 45%))" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 justify-center mt-2">
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Ingresos
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm bg-destructive" /> Gastos
            </span>
          </div>
        </CardContent>
      </Card>

      {/* GASTO POR CATEGORÍA (mes a mes) */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Gasto por categoría · últimos 6 meses</CardTitle></CardHeader>
        <CardContent>
          {visibleCategoriesForChart.length > 0 ? (
            <>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryMonthly}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                    <Tooltip
                      formatter={(v: number, name: string) => {
                        const cat = categoryTree.find(c => c.id === name);
                        return [formatUSD(v), cat ? `${cat.icon} ${cat.name}` : name];
                      }}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                    />
                    {visibleCategoriesForChart.map((cat, idx) => (
                      <Bar
                        key={cat.id}
                        dataKey={cat.id}
                        stackId="a"
                        fill={getCategoryHex(cat.name, cat.color) || CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {visibleCategoriesForChart.map((cat, idx) => (
                  <span key={cat.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: getCategoryHex(cat.name, cat.color) || CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                    />
                    {cat.icon} {cat.name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground py-8 text-center">Sin datos suficientes</p>
          )}
        </CardContent>
      </Card>

      {/* POR CATEGORÍA — horizontal bars, no pie */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Por categoría</CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">{formatUSD(totalExpenses)} total</span>
        </CardHeader>
        <CardContent>
          {byCategory.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Sin gastos en este período</p>
          ) : (
            <div className="space-y-3">
              {byCategory.map((c, idx) => {
                const pct = totalExpenses > 0 ? (c.total / totalExpenses * 100) : 0;
                const color = getCategoryHex(c.name, c.color) || CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                return (
                  <div key={c.id}>
                    <div
                      className={cn(
                        'flex items-center justify-between text-sm py-1 rounded-lg transition-colors',
                        c.isDigital && 'cursor-pointer hover:bg-accent/50'
                      )}
                      onClick={() => c.isDigital && setDigitalExpanded(v => !v)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{getCategoryIcon(c.name, c.icon)}</span>
                        <span className="text-foreground font-medium">{c.name}</span>
                        {c.isDigital && (
                          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', digitalExpanded && 'rotate-180')} />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                        <span className="font-bold text-foreground tabular-nums">{formatUSD(c.total)}</span>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden mt-1">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    {c.isDigital && digitalExpanded && digitalBreakdown.filter(s => s.total > 0).length > 0 && (
                      <div className="ml-6 mt-2 space-y-2">
                        {digitalBreakdown.filter(s => s.total > 0).map(s => {
                          const sPct = totalExpenses > 0 ? (s.total / totalExpenses * 100) : 0;
                          return (
                            <div key={s.id}>
                              <div className="flex items-center justify-between text-xs py-0.5 text-muted-foreground">
                                <span>{s.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="tabular-nums">{sPct.toFixed(0)}%</span>
                                  <span className="tabular-nums">{formatUSD(s.total)}</span>
                                </div>
                              </div>
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-0.5">
                                <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${sPct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* FIJOS vs VARIABLES */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Fijos vs Variables</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">Gastos fijos</p>
              <p className="text-lg font-bold text-foreground tabular-nums">{formatUSD(fixedAmount)}</p>
              <p className="text-[10px] text-muted-foreground">{fixedPct.toFixed(0)}% del total</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">Gastos variables</p>
              <p className="text-lg font-bold text-foreground tabular-nums">{formatUSD(variableAmount)}</p>
              <p className="text-[10px] text-muted-foreground">{(100 - fixedPct).toFixed(0)}% del total</p>
            </div>
          </div>
          {totalExpenses > 0 && (
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden flex">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${fixedPct}%` }} />
              <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${100 - fixedPct}%` }} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* PRESUPUESTO vs REAL */}
      {budgetVsActual.some(m => m.budgeted > 0 || m.actual > 0) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Presupuesto vs Real</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {budgetVsActual.filter(m => m.budgeted > 0 || m.actual > 0).map(m => {
                const isOver = m.deviation > 0 && m.budgeted > 0;
                const pctUsed = m.budgeted > 0 ? Math.min((m.actual / m.budgeted) * 100, 100) : 0;
                return (
                  <div key={m.month}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground font-medium">{m.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground tabular-nums">
                          {formatUSD(m.actual)} / {formatUSD(m.budgeted || 0)}
                        </span>
                        {m.budgeted > 0 && (
                          <span className={cn('tabular-nums font-medium', isOver ? 'text-destructive' : 'text-emerald-600')}>
                            {isOver ? '+' : ''}{m.pct}%
                          </span>
                        )}
                      </div>
                    </div>
                    {m.budgeted > 0 ? (
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isOver ? 'bg-destructive' : pctUsed > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                          )}
                          style={{ width: `${pctUsed}%` }}
                        />
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">Sin presupuesto definido</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TOP MERCHANTS */}
      {topMerchants.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top merchants</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topMerchants.map(m => (
              <div key={m.name} className="flex items-center gap-3">
                <MerchantLogo name={m.name} size={32} />
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
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
