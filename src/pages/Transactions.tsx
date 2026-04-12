import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTransactions, useDeleteTransaction } from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import { formatCurrency, formatUSD, TRANSACTION_TYPE_LABELS } from '@/lib/constants';
import { getCategoryColor } from '@/lib/categoryColors';
import { Search, Trash2, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

function formatDateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function MerchantAvatar({ tx, cat }: { tx: any; cat: any }) {
  const isTransfer = tx.type === 'transfer';
  const initial = (tx.merchant || tx.description || tx.type)?.[0]?.toUpperCase() || '?';

  if (isTransfer) {
    return (
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  const colors = cat?.name ? getCategoryColor(cat.name) : getCategoryColor('Uncategorized');

  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${colors.bg} ${colors.text}`}>
      {initial}
    </div>
  );
}

export default function Transactions() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');

  const { data: transactions, isLoading } = useTransactions({
    search: search || undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    accountId: accountFilter !== 'all' ? accountFilter : undefined,
  });
  const { data: accounts } = useAccounts();
  const deleteTx = useDeleteTransaction();

  // Group by date
  const grouped = useMemo(() => {
    if (!transactions) return [];
    const groups: { date: string; label: string; txs: typeof transactions }[] = [];
    let currentDate = '';
    transactions.forEach(tx => {
      if (tx.date !== currentDate) {
        currentDate = tx.date;
        groups.push({ date: tx.date, label: formatDateGroupLabel(tx.date), txs: [] });
      }
      groups[groups.length - 1].txs.push(tx);
    });
    return groups;
  }, [transactions]);

  const handleDelete = async (id: string) => {
    try {
      await deleteTx.mutateAsync(id);
      toast.success('Transaction deleted');
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Transactions</h1>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10 rounded-xl" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px] h-10 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[160px] h-10 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Transaction list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : grouped.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">No transactions found</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.date} className="animate-fade-in">
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="space-y-1">
                {group.txs.map(tx => {
                  const acct = (tx as any).accounts;
                  const cat = (tx as any).categories;
                  const isTransfer = tx.type === 'transfer';
                  const isIncome = tx.type === 'income';
                  const isExpense = tx.type === 'expense';
                  const amount = Number(tx.amount);
                  const catColor = cat?.name ? getCategoryColor(cat.name) : null;

                  return (
                    <div key={tx.id} className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-accent/60 active:bg-accent transition-colors group">
                      <MerchantAvatar tx={tx} cat={cat} />

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {tx.merchant || tx.description || 'Untitled'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{acct?.name}</span>
                          {cat && catColor && (
                            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${catColor.bg} ${catColor.text}`}>
                              {cat.name}
                            </span>
                          )}
                          {tx.is_subscription && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-medium">Sub</Badge>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right shrink-0">
                        <p className={`text-base font-bold tabular-nums ${
                          isIncome ? 'text-success' :
                          isExpense ? 'text-destructive' :
                          'text-foreground'
                        }`}>
                          {amount > 0 ? '+' : ''}{formatCurrency(amount, tx.currency)}
                        </p>
                        {tx.currency !== 'USD' && (
                          <p className="text-[11px] text-muted-foreground tabular-nums">{formatUSD(Number(tx.amount_usd))}</p>
                        )}
                      </div>

                      {/* Delete */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8 shrink-0 transition-opacity">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
