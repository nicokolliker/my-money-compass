import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBudgets, useUpsertBudget } from '@/hooks/useBudgets';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useCategoryTree } from '@/hooks/useCategoryTree';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  const [trackingExpanded, setTrackingExpanded] = useState(true);
  const [fixedExpanded, setFixedExpanded] = useState(true);
  const [variableExpanded, setVariableExpanded] = useState(true);

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
          .filter(t => (t.category_id === categoryId || (t as any).subcategory_id === categoryId) && t.type === 'expense' && t.date.startsWith(prefix))
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
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {/* Header */}
      {!embedded && (
        <div className="flex items-start justify-between gap-3">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-foreground">Budget</h1>
            <p className="text-sm text-muted-foreground">Planificación mensual y anual por categoría</p>
          </div>
        </div>
      )}

      {/* Section 1: Chart for selected month */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-16rem)] lg:px-6">
        <Card>
          <div
            className="flex items-center justify-between px-6 py-4 cursor-pointer border-b border-border gap-3"
            onClick={() => setTrackingExpanded(v => !v)}
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold capitalize">
                {monthLabel} — Seguimiento del mes
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmt(chartData.reduce((s, d) => s + d.spent, 0))} gastado de {fmt(chartData.reduce((s, d) => s + d.budgeted, 0))} presupuestado
              </p>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <select
                value={selectedChartMonth}
                onChange={e => setSelectedChartMonth(Number(e.target.value))}
                className="text-xs border border-border rounded-lg px-2 py-1 bg-background"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setSelectedYear(y => y - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs font-semibold tabular-nums w-12 text-center">{selectedYear}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setSelectedYear(y => y + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', trackingExpanded && 'rotate-180')} />
            </div>
          </div>
          {trackingExpanded && (
            <CardContent>
              {chartData.length === 0 ? (
                <div className="py-6 text-center space-y-1">
                  <p className="text-sm text-muted-foreground">No hay presupuestos definidos para este mes.</p>
                  <p className="text-xs text-muted-foreground">Usá la tabla de abajo para definir tu presupuesto mensual.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chartData.map(item => {
                    const pctUsed = item.budgeted > 0 ? Math.min((item.spent / item.budgeted) * 100, 100) : 0;
                    const isOver = item.spent > item.budgeted && item.budgeted > 0;
                    const remaining = item.budgeted - item.spent;
                    const barColor = isOver ? 'bg-destructive' : pctUsed > 80 ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                      <div key={item.id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <span>{item.icon}</span>
                            <span>{item.name}</span>
                          </div>
                          <div className="text-xs tabular-nums">
                            <span className={cn('font-semibold', isOver ? 'text-destructive' : 'text-foreground')}>
                              {fmt(item.spent)}
                            </span>
                            <span className="text-muted-foreground"> / {fmt(item.budgeted)}</span>
                          </div>
                        </div>
                        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pctUsed}%` }} />
                          {isOver && <div className="absolute inset-0 rounded-full ring-1 ring-destructive/40 pointer-events-none" />}
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                          <span>{Math.round(pctUsed)}% usado</span>
                          <span className={cn(isOver && 'text-destructive font-semibold')}>
                            {isOver ? `+${fmt(Math.abs(remaining))} sobre presupuesto` : `${fmt(remaining)} restante`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Section 2: Annual planning table */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-16rem)] lg:px-6">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Planificación anual {selectedYear}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: '960px', width: '100%' }}>
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th
                    className="text-left px-3 py-2 sticky left-0 z-10 min-w-[180px] font-semibold text-foreground"
                    style={{ background: 'hsl(var(--muted))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}
                  >
                    Categoría
                  </th>
                  {MONTHS.map((m, i) => (
                    <th
                      key={m}
                      className={cn(
                        'px-2 py-2 text-center font-semibold text-foreground min-w-[80px]',
                        isCurrent(i) && 'bg-primary/10 text-primary'
                      )}
                    >
                      {m}
                      {isCurrent(i) && <div className="text-[9px] font-normal opacity-80">← actual</div>}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold text-foreground min-w-[90px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {/* Income row */}
                <tr className="border-b border-border bg-emerald-500/5">
                  <td
                    className="px-3 py-2 sticky left-0 z-10 font-semibold text-foreground"
                    style={{ background: 'hsl(var(--card))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}
                  >
                    💰 Ingresos
                  </td>
                  {MONTHS.map((_, i) => {
                    const actual = getActualIncome(i);
                    const budgeted = getBudgetAmount(incomeCategoryId, i);
                    return (
                      <td key={i} className={cn('px-1 py-1 text-center tabular-nums', isCurrent(i) && 'bg-primary/5')}>
                        {isPast(i) ? (
                          <span className="text-emerald-600 font-medium">{actual > 0 ? fmt(actual) : '—'}</span>
                        ) : (
                          <Input
                            key={`income-${selectedYear}-${i}-${budgeted}`}
                            type="number"
                            defaultValue={budgeted || ''}
                            placeholder="0"
                            className="h-7 text-xs text-center px-1 tabular-nums"
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && incomeCategoryId) saveBudget(incomeCategoryId, i, val);
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-600">{fmt(incomeYearTotal)}</td>
                </tr>

                {/* Separator */}
                <tr>
                  <td colSpan={14} className="h-2 bg-muted/30 border-y border-border" />
                </tr>

                {/* Category rows (fixed + variable stacked) */}
                {tree.map(cat => {
                  const yearTotal = MONTHS.reduce((s, _, i) => {
                    const variable = isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i);
                    return s + cat.recurringMonthly + variable;
                  }, 0);
                  return (
                    <React.Fragment key={cat.id}>
                      <tr className="border-b border-border hover:bg-muted/20">
                        <td
                          className="px-3 py-2 sticky left-0 z-10"
                          style={{ background: 'hsl(var(--card))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{cat.icon}</span>
                            <span className="text-foreground truncate font-medium">{cat.name}</span>
                            {cat.isDigital && cat.children.length > 0 && (
                              <button
                                onClick={toggleDigital}
                                className="ml-auto text-muted-foreground hover:text-foreground"
                                aria-label="Toggle digital subcategories"
                              >
                                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', digitalExpanded && 'rotate-180')} />
                              </button>
                            )}
                          </div>
                        </td>
                        {MONTHS.map((_, i) => {
                          const fixed = cat.recurringMonthly;
                          const variable = getBudgetAmount(cat.id, i);
                          const actual = getActualSpending(cat.id, i);
                          const isOver = (fixed + variable) > 0 && actual > (fixed + variable);
                          return (
                            <td
                              key={i}
                              className={cn('px-1 py-1 text-center tabular-nums align-middle', isCurrent(i) && 'bg-primary/5')}
                            >
                              <div className="space-y-0.5">
                                {fixed > 0 && (
                                  <div className="text-[10px] text-primary font-medium tabular-nums" title="Recurring fixed">
                                    🔒 {fmt(fixed)}
                                  </div>
                                )}
                                {isPast(i) ? (
                                  <div className={cn('text-[11px]', actual > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                                    {actual > 0 ? fmt(actual) : '—'}
                                  </div>
                                ) : isCurrent(i) ? (
                                  <>
                                    <div className={cn('text-[10px]', isOver ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                                      {actual > 0 ? fmt(actual) : '—'}
                                    </div>
                                    <Input
                                      key={`${cat.id}-cur-${selectedYear}-${i}-${variable}`}
                                      type="number"
                                      defaultValue={variable || ''}
                                      placeholder="0"
                                      className="h-6 text-[11px] text-center px-1 tabular-nums"
                                      onBlur={(e) => {
                                        const v = parseFloat(e.target.value);
                                        if (!isNaN(v)) saveBudget(cat.id, i, v);
                                      }}
                                    />
                                  </>
                                ) : (
                                  <Input
                                    key={`${cat.id}-fut-${selectedYear}-${i}-${variable}`}
                                    type="number"
                                    defaultValue={variable || ''}
                                    placeholder="0"
                                    className="h-6 text-[11px] text-center px-1 tabular-nums"
                                    onBlur={(e) => {
                                      const v = parseFloat(e.target.value);
                                      if (!isNaN(v)) saveBudget(cat.id, i, v);
                                    }}
                                  />
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{fmt(yearTotal)}</td>
                      </tr>

                      {/* Digital subcategory rows */}
                      {cat.isDigital && digitalExpanded && cat.children.map(sub => {
                        const subYearTotal = MONTHS.reduce(
                          (s, _, i) => s + (isPast(i) ? getActualSpending(sub.id, i) : getBudgetAmount(sub.id, i)),
                          0
                        );
                        return (
                          <tr key={sub.id} className="border-b border-border/60 bg-muted/10">
                            <td
                              className="px-3 py-1.5 sticky left-0 z-10 pl-8"
                              style={{ background: 'hsl(var(--card))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}
                            >
                              <span className="text-[11px] text-muted-foreground">↳ {sub.name}</span>
                            </td>
                            {MONTHS.map((_, i) => {
                              const variable = getBudgetAmount(sub.id, i);
                              const actual = getActualSpending(sub.id, i);
                              return (
                                <td key={i} className={cn('px-1 py-1 text-center tabular-nums', isCurrent(i) && 'bg-primary/5')}>
                                  {isPast(i) ? (
                                    <span className="text-[11px] text-muted-foreground">{actual > 0 ? fmt(actual) : '—'}</span>
                                  ) : (
                                    <Input
                                      key={`${sub.id}-${selectedYear}-${i}-${variable}`}
                                      type="number"
                                      defaultValue={variable || ''}
                                      placeholder="0"
                                      className="h-6 text-[11px] text-center px-1 tabular-nums"
                                      onBlur={(e) => {
                                        const v = parseFloat(e.target.value);
                                        if (!isNaN(v)) saveBudget(sub.id, i, v);
                                      }}
                                    />
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(subYearTotal)}</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

                {/* Total egresos row */}
                <tr className="border-y-2 border-border bg-muted/40">
                  <td
                    className="px-3 py-2 sticky left-0 z-10 font-semibold text-foreground"
                    style={{ background: 'hsl(var(--muted))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}
                  >
                    Total egresos
                  </td>
                  {MONTHS.map((_, i) => {
                    const total = tree.reduce((s, cat) => {
                      const variable = isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i);
                      return s + cat.recurringMonthly + variable;
                    }, 0);
                    return (
                      <td key={i} className={cn('px-2 py-2 text-center tabular-nums font-bold text-foreground', isCurrent(i) && 'bg-primary/10')}>
                        {fmt(total)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-foreground">
                    {fmt(
                      MONTHS.reduce((s, _, i) => {
                        const total = tree.reduce((a, cat) => {
                          const variable = isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i);
                          return a + cat.recurringMonthly + variable;
                        }, 0);
                        return s + total;
                      }, 0)
                    )}
                  </td>
                </tr>

                {/* Result row */}
                <tr className="bg-muted/60">
                  <td
                    className="px-3 py-2 sticky left-0 z-10 font-bold text-foreground"
                    style={{ background: 'hsl(var(--muted))', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)' }}
                  >
                    = Resultado
                  </td>
                  {MONTHS.map((_, i) => {
                    const income = isPast(i) ? getActualIncome(i) : getBudgetAmount(incomeCategoryId, i);
                    const egresos = tree.reduce((s, cat) => {
                      const variable = isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i);
                      return s + cat.recurringMonthly + variable;
                    }, 0);
                    const result = income - egresos;
                    const noIncome = !isPast(i) && !isCurrent(i) && income === 0;
                    return (
                      <td
                        key={i}
                        className={cn(
                          'px-2 py-2 text-center tabular-nums font-bold',
                          noIncome ? 'text-muted-foreground' : result >= 0 ? 'text-emerald-600' : 'text-destructive',
                          isCurrent(i) && 'bg-primary/10'
                        )}
                      >
                        {noIncome ? '—' : `${result >= 0 ? '+' : ''}${Math.round(result).toLocaleString('en-US')}`}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-bold">
                    {(() => {
                      const yearResult = MONTHS.reduce((s, _, i) => {
                        const income = isPast(i) ? getActualIncome(i) : getBudgetAmount(incomeCategoryId, i);
                        if (!isPast(i) && !isCurrent(i) && income === 0) return s;
                        const egresos = tree.reduce((a, cat) => {
                          const variable = isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i);
                          return a + cat.recurringMonthly + variable;
                        }, 0);
                        return s + (income - egresos);
                      }, 0);
                      return (
                        <span className={yearResult >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                          {yearResult >= 0 ? '+' : ''}{Math.round(yearResult).toLocaleString('en-US')}
                        </span>
                      );
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
