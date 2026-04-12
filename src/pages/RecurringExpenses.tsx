import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useRecurringExpenses, useCreateRecurringExpense, useUpdateRecurringExpense, useDeleteRecurringExpense } from '@/hooks/useRecurringExpenses';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { formatCurrency, formatUSD } from '@/lib/constants';
import { getCategoryColor } from '@/lib/categoryColors';
import { getBrandLogo, getInitialsColor, getCategoryIcon } from '@/lib/brandLogos';
import { Plus, Trash2, CheckCircle2, AlertCircle, Clock, CreditCard, CalendarDays, DollarSign, TrendingUp, Repeat, Building, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { format, isAfter, isBefore, subDays, addMonths } from 'date-fns';

const TYPE_LABELS: Record<string, { label: string; icon: typeof Repeat }> = {
  subscription: { label: 'Subscriptions', icon: Repeat },
  fixed_cost: { label: 'Fixed Costs', icon: Building },
  tax_fee: { label: 'Taxes & Fees', icon: FileText },
};

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }> = {
  paid: { label: 'Paid', variant: 'default', icon: CheckCircle2 },
  expected: { label: 'Expected', variant: 'secondary', icon: Clock },
  overdue: { label: 'Overdue', variant: 'destructive', icon: AlertCircle },
  missing: { label: 'Missing', variant: 'outline', icon: AlertCircle },
};

export default function RecurringExpenses() {
  const { data: items, isLoading } = useRecurringExpenses();
  const { data: transactions } = useTransactions();
  const { data: categories } = useCategories();
  const { data: accounts } = useAccounts();
  const createItem = useCreateRecurringExpense();
  const updateItem = useUpdateRecurringExpense();
  const deleteItem = useDeleteRecurringExpense();
  const [showAdd, setShowAdd] = useState(false);
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');
  const [filterType, setFilterType] = useState<string>('all');

  const [form, setForm] = useState({
    name: '', type: 'subscription', category_id: '', account_id: '', amount: '',
    currency: 'USD', frequency: 'monthly', due_day: '1', notes: '',
  });

  // Auto-reconcile: try to match recent transactions
  const reconciled = useMemo(() => {
    if (!items || !transactions) return {};
    const map: Record<string, { matched: boolean; txId?: string; txDate?: string; txAmount?: number }> = {};
    items.forEach(item => {
      const recent = transactions.filter(t => {
        if (t.type !== 'expense') return false;
        const name = (item.name || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const merchant = (t.merchant || '').toLowerCase();
        return desc.includes(name) || merchant.includes(name) || name.includes(merchant);
      });
      const lastMonth = subDays(new Date(), 45);
      const match = recent.find(t => isAfter(new Date(t.date), lastMonth));
      map[item.id] = match
        ? { matched: true, txId: match.id, txDate: match.date, txAmount: Math.abs(Number(match.amount)) }
        : { matched: false };
    });
    return map;
  }, [items, transactions]);

  const filtered = useMemo(() => {
    if (!items) return [];
    return filterType === 'all' ? items : items.filter(i => i.type === filterType);
  }, [items, filterType]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    filtered.forEach(item => {
      const key = item.type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filtered]);

  const totals = useMemo(() => {
    if (!items) return { monthly: 0, yearly: 0, active: 0, overdue: 0 };
    const active = items.filter(i => i.is_active);
    let monthly = 0;
    active.forEach(i => {
      const amt = Math.abs(Number(i.amount));
      switch (i.frequency) {
        case 'weekly': monthly += amt * 4.33; break;
        case 'monthly': monthly += amt; break;
        case 'quarterly': monthly += amt / 3; break;
        case 'yearly': monthly += amt / 12; break;
      }
    });
    const overdue = active.filter(i => i.next_due_date && isBefore(new Date(i.next_due_date), new Date()) && i.status !== 'paid').length;
    return { monthly, yearly: monthly * 12, active: active.length, overdue };
  }, [items]);

  const multiplier = viewMode === 'yearly' ? 12 : 1;

  const handleAdd = async () => {
    if (!form.name || !form.amount) return;
    const nextDue = new Date();
    nextDue.setDate(parseInt(form.due_day) || 1);
    if (nextDue < new Date()) nextDue.setMonth(nextDue.getMonth() + 1);

    try {
      await createItem.mutateAsync({
        name: form.name,
        type: form.type as any,
        category_id: form.category_id || null,
        account_id: form.account_id || null,
        amount: parseFloat(form.amount),
        currency: form.currency,
        frequency: form.frequency as any,
        due_day: parseInt(form.due_day) || 1,
        next_due_date: nextDue.toISOString().split('T')[0],
        notes: form.notes || null,
      });
      toast.success('Added recurring expense');
      setShowAdd(false);
      setForm({ name: '', type: 'subscription', category_id: '', account_id: '', amount: '', currency: 'USD', frequency: 'monthly', due_day: '1', notes: '' });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleConfirmPaid = async (item: any) => {
    const rec = reconciled[item.id];
    try {
      await updateItem.mutateAsync({
        id: item.id,
        status: 'paid',
        last_paid_date: rec?.txDate || new Date().toISOString().split('T')[0],
        last_matched_transaction_id: rec?.txId || null,
        next_due_date: addMonths(new Date(item.next_due_date || new Date()), item.frequency === 'monthly' ? 1 : item.frequency === 'quarterly' ? 3 : item.frequency === 'yearly' ? 12 : 1).toISOString().split('T')[0],
      });
      toast.success(`${item.name} marked as paid`);
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Recurring Expenses</h1>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Recurring Expense</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Netflix, Gym, Rent..." className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="subscription">Subscription</SelectItem>
                      <SelectItem value="fixed_cost">Fixed Cost</SelectItem>
                      <SelectItem value="tax_fee">Tax / Fee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Frequency</Label>
                  <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-1" /></div>
                <div><Label>Currency</Label>
                  <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ARS">ARS</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Category</Label>
                  <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Account</Label>
                  <Select value={form.account_id} onValueChange={v => setForm(f => ({ ...f, account_id: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Due Day (of month)</Label><Input type="number" min="1" max="31" value={form.due_day} onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} className="mt-1" /></div>
              <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
              <Button className="w-full" onClick={handleAdd} disabled={createItem.isPending}>Add Recurring Expense</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* View toggle + filters */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-xl overflow-hidden border">
          <Button variant={viewMode === 'monthly' ? 'secondary' : 'ghost'} size="sm" className="rounded-none h-8 text-xs" onClick={() => setViewMode('monthly')}>Monthly</Button>
          <Button variant={viewMode === 'yearly' ? 'secondary' : 'ghost'} size="sm" className="rounded-none h-8 text-xs" onClick={() => setViewMode('yearly')}>Yearly</Button>
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="subscription">Subscriptions</SelectItem>
            <SelectItem value="fixed_cost">Fixed Costs</SelectItem>
            <SelectItem value="tax_fee">Taxes & Fees</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs opacity-80">Est. {viewMode === 'yearly' ? 'Yearly' : 'Monthly'}</p>
            <p className="text-2xl font-extrabold mt-0.5">{formatUSD(viewMode === 'yearly' ? totals.yearly : totals.monthly)}</p>
            <p className="text-[10px] opacity-70 mt-1">{totals.active} active · {viewMode === 'yearly' ? formatUSD(totals.monthly) + '/mo' : formatUSD(totals.yearly) + '/yr'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
            <p className="text-2xl font-extrabold text-foreground">{totals.overdue}</p>
            <p className="text-[10px] text-muted-foreground mt-1">items need attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Grouped list */}
      {Object.entries(grouped).map(([type, typeItems]) => {
        const cfg = TYPE_LABELS[type] || TYPE_LABELS.subscription;
        const Icon = cfg.icon;
        return (
          <div key={type} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">{cfg.label}</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">{typeItems.length}</Badge>
            </div>
            {typeItems.map(item => {
              const cat = (item as any).categories;
              const acc = (item as any).accounts;
              const brand = getBrandLogo(item.name);
              const initials = getInitialsColor(item.name);
              const rec = reconciled[item.id];
              const isOverdue = item.next_due_date && isBefore(new Date(item.next_due_date), new Date()) && item.status !== 'paid';
              const statusKey = isOverdue ? 'overdue' : item.status;
              const st = STATUS_CONFIG[statusKey] || STATUS_CONFIG.expected;
              const StIcon = st.icon;

              return (
                <Card key={item.id} className={isOverdue ? 'border-destructive/30' : ''}>
                  <CardContent className="flex items-center gap-3 py-3.5">
                    {brand ? (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${brand.bg}`}>{brand.icon}</div>
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${initials.bg} ${initials.text}`}>
                        {item.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                        <Badge variant={st.variant} className="text-[9px] h-4 px-1.5 flex items-center gap-0.5">
                          <StIcon className="h-2.5 w-2.5" />{st.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-xs text-muted-foreground">
                        {cat && <span>{cat.icon} {cat.name}</span>}
                        {acc && <><span>·</span><span>{acc.name}</span></>}
                        {item.next_due_date && <><span>·</span><span className="flex items-center gap-0.5"><CalendarDays className="h-3 w-3" />Due {format(new Date(item.next_due_date + 'T12:00:00'), 'MMM d')}</span></>}
                      </div>
                      {rec?.matched && (
                        <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Matched tx on {rec.txDate} ({formatCurrency(rec.txAmount!, item.currency)})
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="text-sm font-bold text-foreground tabular-nums">
                        {formatCurrency(Math.abs(Number(item.amount)) * (viewMode === 'yearly' && item.frequency === 'monthly' ? 12 : viewMode === 'yearly' && item.frequency === 'quarterly' ? 4 : viewMode === 'yearly' && item.frequency === 'weekly' ? 52 : 1), item.currency)}
                      </p>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 capitalize">{item.frequency}</Badge>
                    </div>
                  </CardContent>
                  {(isOverdue || item.status === 'expected') && (
                    <div className="px-4 pb-3 flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => handleConfirmPaid(item)}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Paid
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteItem.mutateAsync(item.id).then(() => toast.success('Deleted'))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Repeat className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No recurring expenses yet.</p>
          <p className="text-sm text-muted-foreground/70">Add subscriptions, fixed costs, and taxes to track them here.</p>
        </div>
      )}
    </div>
  );
}
