import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useBudgets, useUpsertBudget, useDeleteBudget } from '@/hooks/useBudgets';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { formatUSD } from '@/lib/constants';
import { getCategoryColor } from '@/lib/categoryColors';
import { getCategoryIcon } from '@/lib/brandLogos';
import { Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle, Target, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export default function BudgetPage({ embedded = false }: { embedded?: boolean } = {}) {
  const currentMonth = format(new Date(), 'yyyy-MM-01');
  const { data: budgets, isLoading } = useBudgets(currentMonth);
  const { data: transactions } = useTransactions({
    dateFrom: currentMonth,
    dateTo: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });
  const { data: categories } = useCategories();
  const upsertBudget = useUpsertBudget();
  const deleteBudget = useDeleteBudget();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category_id: '', amount: '' });

  const spendingByCategory = useMemo(() => {
    if (!transactions) return {};
    const map: Record<string, number> = {};
    transactions.forEach(t => {
      if (t.type !== 'expense') return;
      const catId = t.category_id || 'uncategorized';
      map[catId] = (map[catId] || 0) + Math.abs(Number(t.amount_usd));
    });
    return map;
  }, [transactions]);

  const budgetItems = useMemo(() => {
    if (!budgets) return [];
    return budgets.map(b => {
      const cat = (b as any).categories;
      const spent = spendingByCategory[b.category_id || ''] || 0;
      const pct = b.amount > 0 ? (spent / Number(b.amount)) * 100 : 0;
      return { ...b, cat, spent, pct, remaining: Number(b.amount) - spent };
    });
  }, [budgets, spendingByCategory]);

  const totalBudget = budgetItems.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent = budgetItems.reduce((s, b) => s + b.spent, 0);
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const overBudgetCount = budgetItems.filter(b => b.pct > 100).length;

  const handleAdd = async () => {
    if (!form.category_id || !form.amount) return;
    try {
      await upsertBudget.mutateAsync({
        category_id: form.category_id,
        month: currentMonth,
        amount: parseFloat(form.amount),
      });
      toast.success('Budget set');
      setShowAdd(false);
      setForm({ category_id: '', amount: '' });
    } catch (e: any) { toast.error(e.message); }
  };

  const unbugdetedCategories = useMemo(() => {
    if (!categories || !budgets) return categories || [];
    const budgetCatIds = new Set(budgets.map(b => b.category_id));
    return categories.filter(c => !budgetCatIds.has(c.id));
  }, [categories, budgets]);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      <div className={embedded ? 'flex items-center justify-end' : 'flex items-center justify-between'}>
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold text-foreground">Budget</h1>
            <p className="text-sm text-muted-foreground">{format(new Date(), 'MMMM yyyy')}</p>
          </div>
        )}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Set Budget</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Set Category Budget</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div>
                <Label>Category</Label>
                <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {unbugdetedCategories?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Monthly Budget (USD)</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-1" placeholder="500" />
              </div>
              <Button className="w-full" onClick={handleAdd} disabled={upsertBudget.isPending}>Set Budget</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Overall progress */}
      <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm opacity-80">Total Budget</p>
            <p className="text-sm opacity-80 tabular-nums">{Math.round(totalPct)}%</p>
          </div>
          <Progress value={Math.min(totalPct, 100)} className="h-3 bg-primary-foreground/20" />
          <div className="flex items-center justify-between mt-3">
            <div>
              <p className="text-2xl font-extrabold">{formatUSD(totalSpent)}</p>
              <p className="text-xs opacity-70">spent</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold">{formatUSD(totalBudget)}</p>
              <p className="text-xs opacity-70">budget</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="pt-3 pb-3 text-center">
            <Target className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold text-foreground">{formatUSD(totalBudget - totalSpent)}</p>
            <p className="text-[10px] text-muted-foreground">Remaining</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3 text-center">
            <DollarSign className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold text-foreground">{budgetItems.length}</p>
            <p className="text-[10px] text-muted-foreground">Categories</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3 text-center">
            <AlertTriangle className={`h-4 w-4 mx-auto mb-1 ${overBudgetCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            <p className="text-lg font-bold text-foreground">{overBudgetCount}</p>
            <p className="text-[10px] text-muted-foreground">Over Budget</p>
          </CardContent>
        </Card>
      </div>

      {/* Category budgets */}
      <div className="space-y-2">
        {budgetItems.map(item => {
          const isOver = item.pct > 100;
          const isWarning = item.pct > 80 && !isOver;
          const color = getCategoryColor(item.cat?.name, item.cat?.color);

          return (
            <Card key={item.id} className={isOver ? 'border-destructive/30' : ''}>
              <CardContent className="py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{getCategoryIcon(item.cat?.name, item.cat?.icon)}</span>
                    <span className="text-sm font-semibold text-foreground">{item.cat?.name || 'Unknown'}</span>
                    {isOver && <Badge variant="destructive" className="text-[9px] h-4 px-1.5">Over!</Badge>}
                    {isWarning && <Badge variant="secondary" className="text-[9px] h-4 px-1.5">⚠️ {Math.round(item.pct)}%</Badge>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteBudget.mutateAsync(item.id).then(() => toast.success('Removed'))}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
                <Progress value={Math.min(item.pct, 100)} className="h-2 mb-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">{formatUSD(item.spent)} spent</span>
                  <span className="tabular-nums">
                    {item.remaining >= 0
                      ? `${formatUSD(item.remaining)} left`
                      : `${formatUSD(Math.abs(item.remaining))} over`
                    }
                  </span>
                  <span className="tabular-nums">{formatUSD(Number(item.amount))} budget</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Unbudgeted spending */}
      {Object.entries(spendingByCategory).filter(([catId]) => !budgetItems.find(b => b.category_id === catId)).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground px-1">Unbudgeted Spending</p>
          {Object.entries(spendingByCategory)
            .filter(([catId]) => !budgetItems.find(b => b.category_id === catId))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([catId, spent]) => {
              const cat = categories?.find(c => c.id === catId);
              return (
                <Card key={catId} className="border-dashed">
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{getCategoryIcon(cat?.name, cat?.icon)}</span>
                      <span className="text-sm text-foreground">{cat?.name || 'Uncategorized'}</span>
                    </div>
                    <span className="text-sm font-bold text-foreground tabular-nums">{formatUSD(spent)}</span>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      {budgetItems.length === 0 && (
        <div className="text-center py-12">
          <Target className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No budgets set yet.</p>
          <p className="text-sm text-muted-foreground/70">Set monthly limits for your spending categories.</p>
        </div>
      )}
    </div>
  );
}
