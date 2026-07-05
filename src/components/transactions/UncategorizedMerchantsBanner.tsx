import { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/hooks/useCategories';
import { useCreateRule } from '@/hooks/useRules';
import { useIgnoredSuggestions } from '@/hooks/useRuleSuggestions';
import { useUncategorizedMerchants, type UncategorizedMerchant } from '@/hooks/useUncategorizedMerchants';
import { DIGITAL_SUBTYPES, getDigitalSubtype } from '@/lib/digitalSubtypes';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface RowState {
  categoryId: string;          // '' = unassigned
  subtype: string;             // only used when category is Digital
  createRule: boolean;
}

export function UncategorizedMerchantsBanner() {
  const merchants = useUncategorizedMerchants(1);
  const { data: categories } = useCategories();
  const { ignore } = useIgnoredSuggestions();
  const createRule = useCreateRule();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [saving, setSaving] = useState(false);

  const digitalCategoryId = categories?.find(c => c.name === 'Digital')?.id;

  // Initialize row state from merchants when opening / list changes
  useEffect(() => {
    if (!open) return;
    setRows(prev => {
      const next = { ...prev };
      for (const m of merchants) {
        if (!next[m.key]) {
          const catId = m.inferredCategoryId ?? '';
          next[m.key] = {
            categoryId: catId,
            subtype: catId && catId === digitalCategoryId ? getDigitalSubtype(m.name) : '',
            createRule: false,
          };
        }
      }
      return next;
    });
  }, [open, merchants, digitalCategoryId]);

  if (merchants.length === 0) return null;

  const totalTxs = merchants.reduce((s, m) => s + m.count, 0);

  const handleIgnore = (m: UncategorizedMerchant) => {
    ignore(m.id);
    toast.message(`${m.name} ignorado`);
  };

  const handleConfirm = async () => {
    const toApply = merchants.filter(m => rows[m.key]?.categoryId);
    if (toApply.length === 0) {
      toast.message('Asigná al menos una categoría');
      return;
    }
    setSaving(true);
    try {
      const { fetchDigitalSubcatMap, resolveDigitalSubcategoryId } = await import('@/lib/applyRules');
      const digitalMap = await fetchDigitalSubcatMap();
      let updatedTxs = 0;
      let createdRules = 0;
      for (const m of toApply) {
        const state = rows[m.key];
        const isDigital = !!digitalCategoryId && state.categoryId === digitalCategoryId;
        const update: { category_id: string; subtype?: string | null; subcategory_id?: string | null } = {
          category_id: state.categoryId,
          subtype: isDigital ? (state.subtype || getDigitalSubtype(m.name)) : null,
          subcategory_id: isDigital
            ? resolveDigitalSubcategoryId(state.categoryId, m.name, digitalMap)
            : null,
        };
        const { error } = await supabase
          .from('transactions')
          .update(update)
          .in('id', m.txIds);
        if (error) throw error;
        updatedTxs += m.txIds.length;

        if (state.createRule) {
          try {
            await createRule.mutateAsync({
              keyword: m.name,
              match_field: 'description',
              category_id: state.categoryId,
              is_active: true,
            } as any);
            createdRules += 1;
          } catch (e: any) {
            console.warn('rule create failed', e?.message);
          }
        }
      }
      await qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(
        `${updatedTxs} transacciones categorizadas${createdRules ? ` · ${createdRules} reglas creadas` : ''}`,
      );
      setOpen(false);
      setRows({});
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              {totalTxs} transacciones sin categoría detectadas
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {merchants.length} comercios → Categorizar ahora
            </p>
          </div>
        </div>
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300 shrink-0">
          Revisar →
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Categorizar comercios</DialogTitle>
            <DialogDescription>
              Asigná una categoría a cada comercio. Marcá "Crear regla" para que futuras transacciones se categoricen automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-2">
            {merchants.map(m => {
              const state: RowState = rows[m.key] ?? { categoryId: m.inferredCategoryId ?? '', subtype: '', createRule: false };
              const isDigital = !!digitalCategoryId && state.categoryId === digitalCategoryId;
              return (
                <div
                  key={m.key}
                  className="rounded-lg border border-border bg-card p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.count} tx · prom. {m.avgAmount.toFixed(2)} {m.currency}
                        {m.inferredCategoryName && (
                          <> · sugerido: <span className="text-foreground">{m.inferredCategoryName}</span></>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleIgnore(m)}
                      title="Ignorar"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={state.categoryId || 'none'}
                      onValueChange={(v) => {
                        const nextCat = v === 'none' ? '' : v;
                        const nextSubtype =
                          nextCat && nextCat === digitalCategoryId
                            ? (state.subtype || getDigitalSubtype(m.name))
                            : '';
                        setRows(prev => ({
                          ...prev,
                          [m.key]: { ...state, categoryId: nextCat, subtype: nextSubtype },
                        }));
                      }}
                    >
                      <SelectTrigger className="h-9 flex-1 min-w-[180px] rounded-lg">
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Sin asignar —</SelectItem>
                        {categories?.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="flex items-center gap-1.5">
                              <span>{c.icon || '📌'}</span>
                              <span>{c.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                      <Checkbox
                        checked={state.createRule}
                        onCheckedChange={(v) =>
                          setRows(prev => ({
                            ...prev,
                            [m.key]: { ...state, createRule: !!v },
                          }))
                        }
                      />
                      Crear regla automática
                    </label>
                  </div>

                  {isDigital && (
                    <Select
                      value={state.subtype || 'otros'}
                      onValueChange={(v) =>
                        setRows(prev => ({
                          ...prev,
                          [m.key]: { ...state, subtype: v },
                        }))
                      }
                    >
                      <SelectTrigger className="h-9 rounded-lg">
                        <SelectValue placeholder="Subtipo digital" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DIGITAL_SUBTYPES).map(([key, { label, icon }]) => (
                          <SelectItem key={key} value={key}>{icon} {label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? 'Guardando…' : 'Confirmar todo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
