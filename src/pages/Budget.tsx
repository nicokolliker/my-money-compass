import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useBudgets, useUpsertBudget } from '@/hooks/useBudgets';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useCategoryTree, type CategoryNode } from '@/hooks/useCategoryTree';
import { ChevronLeft, ChevronRight, ChevronDown, Lightbulb, AlertTriangle, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, Cell, Legend } from 'recharts';

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
    (categoryId: string | null, monthIndex: number) => {
      if (!categoryId) return 0;
      const b = (budgets || []).find(b => b.category_id === categoryId && String(b.month).startsWith(monthPrefix(selectedYear, monthIndex)));
      return Number(b?.amount || 0);
    },
    [budgets, selectedYear]
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
    const prefix = monthPrefix(selectedYear, selectedChartMonth);
    return tree
      .map(cat => {
        const budgetedVar = Number(
          (budgets || []).find(b => b.category_id === cat.id && String(b.month).startsWith(prefix))?.amount || 0
        );
        const budgeted = budgetedVar + cat.recurringMonthly;
        const spent = Math.abs(
          (transactions || [])
            .filter(t => t.category_id === cat.id && t.type === 'expense' && t.date.startsWith(prefix))
            .reduce((s, t) => s + Number(t.amount_usd || 0), 0)
        );
        if (budgeted === 0 && spent === 0) return null;
        return { id: cat.id, name: cat.name, icon: cat.icon, budgeted, spent };
      })
      .filter(Boolean) as Array<{ id: string; name: string; icon: string | null; budgeted: number; spent: number }>;
  }, [tree, budgets, transactions, selectedYear, selectedChartMonth]);

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
        <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-16rem)] lg:px-6">
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
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-16rem)] lg:px-6">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">

          {/* Header row */}
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer"
            onClick={() => setTrackingExpanded(v => !v)}
          >
            <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
              <select
                value={selectedChartMonth}
                onChange={e => setSelectedChartMonth(Number(e.target.value))}
                className="text-base font-semibold bg-transparent border-0 focus:outline-none cursor-pointer capitalize pr-1"
              >
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <span className="text-base font-semibold text-foreground">{selectedYear}</span>
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
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-16rem)] lg:px-6">
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
                        const varTotal = tree.reduce((s, c) => s + (isPast(i) ? getActualSpending(c.id, i) : getBudgetAmount(c.id, i)), 0);
                        return (
                          <td key={i} className={cn('px-2 py-2 text-center tabular-nums text-xs font-medium', isCurrent(i) && 'bg-primary/5')}>
                            {varTotal > 0 ? fmt(varTotal) : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right tabular-nums text-xs font-semibold">
                        {fmt(MONTHS.reduce((s, _, i) => s + tree.reduce((a, c) => a + (isPast(i) ? getActualSpending(c.id, i) : getBudgetAmount(c.id, i)), 0), 0))}
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
                          const actual = getActualSpending(cat.id, i);
                          const budgeted = getBudgetAmount(cat.id, i);
                          return (
                            <td key={i} className={cn('px-1.5 py-1.5 text-center', isCurrent(i) && 'bg-primary/5')}>
                              {isPast(i) ? (
                                <span className={actual > 0 ? 'text-foreground tabular-nums' : 'text-muted-foreground'}>
                                  {actual > 0 ? fmt(actual) : '—'}
                                </span>
                              ) : (
                                <Input
                                  key={`${cat.id}-${selectedYear}-${i}-${budgeted}`}
                                  type="number"
                                  defaultValue={budgeted || ''}
                                  placeholder="0"
                                  className={cn('h-7 text-xs text-center px-1 tabular-nums border-border/50 rounded-lg', noSpinClass)}
                                  onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) saveBudget(cat.id, i, v); }}
                                />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {fmt(MONTHS.reduce((s, _, i) => s + (isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i)), 0))}
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
                            return (
                              <td key={i} className={cn('px-1.5 py-1.5 text-center', isCurrent(i) && 'bg-primary/5')}>
                                {isPast(i) ? (
                                  <span className={actual > 0 ? 'text-xs text-foreground tabular-nums' : 'text-xs text-muted-foreground'}>
                                    {actual > 0 ? fmt(actual) : '—'}
                                  </span>
                                ) : (
                                  <Input
                                    key={`${child.id}-${selectedYear}-${i}-${budgeted}`}
                                    type="number"
                                    defaultValue={budgeted || ''}
                                    placeholder="0"
                                    className={cn('h-7 text-xs text-center px-1 tabular-nums border-border/50 rounded-lg', noSpinClass)}
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
                    return s + cat.recurringMonthly + (isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i));
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
                        const total = cat.recurringMonthly + (isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i));
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
                    const variable = tree.reduce((s, c) => s + (isPast(i) ? getActualSpending(c.id, i) : getBudgetAmount(c.id, i)), 0);
                    return (
                      <td key={i} className={cn('px-2 py-2.5 text-center tabular-nums text-xs font-semibold', isCurrent(i) && 'bg-primary/10')}>
                        {fmt(fixed + variable)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold">
                    {fmt(MONTHS.reduce((s, _, i) => s + totalRecurringMonthly + tree.reduce((a, c) => a + (isPast(i) ? getActualSpending(c.id, i) : getBudgetAmount(c.id, i)), 0), 0))}
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
                    const variable = tree.reduce((s, c) => s + (isPast(i) ? getActualSpending(c.id, i) : getBudgetAmount(c.id, i)), 0);
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
                        return s + income - totalRecurringMonthly - tree.reduce((a, c) => a + (isPast(i) ? getActualSpending(c.id, i) : getBudgetAmount(c.id, i)), 0);
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

    </div>
  );
}
