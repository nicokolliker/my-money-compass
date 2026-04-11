import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAccountBalances, useCreateAccount, useUpdateAccount } from '@/hooks/useAccounts';
import { ACCOUNT_TYPE_LABELS, CURRENCIES, formatCurrency, formatUSD, ASSET_TYPES } from '@/lib/constants';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function Accounts() {
  const { data: accounts, isLoading } = useAccountBalances();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'bank' as string, institution: '', currency: 'USD', opening_balance: '0', notes: '' });

  const grouped = accounts?.reduce((acc, a) => {
    acc[a.type] = acc[a.type] || [];
    acc[a.type].push(a);
    return acc;
  }, {} as Record<string, typeof accounts>) || {};

  const handleSave = async () => {
    try {
      const payload = { ...form, opening_balance: parseFloat(form.opening_balance), type: form.type as any };
      if (editId) {
        await updateAccount.mutateAsync({ id: editId, ...payload });
      } else {
        await createAccount.mutateAsync(payload);
      }
      toast.success(editId ? 'Account updated' : 'Account created');
      setShowForm(false);
      setEditId(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const openEdit = (a: any) => {
    setForm({ name: a.name, type: a.type, institution: a.institution || '', currency: a.currency, opening_balance: String(a.opening_balance), notes: a.notes || '' });
    setEditId(a.id);
    setShowForm(true);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
        <Button size="sm" onClick={() => { setEditId(null); setForm({ name: '', type: 'bank', institution: '', currency: 'USD', opening_balance: '0', notes: '' }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {Object.entries(grouped).map(([type, accs]) => (
        <Card key={type}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{ACCOUNT_TYPE_LABELS[type] || type}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {accs!.map(a => (
              <button key={a.id} onClick={() => openEdit(a)} className="flex items-center justify-between w-full py-2 text-left hover:bg-accent rounded-lg px-2 -mx-2 transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.institution || ''}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${a.computed_balance < 0 ? 'text-destructive' : 'text-foreground'}`}>
                    {formatCurrency(a.computed_balance, a.currency)}
                  </p>
                  {a.currency !== 'USD' && <p className="text-xs text-muted-foreground">≈ {formatUSD(a.computed_balance_usd)}</p>}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      ))}

      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl">
          <SheetHeader><SheetTitle>{editId ? 'Edit Account' : 'New Account'}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4 overflow-y-auto">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Institution</Label><Input value={form.institution} onChange={e => setForm(f => ({ ...f, institution: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Opening Balance</Label><Input type="number" value={form.opening_balance} onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))} className="mt-1" /></div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
            <Button className="w-full h-12" onClick={handleSave} disabled={createAccount.isPending || updateAccount.isPending}>Save</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
