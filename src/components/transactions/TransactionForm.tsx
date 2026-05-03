import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategoryTree } from '@/hooks/useCategoryTree';
import { useSubcategories } from '@/hooks/useCategories';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useMerchants } from '@/hooks/useMerchants';
import { useCreateTransaction, useCreateTransfer, useUpdateTransaction } from '@/hooks/useTransactions';
import { useFxRates } from '@/hooks/useFxRates';
import { CURRENCIES, TRANSACTION_TYPE_LABELS, formatUSD } from '@/lib/constants';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';

interface Props {
  onSuccess?: () => void;
  editData?: any;
}

function MerchantCombobox({ merchants, value, onChange }: { merchants: any[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = merchants.find(m => m.id === value);
  const filtered = merchants.filter(m =>
    (m.display_name || m.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
        >
          <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
            {selected ? (selected.display_name || selected.name) : 'Select merchant (optional)'}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Search merchants..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-[240px] overflow-y-auto p-1">
          <button
            type="button"
            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent"
            onClick={() => { onChange('none'); setOpen(false); setSearch(''); }}
          >
            No merchant
          </button>
          {filtered.map((m: any) => (
            <button
              type="button"
              key={m.id}
              className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-accent"
              onClick={() => { onChange(m.id); setOpen(false); setSearch(''); }}
            >
              <span>{m.display_name || m.name}</span>
              {value === m.id && <Check className="h-4 w-4" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-xs text-center text-muted-foreground">No merchants found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TransactionForm({ onSuccess, editData }: Props) {
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: merchants } = useMerchants();
  const { data: fxRates } = useFxRates();
  const createTx = useCreateTransaction();
  const createTransfer = useCreateTransfer();
  const updateTx = useUpdateTransaction();

  const [type, setType] = useState<string>(editData?.type || 'expense');
  const [amount, setAmount] = useState(editData ? String(Math.abs(Number(editData.amount))) : '');
  const [description, setDescription] = useState(editData?.description || '');
  const [merchantId, setMerchantId] = useState(editData?.merchant_id || '');
  const [date, setDate] = useState(editData?.date || new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState(editData?.account_id || '');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState(editData?.category_id || '');
  const [fxRate, setFxRate] = useState(editData?.fx_rate ? String(editData.fx_rate) : '1');
  const [toAmount, setToAmount] = useState('');
  const [isSubscription, setIsSubscription] = useState(editData?.is_subscription || false);

  const activeAccounts = accounts?.filter(a => a.is_active) || [];
  const selectedAccount = activeAccounts.find(a => a.id === accountId);
  const toAccount = activeAccounts.find(a => a.id === toAccountId);
  const isCrossCurrency = type === 'transfer' && selectedAccount && toAccount && selectedAccount.currency !== toAccount.currency;
  const isEdit = !!editData?.id;

  // Auto-set FX rate when currencies change (skip in edit mode to preserve historical rate)
  useEffect(() => {
    if (isEdit) return;
    if (selectedAccount && selectedAccount.currency !== 'USD' && fxRates) {
      const rate = fxRates.find(r => r.from_currency === selectedAccount.currency && r.to_currency === 'USD');
      if (rate) setFxRate(String(rate.rate));
    } else if (selectedAccount?.currency === 'USD') {
      setFxRate('1');
    }
  }, [accountId, fxRates, selectedAccount, isEdit]);

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
      const resolvedMerchantId = merchantId && merchantId !== 'none' ? merchantId : null;
      const selectedMerchant = resolvedMerchantId ? merchants?.find(m => m.id === resolvedMerchantId) : null;

      if (isEdit) {
        const signedAmount = type === 'expense' ? -Math.abs(numAmount) : Math.abs(numAmount);
        const rate = parseFloat(fxRate);
        await updateTx.mutateAsync({
          id: editData.id,
          date,
          description,
          merchant: selectedMerchant?.display_name || selectedMerchant?.name || editData.merchant || null,
          merchant_id: resolvedMerchantId,
          amount: signedAmount,
          fx_rate: rate,
          amount_usd: selectedAccount!.currency === 'USD' ? signedAmount : signedAmount * rate,
          account_id: accountId,
          category_id: categoryId || null,
          type: type as any,
          is_subscription: isSubscription,
        });
      } else if (type === 'transfer') {
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
        await createTx.mutateAsync({
          date,
          description,
          merchant: selectedMerchant?.display_name || selectedMerchant?.name || null,
          merchant_id: resolvedMerchantId,
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
      toast.success(isEdit ? 'Transaction updated' : 'Transaction saved');
      onSuccess?.();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const isPending = updateTx.isPending || createTx.isPending || createTransfer.isPending;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Edit Transaction' : 'Add Transaction'}</SheetTitle>
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
        {selectedAccount && selectedAccount.currency !== 'USD' && amount && parseFloat(amount) > 0 && (
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            ≈ {formatUSD(Math.abs(parseFloat(amount)) * parseFloat(fxRate || '1'))} USD
          </p>
        )}
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
          <MerchantCombobox
            merchants={merchants || []}
            value={merchantId}
            onChange={(v) => {
              setMerchantId(v);
              if (v && v !== 'none' && !categoryId) {
                const m = merchants?.find(m => m.id === v);
                if ((m as any)?.default_category_id) setCategoryId((m as any).default_category_id);
              }
            }}
          />
        </div>
      )}

      {/* Category (not for transfers) — moved up */}
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

      {/* Subscription toggle */}
      {type === 'expense' && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isSubscription} onChange={e => setIsSubscription(e.target.checked)} className="rounded" />
          Mark as subscription
        </label>
      )}

      <Button onClick={handleSubmit} className="h-12 text-base mt-2" disabled={isPending}>
        {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Transaction'}
      </Button>
    </div>
  );
}
