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
import { Plus, ChevronDown, FolderPlus, Pencil, Trash2, FileUp, PenLine, Wifi, Clock, AlertTriangle, EyeOff, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { DemoDataBanner } from '@/components/DemoDataBanner';
import { useDemoData } from '@/hooks/useDemoData';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useQueryClient } from '@tanstack/react-query';
import { useImportLog } from '@/hooks/useImportLog';
import { useArqPendingReconciliations } from '@/hooks/useArqReconciliation';
import { ArqReconciliationSheet } from '@/components/accounts/ArqReconciliationSheet';
import { AccountReconciliationSheet } from '@/components/accounts/AccountReconciliationSheet';
import { AccountDetailSheet } from '@/components/accounts/AccountDetailSheet';
import { useQuery } from '@tanstack/react-query';
import { useUserId } from '@/hooks/useAuthUser';
import { useUserSettings } from '@/hooks/useUserSettings';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';




function AccountLogo({ name, institution }: { name: string; institution?: string | null }) {
  // Try institution name first (e.g. "Wise", "Banco Galicia"), then fall back to account name
  const logoName = institution || name;
  return <MerchantLogo name={logoName} size={40} />;
}

export default function Accounts() {
  const navigate = useNavigate();
  const { data: accounts, isLoading } = useAccountBalances();
  const { data: importLog } = useImportLog();
  const { data: arqPending } = useArqPendingReconciliations();

  /** Total USD remaining (transferred - spent) for pending Wise→ARQ transfers */
  const arqPendingTotal = (arqPending || []).reduce(
    (s, r) => s + Math.max(0, Number(r.wise_amount_usd) - Number(r.total_spent_usd ?? 0)), 0
  );
  /** Most recent pending deposit date, for the badge subtitle */
  const arqPendingLatestDate = arqPending?.[0]?.wise_date ?? null;
  const isArqAccount = (name: string) => /arq|dolarapp/i.test(name.toLowerCase());
  const isTrackedDestAccount = (name: string) => /mercado|galicia/i.test(name.toLowerCase());
  const { data: groups } = useAccountGroups();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const createGroup = useCreateAccountGroup();
  const updateGroup = useUpdateAccountGroup();
  const deleteGroup = useDeleteAccountGroup();
  const { hasDemoData, onCleared: onDemoCleared } = useDemoData();
  const { netWorthUsd: totalNetWorth } = useNetWorth();
  const { data: userSettings } = useUserSettings();
  const binanceBalances: any[] = (userSettings as any)?.binance_balances || [];
  const binanceTotalUsd = binanceBalances.reduce((s: number, b: any) => s + (b.value_usd || 0), 0);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'bank' as string, institution: '', currency: 'USD', opening_balance: '0', notes: '', group_id: '', exclude_from_net_worth: false });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showPostCreate, setShowPostCreate] = useState(false);
  const [arqSheetAccount, setArqSheetAccount] = useState<any>(null);
  const [destSheetAccount, setDestSheetAccount] = useState<any>(null);
  const [detailAccount, setDetailAccount] = useState<any>(null);

  // Pending counts per destination account (MP/Galicia) for badges
  const userId = useUserId();
  const { data: destPendingMap } = useQuery({
    queryKey: ['account-reconciliations-pending-map', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('account_reconciliations')
        .select('to_account_id, transfer_amount_usd, total_spent_usd, transfer_date')
        .eq('status', 'pending');
      const map = new Map<string, { total: number; latest: string | null }>();
      for (const r of data || []) {
        const k = r.to_account_id as string;
        const cur = map.get(k) || { total: 0, latest: null };
        const remaining = Math.max(
          0,
          Number(r.transfer_amount_usd || 0) - Number((r as any).total_spent_usd || 0),
        );
        cur.total += remaining;
        const d = r.transfer_date as string;
        if (!cur.latest || d > cur.latest) cur.latest = d;
        map.set(k, cur);
      }
      return map;
    },
  });



  const qc = useQueryClient();

  const IMPORTABLE = ['arq', 'dolarapp', 'mercado', 'galicia'];
  function getLastImport(accountName: string): string | null {
    const lower = (accountName || '').toLowerCase();
    let source = '';
    if (lower.includes('arq') || lower.includes('dolarapp')) source = 'arq';
    else if (lower.includes('mercado')) source = 'mercadopago';
    else if (lower.includes('galicia')) source = 'galicia';
    else return null;
    const entries = (importLog || [])
      .filter(l => l.source === source)
      .sort((a, b) => b.month.localeCompare(a.month));
    return entries[0]?.month || null;
  }

  const sections = useMemo(() => {
    if (!accounts) return [];
    const visibleAccounts = accounts.filter(a =>
      !/deel/i.test(a.name) &&
      !/deel/i.test((a as any).institution || '') &&
      !['debt', 'credit_card'].includes(a.type) &&
      !/splitwise/i.test(a.name)
    );
    const result: { key: string; label: string; icon: string; isCustomGroup: boolean; accounts: typeof accounts }[] = [];
    const assignedIds = new Set<string>();

    if (groups && groups.length > 0) {
      for (const g of groups) {
        const groupAccounts = visibleAccounts.filter(a => a.group_id === g.id);
        result.push({ key: g.id, label: g.name, icon: g.icon || '📁', isCustomGroup: true, accounts: groupAccounts });
        groupAccounts.forEach(a => assignedIds.add(a.id));
      }
      const ungrouped = visibleAccounts.filter(a => !assignedIds.has(a.id));
      if (ungrouped.length > 0) {
        result.push({ key: 'ungrouped', label: 'Ungrouped', icon: '📦', isCustomGroup: false, accounts: ungrouped });
      }
    } else {
      result.push({ key: 'all', label: 'All Accounts', icon: '🏦', isCustomGroup: false, accounts: visibleAccounts });
    }

    return result;
  }, [accounts, groups]);

  async function handleDeleteAccount(id: string) {
    try {
      const { error } = await supabase.from('accounts').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      toast.success('Cuenta eliminada');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar');
    }
  }

  const handleSave = async () => {
    try {
      const payload: any = { name: form.name, type: form.type, institution: form.institution || null, currency: form.currency, opening_balance: parseFloat(form.opening_balance), notes: form.notes || null, exclude_from_net_worth: form.exclude_from_net_worth };
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
    setForm({ name: a.name, type: a.type, institution: a.institution || '', currency: a.currency, opening_balance: String(a.opening_balance), notes: a.notes || '', group_id: a.group_id || '', exclude_from_net_worth: !!(a as any).exclude_from_net_worth });
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
                      <div key={a.id} className="flex items-center gap-1">
                        {isArqAccount(a.name) && (
                          <button
                            onClick={() => setArqSheetAccount(a)}
                            className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors shrink-0"
                            title="Ver conciliaciones"
                          >
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {isTrackedDestAccount(a.name) && (
                          <button
                            onClick={() => setDestSheetAccount(a)}
                            className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors shrink-0"
                            title="Ver conciliaciones"
                          >
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {(() => {
                          const isSpecial = isArqAccount(a.name) || isTrackedDestAccount(a.name);
                          const onRowClick = isSpecial ? () => openEdit(a) : () => setDetailAccount(a);
                          return (
                        <button onClick={onRowClick} className="flex items-center gap-3 flex-1 min-w-0 py-3 text-left hover:bg-accent/50 active:bg-accent rounded-lg px-2 -mx-2 transition-colors">
                          <AccountLogo name={a.name} institution={(a as any).institution} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-foreground truncate">{a.name}</p>
                              {(a as any).source === 'csv' && <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0"><FileUp className="h-2.5 w-2.5 mr-0.5" />CSV</Badge>}
                              {(a as any).source === 'manual' && <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0 text-muted-foreground"><PenLine className="h-2.5 w-2.5 mr-0.5" />Manual</Badge>}
                              {(a as any).exclude_from_net_worth && <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0 text-muted-foreground"><EyeOff className="h-2.5 w-2.5 mr-0.5" />Excluido</Badge>}
                            </div>
                            {a.institution && <p className="text-xs text-muted-foreground">{a.institution}</p>}
                            {IMPORTABLE.some(k => a.name.toLowerCase().includes(k)) && (
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {getLastImport(a.name)
                                  ? <>Últ. extracto: <span className="font-medium">{getLastImport(a.name)}</span></>
                                  : <span className="italic">Sin extracto importado</span>
                                }
                              </p>
                            )}
                            {/* ARQ reconciliation pending badge */}
                            {isArqAccount(a.name) && arqPendingTotal > 0 && (
                              <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5 font-medium">
                                <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                ${arqPendingTotal.toFixed(0)} sin conciliar
                                {arqPendingLatestDate && (
                                  <span className="font-normal text-amber-500">
                                    — desde {arqPendingLatestDate}
                                  </span>
                                )}
                              </p>
                            )}
                            {/* MP/Galicia reconciliation pending badge */}
                            {isTrackedDestAccount(a.name) && (() => {
                              const dp = destPendingMap?.get(a.id);
                              if (!dp || dp.total <= 0) return null;
                              return (
                                <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5 font-medium">
                                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                  ${dp.total.toFixed(0)} sin conciliar
                                  {dp.latest && (
                                    <span className="font-normal text-amber-500">
                                      — desde {dp.latest}
                                    </span>
                                  )}
                                </p>
                              );
                            })()}
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
                          );
                        })()}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(a)}
                          title="Editar cuenta"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar cuenta?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará la cuenta "{a.name}" y todas sus transacciones asociadas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDeleteAccount(a.id)}
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {binanceBalances.length > 0 && (
        <Collapsible open={!collapsed['cripto']} onOpenChange={(open) => setCollapsed(c => ({ ...c, cripto: !open }))}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full px-1 py-2 group">
              <div className="flex items-center gap-2">
                <span className="text-base">₿</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cripto</span>
                <span className="text-xs text-muted-foreground tabular-nums">({binanceBalances.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground tabular-nums">{formatUSD(binanceTotalUsd)}</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${!collapsed['cripto'] ? '' : '-rotate-90'}`} />
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card>
              <CardContent className="divide-y divide-border py-1">
                {binanceBalances.map((b: any) => {
                  const pct = totalNetWorth !== 0 ? (b.value_usd / totalNetWorth * 100) : 0;
                  return (
                    <div key={b.asset} className="flex items-center gap-3 py-3 px-2">
                      <MerchantLogo name="Binance" size={40} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{b.asset}</p>
                        <p className="text-xs text-muted-foreground">Binance</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums text-foreground">
                          ${Number(b.value_usd).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </p>
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {Number(b.total).toFixed(b.asset === 'BTC' ? 8 : 4)} {b.asset}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

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
            {/* PR1: exclude from net worth */}
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <Label className="text-sm cursor-pointer">Excluir del Net Worth</Label>
                  <p className="text-[11px] text-muted-foreground">Para cuentas de seguimiento (ej: Viejo)</p>
                </div>
              </div>
              <Switch
                checked={form.exclude_from_net_worth}
                onCheckedChange={v => setForm(f => ({ ...f, exclude_from_net_worth: v }))}
              />
            </div>
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
              onClick={() => { setShowAddChoice(false); setEditId(null); setForm({ name: '', type: 'bank', institution: '', currency: 'USD', opening_balance: '0', notes: '', group_id: '', exclude_from_net_worth: false }); setShowForm(true); }}
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
      {/* ARQ Reconciliation Sheet */}
      {arqSheetAccount && (
        <ArqReconciliationSheet
          open={!!arqSheetAccount}
          onClose={() => setArqSheetAccount(null)}
          accountName={arqSheetAccount.name}
          balanceUsd={arqSheetAccount.computed_balance_usd}
        />
      )}
      {/* MP/Galicia Reconciliation Sheet */}
      {destSheetAccount && (
        <AccountReconciliationSheet
          open={!!destSheetAccount}
          onClose={() => setDestSheetAccount(null)}
          accountId={destSheetAccount.id}
          accountName={destSheetAccount.name}
          accountInstitution={(destSheetAccount as any).institution}
          balanceUsd={destSheetAccount.computed_balance_usd}
        />
      )}
    </div>
  );
}