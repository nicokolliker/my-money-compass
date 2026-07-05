import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTransactions, useDeleteTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useCreateRecurringExpense } from '@/hooks/useRecurringExpenses';
import { Label } from '@/components/ui/label';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories, useSubcategories } from '@/hooks/useCategories';
import { DIGITAL_SUBTYPES } from '@/lib/digitalSubtypes';
import { useTransactionRecurringMap } from '@/hooks/useTransactionRecurringMap';
import { formatCurrency, formatUSD, TRANSACTION_TYPE_LABELS } from '@/lib/constants';
import { MerchantLogo } from '@/components/MerchantLogo';
import { Search, Trash2, ArrowLeftRight, Repeat, Calendar, Link2, Upload, ChevronLeft, ChevronRight, FileSpreadsheet, X } from 'lucide-react';
import { DemoDataBanner } from '@/components/DemoDataBanner';
import { UncategorizedMerchantsBanner } from '@/components/transactions/UncategorizedMerchantsBanner';
import { useDemoData } from '@/hooks/useDemoData';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useImportLog } from '@/hooks/useImportLog';
import { useLatestFxRate } from '@/hooks/useFxRates';
import { format, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseMercadoPago } from '@/lib/importers/mercadoPagoParser';
import { parseArqStatements } from '@/lib/importers/arqParser';

import { extractPdfText } from '@/lib/pdfReader';

const MONTH_LABELS_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function detectPredominantMonth(txs: { date: string }[]): string {
  const counts = new Map<string, number>();
  for (const t of txs) {
    const m = (t.date || '').slice(0, 7);
    if (!m) continue;
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  let best = '';
  let max = 0;
  for (const [m, c] of counts) {
    if (c > max) { max = c; best = m; }
  }
  return best || new Date().toISOString().slice(0, 7);
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_LABELS_FULL[m - 1]} ${y}`;
}

function MonthConfirm({ month, onChange, count }: { month: string; onChange: (m: string) => void; count: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <span className="text-muted-foreground text-xs">Resumen detectado:</span>
      <span className="font-medium text-foreground">{formatMonthLabel(month)}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onChange(shiftMonth(month, -1))}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onChange(shiftMonth(month, 1))}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">— {count} transacciones</span>
    </div>
  );
}

function formatDateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function MerchantAvatar({ tx }: { tx: any; cat?: any }) {
  const isTransfer = tx.type === 'transfer';
  const merchantData = (tx as any).merchants;
  const name = merchantData?.display_name || merchantData?.name || tx.merchant || tx.description || '';
  const domain = merchantData?.domain || null;

  if (isTransfer) {
    return (
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  if (merchantData?.logo_url) {
    return <img src={merchantData.logo_url} alt={name} className="w-10 h-10 rounded-full object-cover shrink-0" />;
  }

  return <MerchantLogo name={name} domain={domain} size={40} />;
}

const IMPORT_REQUIRED: Record<string, string> = {
  'arq': 'arq',
  'dolarapp': 'arq',
  'mercado pago': 'mercadopago',
  'mercadopago': 'mercadopago',
  'galicia': 'galicia',
};

function getImportSource(accountName: string): string | null {
  const lower = (accountName || '').toLowerCase();
  for (const [key, src] of Object.entries(IMPORT_REQUIRED)) {
    if (lower.includes(key)) return src;
  }
  return null;
}

function ConcilRow({ row, onImport }: { row: any; onImport: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {row.fromName} → {row.toName}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(row.date + 'T12:00:00'), "d MMM", { locale: es })}
        </p>
      </div>
      <div className="text-sm font-semibold tabular-nums text-foreground shrink-0">
        {row.currency !== 'USD'
          ? `${row.currency} ${row.amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
          : `$${row.amountUSD.toFixed(0)}`}
      </div>
      {row.isImported === true && (
        <Badge variant="secondary" className="text-[10px] shrink-0">✓ conciliado</Badge>
      )}
      {row.isImported === false && (
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={onImport}>
          ⚠ importar
        </Button>
      )}
      {row.isImported === null && (
        <Badge variant="outline" className="text-[10px] shrink-0">efectivo</Badge>
      )}
    </div>
  );
}

export default function Transactions() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialAccountId = (location.state as any)?.accountId as string | undefined;
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState<string>(initialAccountId || 'all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [editTx, setEditTx] = useState<any>(null);
  const [recurringDialog, setRecurringDialog] = useState<null | {
    txId: string; name: string; amount: string; currency: string;
    frequency: string; categoryId: string; accountId: string; nextDueDate: string;
    subtype: string;
  }>(null);
  const [recurringSaving, setRecurringSaving] = useState(false);

  // Clear location state once consumed so refreshes don't re-apply it
  useEffect(() => {
    if (initialAccountId) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const { data: transactions, isLoading, error } = useTransactions({
    search: search || undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    accountId: accountFilter !== 'all' ? accountFilter : undefined,
    categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const digitalCatId = useMemo(
    () => (categories || []).find((c: any) => (c.name || '').toLowerCase() === 'digital')?.id || null,
    [categories],
  );
  const { data: digitalSubcats = [] } = useSubcategories(digitalCatId || undefined);
  const { data: recurringMatchMap = {} } = useTransactionRecurringMap();
  const deleteTx = useDeleteTransaction();
  const updateTx = useUpdateTransaction();
  const createRecurring = useCreateRecurringExpense();
  const { hasDemoData, onCleared: onDemoCleared } = useDemoData();
  const { data: importLog } = useImportLog();
  const arsToUsd = useLatestFxRate('ARS', 'USD');
  const qc = useQueryClient();

  // Outgoing transfers (last 2 months)
  const { data: transferTxs } = useQuery({
    queryKey: ['outgoing-transfers'],
    queryFn: async () => {
      const twoMonthsAgo = format(subMonths(new Date(), 2), 'yyyy-MM-01');
      const { data } = await supabase
        .from('transactions')
        .select('id, date, amount, amount_usd, currency, account_id, description, linked_transfer_id')
        .eq('type', 'transfer')
        .lt('amount', 0)
        .gte('date', twoMonthsAgo)
        .order('date', { ascending: false });
      return data || [];
    },
  });

  const concilRows = useMemo(() => {
    if (!transferTxs || !accounts) return [];
    return transferTxs.map((tx: any) => {
      const fromAcc = accounts.find(a => a.id === tx.account_id);
      const counterTx = transferTxs.find((ct: any) =>
        ct.linked_transfer_id === tx.id || tx.linked_transfer_id === ct.id
      );
      const toAcc = accounts.find(a => a.id === counterTx?.account_id);
      const month = tx.date.slice(0, 7);
      const importSource = getImportSource(toAcc?.name || '');
      const isImported = importSource
        ? (importLog?.some(l => l.source === importSource && l.month === month) ?? false)
        : null;

      return {
        date: tx.date,
        month,
        fromName: fromAcc?.name || 'Cuenta',
        toName: toAcc?.name || tx.description || '—',
        amountUSD: Math.abs(Number(tx.amount_usd)),
        amount: Math.abs(Number(tx.amount)),
        currency: fromAcc?.currency || 'USD',
        importSource,
        isImported,
        toAccName: toAcc?.name || '',
      };
    });
  }, [transferTxs, accounts, importLog]);

  const filtered = useMemo(() => {
    return (transactions || []).filter(tx => {
      if (tx.type === 'transfer' || (tx.type as any) === 'adjustment') return false;
      if (uncategorizedOnly && tx.category_id) return false;
      return true;
    });
  }, [transactions, uncategorizedOnly]);

  const grouped = useMemo(() => {
    const groups: { date: string; label: string; txs: typeof filtered }[] = [];
    let currentDate = '';
    filtered.forEach(tx => {
      if (tx.date !== currentDate) {
        currentDate = tx.date;
        groups.push({ date: tx.date, label: formatDateGroupLabel(tx.date), txs: [] });
      }
      groups[groups.length - 1].txs.push(tx);
    });
    return groups;
  }, [filtered]);

  // Inline import dialog state
  const [importTarget, setImportTarget] = useState<any>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importProcessing, setImportProcessing] = useState(false);
  const [importingNow, setImportingNow] = useState(false);
  const [importMonth, setImportMonth] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleInlineProcess() {
    if (!importFile || !importTarget) return;
    setImportProcessing(true);
    try {
      let parsed: any[] = [];
      if (importTarget.importSource === 'mercadopago') {
        const buf = await importFile.arrayBuffer();
        parsed = parseMercadoPago(buf, arsToUsd || 0);
      } else if (importTarget.importSource === 'arq') {
        const text = await extractPdfText(importFile);
        parsed = parseArqStatements('', text, arsToUsd || 0).transactions;
      }
      const ids = parsed.map(p => p.external_id);
      const { data: existing } = await supabase
        .from('transactions')
        .select('external_id')
        .in('external_id', ids);
      const dupSet = new Set((existing || []).map((r: any) => r.external_id));
      setImportRows(parsed.map(p => ({ ...p, duplicate: dupSet.has(p.external_id) })));
      setImportMonth(detectPredominantMonth(parsed));
    } catch (e: any) {
      toast.error(e.message || 'Error al procesar');
    } finally {
      setImportProcessing(false);
    }
  }

  async function handleInlineImport() {
    if (!importTarget || !importMonth) return;
    setImportingNow(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const toImport = importRows.filter(r => !r.duplicate);
      const targetAcc = accounts?.find(a =>
        a.name.toLowerCase().includes((importTarget.toAccName || '').toLowerCase().split(' ')[0])
      );
      if (!targetAcc) { toast.error('No se encontró la cuenta destino'); return; }

      const payload = toImport.map(r => ({
        user_id: user.id,
        account_id: targetAcc.id,
        date: r.date,
        description: r.description,
        amount: r.amountARS > 0 ? -r.amountARS : -r.amountUSD,
        currency: r.amountARS > 0 ? 'ARS' : 'USD',
        fx_rate: arsToUsd || 0,
        amount_usd: -r.amountUSD,
        type: (r.type === 'transfer' ? 'transfer' : 'expense') as any,
        external_id: r.external_id,
      }));

      const { error } = await supabase.from('transactions').insert(payload);
      if (error) throw error;

      await supabase.from('import_log').upsert({
        user_id: user.id,
        source: importTarget.importSource,
        month: importMonth,
        transaction_count: toImport.length,
        imported_at: new Date().toISOString(),
      }, { onConflict: 'user_id,source,month' });

      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['import-log'] });
      qc.invalidateQueries({ queryKey: ['outgoing-transfers'] });
      toast.success(`${toImport.length} transacciones importadas`);
      setImportTarget(null);
      setImportFile(null);
      setImportRows([]);
    } catch (e: any) {
      toast.error(e.message || 'Error al importar');
    } finally {
      setImportingNow(false);
    }
  }

  const handleDelete = async (id: string) => {
    try { await deleteTx.mutateAsync(id); toast.success('Transaction deleted'); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleCategoryChange = async (txId: string, catId: string | null) => {
    try {
      const updates: any = { id: txId, category_id: catId, subcategory_id: null };
      // If switching to Digital, auto-assign a subtype + subcategory_id from the tx name signal.
      const digitalCat = categories?.find(c => c.name === 'Digital');
      if (catId && digitalCat && catId === digitalCat.id) {
        const tx: any = transactions?.find((t: any) => t.id === txId);
        const nameSignal = tx?.merchant || tx?.description || '';
        const { getDigitalSubtype, DIGITAL_SUBTYPES } = await import('@/lib/digitalSubtypes');
        const subtypeKey = getDigitalSubtype(nameSignal);
        updates.subtype = subtypeKey;
        const label = DIGITAL_SUBTYPES[subtypeKey]?.label?.toLowerCase();
        if (label) {
          const { data: subs } = await supabase
            .from('subcategories')
            .select('id, name')
            .eq('category_id', digitalCat.id);
          const match = (subs || []).find((s: any) => (s.name || '').toLowerCase() === label);
          if (match) updates.subcategory_id = match.id;
        }
      } else if (catId === null) {
        updates.subtype = null;
      }
      await updateTx.mutateAsync(updates);

      // Offer to recategorize all other transactions of the same merchant.
      if (catId) {
        const { normalizeMerchantName } = await import('@/lib/merchantSync');
        const tx: any = transactions?.find((t: any) => t.id === txId);
        const norm = normalizeMerchantName(tx?.merchant || tx?.description);
        if (norm) {
          const key = norm.toLowerCase();
          const siblings = ((transactions || []) as any[]).filter((t: any) => {
            if (t.id === txId) return false;
            if (t.category_id === catId) return false;
            const n = normalizeMerchantName(t.merchant || t.description);
            return n?.toLowerCase() === key;
          });
          if (siblings.length > 0) {
            const batch = { ...updates };
            delete (batch as any).id;
            toast.success('Category updated', {
              duration: 8000,
              action: {
                label: `Aplicar a ${siblings.length} más de ${norm}`,
                onClick: async () => {
                  try {
                    const ids = siblings.map((t: any) => t.id);
                    for (let i = 0; i < ids.length; i += 200) {
                      const { error } = await supabase
                        .from('transactions')
                        .update(batch)
                        .in('id', ids.slice(i, i + 200));
                      if (error) throw error;
                    }
                    qc.invalidateQueries({ queryKey: ['transactions'] });
                    toast.success(`${ids.length} transacciones de ${norm} recategorizadas`);
                  } catch (e: any) {
                    toast.error(e.message || 'Error al recategorizar');
                  }
                },
              },
            });
            return;
          }
        }
      }
      toast.success('Category updated');
    }
    catch (e: any) { toast.error(e.message); }
  };

  const handleToggleSubscription = async (txId: string, current: boolean) => {
    try {
      if (current) {
        // Unmarking — just flip the flag, don't touch existing recurring rows.
        await updateTx.mutateAsync({ id: txId, is_subscription: false });
        toast.success('Unmarked');
        return;
      }
      // Marking as recurring → open pre-filled dialog
      const tx: any = transactions?.find((t: any) => t.id === txId);
      if (!tx) return;
      setRecurringDialog({
        txId: tx.id,
        name: tx.merchant || tx.description || 'Recurring',
        amount: String(Math.abs(Number(tx.amount) || 0)),
        currency: tx.currency || 'USD',
        frequency: 'monthly',
        categoryId: tx.category_id || '',
        accountId: tx.account_id || '',
        nextDueDate: tx.date || new Date().toISOString().slice(0, 10),
        subtype: '',
      });
    }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-5">
      {hasDemoData && <DemoDataBanner onCleared={onDemoCleared} />}
      <UncategorizedMerchantsBanner />
      <h1 className="text-2xl font-bold text-foreground">Transactions</h1>


      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10 rounded-xl" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px] h-10 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={showDateFilter ? 'secondary' : 'outline'} size="icon" className="h-10 w-10 rounded-xl" onClick={() => setShowDateFilter(!showDateFilter)}>
            <Calendar className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[150px] h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px] h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-1.5">
                    <span>{c.icon || '📌'}</span>
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showDateFilter && (
          <div className="flex gap-2 items-center">
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 rounded-xl text-xs flex-1" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 rounded-xl text-xs flex-1" />
            {(dateFrom || dateTo) && <Button variant="ghost" size="sm" className="text-xs h-9" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</Button>}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setUncategorizedOnly(!uncategorizedOnly)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              uncategorizedOnly
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-primary/50'
            }`}
          >
            📌 Without category
          </button>
        </div>
      </div>

      {/* List */}
      {error && <p className="text-center py-4 text-destructive text-sm">Error: {error.message}</p>}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : grouped.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">
          {uncategorizedOnly ? '✅ All transactions are categorized' : 'No transactions found'}
        </p>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.date} className="animate-fade-in">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-1">
                {group.txs.map(tx => {
                  const acct = (tx as any).accounts;
                  const cat = (tx as any).categories;
                  const isIncome = tx.type === 'income';
                  const isExpense = tx.type === 'expense';
                  const amount = Number(tx.amount);

                  return (
                    <div key={tx.id} className={`flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-muted/60 active:bg-accent transition-colors group ${tx.is_subscription ? 'border-l-2 border-l-primary/40' : ''}`}>
                      <div
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        onClick={() => setEditTx(tx)}
                      >
                        <MerchantAvatar tx={tx} cat={cat} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{(tx as any).merchants?.display_name || tx.merchant || tx.description || 'Untitled'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">{acct?.name}</span>

                            {/* Category pill */}
                            <div onClick={(e) => e.stopPropagation()}>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    style={cat?.color ? { backgroundColor: `hsl(${cat.color} / 0.15)`, color: `hsl(${cat.color})` } : undefined}
                                    className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full hover:ring-1 hover:ring-primary/30 transition-all ${!cat?.color ? 'bg-muted text-muted-foreground' : ''}`}
                                  >
                                    {cat ? (
                                      <span className="flex items-center gap-1">
                                        <span>{cat.icon || '📌'}</span>
                                        <span>
                                          {cat.name}
                                          {cat.name === 'Digital' && (tx as any).subcategories?.name
                                            ? ` · ${(tx as any).subcategories.name}`
                                            : ''}
                                        </span>
                                      </span>
                                    ) : '+ Category'}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-48 p-1" align="start">
                                  <div className="space-y-0.5 max-h-48 overflow-auto">
                                    <button className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/60" onClick={() => handleCategoryChange(tx.id, null)}>
                                      📌 Uncategorized
                                    </button>
                                    {categories?.map(c => (
                                      <button key={c.id} className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/60" onClick={() => handleCategoryChange(tx.id, c.id)}>
                                        {c.icon || '📌'} {c.name}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>

                            {recurringMatchMap[tx.id] && <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-medium">🔄 Recurring</Badge>}
                            {recurringMatchMap[tx.id] && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-medium flex items-center gap-0.5">
                                <Link2 className="h-2.5 w-2.5" /> {recurringMatchMap[tx.id].recurring_name}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className={`text-base font-bold tabular-nums ${isIncome ? 'text-success' : isExpense ? 'text-destructive' : 'text-foreground'}`}>
                          {amount > 0 ? '+' : ''}{formatCurrency(amount, tx.currency)}
                        </p>
                        {tx.currency !== 'USD' && (
                          <p className="text-[11px] text-muted-foreground tabular-nums">{formatUSD(Number(tx.amount_usd))}</p>
                        )}
                      </div>

                      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title={tx.is_subscription ? 'Unmark recurring' : 'Mark as recurring'} onClick={(e) => { e.stopPropagation(); handleToggleSubscription(tx.id, tx.is_subscription); }}>
                          <Repeat className={`h-3 w-3 ${tx.is_subscription ? 'text-primary' : 'text-muted-foreground'}`} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
                              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(tx.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editTx} onOpenChange={(open) => { if (!open) setEditTx(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar transacción</DialogTitle>
          </DialogHeader>
          {editTx && (
            <TransactionForm
              editData={editTx}
              onSuccess={() => setEditTx(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Inline Import Dialog */}
      <Dialog
        open={!!importTarget}
        onOpenChange={(o) => {
          if (!o) {
            setImportTarget(null);
            setImportFile(null);
            setImportRows([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar extracto — {importTarget?.toAccName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center gap-2 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
              <p className="text-xs font-medium text-foreground">
                {importFile
                  ? importFile.name
                  : importTarget?.importSource === 'mercadopago'
                    ? 'Reporte MercadoPago (.xlsx)'
                    : 'Estado ARS (.pdf)'}
              </p>
              {importFile && (
                <button
                  onClick={(e) => { e.stopPropagation(); setImportFile(null); setImportRows([]); }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={importTarget?.importSource === 'mercadopago' ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'}
                className="hidden"
                onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportRows([]); }}
              />
            </div>

            {importFile && importRows.length === 0 && (
              <Button onClick={handleInlineProcess} disabled={importProcessing} className="w-full">
                {importProcessing ? 'Procesando...' : 'Procesar archivo'}
              </Button>
            )}

            {importRows.length > 0 && (
              <>
                <MonthConfirm month={importMonth} onChange={setImportMonth} count={importRows.length} />
                <div className="rounded-lg border border-border overflow-hidden max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importRows.slice(0, 20).map((r, i) => (
                        <TableRow key={i} className={r.duplicate ? 'opacity-50' : ''}>
                          <TableCell className="text-xs">{r.date}</TableCell>
                          <TableCell className="text-xs truncate max-w-[200px]">{r.description}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {r.amountARS > 0
                              ? `ARS ${r.amountARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
                              : `$${r.amountUSD.toFixed(2)}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button onClick={handleInlineImport} disabled={importingNow} className="w-full">
                  {importingNow ? 'Importando...' : `Importar ${importRows.filter(r => !r.duplicate).length} transacciones`}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark-as-recurring dialog */}
      <Dialog open={!!recurringDialog} onOpenChange={(o) => { if (!o) setRecurringDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear gasto recurrente</DialogTitle>
          </DialogHeader>
          {recurringDialog && (
            <div className="space-y-3">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={recurringDialog.name}
                  onChange={(e) => setRecurringDialog({ ...recurringDialog, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Monto</Label>
                  <Input
                    type="number"
                    value={recurringDialog.amount}
                    onChange={(e) => setRecurringDialog({ ...recurringDialog, amount: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Moneda</Label>
                  <Input
                    value={recurringDialog.currency}
                    onChange={(e) => setRecurringDialog({ ...recurringDialog, currency: e.target.value.toUpperCase() })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Frecuencia</Label>
                  <Select
                    value={recurringDialog.frequency}
                    onValueChange={(v) => setRecurringDialog({ ...recurringDialog, frequency: v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensual</SelectItem>
                      <SelectItem value="quarterly">Trimestral</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Próximo vencimiento</Label>
                  <Input
                    type="date"
                    value={recurringDialog.nextDueDate}
                    onChange={(e) => setRecurringDialog({ ...recurringDialog, nextDueDate: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label>Categoría</Label>
                <Select
                  value={recurringDialog.categoryId || 'none'}
                  onValueChange={(v) => setRecurringDialog({ ...recurringDialog, categoryId: v === 'none' ? '' : v, subtype: '' })}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {(categories || []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {digitalCatId && recurringDialog.categoryId === digitalCatId && digitalSubcats.length > 0 && (
                <div>
                  <Label>Subcategoría</Label>
                  <Select
                    value={recurringDialog.subtype || 'none'}
                    onValueChange={(v) => setRecurringDialog({ ...recurringDialog, subtype: v === 'none' ? '' : v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar subcategoría" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin subcategoría</SelectItem>
                      {Object.entries(DIGITAL_SUBTYPES).map(([key, def]) => (
                        <SelectItem key={key} value={key}>{def.icon} {def.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setRecurringDialog(null)} disabled={recurringSaving}>
                  Cancelar
                </Button>
                <Button
                  disabled={recurringSaving || !recurringDialog.name || !parseFloat(recurringDialog.amount)}
                  onClick={async () => {
                    setRecurringSaving(true);
                    try {
                      const amt = Math.abs(parseFloat(recurringDialog.amount));
                      const selectedCat: any = (categories || []).find((c: any) => c.id === recurringDialog.categoryId);
                      const derivedType = selectedCat
                        ? (selectedCat.name || '').toLowerCase().replace(/\s+/g, '_')
                        : 'otros';
                      await createRecurring.mutateAsync({
                        name: recurringDialog.name,
                        amount: amt,
                        currency: recurringDialog.currency || 'USD',
                        frequency: recurringDialog.frequency as any,
                        type: derivedType as any,
                        subtype: recurringDialog.subtype || null,
                        category_id: recurringDialog.categoryId || null,
                        linked_category_id: recurringDialog.categoryId || null,
                        account_id: recurringDialog.accountId || null,
                        next_due_date: recurringDialog.nextDueDate || null,
                        is_active: true,
                      } as any);
                      await updateTx.mutateAsync({ id: recurringDialog.txId, is_subscription: true });
                      try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                          await supabase.rpc('refresh_recurring_tracking', { p_user_id: user.id });
                        }
                      } catch (err) {
                        console.warn('refresh_recurring_tracking failed', err);
                      }
                      qc.invalidateQueries({ queryKey: ['recurring-instances'] });
                      qc.invalidateQueries({ queryKey: ['transaction-recurring-map'] });
                      toast.success('Gasto recurrente creado');
                      setRecurringDialog(null);
                    } catch (e: any) {
                      toast.error(e.message || 'Error al crear recurrente');
                    } finally {
                      setRecurringSaving(false);
                    }
                  }}
                >
                  {recurringSaving ? 'Guardando...' : 'Crear recurrente'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
