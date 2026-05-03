import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBudgets, useUpsertBudget } from '@/hooks/useBudgets';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import { useFxRates } from '@/hooks/useFxRates';
import { toMonthlyAmount, toUSD, type FxRateRow } from '@/lib/money';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const { data: transactions } = useTransactions();
  const { data: budgets } = useBudgets();
  const { data: categories } = useCategories();
  const { data: recurringItems } = useRecurringExpenses();
  const { data: fxRates } = useFxRates();
  const upsertBudget = useUpsertBudget();

  const incomeCategoryId = useMemo(
    () => categories?.find(c => c.name === INCOME_CATEGORY_NAME)?.id || null,
    [categories]
  );

  // Variable budget categories — exclude system / aggregated categories
  const EXCLUDED_CATEGORIES = [
    'Ingresos Proyectados', 'Income', 'Ingresos',
    'Transfers', 'Transferencias', 'Transfer',
    'Debt / Loans', 'Debt', 'Loans',
    'Digital', // parent category — subcategories appear individually
  ];
  const variableCategories = useMemo(
    () => (categories || []).filter(c => !EXCLUDED_CATEGORIES.includes(c.name)),
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
          .filter(t => t.category_id === categoryId && t.type === 'expense' && t.date.startsWith(prefix))
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
      const monthStr = monthStrFor(selectedYear, monthIndex);
      const b = (budgets || []).find(b => b.category_id === categoryId && String(b.month).startsWith(monthPrefix(selectedYear, monthIndex)));
      return Number(b?.amount || 0);
      void monthStr;
    },
    [budgets, selectedYear]
  );

  const recurringMonthlyTotal = useMemo(() => {
    return (recurringItems || [])
      .filter(r => r.is_active)
      .reduce((s, r) => {
        const amountUsd = toUSD(
          Math.abs(Number(r.amount)),
          r.currency || 'USD',
          fxRates as FxRateRow[] | undefined
        );
        return s + toMonthlyAmount(amountUsd, r.frequency);
      }, 0);
  }, [recurringItems, fxRates]);

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

  // ----- Chart month: fall back to last month if current has no transactions -----
  const chartMonth = useMemo(() => {
    if (!transactions?.length) return { year: currentYear, month: currentMonth };
    const currentPrefix = monthPrefix(currentYear, currentMonth);
    const hasCurrent = transactions.some(t => t.date.startsWith(currentPrefix));
    if (hasCurrent) return { year: currentYear, month: currentMonth };
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    return { year: lastMonthYear, month: lastMonth };
  }, [transactions, currentYear, currentMonth]);

  // ----- Chart data: budgeted vs actual for chart month -----
  const chartData = useMemo(() => {
    const prefix = monthPrefix(chartMonth.year, chartMonth.month);
    return variableCategories
      .map(cat => {
        const b = (budgets || []).find(
          b => b.category_id === cat.id && String(b.month).startsWith(prefix)
        );
        if (!b) return null;
        const budgeted = Number(b.amount || 0);
        const spent = Math.abs(
          (transactions || [])
            .filter(t => t.category_id === cat.id && t.type === 'expense' && t.date.startsWith(prefix))
            .reduce((s, t) => s + Number(t.amount_usd || 0), 0)
        );
        const deviation = spent - budgeted;
        const pct = budgeted > 0 ? Math.round((deviation / budgeted) * 100) : 0;
        return { id: cat.id, name: cat.name, icon: cat.icon, budgeted, spent, deviation, pct };
      })
      .filter(Boolean) as Array<{
        id: string; name: string; icon: string | null; budgeted: number; spent: number; deviation: number; pct: number;
      }>;
  }, [variableCategories, budgets, transactions, chartMonth]);

  // ----- Annual totals per row -----
  const incomeYearTotal = useMemo(() => {
    return MONTHS.reduce((s, _, i) => {
      const v = isPast(i) ? getActualIncome(i) : getBudgetAmount(incomeCategoryId, i);
      return s + v;
    }, 0);
  }, [incomeCategoryId, selectedYear, getActualIncome, getBudgetAmount]);

  const recurringYearTotal = recurringMonthlyTotal * 12;

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {/* Header */}
      <div className={embedded ? 'flex items-center justify-end gap-2' : 'flex items-center justify-between'}>
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold text-foreground">Budget</h1>
            <p className="text-sm text-muted-foreground">Annual planning and monthly tracking</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedYear(y => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-base font-semibold text-foreground tabular-nums w-14 text-center">{selectedYear}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedYear(y => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Section 1: Chart for current month */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-16rem)] lg:px-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold capitalize">
              {new Date(chartMonth.year, chartMonth.month).toLocaleString('es', { month: 'long', year: 'numeric' })} — Seguimiento del mes
            </CardTitle>
          </CardHeader>
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
                        <div
                          className={cn('h-full rounded-full transition-all', barColor)}
                          style={{ width: `${pctUsed}%` }}
                        />
                        {isOver && (
                          <div className="absolute inset-0 rounded-full ring-1 ring-destructive/40 pointer-events-none" />
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                        <span>{Math.round(pctUsed)}% usado</span>
                        <span className={cn(isOver && 'text-destructive font-semibold')}>
                          {isOver
                            ? `+${fmt(Math.abs(remaining))} sobre presupuesto`
                            : `${fmt(remaining)} restante`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
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
                    style={{
                      background: 'var(--color-background-secondary, hsl(var(--muted)))',
                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
                    }}
                  >
                    Categoría
                  </th>
                  {MONTHS.map((m, i) => (
                    <th
                      key={m}
                      className={cn(
                        'px-2 py-2 text-center font-semibold text-foreground min-w-[68px]',
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
                    style={{
                      background: 'color-mix(in srgb, var(--color-background-primary, hsl(var(--card))) 95%, #22c55e 5%)',
                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
                    }}
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
                            type="number"
                            defaultValue={budgeted || ''}
                            placeholder="0"
                            className="h-7 text-xs text-center px-1 tabular-nums"
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && incomeCategoryId && val !== budgeted) {
                                saveBudget(incomeCategoryId, i, val);
                              }
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-600">{fmt(incomeYearTotal)}</td>
                </tr>

                {/* Fixed costs (recurring) row */}
                <tr className="border-b border-border bg-primary/5">
                  <td
                    className="px-3 py-2 sticky left-0 z-10 font-semibold text-foreground"
                    style={{
                      background: 'color-mix(in srgb, var(--color-background-primary, hsl(var(--card))) 95%, hsl(var(--primary)) 5%)',
                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
                    }}
                  >
                    🔒 Gastos fijos
                  </td>
                  {MONTHS.map((_, i) => (
                    <td key={i} className={cn('px-2 py-2 text-center tabular-nums text-foreground', isCurrent(i) && 'bg-primary/10')}>
                      {fmt(recurringMonthlyTotal)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-foreground">{fmt(recurringYearTotal)}</td>
                </tr>

                {/* Separator */}
                <tr>
                  <td colSpan={14} className="h-2 bg-muted/30 border-y border-border" />
                </tr>

                {/* Variable budget rows */}
                {variableCategories.map(cat => {
                  const yearTotal = MONTHS.reduce((s, _, i) => {
                    const v = isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i);
                    return s + v;
                  }, 0);
                  return (
                    <tr key={cat.id} className="border-b border-border hover:bg-muted/20">
                      <td
                        className="px-3 py-2 sticky left-0 z-10"
                        style={{
                          background: 'var(--color-background-primary, hsl(var(--card)))',
                          boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{cat.icon}</span>
                          <span className="text-foreground truncate">{cat.name}</span>
                        </div>
                      </td>
                      {MONTHS.map((_, i) => {
                        const actual = getActualSpending(cat.id, i);
                        const budgeted = getBudgetAmount(cat.id, i);
                        const isOver = budgeted > 0 && actual > budgeted;
                        return (
                          <td
                            key={i}
                            className={cn(
                              'px-1 py-1 text-center tabular-nums align-middle',
                              isCurrent(i) && 'bg-primary/5'
                            )}
                          >
                            {isPast(i) ? (
                              <span className={cn(actual > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                                {actual > 0 ? fmt(actual) : '—'}
                              </span>
                            ) : isCurrent(i) ? (
                              <div className="space-y-0.5">
                                <div className={cn('text-[10px]', isOver ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                                  {actual > 0 ? fmt(actual) : '—'}
                                </div>
                                <Input
                                  type="number"
                                  defaultValue={budgeted || ''}
                                  placeholder="0"
                                  className="h-6 text-[11px] text-center px-1 tabular-nums"
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val !== budgeted) saveBudget(cat.id, i, val);
                                  }}
                                />
                              </div>
                            ) : (
                              <Input
                                type="number"
                                defaultValue={budgeted || ''}
                                placeholder="0"
                                className="h-7 text-xs text-center px-1 tabular-nums"
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val !== budgeted) saveBudget(cat.id, i, val);
                                }}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{fmt(yearTotal)}</td>
                    </tr>
                  );
                })}

                {/* Total egresos row */}
                <tr className="border-y-2 border-border bg-muted/40">
                  <td
                    className="px-3 py-2 sticky left-0 z-10 font-semibold text-foreground"
                    style={{
                      background: 'var(--color-background-secondary, hsl(var(--muted)))',
                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
                    }}
                  >
                    Total egresos
                  </td>
                  {MONTHS.map((_, i) => {
                    const variable = variableCategories.reduce(
                      (s, cat) => s + (isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i)),
                      0
                    );
                    const total = recurringMonthlyTotal + variable;
                    return (
                      <td key={i} className={cn('px-2 py-2 text-center tabular-nums font-bold text-foreground', isCurrent(i) && 'bg-primary/10')}>
                        {fmt(total)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-foreground">
                    {fmt(
                      MONTHS.reduce((s, _, i) => {
                        const variable = variableCategories.reduce(
                          (a, cat) => a + (isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i)),
                          0
                        );
                        return s + recurringMonthlyTotal + variable;
                      }, 0)
                    )}
                  </td>
                </tr>

                {/* Result row */}
                <tr className="bg-muted/60">
                  <td
                    className="px-3 py-2 sticky left-0 z-10 font-bold text-foreground"
                    style={{
                      background: 'var(--color-background-secondary, hsl(var(--muted)))',
                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
                    }}
                  >
                    = Resultado
                  </td>
                  {MONTHS.map((_, i) => {
                    const income = isPast(i) ? getActualIncome(i) : getBudgetAmount(incomeCategoryId, i);
                    const variable = variableCategories.reduce(
                      (s, cat) => s + (isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i)),
                      0
                    );
                    const result = income - recurringMonthlyTotal - variable;
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
                        const variable = variableCategories.reduce(
                          (a, cat) => a + (isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i)),
                          0
                        );
                        return s + (income - recurringMonthlyTotal - variable);
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
