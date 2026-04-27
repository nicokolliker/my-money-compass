import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRecurringExpenses, useCreateRecurringExpense, useUpdateRecurringExpense, useDeleteRecurringExpense } from '@/hooks/useRecurringExpenses';
import { useTransactions } from '@/hooks/useTransactions';
import { useDerivedInstances } from '@/hooks/useRecurringInstances';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { useFxRates } from '@/hooks/useFxRates';
import { formatCurrency, formatUSD } from '@/lib/constants';
import { toMonthlyAmount, isDerivedPaid, toUSD, deriveInstanceState, type FxRateRow, type DerivedInstanceState } from '@/lib/money';
import { getBrandLogo, getInitialsColor } from '@/lib/brandLogos';
import { Plus, Trash2, CheckCircle2, AlertCircle, Clock, CalendarDays, Repeat, Building, FileText, CreditCard, Wallet, TrendingUp, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { format, isBefore, addMonths, addYears, addWeeks } from 'date-fns';
import { DemoDataBanner } from '@/components/DemoDataBanner';
import { useDemoData } from '@/hooks/useDemoData';
import RecurringTracking from '@/components/recurring/RecurringTracking';
import { RecurringStatusBadge } from '@/components/recurring/RecurringStatusBadge';

const TYPE_LABELS: Record<string, { label: string; icon: typeof Repeat }> = {
  subscription: { label: 'Subscriptions', icon: Repeat },
  fixed_cost: { label: 'Fixed Costs', icon: Building },
  tax_fee: { label: 'Taxes & Fees', icon: FileText },
};

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }> = {
  paid: { label: 'Paid', variant: 'default', icon: CheckCircle2 },
  expected: { label: 'Pending', variant: 'secondary', icon: Clock },
  overdue: { label: 'Overdue', variant: 'destructive', icon: AlertCircle },
  missing: { label: 'Missing', variant: 'outline', icon: AlertCircle },
};

function getNextDate(current: Date, frequency: string): Date {
  switch (frequency) {
    case 'weekly': return addWeeks(current, 1);
    case 'quarterly': return addMonths(current, 3);
    case 'yearly': return addYears(current, 1);
    default: return addMonths(current, 1);
  }
}

// Monthly normalization lives in lib/money (toMonthlyAmount)

export default function RecurringExpenses({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: items, isLoading, error: itemsError } = useRecurringExpenses();
  const { data: transactions } = useTransactions();
  const { data: instances, error: instancesError } = useDerivedInstances();
  if (instancesError) console.error('Recurring instances error:', instancesError);
  const { data: categories } = useCategories();
  const { data: accounts } = useAccounts();
  const { data: fxRates } = useFxRates();
  const createItem = useCreateRecurringExpense();
  const updateItem = useUpdateRecurringExpense();
  const deleteItem = useDeleteRecurringExpense();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');
  const [activeTab, setActiveTab] = useState('all');
  const { hasDemoData, onCleared: onDemoCleared } = useDemoData();

  const emptyForm = {
    name: '', type: 'subscription', category_id: '', account_id: '', amount: '',
    currency: 'USD', frequency: 'monthly', due_day: '1', notes: '', end_date: '', renewal_notes: '',
  };
  const [form, setForm] = useState(emptyForm);

  // Per-item derived state from canonical recurring_instances.
  // Picks the most relevant instance: latest paid/matched OR nearest upcoming/missing.
  const reconciled = useMemo(() => {
    if (!items || !instances) return {};
    const map: Record<string, {
      derived: DerivedInstanceState;
      txId?: string;
      txDate?: string;
      txAmount?: number;
      diff?: number;
    }> = {};
    items.forEach(item => {
      const own = instances.filter(i => i.recurring_id === item.id);
      // Prefer latest paid; else nearest upcoming/needs_review; else most recent missing.
      const paid = own.filter(i => isDerivedPaid(i.derived))
        .sort((a, b) => (b.expected_date > a.expected_date ? 1 : -1))[0];
      const upcoming = own.filter(i => i.derived === 'upcoming' || i.derived === 'needs_review')
        .sort((a, b) => (a.expected_date > b.expected_date ? 1 : -1))[0];
      const missing = own.filter(i => i.derived === 'missing')
        .sort((a, b) => (b.expected_date > a.expected_date ? 1 : -1))[0];
      const pick = paid || upcoming || missing;
      if (!pick) { map[item.id] = { derived: 'upcoming' }; return; }
      const tx = (pick as any).transactions;
      const expected = Math.abs(Number(item.amount));
      map[item.id] = {
        derived: pick.derived,
        txId: tx?.id,
        txDate: tx?.date,
        txAmount: tx ? Math.abs(Number(tx.amount)) : undefined,
        diff: tx ? Math.abs(Number(tx.amount)) - expected : undefined,
      };
    });
    return map;
  }, [items, instances]);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (activeTab === 'all') return items;
    return items.filter(i => i.type === activeTab);
  }, [items, activeTab]);

  const totals = useMemo(() => {
    if (!items) return { monthly: 0, yearly: 0, active: 0, overdue: 0, subMonthly: 0, fixedMonthly: 0 };
    const active = items.filter(i => i.is_active);
    let monthly = 0, subMonthly = 0, fixedMonthly = 0;
    active.forEach(i => {
      const m = toMonthlyAmount(Math.abs(Number(i.amount)), i.frequency);
      monthly += m;
      if (i.type === 'subscription') subMonthly += m;
      else fixedMonthly += m;
    });
    // "Overdue" label = derived `missing` state
    const overdue = (instances || []).filter(i => i.derived === 'missing').length;
    return { monthly, yearly: monthly * 12, active: active.length, overdue, subMonthly, fixedMonthly };
  }, [items, instances]);

  const monthIncome = useMemo(() => {
    if (!transactions) return 0;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return Math.abs(transactions.filter(t => t.type === 'income' && t.date >= monthStart).reduce((s, t) => s + Number(t.amount_usd), 0));
  }, [transactions]);

  const incomePercent = monthIncome > 0 ? (totals.monthly / monthIncome * 100) : 0;

  const openEdit = (item: any) => {
    setForm({
      name: item.name, type: item.type, category_id: item.category_id || '',
      account_id: item.account_id || '', amount: String(Math.abs(Number(item.amount))),
      currency: item.currency, frequency: item.frequency, due_day: String(item.due_day || 1),
      notes: item.notes || '', end_date: item.end_date || '', renewal_notes: item.renewal_notes || '',
    });
    setEditingId(item.id);
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.amount) return;
    const nextDue = new Date();
    nextDue.setDate(parseInt(form.due_day) || 1);
    if (nextDue < new Date()) nextDue.setMonth(nextDue.getMonth() + 1);

    const payload: any = {
      name: form.name, type: form.type, category_id: form.category_id || null,
      account_id: form.account_id || null, amount: parseFloat(form.amount),
      currency: form.currency, frequency: form.frequency,
      due_day: parseInt(form.due_day) || 1, notes: form.notes || null,
      end_date: form.end_date || null, renewal_notes: form.renewal_notes || null,
    };

    try {
      if (editingId) {
        await updateItem.mutateAsync({ id: editingId, ...payload });
        toast.success('Updated');
      } else {
        await createItem.mutateAsync({ ...payload, next_due_date: nextDue.toISOString().split('T')[0] });
        toast.success('Added');
      }
      setShowAdd(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleConfirmPaid = async (item: any) => {
    const rec = reconciled[item.id];
    try {
      await updateItem.mutateAsync({
        id: item.id, status: 'paid',
        last_paid_date: rec?.txDate || new Date().toISOString().split('T')[0],
        last_matched_transaction_id: rec?.txId || null,
        next_due_date: getNextDate(new Date(item.next_due_date || new Date()), item.frequency).toISOString().split('T')[0],
      });
      toast.success(`${item.name} marked as paid`);
    } catch (e: any) { toast.error(e.message); }
  };

  const [topTab, setTopTab] = useState<'library' | 'tracking'>('library');

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading recurring expenses...</div>;

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {!embedded && hasDemoData && <DemoDataBanner onCleared={onDemoCleared} />}
      <div className={embedded ? 'flex items-center justify-end' : 'flex items-center justify-between'}>
        {!embedded && <h1 className="text-2xl font-bold text-foreground">Recurring</h1>}
        <Dialog open={showAdd} onOpenChange={o => { setShowAdd(o); if (!o) { setEditingId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Add'} Recurring Expense</DialogTitle></DialogHeader>
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
                <div><Label>Payment Method</Label>
                  <Select value={form.account_id} onValueChange={v => setForm(f => ({ ...f, account_id: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Due Day</Label><Input type="number" min="1" max="31" value={form.due_day} onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} className="mt-1" /></div>
                <div><Label>End Date (optional)</Label><Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="mt-1" /></div>
              </div>
              <div><Label>Renewal Notes</Label><Input value={form.renewal_notes} onChange={e => setForm(f => ({ ...f, renewal_notes: e.target.value }))} placeholder="e.g. Renews yearly in March" className="mt-1" /></div>
              <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
              <Button className="w-full" onClick={handleSave} disabled={createItem.isPending || updateItem.isPending}>
                {editingId ? 'Save Changes' : 'Add Recurring Expense'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={topTab} onValueChange={(v) => setTopTab(v as any)}>
        <TabsList className="w-full">
          <TabsTrigger value="library" className="flex-1">Library</TabsTrigger>
          <TabsTrigger value="tracking" className="flex-1">Tracking (Expected vs Actual)</TabsTrigger>
        </TabsList>
        <TabsContent value="tracking" className="mt-4">
          <RecurringTracking />
        </TabsContent>
        <TabsContent value="library" className="mt-4 space-y-5">

      {/* View toggle */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-xl overflow-hidden border">
          <Button variant={viewMode === 'monthly' ? 'secondary' : 'ghost'} size="sm" className="rounded-none h-8 text-xs" onClick={() => setViewMode('monthly')}>Monthly</Button>
          <Button variant={viewMode === 'yearly' ? 'secondary' : 'ghost'} size="sm" className="rounded-none h-8 text-xs" onClick={() => setViewMode('yearly')}>Yearly</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs opacity-80">Est. {viewMode === 'yearly' ? 'Yearly' : 'Monthly'}</p>
            <p className="text-2xl font-extrabold mt-0.5">{formatUSD(viewMode === 'yearly' ? totals.yearly : totals.monthly)}</p>
            <p className="text-[10px] opacity-70 mt-1">{totals.active} active · {incomePercent > 0 ? `${incomePercent.toFixed(0)}% of income` : ''}</p>
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

      {/* Financial Impact Breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Financial Impact</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2"><Repeat className="h-3.5 w-3.5 text-primary" /><span className="text-muted-foreground">Subscriptions</span></div>
            <span className="font-semibold text-foreground tabular-nums">{formatUSD(viewMode === 'yearly' ? totals.subMonthly * 12 : totals.subMonthly)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2"><Building className="h-3.5 w-3.5 text-primary" /><span className="text-muted-foreground">Fixed Costs</span></div>
            <span className="font-semibold text-foreground tabular-nums">{formatUSD(viewMode === 'yearly' ? totals.fixedMonthly * 12 : totals.fixedMonthly)}</span>
          </div>
          {monthIncome > 0 && (
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">% of Income</span>
                <span className={`font-bold ${incomePercent > 70 ? 'text-destructive' : incomePercent > 50 ? 'text-amber-500' : 'text-success'}`}>
                  {incomePercent.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(incomePercent, 100)}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs by type */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
          <TabsTrigger value="subscription" className="flex-1 text-xs">Subscriptions</TabsTrigger>
          <TabsTrigger value="fixed_cost" className="flex-1 text-xs">Fixed</TabsTrigger>
          <TabsTrigger value="tax_fee" className="flex-1 text-xs">Taxes</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Items list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Repeat className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No recurring expenses yet.</p>
          </div>
        )}
        {filtered.map(item => {
          const cat = (item as any).categories;
          const acc = (item as any).accounts;
          const pm = (item as any).payment_methods;
          const brand = getBrandLogo(item.name);
          const initials = getInitialsColor(item.name);
          const rec = reconciled[item.id];
          const derived: DerivedInstanceState = rec?.derived || 'upcoming';
          const isPaid = isDerivedPaid(derived);
          const isMissing = derived === 'missing';
          const monthlyAmt = toMonthlyAmount(Math.abs(Number(item.amount)), item.frequency);
          const usd = toUSD(Math.abs(Number(item.amount)), item.currency, fxRates as FxRateRow[] | undefined);

          return (
            <Card key={item.id} className={isMissing ? 'border-destructive/30' : isPaid ? 'border-success/30' : derived === 'needs_review' ? 'border-amber-500/30' : ''}>
              <CardContent className="flex items-center gap-3 py-3.5">
                {brand ? (
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${brand.bg}`}>{brand.icon}</div>
                ) : cat?.icon ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: cat.color ? `hsl(${cat.color} / 0.15)` : undefined }}>
                    {cat.icon}
                  </div>
                ) : (
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${initials.bg} ${initials.text}`}>
                    {item.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                    <RecurringStatusBadge state={derived} />
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-xs text-muted-foreground">
                    {cat && <span>{cat.icon} {cat.name}</span>}
                    {pm && <><span>·</span><span className="flex items-center gap-0.5"><CreditCard className="h-3 w-3" />{pm.name}</span></>}
                    {acc && <><span>·</span><span className="flex items-center gap-0.5"><Wallet className="h-3 w-3" />{acc.name}</span></>}
                    {item.next_due_date && <><span>·</span><span className="flex items-center gap-0.5"><CalendarDays className="h-3 w-3" />Due {format(new Date(item.next_due_date + 'T12:00:00'), 'MMM d')}</span></>}
                  </div>
                  {/* Reconciliation info */}
                  {isPaid && rec?.txDate && (
                    <p className="text-[10px] text-success mt-0.5 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Matched {format(new Date(rec.txDate + 'T12:00:00'), 'MMM d')} · {formatCurrency(rec.txAmount!, item.currency)}
                      {rec.diff !== undefined && Math.abs(rec.diff) > 0.01 && (
                        <span className={rec.diff > 0 ? 'text-destructive' : 'text-success'}>
                          ({rec.diff > 0 ? '+' : ''}{formatCurrency(rec.diff, item.currency)})
                        </span>
                      )}
                    </p>
                  )}
                  {isMissing && (
                    <p className="text-[10px] text-destructive mt-0.5">No matching transaction found</p>
                  )}
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-sm font-bold text-foreground tabular-nums">
                    {formatCurrency(Math.abs(Number(item.amount)), item.currency)}
                  </p>
                  {item.currency !== 'USD' && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">~{formatUSD(usd)}</p>
                  )}
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 capitalize">{item.frequency}</Badge>
                </div>
              </CardContent>
              <div className="px-4 pb-3 flex gap-2">
                {!isPaid && (
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => handleConfirmPaid(item)}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Paid
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(item)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteItem.mutateAsync(item.id).then(() => toast.success('Deleted'))}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
