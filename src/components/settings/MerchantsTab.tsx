import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMerchants, useUpdateMerchant, useDeleteMerchant, useMergeMerchants, useMerchantTransactions, useApplyMerchantCategory, useCreateMerchant } from '@/hooks/useMerchants';
import { syncMerchantsFromImport, cleanupMerchantArtifacts } from '@/lib/merchantSync';
import { useQueryClient } from '@tanstack/react-query';
import { useCategories } from '@/hooks/useCategories';
import { getBrandLogo, getInitialsColor } from '@/lib/brandLogos';
import { MerchantLogo } from '@/components/MerchantLogo';
import { formatCurrency, formatUSD } from '@/lib/constants';
import { Search, Pencil, Trash2, GitMerge, ChevronRight, Upload, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

function MerchantLogoLegacy({ merchant, size = 'md' }: { merchant: any; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-lg';

  if (merchant.logo_url) {
    return <img src={merchant.logo_url} alt={merchant.display_name || merchant.name} className={`${dim} rounded-full object-cover`} />;
  }

  const brand = getBrandLogo(merchant.name);
  if (brand) {
    return <div className={`${dim} rounded-full flex items-center justify-center ${brand.bg}`}>{brand.icon}</div>;
  }

  const colors = getInitialsColor(merchant.name);
  return (
    <div className={`${dim} rounded-full flex items-center justify-center font-bold ${colors.bg} ${colors.text}`}>
      {merchant.name[0]?.toUpperCase()}
    </div>
  );
}

export default function MerchantsTab() {
  const { data: merchants, isLoading } = useMerchants();
  const { data: categories } = useCategories();
  const updateMerchant = useUpdateMerchant();
  const deleteMerchant = useDeleteMerchant();
  const mergeMerchants = useMergeMerchants();

  const qc = useQueryClient();
  const createMerchant = useCreateMerchant();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', domain: '', default_category_id: '' });
  const [generating, setGenerating] = useState(false);

  const handleAdd = async () => {
    if (!addForm.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    try {
      await createMerchant.mutateAsync({
        name: addForm.name.trim(),
        domain: addForm.domain.trim() || null,
        default_category_id: addForm.default_category_id || null,
      });
      toast.success('Merchant creado');
      setAddOpen(false);
      setAddForm({ name: '', domain: '', default_category_id: '' });
    } catch (e: any) { toast.error(e.message); }
  };

  // Backfill: crea merchants a partir de las transacciones YA importadas
  // (el sync automático solo corre en imports nuevos).
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: txs, error } = await supabase
        .from('transactions')
        .select('merchant, description, category_id, type')
        .eq('user_id', user.id)
        .in('type', ['expense', 'income']);
      if (error) throw error;
      const removed = await cleanupMerchantArtifacts();
      const n = await syncMerchantsFromImport(user.id, (txs || []) as any[]);
      qc.invalidateQueries({ queryKey: ['merchants'] });
      const parts: string[] = [];
      if (n > 0) parts.push(`${n} creados`);
      if (removed > 0) parts.push(`${removed} duplicados eliminados`);
      toast.success(parts.length ? `Merchants: ${parts.join(' · ')}` : 'Sin cambios — todo ya existía');
    } catch (e: any) {
      toast.error(e.message || 'Error generando merchants');
    } finally {
      setGenerating(false);
    }
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editSheet, setEditSheet] = useState(false);
  const [mergeDialog, setMergeDialog] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', default_category_id: '', domain: '' });

  const selected = merchants?.find(m => m.id === selectedId);
  const { data: merchantTxs } = useMerchantTransactions(
    selected ? { id: selected.id, name: selected.name } : null,
  );
  const applyCategory = useApplyMerchantCategory();

  const handleApplyToAll = async () => {
    if (!selected || !editForm.default_category_id) return;
    try {
      const n = await applyCategory.mutateAsync({
        merchant: { id: selected.id, name: selected.name },
        categoryId: editForm.default_category_id,
      });
      toast.success(`${n} transacciones actualizadas`);
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = merchants?.filter(m => {
    const q = search.toLowerCase();
    return !q || m.name.toLowerCase().includes(q) || (m.display_name || '').toLowerCase().includes(q);
  });

  const openEdit = (m: any) => {
    setSelectedId(m.id);
    setEditForm({
      display_name: m.display_name || m.name,
      default_category_id: m.default_category_id || '',
      domain: m.domain || '',
    });
    setEditSheet(true);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      await updateMerchant.mutateAsync({
        id: selectedId,
        display_name: editForm.display_name || null,
        default_category_id: editForm.default_category_id || null,
        domain: editForm.domain.trim() || null,
      } as any);
      toast.success('Merchant updated');
      setEditSheet(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    try {
      const ext = file.name.split('.').pop();
      const path = `merchants/${selectedId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(path);
      await updateMerchant.mutateAsync({ id: selectedId, logo_url: urlData.publicUrl });
      toast.success('Logo uploaded');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleMerge = async () => {
    if (!selectedId || !mergeTargetId) return;
    try {
      await mergeMerchants.mutateAsync({ keepId: selectedId, mergeId: mergeTargetId });
      toast.success('Merchants merged');
      setMergeDialog(false);
      setMergeTargetId('');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMerchant.mutateAsync(id);
      toast.success('Merchant deleted');
      setDeleteConfirm(null);
      if (selectedId === id) { setSelectedId(null); setEditSheet(false); }
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-3 mt-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search merchants..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 rounded-xl" />
        </div>
        <Button size="sm" variant="outline" className="h-9 rounded-xl shrink-0" onClick={handleGenerate} disabled={generating}>
          <RefreshCw className={`h-4 w-4 mr-1 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Generando...' : 'Desde transacciones'}
        </Button>
        <Button size="sm" className="h-9 rounded-xl shrink-0" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Agregar
        </Button>
      </div>

      {/* Add Merchant Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo Merchant</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Netflix" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Dominio (para logo automático)</Label>
              <Input value={addForm.domain} onChange={e => setAddForm(f => ({ ...f, domain: e.target.value }))} placeholder="netflix.com" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Categoría default</Label>
              <Select value={addForm.default_category_id || 'none'} onValueChange={v => setAddForm(f => ({ ...f, default_category_id: v === 'none' ? '' : v }))}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full rounded-xl" onClick={handleAdd} disabled={createMerchant.isPending}>
              {createMerchant.isPending ? 'Creando...' : 'Crear merchant'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {!filtered?.length ? (
        <p className="text-center py-8 text-sm text-muted-foreground">No merchants found</p>
      ) : (
        <div className="space-y-1">
          {filtered.map(m => {
            const cat = (m as any).categories;
            return (
              <button
                key={m.id}
                onClick={() => openEdit(m)}
                className="w-full flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-muted/60 transition-colors text-left"
              >
                <MerchantLogo name={m.display_name || m.name} domain={(m as any).domain} size={36} />
                {m.logo_url ? (
                  <img src={m.logo_url} alt="" className="hidden" />
                ) : null}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{m.display_name || m.name}</p>
                  {cat && (
                    <span
                      className="text-[11px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 mt-0.5"
                      style={cat.color ? { backgroundColor: `hsl(${cat.color} / 0.15)`, color: `hsl(${cat.color})` } : undefined}
                    >
                      {cat.icon} {cat.name}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Edit Merchant Dialog */}
      <Dialog open={editSheet} onOpenChange={setEditSheet}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Merchant</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-5 mt-4 overflow-y-auto">
              {/* Logo + Name */}
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <MerchantLogo name={selected.display_name || selected.name} domain={(selected as any).domain || editForm.domain} size={40} />
                  <label className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                    <Upload className="h-4 w-4 text-white" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Display Name</Label>
                  <Input value={editForm.display_name} onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))} className="mt-1 rounded-xl" />
                </div>
              </div>

              {/* Domain (for automatic logo) */}
              <div>
                <Label className="text-xs">Dominio (para logo automático)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    placeholder="netflix.com"
                    value={editForm.domain}
                    onChange={e => setEditForm(f => ({ ...f, domain: e.target.value }))}
                    className="flex-1 rounded-xl"
                  />
                  {editForm.domain.trim() && (
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      <img
                        src={`https://logo.clearbit.com/${editForm.domain.trim()}`}
                        alt="logo preview"
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Ingresá el dominio para mostrar el logo real. Preview en tiempo real.
                </p>
              </div>

              {/* Default Category */}
              <div>
                <Label className="text-xs">Default Category</Label>
                <Select value={editForm.default_category_id || 'none'} onValueChange={v => setEditForm(f => ({ ...f, default_category_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full rounded-xl" onClick={handleSave} disabled={updateMerchant.isPending}>Save</Button>

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setMergeDialog(true)}>
                  <GitMerge className="h-4 w-4 mr-1.5" /> Merge
                </Button>
                <Button variant="destructive" size="icon" className="rounded-xl" onClick={() => setDeleteConfirm(selected.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Transactions for this merchant */}
              {merchantTxs && merchantTxs.length > 0 && (
                <div>
                  <div className="rounded-xl bg-muted/40 px-3 py-2.5 mb-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {merchantTxs.length} transacciones
                    </span>
                    <span className="font-mono font-semibold text-foreground">
                      Total: {formatUSD(merchantTxs.reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount_usd ?? tx.amount) || 0), 0))}
                    </span>
                  </div>
                  {editForm.default_category_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl mb-3"
                      onClick={handleApplyToAll}
                      disabled={applyCategory.isPending}
                    >
                      {applyCategory.isPending ? 'Aplicando...' : `Aplicar categoría a las ${merchantTxs.length} transacciones`}
                    </Button>
                  )}
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Recent Transactions ({merchantTxs.length})
                  </p>
                  <div className="space-y-1 max-h-64 overflow-auto">
                    {merchantTxs.map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between py-2 px-2 rounded-lg bg-accent/30">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{tx.description || tx.merchant}</p>
                          <p className="text-[10px] text-muted-foreground">{tx.date} · {tx.accounts?.name}</p>
                        </div>
                        <span className={`text-xs font-bold tabular-nums shrink-0 ${Number(tx.amount) < 0 ? 'text-destructive' : 'text-success'}`}>
                          {formatCurrency(Number(tx.amount), tx.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <AlertDialog open={mergeDialog} onOpenChange={setMergeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Merchant</AlertDialogTitle>
            <AlertDialogDescription>
              Select a merchant to merge into <strong>{selected?.display_name || selected?.name}</strong>. All their transactions will be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
            <SelectTrigger><SelectValue placeholder="Select merchant to merge" /></SelectTrigger>
            <SelectContent>
              {merchants?.filter(m => m.id !== selectedId).map(m => (
                <SelectItem key={m.id} value={m.id}>{m.display_name || m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMerge} disabled={!mergeTargetId || mergeMerchants.isPending}>Merge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete merchant?</AlertDialogTitle>
            <AlertDialogDescription>This will unlink the merchant from all transactions. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
