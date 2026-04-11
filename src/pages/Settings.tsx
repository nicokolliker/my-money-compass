import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories, useCreateCategory, useDeleteCategory } from '@/hooks/useCategories';
import { useFxRates, useCreateFxRate, useDeleteFxRate } from '@/hooks/useFxRates';
import { useAccounts } from '@/hooks/useAccounts';
import { useCreateTransaction } from '@/hooks/useTransactions';
import { useRules } from '@/hooks/useRules';
import { CURRENCIES } from '@/lib/constants';
import { Plus, Trash2, Upload, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

export default function Settings() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      <Tabs defaultValue="categories">
        <TabsList className="w-full">
          <TabsTrigger value="categories" className="flex-1">Categories</TabsTrigger>
          <TabsTrigger value="fx" className="flex-1">FX Rates</TabsTrigger>
          <TabsTrigger value="import" className="flex-1">Import</TabsTrigger>
        </TabsList>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="fx"><FxRatesTab /></TabsContent>
        <TabsContent value="import"><ImportTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function CategoriesTab() {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const [name, setName] = useState('');

  const handleAdd = async () => {
    if (!name.trim()) return;
    try {
      await createCategory.mutateAsync({ name: name.trim() });
      setName('');
      toast.success('Category added');
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="New category name" className="flex-1" />
        <Button onClick={handleAdd} disabled={createCategory.isPending}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-1">
        {categories?.map(c => (
          <div key={c.id} className="flex items-center justify-between py-2 px-2 rounded hover:bg-accent">
            <div className="flex items-center gap-2">
              {c.color && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `hsl(${c.color})` }} />}
              <span className="text-sm text-foreground">{c.name}</span>
              {c.is_system && <span className="text-[10px] text-muted-foreground">(system)</span>}
            </div>
            {!c.is_system && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCategory.mutateAsync(c.id)}>
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FxRatesTab() {
  const { data: rates } = useFxRates();
  const createRate = useCreateFxRate();
  const deleteRate = useDeleteFxRate();
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
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Add Rate</CardTitle></CardHeader>
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
          {rates?.map(r => (
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
    </div>
  );
}

function ImportTab() {
  const { data: accounts } = useAccounts();
  const createTx = useCreateTransaction();
  const { data: rules } = useRules();
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [accountId, setAccountId] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
      if (lines.length > 1) {
        setHeaders(lines[0]);
        setCsvData(lines.slice(1).filter(l => l.length > 1));
        setStep('map');
      }
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!accountId || !mapping.amount) return;
    setImporting(true);
    const account = accounts?.find(a => a.id === accountId);
    let imported = 0;
    try {
      for (const row of csvData) {
        const getValue = (field: string) => mapping[field] ? row[headers.indexOf(mapping[field])] : '';
        const amount = parseFloat(getValue('amount'));
        if (isNaN(amount)) continue;
        const description = getValue('description') || '';
        const date = getValue('date') || new Date().toISOString().split('T')[0];
        const fxRate = account?.currency === 'USD' ? 1 : parseFloat(getValue('fx_rate') || '1');

        // Apply rules
        let categoryId: string | null = null;
        let isSub = false;
        if (rules) {
          for (const rule of rules) {
            if (!rule.is_active) continue;
            const matchText = rule.match_field === 'merchant' ? getValue('merchant') : description;
            if (matchText.toUpperCase().includes(rule.keyword.toUpperCase())) {
              categoryId = rule.category_id;
              isSub = rule.mark_as_subscription;
              break;
            }
          }
        }

        await createTx.mutateAsync({
          date,
          description,
          merchant: getValue('merchant') || null,
          amount,
          currency: account?.currency || 'USD',
          fx_rate: fxRate,
          amount_usd: account?.currency === 'USD' ? amount : amount * fxRate,
          account_id: accountId,
          category_id: categoryId,
          type: amount < 0 ? 'expense' : 'income',
          is_subscription: isSub,
          raw_imported_description: description,
        });
        imported++;
      }

      // Log import
      await supabase.from('import_logs').insert({ filename: file?.name || 'unknown', account_id: accountId, row_count: imported });
      toast.success(`Imported ${imported} transactions`);
      setStep('upload');
      setCsvData([]);
    } catch (e: any) { toast.error(e.message); }
    setImporting(false);
  };

  const fields = ['date', 'description', 'merchant', 'amount', 'fx_rate'];

  return (
    <div className="space-y-4 mt-4">
      {step === 'upload' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Upload a CSV file to import transactions</p>
              <label className="cursor-pointer">
                <Button asChild><span><Upload className="h-4 w-4 mr-2" /> Choose File</span></Button>
                <input type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'map' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Map Columns</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {fields.map(field => (
                <div key={field}>
                  <Label className="capitalize">{field.replace('_', ' ')}</Label>
                  <Select value={mapping[field] || ''} onValueChange={v => setMapping(m => ({ ...m, [field]: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— Skip —</SelectItem>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <Button className="w-full" onClick={() => setStep('preview')} disabled={!accountId || !mapping.amount}>Preview</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{csvData.length} rows ready to import</p>
          <div className="max-h-64 overflow-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  {fields.filter(f => mapping[f]).map(f => <TableHead key={f} className="capitalize text-xs">{f}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvData.slice(0, 10).map((row, i) => (
                  <TableRow key={i}>
                    {fields.filter(f => mapping[f]).map(f => (
                      <TableCell key={f} className="text-xs">{row[headers.indexOf(mapping[f])]}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep('map')}>Back</Button>
            <Button className="flex-1" onClick={handleImport} disabled={importing}>{importing ? 'Importing...' : 'Import'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
