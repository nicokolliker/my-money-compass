import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAccountBalances, useCreateAccount, useUpdateAccount } from '@/hooks/useAccounts';
import { useAccountGroups, useCreateAccountGroup, useUpdateAccountGroup, useDeleteAccountGroup } from '@/hooks/useAccountGroups';
import { useNetWorth } from '@/hooks/useNetWorth';
import { supabase } from '@/integrations/supabase/client';
import { ACCOUNT_TYPE_LABELS, CURRENCIES, formatCurrency, formatUSD } from '@/lib/constants';
import { MerchantLogo } from '@/components/MerchantLogo';
import { getAccountStyle } from '@/lib/accountIcons';
import { Plus, ChevronDown, FolderPlus, Pencil, Trash2, FileUp, PenLine, Wifi, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { DemoDataBanner } from '@/components/DemoDataBanner';
import { useDemoData } from '@/hooks/useDemoData';
import { Badge } from '@/components/ui/badge';
import { FundFlowDiagram } from '@/components/accounts/FundFlowDiagram';




function AccountLogo({ name, institution }: { name: string; institution?: string | null }) {
  // Try institution name first (e.g. "Wise", "Banco Galicia"), then fall back to account name
  const logoName = institution || name;
  return <MerchantLogo name={logoName} size={40} />;
}

export default function Accounts() {
  const navigate = useNavigate();
  const { data: accounts, isLoading } = useAccountBalances();
  const { data: groups } = useAccountGroups();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const createGroup = useCreateAccountGroup();
  const updateGroup = useUpdateAccountGroup();
  const deleteGroup = useDeleteAccountGroup();
  const { hasDemoData, onCleared: onDemoCleared } = useDemoData();
  const { netWorthUsd: totalNetWorth } = useNetWorth();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'bank' as string, institution: '', currency: 'USD', opening_balance: '0', notes: '', group_id: '' });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showPostCreate, setShowPostCreate] = useState(false);



  const sections = useMemo(() => {
    if (!accounts) return [];
    const result: { key: string; label: string; icon: string; isCustomGroup: boolean; accounts: typeof accounts }[] = [];
    const assignedIds = new Set<string>();

    if (groups && groups.length > 0) {
      for (const g of groups) {
        const groupAccounts = accounts.filter(a => a.group_id === g.id);
        result.push({ key: g.id, label: g.name, icon: g.icon || '📁', isCustomGroup: true, accounts: groupAccounts });
        groupAccounts.forEach(a => assignedIds.add(a.id));
      }
      const ungrouped = accounts.filter(a => !assignedIds.has(a.id));
      if (ungrouped.length > 0) {
        result.push({ key: 'ungrouped', label: 'Ungrouped', icon: '📦', isCustomGroup: false, accounts: ungrouped });
      }
    } else {
      result.push({ key: 'all', label: 'All Accounts', icon: '🏦', isCustomGroup: false, accounts });
    }

    return result;
  }, [accounts, groups]);

  const handleSave = async () => {
    try {
      const payload: any = { name: form.name, type: form.type, institution: form.institution || null, currency: form.currency, opening_balance: parseFloat(form.opening_balance), notes: form.notes || null };
      payload.group_id = form.group_id || null;

      if (editId) {
        await updateAccount.mutateAsync({ id: editId, ...payload });
        toast.success('Account updated');
      } else {
        await createAccount.mutateAsync(payload);
        toast.success('Account created');
        setShowPostCreate(true);
      }
      setShowForm(false);
      setEditId(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const openEdit = (a: any) => {
    setForm({ name: a.name, type: a.type, institution: a.institution || '', currency: a.currency, opening_balance: String(a.opening_balance), notes: a.notes || '', group_id: a.group_id || '' });
    setEditId(a.id);
    setShowForm(true);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      if (editGroupId) {
        await updateGroup.mutateAsync({ id: editGroupId, name: newGroupName.trim() });
        toast.success('Group updated');
      } else {
        await createGroup.mutateAsync({ name: newGroupName.trim(), sort_order: (groups?.length || 0) });
        toast.success('Group created');
      }
      setNewGroupName('');
      setShowGroupForm(false);
      setEditGroupId(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await deleteGroup.mutateAsync(id);
      toast.success('Group deleted');
      setShowGroupForm(false);
      setEditGroupId(null);
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      {hasDemoData && <DemoDataBanner onCleared={onDemoCleared} />}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setEditGroupId(null); setNewGroupName(''); setShowGroupForm(true); }}>
            <FolderPlus className="h-4 w-4 mr-1" /> Group
          </Button>
          <Button size="sm" className="rounded-xl" onClick={() => { setShowAddChoice(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Net Worth Summary */}
      <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 shadow-elevated">
        <CardContent className="pt-5 pb-5">
          <p className="text-sm opacity-80 font-medium">Total Net Worth</p>
          <p className="text-3xl font-extrabold mt-1 tracking-tight">{formatUSD(totalNetWorth)}</p>
        </CardContent>
      </Card>

      <FundFlowDiagram />



      {sections.map(section => {
        const sectionTotal = section.accounts.reduce((s, a) => s + a.computed_balance_usd, 0);
        const isOpen = !collapsed[section.key];

        return (
          <Collapsible key={section.key} open={isOpen} onOpenChange={(open) => setCollapsed(c => ({ ...c, [section.key]: !open }))}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full px-1 py-2 group">
                <div className="flex items-center gap-2">
                  <span className="text-base">{section.icon}</span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{section.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">({section.accounts.length})</span>
                  {section.isCustomGroup && (
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                      onClick={(e) => { e.stopPropagation(); setEditGroupId(section.key); setNewGroupName(section.label); setShowGroupForm(true); }}
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground tabular-nums">{formatUSD(sectionTotal)}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card>
                <CardContent className="divide-y divide-border py-1">
                  {section.accounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No accounts in this group</p>
                  ) : section.accounts.map(a => {
                    const balUsd = a.computed_balance_usd;
                    const pct = totalNetWorth !== 0 ? (balUsd / totalNetWorth * 100) : 0;
                    return (
                      <div key={a.id}>
                        <button onClick={() => openEdit(a)} className="flex items-center gap-3 w-full py-3 text-left hover:bg-accent/50 active:bg-accent rounded-lg px-2 -mx-2 transition-colors">
                          <AccountLogo name={a.name} institution={(a as any).institution} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-foreground truncate">{a.name}</p>
                              {(a as any).source === 'csv' && <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0"><FileUp className="h-2.5 w-2.5 mr-0.5" />CSV</Badge>}
                              {(a as any).source === 'manual' && <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0 text-muted-foreground"><PenLine className="h-2.5 w-2.5 mr-0.5" />Manual</Badge>}
                            </div>
                            {a.institution && <p className="text-xs text-muted-foreground">{a.institution}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold tabular-nums ${a.computed_balance < 0 ? 'text-destructive' : 'text-foreground'}`}>
                              {formatCurrency(a.computed_balance, a.currency)}
                            </p>
                            <div className="flex items-center gap-1.5 justify-end">
                              {a.currency !== 'USD' && <span className="text-[11px] text-muted-foreground tabular-nums">≈ {formatUSD(a.computed_balance_usd)}</span>}
                              <span className="text-[10px] text-muted-foreground tabular-nums">{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {/* Group Form */}
      <Dialog open={showGroupForm} onOpenChange={setShowGroupForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editGroupId ? 'Edit Group' : 'New Account Group'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4 pb-4">
            <div><Label>Group Name</Label><Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="mt-1 rounded-xl" placeholder="e.g. Foreign Accounts" /></div>
            <div className="flex gap-2">
              {editGroupId && (
                <Button variant="destructive" className="rounded-xl" onClick={() => handleDeleteGroup(editGroupId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button className="flex-1 h-12 rounded-xl" onClick={handleCreateGroup} disabled={createGroup.isPending}>
                {editGroupId ? 'Update' : 'Create Group'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Account Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Edit Account' : 'New Account'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1 rounded-xl" /></div>
            <div>
              <Label>Group</Label>
              <Select value={form.group_id || 'none'} onValueChange={v => setForm(f => ({ ...f, group_id: v === 'none' ? '' : v }))}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Group</SelectItem>
                  {groups?.map(g => <SelectItem key={g.id} value={g.id}>{g.icon} {g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Institution</Label><Input value={form.institution} onChange={e => setForm(f => ({ ...f, institution: e.target.value }))} className="mt-1 rounded-xl" /></div>
            <div>
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Opening Balance</Label><Input type="number" value={form.opening_balance} onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))} className="mt-1 rounded-xl" /></div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 rounded-xl" /></div>
            <Button className="w-full h-12 rounded-xl" onClick={handleSave} disabled={createAccount.isPending || updateAccount.isPending}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Account Choice Dialog */}
      <Dialog open={showAddChoice} onOpenChange={setShowAddChoice}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-dashed opacity-60 cursor-not-allowed">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Wifi className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Connect via API</p>
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-amber-600 border-amber-300">
                    <Clock className="h-2.5 w-2.5 mr-0.5" /> Coming Soon
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Auto-sync from Wise, Deel, and more</p>
              </div>
            </div>
            <button
              onClick={() => { setShowAddChoice(false); setEditId(null); setForm({ name: '', type: 'bank', institution: '', currency: 'USD', opening_balance: '0', notes: '', group_id: '' }); setShowForm(true); }}
              className="w-full flex items-center gap-4 p-4 rounded-xl border hover:border-primary/40 hover:bg-accent/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <PenLine className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Manual Account</p>
                <p className="text-xs text-muted-foreground">Create manually and add transactions or import CSV</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-creation dialog */}
      <Dialog open={showPostCreate} onOpenChange={setShowPostCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Account Created ✓</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">What would you like to do next?</p>
          <div className="space-y-3 pt-2">
            <button
              onClick={() => { setShowPostCreate(false); navigate('/settings', { state: { tab: 'import' } }); }}
              className="w-full flex items-center gap-4 p-4 rounded-xl border hover:border-primary/40 hover:bg-accent/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <FileUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Import CSV</p>
                <p className="text-xs text-muted-foreground">Upload transactions from a bank statement</p>
              </div>
            </button>
            <button
              onClick={() => setShowPostCreate(false)}
              className="w-full flex items-center gap-4 p-4 rounded-xl border hover:border-primary/40 hover:bg-accent/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <PenLine className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Add Transactions Later</p>
                <p className="text-xs text-muted-foreground">You can always import or add them manually</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
