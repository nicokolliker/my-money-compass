import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTransactions, useDeleteTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useTransactionRecurringMap } from '@/hooks/useTransactionRecurringMap';
import { formatCurrency, formatUSD, TRANSACTION_TYPE_LABELS } from '@/lib/constants';
import { getCategoryColor } from '@/lib/categoryColors';
import { getCategoryIcon } from '@/lib/brandLogos';
import { MerchantLogo } from '@/components/MerchantLogo';
import { Search, Trash2, ArrowLeftRight, Repeat, Calendar, Link2 } from 'lucide-react';
import { DemoDataBanner } from '@/components/DemoDataBanner';
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
import { TransactionForm } from '@/components/transactions/TransactionForm';

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

export default function Transactions() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [editTx, setEditTx] = useState<any>(null);

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
  const { data: recurringMatchMap = {} } = useTransactionRecurringMap();
  const deleteTx = useDeleteTransaction();
  const updateTx = useUpdateTransaction();
  const { hasDemoData, onCleared: onDemoCleared } = useDemoData();

  const grouped = useMemo(() => {
    if (!transactions) return [];
    const filtered = uncategorizedOnly
      ? transactions.filter(tx => !tx.category_id)
      : transactions;
    const groups: { date: string; label: string; txs: typeof transactions }[] = [];
    let currentDate = '';
    filtered.forEach(tx => {
      if (tx.date !== currentDate) {
        currentDate = tx.date;
        groups.push({ date: tx.date, label: formatDateGroupLabel(tx.date), txs: [] });
      }
      groups[groups.length - 1].txs.push(tx);
    });
    return groups;
  }, [transactions, uncategorizedOnly]);

  const handleDelete = async (id: string) => {
    try { await deleteTx.mutateAsync(id); toast.success('Transaction deleted'); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleCategoryChange = async (txId: string, catId: string | null) => {
    try { await updateTx.mutateAsync({ id: txId, category_id: catId }); toast.success('Category updated'); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleToggleSubscription = async (txId: string, current: boolean) => {
    try { await updateTx.mutateAsync({ id: txId, is_subscription: !current }); toast.success(!current ? 'Marked as recurring' : 'Unmarked'); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-5">
      {hasDemoData && <DemoDataBanner onCleared={onDemoCleared} />}
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
                    <div key={tx.id} className={`flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-accent/60 active:bg-accent transition-colors group ${tx.is_subscription ? 'border-l-2 border-l-primary/40' : ''}`}>
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
                                        <span>{cat.name}</span>
                                      </span>
                                    ) : '+ Category'}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-48 p-1" align="start">
                                  <div className="space-y-0.5 max-h-48 overflow-auto">
                                    <button className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent" onClick={() => handleCategoryChange(tx.id, null)}>
                                      📌 Uncategorized
                                    </button>
                                    {categories?.map(c => (
                                      <button key={c.id} className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent" onClick={() => handleCategoryChange(tx.id, c.id)}>
                                        {c.icon || '📌'} {c.name}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>

                            {tx.is_subscription && <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-medium">🔄 Recurring</Badge>}
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
    </div>
  );
}
