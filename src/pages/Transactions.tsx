import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTransactions, useDeleteTransaction } from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { formatCurrency, formatUSD, TRANSACTION_TYPE_LABELS } from '@/lib/constants';
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

  const handleDelete = async (id: string) => {
    try {
      await deleteTx.mutateAsync(id);
      toast.success('Transaction deleted');
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Transactions</h1>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Transaction list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-1">
          {transactions?.map(tx => {
            const acct = (tx as any).accounts;
            const cat = (tx as any).categories;
            const isTransfer = tx.type === 'transfer';
            return (
              <div key={tx.id} className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-accent/50 transition-colors group">
                {/* Icon */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${
                  isTransfer ? 'bg-muted text-muted-foreground' :
                  tx.type === 'income' ? 'bg-primary/10 text-primary' :
                  'bg-destructive/10 text-destructive'
                }`}>
                  {isTransfer ? <ArrowLeftRight className="h-4 w-4" /> : cat?.name?.[0] || tx.type[0].toUpperCase()}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tx.description || tx.merchant || 'Untitled'}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{acct?.name}</span>
                    {cat && <><span>·</span><span>{cat.name}</span></>}
                    {tx.is_subscription && <Badge variant="secondary" className="text-[10px] h-4 px-1">Sub</Badge>}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right">
                  <p className={`text-sm font-semibold ${Number(tx.amount) > 0 ? 'text-primary' : 'text-foreground'}`}>
                    {Number(tx.amount) > 0 ? '+' : ''}{formatCurrency(Number(tx.amount), tx.currency)}
                  </p>
                  {tx.currency !== 'USD' && (
                    <p className="text-xs text-muted-foreground">{formatUSD(Number(tx.amount_usd))}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                </div>

                {/* Delete */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8">
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
          {transactions?.length === 0 && <p className="text-center py-8 text-muted-foreground">No transactions found</p>}
        </div>
      )}
    </div>
  );
}
