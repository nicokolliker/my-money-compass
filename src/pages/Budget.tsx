import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useBudgets, useUpsertBudget } from '@/hooks/useBudgets';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useCategoryTree, type CategoryNode } from '@/hooks/useCategoryTree';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid, Legend } from 'recharts';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const INCOME_CATEGORY_NAME = 'Ingresos Proyectados';

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const monthStrFor = (year: number, monthIdx: number) =>
  `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
const monthPrefix = (year: number, monthIdx: number) =>
  `${year}-${String(monthIdx + 1).padStart(2, '0')}`;

export default function BudgetPage({ embedded = false }: { embedded?: boolean } = {}) {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedChartMonth, setSelectedChartMonth] = useState(today.getMonth());
  const [digitalExpanded, setDigitalExpanded] = useState(false);
  const toggleDigital = () => setDigitalExpanded(v => !v);
  const [trackingExpanded, setTrackingExpanded] = useState(false);
  const [fixedExpanded, setFixedExpanded] = useState(false);
  const [variableExpanded, setVariableExpanded] = useState(false);
  const [tableView, setTableView] = useState<'split' | 'consolidated'>('split');
  const [showAllCats, setShowAllCats] = useState(false);

  const noSpinClass = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const { data: transactions } = useTransactions();
  const { data: budgets } = useBudgets();
  const { data: categories } = useCategories();
  const { tree, totalRecurringMonthly } = useCategoryTree();
  const upsertBudget = useUpsertBudget();

  const incomeCategoryId = useMemo(
    () => categories?.find(c => c.name === INCOME_CATEGORY_NAME)?.id || null,
    [categories]
  );

  const isPast = (monthIndex: number) =>
    selectedYear < currentYear ||
    (selectedYear === currentYear && monthIndex < currentMonth);
  const isCurrent = (monthIndex: number) =>
    selectedYear === currentYear && monthIndex === currentMonth;

  // ----- Helpers -----
  const getActualSpending = useCallback(
    (categoryId: string, monthIndex: number) => {
      const prefix = monthPrefix(selectedYear, monthIndex);
      return Math.abs(
        (transactions || [])
          .filter(t => (t.category_id === categoryId || t.subcategory_id === categoryId) && t.type === 'expense' && t.date.startsWith(prefix))
          .reduce((s, t) => s + Number(t.amount_usd || 0), 0)
      );
    },
    [transactions, selectedYear]
  );

  const getActualIncome = useCallback(
    (monthIndex: number) => {
      const prefix = monthPrefix(selectedYear, monthIndex);
      return Math.abs(
        (transactions || [])
          .filter(t => t.type === 'income' && t.date.startsWith(prefix))
          .reduce((s, t) => s + Number(t.amount_usd || 0), 0)
      );
    },
    [transactions, selectedYear]
  );

  const getBudgetAmount = useCallback(
    (categoryId: string | null, monthIndex: number, year: number = selectedYear) => {
      if (!categoryId) return 0;
      const b = (budgets || []).find(b => b.category_id === categoryId && String(b.month).startsWith(`${year}-${String(monthIndex + 1).padStart(2, '0')}`));
      return Number(b?.amount || 0);
    },
    [budgets, selectedYear]
  );

  const spendingForYM = useCallback(
    (categoryId: string, monthIndex: number, year: number) => {
      const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      return Math.abs(
        (transactions || [])
          .filter(t => (t.category_id === categoryId || t.subcategory_id === categoryId) && t.type === 'expense' && t.date.startsWith(prefix))
          .reduce((s, t) => s + Number(t.amount_usd || 0), 0)
      );
    },
    [transactions]
  );

  // Aggregated helpers: for Digital, sum across children (sub-budgets / sub-spending)
  const catBudget = useCallback(
    (cat: CategoryNode, monthIndex: number) => {
      if (cat.isDigital && cat.children.length) {
        return cat.children.reduce((s, ch) => s + getBudgetAmount(ch.id, monthIndex), 0);
      }
      return getBudgetAmount(cat.id, monthIndex);
    },
    [getBudgetAmount]
  );

  const catSpending = useCallback(
    (cat: CategoryNode, monthIndex: number) => {
      if (cat.isDigital && cat.children.length) {
        const childSum = cat.children.reduce((s, ch) => s + getActualSpending(ch.id, monthIndex), 0);
        const parentOnly = getActualSpending(cat.id, monthIndex);
        return Math.max(parentOnly, childSum);
      }
      return getActualSpending(cat.id, monthIndex);
    },
    [getActualSpending]
  );

  // Average of last 3 past months for placeholder hint in future inputs
  const avgLast3 = useCallback(
    (categoryId: string, monthIndex: number) => {
      const vals: number[] = [];
      for (let k = 1; k <= 3; k++) {
        let m = monthIndex - k;
        let y = selectedYear;
        if (m < 0) { m += 12; y -= 1; }
        const past = y < currentYear || (y === currentYear && m < currentMonth);
        if (!past) continue;
        vals.push(spendingForYM(categoryId, m, y));
      }
      if (!vals.length) return 0;
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    },
    [spendingForYM, selectedYear, currentYear, currentMonth]
  );

  // ----- Save handlers -----
  const saveBudget = async (categoryId: string, monthIndex: number, value: number) => {
    if (!categoryId) return;
    try {
      await upsertBudget.mutateAsync({
        category_id: categoryId,
        month: monthStrFor(selectedYear, monthIndex),
        amount: value,
        currency: 'USD',
      });
    } catch (e: any) {
      toast.error(e.message || 'Error saving');
    }
  };

  // ----- Chart data: budgeted+fixed vs actual for the selected chart month -----
  const chartData = useMemo(() => {
    return tree
      .map(cat => {
        const budgetedVar = catBudget(cat, selectedChartMonth);
        const budgeted = budgetedVar + cat.recurringMonthly;
        const spent = catSpending(cat, selectedChartMonth);
        if (budgeted === 0 && spent === 0) return null;
        return { id: cat.id, name: cat.name, icon: cat.icon, budgeted, spent, variance: spent - budgeted };
      })
      .filter(Boolean) as Array<{ id: string; name: string; icon: string | null; budgeted: number; spent: number; variance: number }>;
  }, [tree, catBudget, catSpending, selectedChartMonth]);

  // ----- Annual totals -----
  const incomeYearTotal = useMemo(() => {
    return MONTHS.reduce((s, _, i) => {
      const v = isPast(i) ? getActualIncome(i) : getBudgetAmount(incomeCategoryId, i);
      return s + v;
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeCategoryId, selectedYear, getActualIncome, getBudgetAmount]);

  const monthLabel = new Date(selectedYear, selectedChartMonth).toLocaleString('es', { month: 'long', year: 'numeric' });

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6'}>

      {/* ─── PAGE HEADER ─── */}
      {!embedded && (
        <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-18rem)] lg:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Budget</h1>
              <p className="text-sm text-muted-foreground">Planificación mensual y anual</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedYear(y => y - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold tabular-nums w-14 text-center">{selectedYear}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedYear(y => y + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SEGUIMIENTO DEL MES ─── */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-18rem)] lg:px-6">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">

          {/* Header row */}
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer"
            onClick={() => setTrackingExpanded(v => !v)}
          >
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  if (selectedChartMonth === 0) {
                    setSelectedChartMonth(11);
                    setSelectedYear(y => y - 1);
                  } else {
                    setSelectedChartMonth(m => m - 1);
                  }
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-base font-semibold text-foreground capitalize px-2 py-1 rounded-md hover:bg-muted transition-colors min-w-[140px]">
                    {monthLabel}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="center">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedYear(y => y - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-sm font-semibold tabular-nums">{selectedYear}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedYear(y => y + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {MONTHS.map((m, i) => (
                      <button
                        key={m}
                        onClick={() => setSelectedChartMonth(i)}
                        className={cn(
                          'text-xs py-1.5 rounded-md transition-colors',
                          i === selectedChartMonth
                            ? 'bg-primary text-primary-foreground font-semibold'
                            : 'hover:bg-muted text-foreground'
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  if (selectedChartMonth === 11) {
                    setSelectedChartMonth(0);
                    setSelectedYear(y => y + 1);
                  } else {
                    setSelectedChartMonth(m => m + 1);
                  }
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', trackingExpanded && 'rotate-180')} onClick={() => setTrackingExpanded(v => !v)} />
          </div>

          {/* Summary numbers */}
          {(() => {
            const totalBudgeted = chartData.reduce((s, d) => s + d.budgeted, 0);
            const totalSpent = chartData.reduce((s, d) => s + d.spent, 0);
            const totalRemaining = totalBudgeted - totalSpent;
            const overallPct = totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0;
            const isOver = totalSpent > totalBudgeted && totalBudgeted > 0;
            return (
              <div className="px-5 pb-4 space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Gastado</p>
                    <p className={cn('text-2xl font-bold tabular-nums', isOver ? 'text-destructive' : 'text-foreground')}>{fmt(totalSpent)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Budget</p>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{fmt(totalBudgeted)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">{isOver ? 'Excedido' : 'Disponible'}</p>
                    <p className={cn('text-2xl font-bold tabular-nums', isOver ? 'text-destructive' : 'text-emerald-600')}>{fmt(Math.abs(totalRemaining))}</p>
                  </div>
                </div>
                {totalBudgeted > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{Math.round(overallPct)}% del budget usado</span>
                      <span>{isOver ? 'Sobre presupuesto' : `${100 - Math.round(overallPct)}% restante`}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', isOver ? 'bg-destructive' : overallPct > 80 ? 'bg-amber-500' : 'bg-emerald-500')}
                        style={{ width: `${overallPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Category breakdown */}
          {trackingExpanded && (
            <div className="border-t border-border">
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Definí presupuestos en la tabla de abajo para ver el seguimiento.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {chartData.map(item => {
                    const pctUsed = item.budgeted > 0 ? Math.min((item.spent / item.budgeted) * 100, 100) : 0;
                    const isOver = item.spent > item.budgeted && item.budgeted > 0;
                    const remaining = item.budgeted - item.spent;
                    const barColor = isOver ? 'bg-destructive' : pctUsed > 80 ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                      <div key={item.id} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <span>{item.icon}</span>
                            <span>{item.name}</span>
                          </div>
                          <div className="text-xs tabular-nums">
                            <span className={cn('font-semibold', isOver ? 'text-destructive' : 'text-foreground')}>{fmt(item.spent)}</span>
                            <span className="text-muted-foreground"> / {fmt(item.budgeted)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pctUsed}%` }} />
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                          <span>{Math.round(pctUsed)}% usado</span>
                          <span className={cn(isOver && 'text-destructive font-medium')}>
                            {isOver ? `+${fmt(Math.abs(remaining))} sobre presupuesto` : `${fmt(remaining)} restante`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── ANNUAL TABLE ─── */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-18rem)] lg:px-6">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">

          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Planificación anual {selectedYear}</h3>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setTableView('split')}
                className={cn('text-xs px-3 py-1 rounded-md transition-colors',
                  tableView === 'split' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground')}
              >
                Fijos + Variables
              </button>
              <button
                onClick={() => setTableView('consolidated')}
                className={cn('text-xs px-3 py-1 rounded-md transition-colors',
                  tableView === 'consolidated' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground')}
              >
                Por categoría
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: '960px', width: '100%' }}>
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 sticky left-0 z-10 min-w-[160px] font-medium text-muted-foreground text-xs"
                    style={{ background: 'hsl(var(--muted) / 0.3)', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                    Categoría
                  </th>
                  {MONTHS.map((m, i) => (
                    <th key={m} className={cn('px-2 py-2.5 text-center font-medium text-muted-foreground text-xs min-w-[72px]',
                      isCurrent(i) && 'text-primary')}>
                      {m}
                      {isCurrent(i) && <div className="text-[8px] font-normal text-primary/70">actual</div>}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs min-w-[80px]">Total</th>
                </tr>
              </thead>
              <tbody>

                {/* INCOME ROW */}
                <tr className="border-b border-border">
                  <td className="px-4 py-2.5 sticky left-0 z-10 font-medium text-foreground"
                    style={{ background: 'hsl(var(--card))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Ingresos</span>
                    </div>
                  </td>
                  {MONTHS.map((_, i) => {
                    const actual = getActualIncome(i);
                    const budgeted = getBudgetAmount(incomeCategoryId, i);
                    return (
                      <td key={i} className={cn('px-1.5 py-1.5 text-center', isCurrent(i) && 'bg-primary/5')}>
                        {isPast(i) ? (
                          <span className={cn('tabular-nums font-medium', actual > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                            {actual > 0 ? fmt(actual) : '—'}
                          </span>
                        ) : (
                          <Input
                            key={`income-${selectedYear}-${i}-${budgeted}`}
                            type="number"
                            defaultValue={budgeted || ''}
                            placeholder="0"
                            className={cn('h-7 text-xs text-center px-1 tabular-nums border-border/50 rounded-lg', noSpinClass)}
                            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && incomeCategoryId) saveBudget(incomeCategoryId, i, v); }}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{fmt(incomeYearTotal)}</td>
                </tr>

                {/* ── SPLIT VIEW ── */}
                {tableView === 'split' && (
                  <>
                    <tr className="border-b border-border cursor-pointer group" onClick={() => setFixedExpanded(v => !v)}>
                      <td className="px-4 py-2 sticky left-0 z-10"
                        style={{ background: 'hsl(var(--card))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                        <div className="flex items-center gap-2">
                          <ChevronDown className={cn('h-3.5 w-3.5 text-primary/60 transition-transform', fixedExpanded && 'rotate-180')} />
                          <span className="font-medium text-primary text-xs">Gastos fijos</span>
                        </div>
                      </td>
                      {MONTHS.map((_, i) => (
                        <td key={i} className={cn('px-2 py-2 text-center tabular-nums text-xs font-medium text-primary', isCurrent(i) && 'bg-primary/5')}>
                          {fmt(totalRecurringMonthly)}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right tabular-nums text-xs font-semibold text-primary">{fmt(totalRecurringMonthly * 12)}</td>
                    </tr>

                    {fixedExpanded && tree.filter(c => c.recurringMonthly > 0).map(cat => (
                      <tr key={`f-${cat.id}`} className="border-b border-border/50">
                        <td className="px-4 py-2 pl-9 sticky left-0 z-10 text-muted-foreground"
                          style={{ background: 'hsl(var(--card))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                          <div className="flex items-center gap-1.5">
                            <span>{cat.icon}</span>
                            <span>{cat.name}</span>
                          </div>
                        </td>
                        {MONTHS.map((_, i) => (
                          <td key={i} className={cn('px-2 py-2 text-center tabular-nums text-primary/60', isCurrent(i) && 'bg-primary/5')}>
                            {fmt(cat.recurringMonthly)}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right tabular-nums text-primary/60">{fmt(cat.recurringMonthly * 12)}</td>
                      </tr>
                    ))}

                    <tr className="border-b border-border cursor-pointer" onClick={() => setVariableExpanded(v => !v)}>
                      <td className="px-4 py-2 sticky left-0 z-10"
                        style={{ background: 'hsl(var(--card))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                        <div className="flex items-center gap-2">
                          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', variableExpanded && 'rotate-180')} />
                          <span className="font-medium text-foreground text-xs">Gastos variables</span>
                        </div>
                      </td>
                      {MONTHS.map((_, i) => {
                        const varTotal = tree.reduce((s, c) => s + (isPast(i) ? catSpending(c, i) : catBudget(c, i)), 0);
                        return (
                          <td key={i} className={cn('px-2 py-2 text-center tabular-nums text-xs font-medium', isCurrent(i) && 'bg-primary/5')}>
                            {varTotal > 0 ? fmt(varTotal) : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right tabular-nums text-xs font-semibold">
                        {fmt(MONTHS.reduce((s, _, i) => s + tree.reduce((a, c) => a + (isPast(i) ? catSpending(c, i) : catBudget(c, i)), 0), 0))}
                      </td>
                    </tr>

                    {variableExpanded && tree.map(cat => (
                      <React.Fragment key={`v-frag-${cat.id}`}>
                      <tr key={`v-${cat.id}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 pl-9 sticky left-0 z-10 bg-card"
                          style={{ boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                          <div className="flex items-center gap-1.5 text-foreground">
                            <span>{cat.icon}</span>
                            <span>{cat.name}</span>
                            {cat.isDigital && (
                              <button onClick={() => toggleDigital()} className="ml-0.5">
                                <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', digitalExpanded && 'rotate-180')} />
                              </button>
                            )}
                          </div>
                        </td>
                        {MONTHS.map((_, i) => {
                          const actual = catSpending(cat, i);
                          const budgeted = catBudget(cat, i);
                          const isDigitalAgg = cat.isDigital && cat.children.length > 0;
                          const avg = avgLast3(cat.id, i);
                          return (
                            <td key={i} className={cn('px-1.5 py-1.5 text-center', isCurrent(i) && 'bg-primary/5')}>
                              {isPast(i) ? (
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {actual > 0 ? fmt(actual) : '—'}
                                </span>
                              ) : isDigitalAgg ? (
                                <span className="text-xs text-muted-foreground tabular-nums italic" title="Suma de subcategorías">
                                  {budgeted > 0 ? fmt(budgeted) : '—'}
                                </span>
                              ) : (
                                <Input
                                  key={`${cat.id}-${selectedYear}-${i}-${budgeted}`}
                                  type="number"
                                  defaultValue={budgeted || ''}
                                  placeholder={avg > 0 ? `~${Math.round(avg)}` : '0'}
                                  className={cn('h-7 text-xs text-center px-1 tabular-nums border-border/50 rounded-lg placeholder:text-muted-foreground/50 placeholder:italic', noSpinClass)}
                                  onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) saveBudget(cat.id, i, v); }}
                                />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {fmt(MONTHS.reduce((s, _, i) => s + (isPast(i) ? catSpending(cat, i) : catBudget(cat, i)), 0))}
                        </td>
                      </tr>
                      {cat.isDigital && digitalExpanded && cat.children.map(child => (
                        <tr key={`dig-${child.id}`} className="border-b border-border/30 hover:bg-muted/10 transition-colors bg-muted/20">
                          <td className="px-4 py-1.5 pl-14 sticky left-0 z-10 bg-muted/20"
                            style={{ boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                            <span className="text-xs text-muted-foreground">↳ {child.name}</span>
                          </td>
                          {MONTHS.map((_, i) => {
                            const actual = getActualSpending(child.id, i);
                            const budgeted = getBudgetAmount(child.id, i);
                            const avg = avgLast3(child.id, i);
                            return (
                              <td key={i} className={cn('px-1.5 py-1.5 text-center', isCurrent(i) && 'bg-primary/5')}>
                                {isPast(i) ? (
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {actual > 0 ? fmt(actual) : '—'}
                                  </span>
                                ) : (
                                  <Input
                                    key={`${child.id}-${selectedYear}-${i}-${budgeted}`}
                                    type="number"
                                    defaultValue={budgeted || ''}
                                    placeholder={avg > 0 ? `~${Math.round(avg)}` : '0'}
                                    className={cn('h-7 text-xs text-center px-1 tabular-nums border-border/50 rounded-lg placeholder:text-muted-foreground/50 placeholder:italic', noSpinClass)}
                                    onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) saveBudget(child.id, i, v); }}
                                  />
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-1.5 text-right tabular-nums text-xs text-muted-foreground">
                            {fmt(MONTHS.reduce((s, _, i) => s + (isPast(i) ? getActualSpending(child.id, i) : getBudgetAmount(child.id, i)), 0))}
                          </td>
                        </tr>
                      ))}
                      </React.Fragment>
                    ))}
                  </>
                )}

                {/* ── CONSOLIDATED VIEW ── */}
                {tableView === 'consolidated' && tree.map(cat => {
                  const yearTotal = MONTHS.reduce((s, _, i) => {
                    return s + cat.recurringMonthly + (isPast(i) ? catSpending(cat, i) : catBudget(cat, i));
                  }, 0);
                  return (
                    <React.Fragment key={`c-frag-${cat.id}`}>
                    <tr key={`c-${cat.id}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 sticky left-0 z-10 bg-card"
                        style={{ boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                        <div className="flex items-center gap-1.5">
                          <span>{cat.icon}</span>
                          <span className="font-medium text-foreground">{cat.name}</span>
                          {cat.isDigital && (
                            <button onClick={() => toggleDigital()} className="ml-0.5">
                              <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', digitalExpanded && 'rotate-180')} />
                            </button>
                          )}
                        </div>
                      </td>
                      {MONTHS.map((_, i) => {
                        const total = cat.recurringMonthly + (isPast(i) ? catSpending(cat, i) : catBudget(cat, i));
                        return (
                          <td key={i} className={cn('px-2 py-2.5 text-center tabular-nums', isCurrent(i) && 'bg-primary/5')}>
                            {total > 0 ? (
                              <span className={isPast(i) ? 'text-foreground' : 'text-muted-foreground'}>{fmt(total)}</span>
                            ) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{yearTotal > 0 ? fmt(yearTotal) : '—'}</td>
                    </tr>
                    {cat.isDigital && digitalExpanded && cat.children.map(child => (
                      <tr key={`c-dig-${child.id}`} className="border-b border-border/30 hover:bg-muted/10 transition-colors bg-muted/20">
                        <td className="px-4 py-1.5 pl-12 sticky left-0 z-10 bg-muted/20"
                          style={{ boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                          <span className="text-xs text-muted-foreground">↳ {child.name}</span>
                        </td>
                        {MONTHS.map((_, i) => {
                          const actual = getActualSpending(child.id, i);
                          const budgeted = getBudgetAmount(child.id, i);
                          const total = isPast(i) ? actual : budgeted;
                          return (
                            <td key={i} className={cn('px-2 py-1.5 text-center tabular-nums text-xs', isCurrent(i) && 'bg-primary/5')}>
                              {total > 0 ? (
                                <span className={isPast(i) ? 'text-foreground' : 'text-muted-foreground'}>{fmt(total)}</span>
                              ) : <span className="text-muted-foreground/40">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-4 py-1.5 text-right tabular-nums text-xs text-muted-foreground">
                          {fmt(MONTHS.reduce((s, _, i) => s + (isPast(i) ? getActualSpending(child.id, i) : getBudgetAmount(child.id, i)), 0))}
                        </td>
                      </tr>
                    ))}
                    </React.Fragment>
                  );
                })}

                {/* TOTAL EGRESOS */}
                <tr className="border-t-2 border-border bg-muted/20">
                  <td className="px-4 py-2.5 sticky left-0 z-10 font-semibold text-foreground text-xs"
                    style={{ background: 'hsl(var(--muted) / 0.2)', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                    Total egresos
                  </td>
                  {MONTHS.map((_, i) => {
                    const fixed = totalRecurringMonthly;
                    const variable = tree.reduce((s, c) => s + (isPast(i) ? catSpending(c, i) : catBudget(c, i)), 0);
                    return (
                      <td key={i} className={cn('px-2 py-2.5 text-center tabular-nums text-xs font-semibold', isCurrent(i) && 'bg-primary/10')}>
                        {fmt(fixed + variable)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold">
                    {fmt(MONTHS.reduce((s, _, i) => s + totalRecurringMonthly + tree.reduce((a, c) => a + (isPast(i) ? catSpending(c, i) : catBudget(c, i)), 0), 0))}
                  </td>
                </tr>

                {/* RESULTADO */}
                <tr className="bg-muted/10">
                  <td className="px-4 py-2.5 sticky left-0 z-10 font-bold text-foreground"
                    style={{ background: 'hsl(var(--card))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)' }}>
                    = Resultado
                  </td>
                  {MONTHS.map((_, i) => {
                    const income = isPast(i) ? getActualIncome(i) : getBudgetAmount(incomeCategoryId, i);
                    const fixed = totalRecurringMonthly;
                    const variable = tree.reduce((s, c) => s + (isPast(i) ? catSpending(c, i) : catBudget(c, i)), 0);
                    const result = income - fixed - variable;
                    const noIncome = !isPast(i) && !isCurrent(i) && income === 0;
                    return (
                      <td key={i} className={cn('px-2 py-2.5 text-center tabular-nums font-bold',
                        noIncome ? 'text-muted-foreground/40' : result >= 0 ? 'text-emerald-600' : 'text-destructive',
                        isCurrent(i) && 'bg-primary/5')}>
                        {noIncome ? '—' : `${result >= 0 ? '+' : ''}${Math.round(result).toLocaleString('en-US')}`}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold">
                    {(() => {
                      const yr = MONTHS.reduce((s, _, i) => {
                        const income = isPast(i) ? getActualIncome(i) : getBudgetAmount(incomeCategoryId, i);
                        if (!isPast(i) && !isCurrent(i) && income === 0) return s;
                        return s + income - totalRecurringMonthly - tree.reduce((a, c) => a + (isPast(i) ? catSpending(c, i) : catBudget(c, i)), 0);
                      }, 0);
                      return <span className={yr >= 0 ? 'text-emerald-600' : 'text-destructive'}>{yr >= 0 ? '+' : ''}{Math.round(yr).toLocaleString('en-US')}</span>;
                    })()}
                  </td>
                </tr>

              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── ANÁLISIS DEL MES ─── */}
      {(() => {
        const totalBudgeted = chartData.reduce((s, d) => s + d.budgeted, 0);
        const totalSpent = chartData.reduce((s, d) => s + d.spent, 0);
        if (chartData.length === 0) return null;

        return (
          <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-18rem)] lg:px-6">
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground capitalize">Análisis del mes — {monthLabel}</h3>
              </div>

              {/* Annual evolution chart */}
              {(() => {
                const annualData = MONTHS.map((mLabel, i) => {
                  const budgeted = tree.reduce((s, cat) => s + catBudget(cat, i) + cat.recurringMonthly, 0);
                  const future = selectedYear > currentYear || (selectedYear === currentYear && i > currentMonth);
                  const real = future ? null : tree.reduce((s, cat) => s + catSpending(cat, i), 0);
                  const over = real !== null && real > budgeted && budgeted > 0;
                  return { month: mLabel, monthIdx: i, budgeted, real, future, over };
                });
                const hasReal = annualData.some(d => d.real !== null && d.real > 0);
                const hasBudget = annualData.some(d => d.budgeted > 0);
                if (!hasReal && !hasBudget) return null;
                return (
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-muted-foreground">Presupuestado vs Real — {selectedYear}</p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 border-t-2 border-dashed border-primary" />Presupuestado</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-emerald-500/60" />Real</span>
                      </div>
                    </div>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={annualData}
                          margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                          onClick={(e: any) => {
                            const idx = e?.activePayload?.[0]?.payload?.monthIdx;
                            if (typeof idx === 'number') setSelectedChartMonth(idx);
                          }}
                        >
                          <defs>
                            <linearGradient id="realFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity={0.5} />
                              <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis
                            dataKey="month"
                            tick={(props: any) => {
                              const { x, y, payload } = props;
                              const isSelected = payload.value === MONTHS[selectedChartMonth];
                              return (
                                <text x={x} y={y + 12} textAnchor="middle" fontSize={10}
                                  fill={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                                  fontWeight={isSelected ? 600 : 400}>
                                  {payload.value}
                                </text>
                              );
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                          />
                          <RTooltip
                            contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                            content={({ active, payload, label }: any) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              const diff = d.real !== null ? d.real - d.budgeted : null;
                              return (
                                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                                  <div className="font-semibold mb-1">{label}</div>
                                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Presupuestado</span><span className="tabular-nums">{fmt(d.budgeted)}</span></div>
                                  {d.real !== null && (
                                    <>
                                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Real</span><span className="tabular-nums">{fmt(d.real)}</span></div>
                                      <div className={cn('flex justify-between gap-4 font-semibold', d.over ? 'text-destructive' : 'text-emerald-600')}>
                                        <span>Diferencia</span>
                                        <span className="tabular-nums">{diff! > 0 ? '+' : '−'}{fmt(Math.abs(diff!))}</span>
                                      </div>
                                    </>
                                  )}
                                  {d.future && <div className="text-muted-foreground italic mt-1">Mes futuro</div>}
                                </div>
                              );
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="real"
                            stroke="hsl(142 71% 45%)"
                            strokeWidth={2}
                            fill="url(#realFill)"
                            connectNulls={false}
                            dot={(props: any) => {
                              const { cx, cy, payload, index } = props;
                              if (payload.real === null) return null as any;
                              return (
                                <circle
                                  key={index}
                                  cx={cx}
                                  cy={cy}
                                  r={payload.over ? 4 : 3}
                                  fill={payload.over ? 'hsl(var(--destructive))' : 'hsl(142 71% 45%)'}
                                  stroke="hsl(var(--background))"
                                  strokeWidth={1.5}
                                />
                              );
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="budgeted"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            strokeDasharray="5 4"
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}

              {/* Section header */}
              <div className="px-4 pt-4">
                <h4 className="text-xs font-semibold text-foreground capitalize">Análisis · {monthLabel}</h4>
              </div>

              {/* Monthly breakdown — horizontal progress bars */}
              <div className="p-4 pt-3 space-y-4">
                {(() => {
                  const threshold = totalRecurringMonthly * 0.05;
                  const allRows = [...chartData]
                    .map(d => ({ ...d, pct: d.budgeted > 0 ? (d.spent / d.budgeted) * 100 : (d.spent > 0 ? 999 : 0) }))
                    .sort((a, b) => {
                      const aOver = a.pct > 100, bOver = b.pct > 100;
                      if (aOver !== bOver) return aOver ? -1 : 1;
                      return b.pct - a.pct;
                    });
                  const meaningful = allRows.filter(d => d.spent > 0);
                  const visible = showAllCats ? allRows : meaningful;
                  const hiddenCount = allRows.length - meaningful.length;

                  if (allRows.length === 0) {
                    return <p className="text-xs text-muted-foreground text-center py-4">Sin datos para este mes.</p>;
                  }
                  const maxOverage = Math.max(
                    1,
                    ...visible.map(d => (d.budgeted > 0 && d.spent > d.budgeted ? d.spent - d.budgeted : 0))
                  );
                  return (
                    <div className="space-y-2.5">
                      {visible.map(item => {
                        const spentPct = item.budgeted > 0 ? (item.spent / item.budgeted) * 100 : 0;
                        const isOver = spentPct > 100;
                        const fillPct = Math.min(spentPct / 100, 1) * 72;
                        const overflowExtPct = isOver
                          ? Math.min((item.spent - item.budgeted) / maxOverage, 1) * 28
                          : 0;
                        const totalFillPct = fillPct + overflowExtPct;
                        const barColor = isOver
                          ? 'bg-red-500'
                          : spentPct >= 80
                            ? 'bg-amber-500'
                            : 'bg-emerald-500';
                        const diff = item.spent - item.budgeted;
                        return (
                          <div
                            key={item.id}
                            className="items-center gap-3 text-xs"
                            style={{ display: 'grid', gridTemplateColumns: '120px 1fr 160px' }}
                          >
                            <div className="flex items-center gap-1.5 font-medium min-w-0">
                              <span className="shrink-0">{item.icon}</span>
                              <span className="truncate">{item.name}</span>
                            </div>
                            <div className="relative w-full">
                              <div className="relative h-5 bg-muted rounded-md overflow-hidden">
                                {/* Overflow zone: 28% of track, starting at 72% */}
                                <div
                                  className="absolute top-0 bottom-0 bg-red-50 border-t border-r border-b border-dashed border-red-300 rounded-r-md"
                                  style={{ left: '72%', width: '28%' }}
                                />
                                {/* Divider marker at 72% (budget threshold) */}
                                <div className="absolute top-0 bottom-0 bg-muted-foreground/40 z-10" style={{ left: '72%', width: '2px' }} />
                                <div className={cn('relative h-full transition-all', barColor)} style={{ width: `${totalFillPct}%` }} />
                              </div>
                              <span className={cn(
                                'absolute inset-0 flex items-center px-2 text-[10px] font-semibold',
                                totalFillPct > 40 ? 'text-white' : 'text-foreground'
                              )}>
                                {item.budgeted > 0 ? `${Math.round(item.pct)}%` : 'sin budget'}
                              </span>
                            </div>
                            <div className="text-right tabular-nums whitespace-nowrap">
                              <div className="font-semibold">
                                <span className={cn(isOver && 'text-destructive')}>{fmt(item.spent)}</span>
                                <span className="text-muted-foreground font-normal"> / {fmt(item.budgeted)}</span>
                              </div>
                              {isOver ? (
                                <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-red-300 bg-red-50 text-red-600">
                                  +{Math.round((item.spent / item.budgeted - 1) * 100)}% excedido
                                </span>
                              ) : (
                                <div className="text-[10px] text-muted-foreground">
                                  {Math.round((item.spent / item.budgeted) * 100)}% usado
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {hiddenCount > 0 && (
                        <button
                          onClick={() => setShowAllCats(v => !v)}
                          className="text-[11px] text-primary hover:underline pt-1"
                        >
                          {showAllCats ? 'Ocultar sin actividad' : `Ver categorías sin actividad (${hiddenCount})`}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Insights */}
              {(() => {
                const insights: Array<{ kind: 'red' | 'amber' | 'green' | 'blue'; icon: string; text: string }> = [];

                // 🔴 Biggest overspend
                const overs = chartData.filter(d => d.variance > 0 && d.budgeted > 0).sort((a, b) => b.variance - a.variance);
                if (overs.length > 0) {
                  const top = overs[0];
                  insights.push({
                    kind: 'red',
                    icon: '🔴',
                    text: `${top.name} superó el budget por ${fmt(top.variance)}${overs.length > 1 ? ' — el mayor desvío del mes' : ''}`,
                  });
                }

                // 🟡 High usage (80-100%)
                const highUse = chartData
                  .filter(d => d.budgeted > 0 && d.spent <= d.budgeted && (d.spent / d.budgeted) >= 0.8)
                  .sort((a, b) => (b.spent / b.budgeted) - (a.spent / a.budgeted));
                if (highUse.length > 0) {
                  const h = highUse[0];
                  const pct = Math.round((h.spent / h.budgeted) * 100);
                  insights.push({
                    kind: 'amber',
                    icon: '🟡',
                    text: `${h.name} usó el ${pct}% del budget (${fmt(h.spent)} de ${fmt(h.budgeted)})`,
                  });
                }

                // 🟢 On track count
                const onTrack = chartData.filter(d => d.budgeted > 0 && d.spent > 0 && (d.spent / d.budgeted) < 0.8);
                if (onTrack.length > 0) {
                  insights.push({
                    kind: 'green',
                    icon: '🟢',
                    text: `${onTrack.length} ${onTrack.length === 1 ? 'categoría' : 'categorías'} dentro del rango esperado`,
                  });
                }

                // 📊 Summary
                if (totalBudgeted > 0) {
                  const daysInMonth = new Date(selectedYear, selectedChartMonth + 1, 0).getDate();
                  const isCur = selectedYear === currentYear && selectedChartMonth === currentMonth;
                  const dayOfMonth = isCur ? today.getDate() : daysInMonth;
                  const monthPct = Math.round((dayOfMonth / daysInMonth) * 100);
                  insights.push({
                    kind: 'blue',
                    icon: '📊',
                    text: `Total gastado: ${fmt(totalSpent)} de ${fmt(totalBudgeted)} presupuestados (${monthPct}% del mes transcurrido)`,
                  });
                }

                const top4 = insights.slice(0, 4);
                if (top4.length === 0) return null;

                const styles: Record<string, string> = {
                  red: 'border-l-red-500 bg-red-500/10 text-red-900 dark:text-red-100',
                  amber: 'border-l-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-100',
                  green: 'border-l-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100',
                  blue: 'border-l-blue-500 bg-blue-500/10 text-blue-900 dark:text-blue-100',
                };

                return (
                  <div className="border-t border-border p-4 space-y-3">
                    <p className="text-sm font-semibold text-foreground">Insights del mes</p>
                    <div className="space-y-2">
                      {top4.map((ins, idx) => (
                        <div key={idx} className={cn('border-l-4 rounded-r-lg px-4 py-3', styles[ins.kind])}>
                          <p className="text-sm font-medium">{ins.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
