import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRecurringExpenses, useCreateRecurringExpense, useUpdateRecurringExpense, useDeleteRecurringExpense } from '@/hooks/useRecurringExpenses';
import { useTransactions } from '@/hooks/useTransactions';
import { useDerivedInstances } from '@/hooks/useRecurringInstances';
import { useCategories, useSubcategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { useFxRates } from '@/hooks/useFxRates';
import { useCategoryTree } from '@/hooks/useCategoryTree';
import { formatUSD } from '@/lib/constants';
import { toMonthlyAmount, isDerivedPaid, toUSD, type FxRateRow, type DerivedInstanceState } from '@/lib/money';
import { Plus, Trash2, Pencil, Repeat, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { format, addMonths, addYears, addWeeks } from 'date-fns';
import { DemoDataBanner } from '@/components/DemoDataBanner';
import { MerchantLogo } from '@/components/MerchantLogo';
import { useDemoData } from '@/hooks/useDemoData';
import RecurringTracking from '@/components/recurring/RecurringTracking';

// Status badge tones (Library list)
const STATUS_STYLES: Record<DerivedInstanceState | 'none', { label: string; bg: string; color: string }> = {
  matched:      { label: 'Matched',  bg: '#EAF3DE', color: '#3B6D11' },
  paid_manual:  { label: 'Matched',  bg: '#EAF3DE', color: '#3B6D11' },
  upcoming:     { label: 'Upcoming', bg: '#FAEEDA', color: '#854F0B' },
  needs_review: { label: 'Upcoming', bg: '#FAEEDA', color: '#854F0B' },
  missing:      { label: 'Missing',  bg: '#FCEBEB', color: '#A32D2D' },
  none:         { label: 'Sin instancias', bg: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
};

// Map legacy string `type` values to category names (for migration of unlinked items)
const LEGACY_TYPE_TO_NAME: Record<string, string> = {
  casa: 'Casa', auto: 'Auto', salud: 'Salud',
  personal_care: 'Personal Care', obligaciones: 'Obligaciones',
  ocio: 'Ocio', digital: 'Digital',
};

// Digital subcategory labels + name-based matching (legacy items have null subtype)
const DIGITAL_SUBTYPES: Record<string, { label: string; icon: string }> = {
  ia:                 { label: 'IA',                          icon: '🤖' },
  creatividad:        { label: 'Creatividad & Productividad', icon: '🎨' },
  entretenimiento:    { label: 'Entretenimiento',             icon: '🎬' },
  delivery_movilidad: { label: 'Delivery & Movilidad',        icon: '🚚' },
  otros:              { label: 'Otros',                       icon: '✨' },
};

const DIGITAL_NAME_MAP: Record<string, string[]> = {
  ia: ['chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'openai', 'google ai', 'midjourney', 'runway', 'gamma', 'notebooklm'],
  entretenimiento: ['netflix', 'spotify', 'youtube', 'amazon prime', 'disney', 'hbo', 'apple tv', 'paramount', 'crunchyroll', 'blinkist'],
  creatividad: ['adobe', 'figma', 'canva', 'notion', 'loom', 'grammarly', 'icloud', 'apple one'],
  delivery_movilidad: ['uber', 'didi', 'rappi', 'pedidos ya', 'glovo', 'cabify'],
};

const getDigitalSubtype = (name: string): string => {
  const lower = (name || '').toLowerCase();
  for (const [key, patterns] of Object.entries(DIGITAL_NAME_MAP)) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  return 'otros';
};

function getNextDate(current: Date, frequency: string): Date {
  switch (frequency) {
    case 'weekly': return addWeeks(current, 1);
    case 'quarterly': return addMonths(current, 3);
    case 'yearly': return addYears(current, 1);
    default: return addMonths(current, 1);
  }
}

function monthBounds() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { start, end };
}

export default function RecurringExpenses({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: items, isLoading, error: itemsError } = useRecurringExpenses();
  const { data: transactions } = useTransactions();
  const { data: instances, error: instancesError } = useDerivedInstances();
  if (instancesError) console.error('Recurring instances error:', instancesError);
  const { data: categories } = useCategories();
  const { data: allSubcategories } = useSubcategories();
  const { data: accounts } = useAccounts();
  const { data: fxRates } = useFxRates();
  const { tree } = useCategoryTree();
  const createItem = useCreateRecurringExpense();
  const updateItem = useUpdateRecurringExpense();
  const deleteItem = useDeleteRecurringExpense();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<'library' | 'tracking'>('library');
  const [digitalExpanded, setDigitalExpanded] = useState(false);
  const [digitalSubExpanded, setDigitalSubExpanded] = useState(false);
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Record<string, boolean>>({});
  const toggleSubgroup = (key: string) => setCollapsedSubgroups(v => ({ ...v, [key]: !v[key] }));
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (id: string) => setCollapsedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  const { hasDemoData, onCleared: onDemoCleared } = useDemoData();

  const emptyForm = {
    name: '', type: '', subtype: '', account_id: '', amount: '',
    currency: 'USD', frequency: 'monthly', due_day: '1', notes: '', end_date: '', renewal_notes: '',
  };
  const [form, setForm] = useState(emptyForm);

  const fxList = fxRates as FxRateRow[] | undefined;
  const { start: monthStart, end: monthEnd } = monthBounds();

  // Resolve a category id for any item (linked or via legacy type)
  const itemCategoryId = useMemo(() => {
    const map: Record<string, string | null> = {};
    if (!items) return map;
    items.forEach(i => {
      let cid: string | null = (i as any).linked_category_id || null;
      if (!cid) {
        const legacyName = LEGACY_TYPE_TO_NAME[i.type];
        if (legacyName) cid = tree.find(c => c.name === legacyName)?.id || null;
      }
      map[i.id] = cid;
    });
    return map;
  }, [items, tree]);

  const selectedCategory = tree.find(c => c.id === form.type);
  const isDigitalForm = selectedCategory?.isDigital;
  const digitalSubcats = useMemo(() => {
    if (!selectedCategory?.isDigital) return [];
    return (allSubcategories || []).filter(s => s.category_id === selectedCategory.id);
  }, [selectedCategory, allSubcategories]);

  // ----- Top metrics -----
  const totalFijosUsd = useMemo(() => {
    if (!items) return 0;
    return items.filter(i => i.is_active).reduce((s, i) => {
      const m = toMonthlyAmount(Math.abs(Number(i.amount)), i.frequency);
      return s + toUSD(m, i.currency, fxList);
    }, 0);
  }, [items, fxList]);

  const monthInstances = useMemo(() => {
    if (!instances) return [];
    return instances.filter(i => i.expected_date >= monthStart && i.expected_date <= monthEnd);
  }, [instances, monthStart, monthEnd]);

  const pagadoMesUsd = useMemo(() => {
    return monthInstances
      .filter(i => isDerivedPaid(i.derived))
      .reduce((s, i) => s + toUSD(Number(i.expected_amount), i.expected_currency, fxList), 0);
  }, [monthInstances, fxList]);

  const pendienteMesUsd = useMemo(() => {
    return monthInstances
      .filter(i => i.derived === 'upcoming' || i.derived === 'needs_review' || i.derived === 'missing')
      .reduce((s, i) => s + toUSD(Number(i.expected_amount), i.expected_currency, fxList), 0);
  }, [monthInstances, fxList]);

  const monthIncome = useMemo(() => {
    if (!transactions) return 0;
    return Math.abs(transactions
      .filter(t => t.type === 'income' && t.date >= monthStart && t.date <= monthEnd)
      .reduce((s, t) => s + Number(t.amount_usd), 0));
  }, [transactions, monthStart, monthEnd]);

  const disponibleUsd = monthIncome - totalFijosUsd;

  // ----- Breakdown by category -----
  const breakdown = useMemo(() => {
    const map: Record<string, number> = {};
    tree.forEach(c => { map[c.id] = 0; });
    (items || []).filter(i => i.is_active).forEach(i => {
      const cid = itemCategoryId[i.id];
      if (!cid) return;
      const m = toMonthlyAmount(Math.abs(Number(i.amount)), i.frequency);
      map[cid] = (map[cid] || 0) + toUSD(m, i.currency, fxList);
    });
    return map;
  }, [items, itemCategoryId, fxList, tree]);

  // ----- Timeline del mes -----
  const timeline = useMemo(() => {
    if (!items || !monthInstances.length) return [];
    const itemMap: Record<string, any> = {};
    items.forEach(i => { itemMap[i.id] = i; });
    return [...monthInstances]
      .sort((a, b) => (a.expected_date > b.expected_date ? 1 : -1))
      .map(i => ({ instance: i, item: itemMap[i.recurring_id] }));
  }, [items, monthInstances]);

  // ----- Per-item state -----
  const itemState = useMemo(() => {
    const map: Record<string, DerivedInstanceState | 'none'> = {};
    if (!items) return map;
    items.forEach(item => {
      const own = (instances || []).filter(i => i.recurring_id === item.id);
      if (!own.length) { map[item.id] = 'none'; return; }
      const paid = own.filter(i => isDerivedPaid(i.derived))
        .sort((a, b) => (b.expected_date > a.expected_date ? 1 : -1))[0];
      const upcoming = own.filter(i => i.derived === 'upcoming' || i.derived === 'needs_review')
        .sort((a, b) => (a.expected_date > b.expected_date ? 1 : -1))[0];
      const missing = own.filter(i => i.derived === 'missing')
        .sort((a, b) => (b.expected_date > a.expected_date ? 1 : -1))[0];
      const pick = paid || upcoming || missing;
      map[item.id] = pick ? pick.derived : 'none';
    });
    return map;
  }, [items, instances]);

  // ----- Grouped list by category id -----
  const grouped = useMemo(() => {
    const g: Record<string, { items: any[]; totalUsd: number }> = {};
    tree.forEach(c => { g[c.id] = { items: [], totalUsd: 0 }; });
    (items || []).forEach(i => {
      const cid = itemCategoryId[i.id];
      if (!cid || !g[cid]) return;
      g[cid].items.push(i);
      if (i.is_active) {
        const m = toMonthlyAmount(Math.abs(Number(i.amount)), i.frequency);
        g[cid].totalUsd += toUSD(m, i.currency, fxList);
      }
    });
    return g;
  }, [items, itemCategoryId, fxList, tree]);

  const subcatNameById = useMemo(() => {
    const m: Record<string, string> = {};
    (allSubcategories || []).forEach(s => { m[s.id] = s.name; });
    return m;
  }, [allSubcategories]);

  const openEdit = (item: any) => {
    const cid = itemCategoryId[item.id] || (tree[0]?.id ?? '');
    setForm({
      name: item.name,
      type: cid,
      subtype: item.subtype || '',
      account_id: item.account_id || '',
      amount: String(Math.abs(Number(item.amount))),
      currency: item.currency, frequency: item.frequency, due_day: String(item.due_day || 1),
      notes: item.notes || '', end_date: item.end_date || '', renewal_notes: item.renewal_notes || '',
    });
    setEditingId(item.id);
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.amount || !form.type) return;
    const cat = tree.find(c => c.id === form.type);
    if (!cat) return;
    const nextDue = new Date();
    nextDue.setDate(parseInt(form.due_day) || 1);
    if (nextDue < new Date()) nextDue.setMonth(nextDue.getMonth() + 1);

    const payload: any = {
      name: form.name,
      type: cat.name.toLowerCase().replace(/\s+/g, '_'),
      subtype: cat.isDigital ? (form.subtype || null) : null,
      category_id: cat.id,
      linked_category_id: cat.id,
      account_id: form.account_id || null,
      amount: parseFloat(form.amount),
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

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading recurring expenses...</div>;

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {!embedded && hasDemoData && <DemoDataBanner onCleared={onDemoCleared} />}
      <div className={embedded ? 'flex items-center justify-end' : 'flex items-center justify-between'}>
        {!embedded && <h1 className="text-2xl font-bold text-foreground">Recurring</h1>}
        <Dialog open={showAdd} onOpenChange={o => { setShowAdd(o); if (!o) { setEditingId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => { if (!form.type && tree[0]) setForm(f => ({ ...f, type: tree[0].id })); }}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Add'} Recurring Expense</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Netflix, Gym, Rent..." className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v, subtype: '' }))}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {tree.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                      ))}
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
              {isDigitalForm && digitalSubcats.length > 0 && (
                <div>
                  <Label>Subcategoría</Label>
                  <Select value={form.subtype} onValueChange={v => setForm(f => ({ ...f, subtype: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar subcategoría" /></SelectTrigger>
                    <SelectContent>
                      {digitalSubcats.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
              <div>
                <Label>Payment Method</Label>
                <Select value={form.account_id} onValueChange={v => setForm(f => ({ ...f, account_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>)}</SelectContent>
                </Select>
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

          {itemsError && <p className="text-destructive text-sm text-center py-4">Error loading: {(itemsError as any).message}</p>}

          {/* Top metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total fijos" value={formatUSD(totalFijosUsd)} hint="monthly · USD" />
            <MetricCard label="Pagado este mes" value={formatUSD(pagadoMesUsd)} hint={`${monthInstances.filter(i => isDerivedPaid(i.derived)).length} matched`} valueColor="#3B6D11" />
            <MetricCard label="Pendiente" value={formatUSD(pendienteMesUsd)} hint={`${monthInstances.filter(i => i.derived !== 'matched' && i.derived !== 'paid_manual').length} items`} valueColor="#854F0B" />
            <MetricCard label="Disponible" value={formatUSD(disponibleUsd)} hint={monthIncome > 0 ? `income ${formatUSD(monthIncome)}` : 'no income tracked'} valueColor={disponibleUsd < 0 ? '#A32D2D' : undefined} />
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Breakdown */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Breakdown por tipo</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {tree.map(c => {
                  const v = breakdown[c.id] || 0;
                  if (v === 0 && grouped[c.id]?.items.length === 0) return null;
                  const pct = totalFijosUsd > 0 ? (v / totalFijosUsd) * 100 : 0;

                  if (c.isDigital) {
                    const digitalItems = (items || []).filter(i => i.is_active && itemCategoryId[i.id] === c.id);
                    return (
                      <div key={c.id}>
                        <div
                          className="flex items-center justify-between text-sm cursor-pointer"
                          style={{ userSelect: 'none' }}
                          onClick={() => setDigitalExpanded(v => !v)}
                        >
                          <div className="flex items-center gap-2 min-w-0 pointer-events-none">
                            <span className="text-foreground truncate font-medium">{c.icon} {c.name}</span>
                            <ChevronDown
                              className="h-3.5 w-3.5 text-muted-foreground"
                              style={{ transform: digitalExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                            />
                          </div>
                          <div className="flex items-center gap-2 shrink-0 pointer-events-none">
                            <span className="text-xs text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                            <span className="font-semibold tabular-nums text-foreground">{formatUSD(v)}</span>
                          </div>
                        </div>
                        {digitalExpanded && (
                          <div className="mt-1 space-y-1">
                            {c.children.map(sub => {
                              const subItems = digitalItems.filter((i: any) => i.subtype === sub.id);
                              const subTotal = subItems.reduce((s, i: any) => {
                                const m = toMonthlyAmount(Math.abs(Number(i.amount)), i.frequency);
                                return s + toUSD(m, i.currency, fxList);
                              }, 0);
                              return (
                                <div key={sub.id} className="flex items-center justify-between text-sm pl-6">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs text-muted-foreground truncate">{sub.name}</span>
                                    {subItems.length > 0 && <span className="text-[10px] text-muted-foreground">· {subItems.length}</span>}
                                  </div>
                                  <span className="text-xs font-medium tabular-nums text-foreground shrink-0">{formatUSD(subTotal)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-foreground truncate">{c.icon} {c.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                        <span className="font-semibold tabular-nums text-foreground">{formatUSD(v)}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Timeline del mes</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {timeline.length === 0 && <p className="text-xs text-muted-foreground py-2">Sin instancias este mes.</p>}
                {timeline.map(({ instance, item }) => {
                  const dot =
                    isDerivedPaid(instance.derived) ? '#3B6D11' :
                    instance.derived === 'missing' ? '#A32D2D' :
                    '#D97706';
                  return (
                    <div key={instance.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                        <span className="text-xs text-muted-foreground tabular-nums w-12 shrink-0">{format(new Date(instance.expected_date + 'T12:00:00'), 'MMM d')}</span>
                        <span className="text-foreground truncate">{item?.name || '—'}</span>
                      </div>
                      <span className="font-semibold tabular-nums text-foreground shrink-0">
                        {formatUSD(toUSD(Number(instance.expected_amount), instance.expected_currency, fxList))}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Grouped list by category */}
          <div className="space-y-4">
            {tree.map(c => {
              const group = grouped[c.id];
              if (!group || group.items.length === 0) return null;
              const collapsed = !!collapsedGroups[c.id];
              return (
                <div key={c.id} className="space-y-2">
                  <div
                    className="flex items-center justify-between px-1 cursor-pointer select-none"
                    onClick={() => toggleGroup(c.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-base bg-muted">{c.icon}</span>
                      <span className="font-semibold text-foreground text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground">· {group.items.length}</span>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`} />
                    </div>
                    <span className="text-sm font-bold tabular-nums text-foreground">{formatUSD(group.totalUsd)}</span>
                  </div>
                  {!collapsed && (
                  <div className="space-y-2">
                    {c.isDigital ? (
                      Object.entries(DIGITAL_SUBTYPES).map(([subKey, sub]) => {
                        const subItems = group.items.filter((i: any) => getDigitalSubtype(i.name) === subKey);
                        if (subItems.length === 0) return null;
                        const subTotal = subItems.reduce((s: number, i: any) => {
                          const amountUsd = toUSD(Math.abs(Number(i.amount)), i.currency || 'USD', fxList);
                          return s + toMonthlyAmount(amountUsd, i.frequency);
                        }, 0);
                        const subCollapsed = !!collapsedSubgroups[subKey];
                        return (
                          <div key={subKey} className="space-y-2 ml-3 pl-3 border-l-2 border-border/40">
                            <div
                              className="flex items-center justify-between px-1 cursor-pointer select-none"
                              onClick={() => toggleSubgroup(subKey)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-sm bg-muted">{sub.icon}</span>
                                <span className="font-medium text-foreground text-sm">{sub.label}</span>
                                <span className="text-xs text-muted-foreground">· {subItems.length}</span>
                                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${subCollapsed ? '' : 'rotate-180'}`} />
                              </div>
                              <span className="text-sm font-semibold tabular-nums text-foreground">{formatUSD(subTotal)}</span>
                            </div>
                            {!subCollapsed && (
                              <div className="space-y-2">
                                {subItems.map((item: any) => {
                                  const acc = item.accounts;
                                  const state = itemState[item.id] || 'none';
                                  const badge = STATUS_STYLES[state];
                                  return (
                                    <Card key={item.id}>
                                      <CardContent className="flex items-center gap-3 py-3">
                                        <MerchantLogo name={item.name} size={36} />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                                          <p className="text-xs text-muted-foreground truncate">
                                            {acc?.name || '—'} · <span className="capitalize">{item.frequency}</span>
                                          </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="text-sm font-bold text-foreground tabular-nums">
                                            {Number(item.amount).toLocaleString('en-US', { style: 'currency', currency: item.currency, maximumFractionDigits: item.currency === 'ARS' ? 0 : 2 })}
                                          </p>
                                          <span
                                            className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                            style={{ backgroundColor: badge.bg, color: badge.color }}
                                          >
                                            {badge.label}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(item)} aria-label="Edit">
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteItem.mutateAsync(item.id).then(() => toast.success('Deleted'))} aria-label="Delete">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      group.items.map((item: any) => {
                        const acc = item.accounts;
                        const state = itemState[item.id] || 'none';
                        const badge = STATUS_STYLES[state];
                        return (
                          <Card key={item.id}>
                            <CardContent className="flex items-center gap-3 py-3">
                              <MerchantLogo name={item.name} size={36} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {acc?.name || '—'} · <span className="capitalize">{item.frequency}</span>
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold text-foreground tabular-nums">
                                  {Number(item.amount).toLocaleString('en-US', { style: 'currency', currency: item.currency, maximumFractionDigits: item.currency === 'ARS' ? 0 : 2 })}
                                </p>
                                <span
                                  className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: badge.bg, color: badge.color }}
                                >
                                  {badge.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(item)} aria-label="Edit">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteItem.mutateAsync(item.id).then(() => toast.success('Deleted'))} aria-label="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </div>
                  )}
                </div>
              );
            })}

            {(items?.length || 0) === 0 && (
              <div className="text-center py-12">
                <Repeat className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">No recurring expenses yet.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({ label, value, hint, valueColor }: { label: string; value: string; hint?: string; valueColor?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-extrabold mt-0.5 tabular-nums" style={valueColor ? { color: valueColor } : undefined}>{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export { getNextDate };
