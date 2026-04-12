import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useMerchants } from '@/hooks/useMerchants';
import { useCreateTransaction, useCreateTransfer } from '@/hooks/useTransactions';
import { useFxRates } from '@/hooks/useFxRates';
import { CURRENCIES, TRANSACTION_TYPE_LABELS } from '@/lib/constants';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';

interface Props {
  onSuccess?: () => void;
  editData?: any;
}

export function TransactionForm({ onSuccess, editData }: Props) {
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: merchants } = useMerchants();
  const { data: fxRates } = useFxRates();
  const createTx = useCreateTransaction();
  const createTransfer = useCreateTransfer();

  const [type, setType] = useState<string>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [fxRate, setFxRate] = useState('1');
  const [toAmount, setToAmount] = useState('');
  const [isSubscription, setIsSubscription] = useState(false);

  const activeAccounts = accounts?.filter(a => a.is_active) || [];
  const selectedAccount = activeAccounts.find(a => a.id === accountId);
  const toAccount = activeAccounts.find(a => a.id === toAccountId);
  const isCrossCurrency = type === 'transfer' && selectedAccount && toAccount && selectedAccount.currency !== toAccount.currency;

  // Auto-set FX rate when currencies change
  useEffect(() => {
    if (selectedAccount && selectedAccount.currency !== 'USD' && fxRates) {
      const rate = fxRates.find(r => r.from_currency === selectedAccount.currency && r.to_currency === 'USD');
      if (rate) setFxRate(String(rate.rate));
    } else if (selectedAccount?.currency === 'USD') {
      setFxRate('1');
    }
  }, [accountId, fxRates, selectedAccount]);

  // Set default account
  useEffect(() => {
    if (activeAccounts.length > 0 && !accountId) {
      setAccountId(activeAccounts[0].id);
    }
  }, [activeAccounts, accountId]);

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || !accountId) return;

    try {
      if (type === 'transfer') {
        if (!toAccountId) return;
        const numToAmount = isCrossCurrency ? parseFloat(toAmount) : numAmount;
        await createTransfer.mutateAsync({
          fromAccountId: accountId,
          toAccountId,
          amount: numAmount,
          fromCurrency: selectedAccount!.currency,
          toCurrency: toAccount!.currency,
          fxRate: parseFloat(fxRate),
          toAmount: numToAmount,
          date,
          description,
        });
      } else {
        const signedAmount = type === 'expense' ? -Math.abs(numAmount) : Math.abs(numAmount);
        const rate = parseFloat(fxRate);
        const selectedMerchant = merchants?.find(m => m.id === merchantId);
        await createTx.mutateAsync({
          date,
          description,
          merchant: selectedMerchant?.display_name || selectedMerchant?.name || null,
          merchant_id: merchantId || null,
          amount: signedAmount,
          currency: selectedAccount!.currency,
          fx_rate: rate,
          amount_usd: selectedAccount!.currency === 'USD' ? signedAmount : signedAmount * rate,
          account_id: accountId,
          category_id: categoryId || (selectedMerchant as any)?.default_category_id || null,
          type: type as 'expense' | 'income' | 'transfer' | 'adjustment',
          is_subscription: isSubscription,
        });
      }
      toast.success('Transaction saved');
      onSuccess?.();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      <SheetHeader>
        <SheetTitle>Add Transaction</SheetTitle>
      </SheetHeader>

      {/* Type toggle */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {Object.entries(TRANSACTION_TYPE_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setType(key)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              type === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div>
        <Label>Amount</Label>
        <div className="flex gap-2 mt-1">
          <Input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="text-2xl h-14 font-semibold"
            autoFocus
          />
          {selectedAccount && (
            <span className="flex items-center text-sm font-medium text-muted-foreground px-3 bg-muted rounded-md">
              {selectedAccount.currency}
            </span>
          )}
        </div>
      </div>

      {/* Account */}
      <div>
        <Label>{type === 'transfer' ? 'From Account' : 'Account'}</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
          <SelectContent>
            {activeAccounts.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* To Account (transfer) */}
      {type === 'transfer' && (
        <div>
          <Label>To Account</Label>
          <Select value={toAccountId} onValueChange={setToAccountId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select destination" /></SelectTrigger>
            <SelectContent>
              {activeAccounts.filter(a => a.id !== accountId).map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Cross-currency fields */}
      {isCrossCurrency && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>FX Rate</Label>
            <Input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Received Amount ({toAccount?.currency})</Label>
            <Input type="number" value={toAmount} onChange={e => setToAmount(e.target.value)} className="mt-1" />
          </div>
        </div>
      )}

      {/* FX Rate for non-USD accounts */}
      {selectedAccount && selectedAccount.currency !== 'USD' && type !== 'transfer' && (
        <div>
          <Label>FX Rate ({selectedAccount.currency} → USD)</Label>
          <Input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} className="mt-1" />
        </div>
      )}

      {/* Merchant (not for transfers) */}
      {type !== 'transfer' && (
        <div>
          <Label>Merchant</Label>
          <Select value={merchantId} onValueChange={(v) => {
            setMerchantId(v);
            // Auto-set category from merchant default
            if (v && !categoryId) {
              const m = merchants?.find(m => m.id === v);
              if (m?.default_category_id) setCategoryId(m.default_category_id);
            }
          }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select merchant (optional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No merchant</SelectItem>
              {merchants?.map((m: any) => (
                <SelectItem key={m.id} value={m.id}>{m.display_name || m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Description */}
      <div>
        <Label>Description</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What was this for?" className="mt-1" />
      </div>

      {/* Date */}
      <div>
        <Label>Date</Label>
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
      </div>

      {/* Category (not for transfers) */}
      {type !== 'transfer' && (
        <div>
          <Label>Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {categories?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Subscription toggle */}
      {type === 'expense' && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isSubscription} onChange={e => setIsSubscription(e.target.checked)} className="rounded" />
          Mark as subscription
        </label>
      )}

      <Button onClick={handleSubmit} className="h-12 text-base mt-2" disabled={createTx.isPending || createTransfer.isPending}>
        {createTx.isPending || createTransfer.isPending ? 'Saving...' : 'Save Transaction'}
      </Button>
    </div>
  );
}
