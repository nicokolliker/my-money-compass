import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRules, useCreateRule, useDeleteRule } from '@/hooks/useRules';
import { useCategories } from '@/hooks/useCategories';
import { useFxRates, useCreateFxRate, useDeleteFxRate } from '@/hooks/useFxRates';
import { useBlueDollarRate, useRefreshBlueDollar } from '@/hooks/useBlueDollar';
import { CURRENCIES } from '@/lib/constants';
import { Plus, Trash2, Zap, RefreshCw, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import CategoriesTab from '@/components/settings/CategoriesTab';
import MerchantsTab from '@/components/settings/MerchantsTab';

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
                  {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
  const [form, setForm] = useState({ from_currency: 'ARS', to_currency: 'USD', rate: '', date: new Date().toISOString().split('T')[0] });

  const handleAdd = async () => {
    if (!form.rate) return;
    try {
      await createRate.mutateAsync({ ...form, rate: parseFloat(form.rate) });
      setForm(f => ({ ...f, rate: '' }));
      toast.success('Rate added');
    } catch (e: any) { toast.error(e.message); }
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
                1 USD = {blueDollar.blue_avg ? Math.round(blueDollar.blue_avg).toLocaleString() : Math.round(1 / blueDollar.rate).toLocaleString()} ARS
              </p>
              {blueDollar.value_buy && blueDollar.value_sell && (
                <p className="text-xs text-muted-foreground">
                  Buy: {blueDollar.value_buy.toLocaleString()} · Sell: {blueDollar.value_sell.toLocaleString()}
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

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Add manual rate</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Select value={form.from_currency} onValueChange={v => setForm(f => ({ ...f, from_currency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Select value={form.to_currency} onValueChange={v => setForm(f => ({ ...f, to_currency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Rate</Label><Input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} className="mt-1" placeholder="0.00085" /></div>
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
            {rates.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{r.from_currency}/{r.to_currency}</TableCell>
                <TableCell className="text-sm font-mono">{r.rate}</TableCell>
                <TableCell className="text-sm">{r.date}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRate.mutateAsync(r.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
