import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRules, useCreateRule, useDeleteRule } from '@/hooks/useRules';
import { useCategories } from '@/hooks/useCategories';
import { useFxRates, useCreateFxRate, useDeleteFxRate } from '@/hooks/useFxRates';
import { useBlueDollarRate, useRefreshBlueDollar } from '@/hooks/useBlueDollar';
import { useEurUsdRate } from '@/hooks/useEurUsd';
import { useRuleSuggestions, useIgnoredSuggestions, type RuleSuggestion } from '@/hooks/useRuleSuggestions';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Zap, RefreshCw, DollarSign, ChevronDown, Lightbulb, Repeat, X } from 'lucide-react';
import { toast } from 'sonner';
import CategoriesTab from '@/components/settings/CategoriesTab';
import MerchantsTab from '@/components/settings/MerchantsTab';
import { ResetDataCard } from '@/components/settings/ResetDataCard';

type RulesTab = 'rules' | 'categories' | 'merchants' | 'fx';

export default function Rules({ initialTab }: { initialTab?: RulesTab } = {}) {
  const location = useLocation();
  const tab: RulesTab = initialTab || (location.state as any)?.tab || 'rules';

  const titles: Record<RulesTab, { title: string; subtitle: string }> = {
    rules: { title: 'Rules', subtitle: 'Auto-categorization rules for imported transactions' },
    categories: { title: 'Categories', subtitle: 'Manage your spending categories' },
    merchants: { title: 'Merchants', subtitle: 'Manage merchant names and default categories' },
    fx: { title: 'FX Rates', subtitle: 'Exchange rates for currency conversion' },
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{titles[tab].title}</h1>
        <p className="text-sm text-muted-foreground">{titles[tab].subtitle}</p>
      </div>
      {tab === 'rules' && <RulesPanel />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'merchants' && <MerchantsTab />}
      {tab === 'fx' && <FxRatesPanel />}
    </div>
  );
}

function SuggestionsPanel() {
  const suggestions = useRuleSuggestions();
  const { ignore: ignoreSuggestion } = useIgnoredSuggestions();
  const { data: categories } = useCategories();
  const createRule = useCreateRule();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [, force] = useState(0);

  if (suggestions.length === 0) return null;

  const handleApply = async (s: RuleSuggestion) => {
    try {
      if (s.type === 'category') {
        if (!s.suggestedCategoryId) { toast.error('Categoría no encontrada'); return; }
        await createRule.mutateAsync({ keyword: s.merchant, match_field: 'description', category_id: s.suggestedCategoryId } as any);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('transactions')
            .update({ category_id: s.suggestedCategoryId })
            .eq('user_id', user.id)
            .is('category_id', null)
            .or(`merchant.ilike.%${s.merchant}%,description.ilike.%${s.merchant}%`);
        }
        qc.invalidateQueries({ queryKey: ['transactions'] });
        toast.success(`Regla creada y ${s.count} transacciones categorizadas`);
      } else if (s.type === 'recurring') {
        navigate('/planning/recurring', { state: { prefill: { name: s.merchant, amount: s.avgAmount, currency: s.currency, frequency: 'monthly' } } });
        return;
      } else if (s.type === 'rule') {
        await createRule.mutateAsync({ keyword: s.merchant, match_field: 'description', category_id: s.suggestedCategoryId || null } as any);
        toast.success(`Regla creada para ${s.merchant}`);
      }
      ignoreSuggestion(s.id);
      force(x => x + 1);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleIgnore = (s: RuleSuggestion) => {
    ignoreSuggestion(s.id);
    force(x => x + 1);
  };

  const iconFor = (t: RuleSuggestion['type']) =>
    t === 'category' ? <Lightbulb className="h-4 w-4 text-amber-500" /> :
    t === 'recurring' ? <Repeat className="h-4 w-4 text-primary" /> :
    <Zap className="h-4 w-4 text-purple-500" />;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-primary/20">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-3">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                Sugerencias
                <Badge className="ml-1 h-5">{suggestions.length}</Badge>
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-2 pt-0">
            {suggestions.slice(0, 20).map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card/50">
                {iconFor(s.type)}
                <p className="flex-1 text-xs text-foreground">{s.message}</p>
                <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleApply(s)}>Aplicar</Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleIgnore(s)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function RulesPanel() {
  const { data: rules, isLoading } = useRules();
  const { data: categories } = useCategories();
  const createRule = useCreateRule();
  const deleteRule = useDeleteRule();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ keyword: '', match_field: 'description', category_id: '', mark_as_subscription: false });

  const handleSave = async () => {
    try {
      await createRule.mutateAsync({ ...form, category_id: form.category_id || null } as any);
      toast.success('Rule created');
      setShowForm(false);
      setForm({ keyword: '', match_field: 'description', category_id: '', mark_as_subscription: false });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRule.mutateAsync(id);
      toast.success('Rule deleted');
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <SuggestionsPanel />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Auto-categorize transactions by keyword matching.</p>
        <Button size="sm" onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" /> Add Rule</Button>
      </div>

      <div className="space-y-2">
        {rules?.map(rule => (
          <Card key={rule.id}>
            <CardContent className="flex items-center gap-3 py-3">
              <Zap className="h-4 w-4 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{rule.keyword}</p>
                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{rule.match_field}</Badge>
                  {(rule as any).categories?.name && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{(rule as any).categories.name}</Badge>
                  )}
                  {rule.mark_as_subscription && (
                    <Badge className="text-[10px] h-4 px-1.5">subscription</Badge>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(rule.id)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {(!rules || rules.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-8">No rules yet. Create one to auto-categorize.</p>
        )}
      </div>

      <div className="pt-6">
        <ResetDataCard />
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New rule</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-4">
            <div>
              <Label className="text-xs">Keyword</Label>
              <Input className="mt-1" value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} placeholder="e.g. Spotify" />
            </div>
            <div>
              <Label className="text-xs">Match field</Label>
              <Select value={form.match_field} onValueChange={v => setForm(f => ({ ...f, match_field: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="description">Description</SelectItem>
                  <SelectItem value="merchant">Merchant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={createRule.isPending}>Save rule</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FxRatesPanel() {
  const { data: rates } = useFxRates();
  const createRate = useCreateFxRate();
  const deleteRate = useDeleteFxRate();
  const { data: blueDollar, isLoading: blueLoading } = useBlueDollarRate();
  const refreshBlue = useRefreshBlueDollar();
  const { data: eurUsd, isLoading: eurLoading } = useEurUsdRate();
  // Form: user enters ARS per USD (e.g. 1400)
  const [form, setForm] = useState({ from_currency: 'ARS', to_currency: 'USD', arsPerUsd: '', rate: '', date: new Date().toISOString().split('T')[0] });

  const handleAdd = async () => {
    try {
      let rateValue: number;
      if (form.from_currency === 'ARS' && form.to_currency === 'USD') {
        const v = parseFloat(form.arsPerUsd);
        if (!v || v <= 0) return;
        rateValue = 1 / v;
      } else {
        const v = parseFloat(form.rate);
        if (!v || v <= 0) return;
        rateValue = v;
      }
      await createRate.mutateAsync({
        from_currency: form.from_currency,
        to_currency: form.to_currency,
        rate: rateValue,
        date: form.date,
      });
      setForm(f => ({ ...f, rate: '', arsPerUsd: '' }));
      toast.success('Rate added');
    } catch (e: any) { toast.error(e.message); }
  };

  const isArsUsd = form.from_currency === 'ARS' && form.to_currency === 'USD';

  const formatDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              ARS/USD (Blue)
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refreshBlue.mutate()} disabled={refreshBlue.isPending}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshBlue.isPending ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {blueLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : blueDollar ? (
            <div className="space-y-1">
              <p className="text-2xl font-bold text-foreground">
                1 USD = {blueDollar.blue_avg ? Math.round(blueDollar.blue_avg).toLocaleString('es-AR') : Math.round(1 / blueDollar.rate).toLocaleString('es-AR')} ARS
              </p>
              {blueDollar.value_buy && blueDollar.value_sell && (
                <p className="text-xs text-muted-foreground">
                  Buy: {blueDollar.value_buy.toLocaleString('es-AR')} · Sell: {blueDollar.value_sell.toLocaleString('es-AR')}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Updated: {new Date(blueDollar.updated_at).toLocaleString()}
                {blueDollar.cached && ' · cached'}
                {blueDollar.fallback && ' · fallback'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Could not fetch rate</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            EUR/USD
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eurLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : eurUsd ? (
            <div className="space-y-1">
              <p className="text-2xl font-bold text-foreground">1 EUR = {eurUsd.rate.toFixed(4)} USD</p>
              <p className="text-[10px] text-muted-foreground">
                Updated: {new Date(eurUsd.updated_at).toLocaleString()}
                {eurUsd.cached && ' · cached'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Could not fetch rate</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Add manual rate</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Select value={form.from_currency} onValueChange={v => setForm(f => ({ ...f, from_currency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{['USD','ARS','EUR','GBP','BRL'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Select value={form.to_currency} onValueChange={v => setForm(f => ({ ...f, to_currency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{['USD','ARS','EUR','GBP','BRL'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{isArsUsd ? 'Tipo de cambio (ARS por 1 USD)' : 'Rate'}</Label>
              {isArsUsd ? (
                <Input type="number" value={form.arsPerUsd} onChange={e => setForm(f => ({ ...f, arsPerUsd: e.target.value }))} className="mt-1" placeholder="1400" />
              ) : (
                <Input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} className="mt-1" placeholder="0.00085" />
              )}
            </div>
            <div><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
          </div>
          <Button className="w-full" onClick={handleAdd} disabled={createRate.isPending}>Add rate</Button>
        </CardContent>
      </Card>

      {rates && rates.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pair</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Date</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map(r => {
              const isAU = r.from_currency === 'ARS' && r.to_currency === 'USD';
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.from_currency}/{r.to_currency}</TableCell>
                  <TableCell className="text-sm font-mono">
                    {isAU
                      ? `1 USD = ${Math.round(1 / Number(r.rate)).toLocaleString('es-AR')} ARS`
                      : Number(r.rate).toFixed(6)}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRate.mutateAsync(r.id)}>
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
