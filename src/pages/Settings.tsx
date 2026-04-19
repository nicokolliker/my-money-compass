import { useLocation } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFxRates, useCreateFxRate, useDeleteFxRate } from '@/hooks/useFxRates';
import { useBlueDollarRate, useRefreshBlueDollar } from '@/hooks/useBlueDollar';
import { CURRENCIES } from '@/lib/constants';
import { Trash2, RefreshCw, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import IntegrationsTab from '@/components/settings/IntegrationsTab';
import CategoriesTab from '@/components/settings/CategoriesTab';
import MerchantsTab from '@/components/settings/MerchantsTab';
import ImportTab from '@/components/settings/ImportTab';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useState } from 'react';

export default function Settings({ initialTab: propInitialTab }: { initialTab?: string } = {}) {
  const location = useLocation();
  const initialTab = propInitialTab || (location.state as any)?.tab || 'integrations';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      <Tabs defaultValue={initialTab}>
        <TabsList className="w-full flex-wrap">
          <TabsTrigger value="integrations" className="flex-1">Integrations</TabsTrigger>
          <TabsTrigger value="merchants" className="flex-1">Merchants</TabsTrigger>
          <TabsTrigger value="categories" className="flex-1">Categories</TabsTrigger>
          <TabsTrigger value="fx" className="flex-1">FX Rates</TabsTrigger>
          <TabsTrigger value="import" className="flex-1">Import</TabsTrigger>
        </TabsList>
        <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
        <TabsContent value="merchants"><MerchantsTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="fx"><FxRatesTab /></TabsContent>
        <TabsContent value="import"><ImportTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function FxRatesTab() {
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
    <div className="space-y-4 mt-4">
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
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Add Manual Rate</CardTitle></CardHeader>
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
          <Button className="w-full" onClick={handleAdd} disabled={createRate.isPending}>Add Rate</Button>
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
