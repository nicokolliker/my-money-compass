import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useAccounts } from '@/hooks/useAccounts';
import { useCreateTransaction, useTransactions } from '@/hooks/useTransactions';
import { useRules } from '@/hooks/useRules';
import { useFxRates } from '@/hooks/useFxRates';
import { useRefreshRecurringTracking } from '@/hooks/useRecurringInstances';
import { toUSD, type FxRateRow } from '@/lib/money';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type ImportStep = 'upload' | 'map' | 'preview' | 'result';
type RowStatus = 'new' | 'duplicate' | 'skipped';

interface ParsedRow {
  raw: string[];
  date: string;
  description: string;
  merchant: string;
  amount: number;
  status: RowStatus;
  selected: boolean;
  duplicateOf?: string;
}

export default function ImportTab() {
  const { data: accounts } = useAccounts();
  const createTx = useCreateTransaction();
  const { data: rules } = useRules();
  const { data: fxRates } = useFxRates();
  const refreshRecurring = useRefreshRecurringTracking();
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [accountId, setAccountId] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState({ imported: 0, skipped: 0, duplicates: 0 });

  // Fetch existing transactions for duplicate detection
  const { data: existingTxs } = useTransactions({ accountId: accountId || undefined });

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
        setCsvData(lines.slice(1).filter(l => l.length > 1 && l.some(c => c.trim())));
        setStep('map');
      }
    };
    reader.readAsText(f);
  };

  const detectDuplicates = () => {
    if (!existingTxs) return;
    const account = accounts?.find(a => a.id === accountId);

    const rows: ParsedRow[] = csvData.map(row => {
      const getValue = (field: string) => mapping[field] ? row[headers.indexOf(mapping[field])] : '';
      const amount = parseFloat(getValue('amount'));
      const date = getValue('date') || '';
      const description = getValue('description') || '';
      const merchant = getValue('merchant') || '';

      if (isNaN(amount)) {
        return { raw: row, date, description, merchant, amount: 0, status: 'skipped' as RowStatus, selected: false };
      }

      // Check for duplicates: same date + similar amount + similar description
      const isDupe = existingTxs.some(tx => {
        const sameDate = tx.date === date;
        const sameAmount = Math.abs(Number(tx.amount) - amount) < 0.01;
        const similarDesc = tx.description?.toLowerCase().includes(description.toLowerCase().substring(0, 10)) ||
          description.toLowerCase().includes((tx.description || '').toLowerCase().substring(0, 10));
        return sameDate && sameAmount;
      });

      return {
        raw: row,
        date,
        description,
        merchant,
        amount,
        status: isDupe ? 'duplicate' as RowStatus : 'new' as RowStatus,
        selected: !isDupe,
        duplicateOf: isDupe ? 'Existing transaction with same date and amount' : undefined,
      };
    });

    setParsedRows(rows);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!accountId) return;
    setImporting(true);
    const account = accounts?.find(a => a.id === accountId);
    let imported = 0, skipped = 0, duplicates = 0;

    try {
      const selectedRows = parsedRows.filter(r => r.selected && r.status !== 'skipped');

      for (const row of selectedRows) {
        const currency = account?.currency || 'USD';
        const amountUsd = toUSD(row.amount, currency, fxRates as FxRateRow[] | undefined);
        const fxRate = row.amount !== 0 ? amountUsd / row.amount : 1;

        let categoryId: string | null = null;
        let isSub = false;
        if (rules) {
          for (const rule of rules) {
            if (!rule.is_active) continue;
            const matchText = rule.match_field === 'merchant' ? row.merchant : row.description;
            if (matchText.toUpperCase().includes(rule.keyword.toUpperCase())) {
              categoryId = rule.category_id;
              isSub = rule.mark_as_subscription;
              break;
            }
          }
        }

        const user_id_res = await supabase.auth.getUser();
        const user_id = user_id_res.data.user?.id;
        if (!user_id) throw new Error('Not authenticated');

        await createTx.mutateAsync({
          date: row.date || new Date().toISOString().split('T')[0],
          description: row.description,
          merchant: row.merchant || null,
          amount: row.amount,
          currency,
          fx_rate: fxRate,
          amount_usd: amountUsd,
          account_id: accountId,
          category_id: categoryId,
          type: row.amount < 0 ? 'expense' : 'income',
          is_subscription: isSub,
          raw_imported_description: row.description,
          user_id,
        });
        imported++;
      }

      duplicates = parsedRows.filter(r => r.status === 'duplicate' && !r.selected).length;
      skipped = parsedRows.filter(r => r.status === 'skipped').length;

      await supabase.from('import_logs').insert({ filename: file?.name || 'unknown', account_id: accountId, row_count: imported });

      // Re-run recurring matching against newly imported transactions
      let matchedCount = 0;
      try {
        const r = await refreshRecurring.mutateAsync();
        matchedCount = r.matched || 0;
      } catch {/* non-fatal */}

      setImportResult({ imported, skipped, duplicates });
      setStep('result');
      toast.success(`Imported ${imported} · ${matchedCount} matched to recurring`);
    } catch (e: any) { toast.error(e.message); }
    setImporting(false);
  };

  const toggleRow = (idx: number) => {
    setParsedRows(rows => rows.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const toggleAll = (selected: boolean) => {
    setParsedRows(rows => rows.map(r => r.status === 'skipped' ? r : { ...r, selected }));
  };

  const fields = ['date', 'description', 'merchant', 'amount', 'fx_rate'];
  const newCount = parsedRows.filter(r => r.status === 'new').length;
  const dupeCount = parsedRows.filter(r => r.status === 'duplicate').length;
  const selectedCount = parsedRows.filter(r => r.selected).length;

  return (
    <div className="space-y-4 mt-4">
      {step === 'upload' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Import Transactions from CSV</p>
                <p className="text-xs text-muted-foreground mt-1">Upload a bank or wallet export to import into an account</p>
              </div>
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
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Step 1: Map Columns</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Target Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {fields.map(field => (
                <div key={field}>
                  <Label className="capitalize text-xs">{field.replace('_', ' ')}{field === 'amount' || field === 'date' ? ' *' : ''}</Label>
                  <Select value={mapping[field] || ''} onValueChange={v => setMapping(m => ({ ...m, [field]: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— Skip —</SelectItem>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Found {csvData.length} rows in file</p>
              <Button className="w-full" onClick={detectDuplicates} disabled={!accountId || !mapping.amount}>
                Check for Duplicates & Preview
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          {/* Summary badges */}
          <div className="flex gap-2 flex-wrap">
            <Badge variant="default" className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> {newCount} new
            </Badge>
            {dupeCount > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-3 w-3" /> {dupeCount} likely duplicates
              </Badge>
            )}
            <Badge variant="outline">{selectedCount} selected to import</Badge>
          </div>

          {dupeCount > 0 && (
            <Card className="border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="py-3">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                  {dupeCount} transactions appear to already exist (same date & amount). They are unchecked by default but you can include them if needed.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>Select All</Button>
            <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>Deselect All</Button>
          </div>

          <div className="max-h-80 overflow-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedRows.map((row, i) => (
                  <TableRow key={i} className={row.status === 'skipped' ? 'opacity-40' : row.status === 'duplicate' ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}>
                    <TableCell>
                      {row.status !== 'skipped' && (
                        <Checkbox checked={row.selected} onCheckedChange={() => toggleRow(i)} />
                      )}
                    </TableCell>
                    <TableCell>
                      {row.status === 'new' && <Badge variant="default" className="text-[9px] h-4 px-1.5">New</Badge>}
                      {row.status === 'duplicate' && <Badge variant="secondary" className="text-[9px] h-4 px-1.5 text-amber-600">Duplicate?</Badge>}
                      {row.status === 'skipped' && <Badge variant="outline" className="text-[9px] h-4 px-1.5">Invalid</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">{row.date}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{row.description || row.merchant}</TableCell>
                    <TableCell className={`text-xs text-right font-mono tabular-nums ${row.amount < 0 ? 'text-destructive' : 'text-success'}`}>
                      {row.amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep('map')}>Back</Button>
            <Button className="flex-1" onClick={handleImport} disabled={importing || selectedCount === 0}>
              {importing ? 'Importing...' : `Import ${selectedCount} Transactions`}
            </Button>
          </div>
        </div>
      )}

      {step === 'result' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-6">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground">Import Complete</p>
                <div className="flex gap-3 justify-center mt-2">
                  <span className="text-sm text-foreground font-medium">{importResult.imported} imported</span>
                  {importResult.duplicates > 0 && <span className="text-sm text-amber-600">{importResult.duplicates} duplicates skipped</span>}
                  {importResult.skipped > 0 && <span className="text-sm text-muted-foreground">{importResult.skipped} invalid rows</span>}
                </div>
              </div>
              <Button onClick={() => { setStep('upload'); setCsvData([]); setParsedRows([]); setFile(null); setMapping({}); }}>
                Import Another File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
