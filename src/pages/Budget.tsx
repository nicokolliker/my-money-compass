import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBudgets, useUpsertBudget } from '@/hooks/useBudgets';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import { toMonthlyAmount } from '@/lib/money';
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
      .reduce((s, r) => s + toMonthlyAmount(Math.abs(Number(r.amount)), r.frequency), 0);
  }, [recurringItems]);

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

  // ----- Chart data: budgeted vs actual for current month -----
  const chartData = useMemo(() => {
    const prefix = monthPrefix(currentYear, currentMonth);
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
  }, [variableCategories, budgets, transactions, currentYear, currentMonth]);

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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold capitalize">
            {new Date(currentYear, currentMonth).toLocaleString('es', { month: 'long', year: 'numeric' })} — Presupuestado vs Real
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Definí presupuestos para ver el comparativo.
            </p>
          ) : (
            <div className="space-y-4">
              {chartData.map(item => {
                const isOver = item.deviation > 0;
                const max = Math.max(item.budgeted, item.spent, 1);
                return (
                  <div key={item.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span>{item.icon}</span>
                        <span>{item.name}</span>
                      </div>
                      <span className={`text-xs font-semibold tabular-nums ${isOver ? 'text-destructive' : 'text-emerald-600'}`}>
                        {isOver ? '+' : ''}{item.pct}% ({isOver ? '+' : ''}{fmt(item.deviation)})
                      </span>
                    </div>

                    {/* Budget bar */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">Budget</span>
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/40 rounded-full" style={{ width: '100%' }} />
                      </div>
                      <span className="text-[10px] tabular-nums text-muted-foreground w-14 text-right shrink-0">{fmt(item.budgeted)}</span>
                    </div>

                    {/* Actual bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">Gastado</span>
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isOver ? 'bg-destructive' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min((item.spent / max) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={`text-[10px] tabular-nums font-semibold w-14 text-right shrink-0 ${isOver ? 'text-destructive' : 'text-emerald-600'}`}>
                        {fmt(item.spent)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Annual planning table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Planificación anual {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-6 px-6">
            <table style={{ minWidth: '900px' }} className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-3 py-2 sticky left-0 bg-muted/40 z-10 min-w-[180px] font-semibold text-foreground">
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
                  <td className="px-3 py-2 sticky left-0 bg-emerald-500/5 z-10 font-semibold text-foreground">
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
                  <td className="px-3 py-2 sticky left-0 bg-primary/5 z-10 font-semibold text-foreground">
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
                      <td className="px-3 py-2 sticky left-0 bg-card z-10">
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
                  <td className="px-3 py-2 sticky left-0 bg-muted/40 z-10 font-semibold text-foreground">
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
                  <td className="px-3 py-2 sticky left-0 bg-muted/60 z-10 font-bold text-foreground">
                    = Resultado
                  </td>
                  {MONTHS.map((_, i) => {
                    const income = isPast(i) ? getActualIncome(i) : getBudgetAmount(incomeCategoryId, i);
                    const variable = variableCategories.reduce(
                      (s, cat) => s + (isPast(i) ? getActualSpending(cat.id, i) : getBudgetAmount(cat.id, i)),
                      0
                    );
                    const result = income - recurringMonthlyTotal - variable;
                    return (
                      <td
                        key={i}
                        className={cn(
                          'px-2 py-2 text-center tabular-nums font-bold',
                          result >= 0 ? 'text-emerald-600' : 'text-destructive',
                          isCurrent(i) && 'bg-primary/10'
                        )}
                      >
                        {result >= 0 ? '+' : ''}{Math.round(result).toLocaleString('en-US')}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-bold">
                    {(() => {
                      const yearResult = MONTHS.reduce((s, _, i) => {
                        const income = isPast(i) ? getActualIncome(i) : getBudgetAmount(incomeCategoryId, i);
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
        </CardContent>
      </Card>
    </div>
  );
}
