import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useRuleSuggestions,
  useIgnoredSuggestions,
  inferCategoryName,
  type RuleSuggestion,
} from '@/hooks/useRuleSuggestions';
import { useCategoryTree } from '@/hooks/useCategoryTree';
import { useCreateRecurringExpense } from '@/hooks/useRecurringExpenses';

/** Subset of suggestions that are recurring-type. */
export function useRecurringSuggestions(): RuleSuggestion[] {
  const all = useRuleSuggestions();
  return useMemo(() => all.filter(s => s.type === 'recurring'), [all]);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DraftFields {
  name: string;
  amount: string;
  currency: string;
  categoryId: string;
}

export function RecurringSuggestionsDialog({ open, onOpenChange }: Props) {
  const suggestions = useRecurringSuggestions();
  const { ignore } = useIgnoredSuggestions();
  const { tree } = useCategoryTree();
  const createItem = useCreateRecurringExpense();

  const defaultCategoryId = (name: string): string => {
    const inferred = inferCategoryName(name);
    if (inferred) {
      const match = tree.find(c => c.name.toLowerCase() === inferred.toLowerCase());
      if (match) return match.id;
    }
    return tree[0]?.id || '';
  };

  // Per-suggestion editable draft. Initialized lazily on first edit/save.
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const getDraft = (s: RuleSuggestion): DraftFields => {
    if (drafts[s.id]) return drafts[s.id];
    return {
      name: s.merchant,
      amount: s.avgAmount ? s.avgAmount.toFixed(2) : '',
      currency: 'USD', // avgAmount is normalized to USD in useRuleSuggestions
      categoryId: defaultCategoryId(s.merchant),
    };
  };

  const updateDraft = (id: string, patch: Partial<DraftFields>) => {
    setDrafts(d => ({ ...d, [id]: { ...getDraftRef(id), ...patch } }));
  };
  const getDraftRef = (id: string): DraftFields => {
    const existing = drafts[id];
    if (existing) return existing;
    const s = suggestions.find(x => x.id === id);
    return s
      ? {
          name: s.merchant,
          amount: s.avgAmount ? s.avgAmount.toFixed(2) : '',
          currency: 'USD',
          categoryId: defaultCategoryId(s.merchant),
        }
      : { name: '', amount: '', currency: 'USD', categoryId: tree[0]?.id || '' };
  };

  const handleAdd = async (s: RuleSuggestion) => {
    const d = getDraft(s);
    const cat = tree.find(c => c.id === d.categoryId);
    if (!d.name || !d.amount || !cat) {
      toast.error('Completá nombre, monto y categoría');
      return;
    }
    setBusyId(s.id);
    try {
      const nextDue = new Date();
      nextDue.setDate(1);
      nextDue.setMonth(nextDue.getMonth() + 1);
      await createItem.mutateAsync({
        name: d.name,
        type: cat.name.toLowerCase().replace(/\s+/g, '_'),
        category_id: cat.id,
        linked_category_id: cat.id,
        amount: parseFloat(d.amount),
        currency: d.currency,
        frequency: 'monthly',
        due_day: 1,
        next_due_date: nextDue.toISOString().split('T')[0],
        is_active: true,
      } as any);
      ignore(s.id); // dismiss so it won't re-appear
      toast.success(`${d.name} agregado a Recurrentes`);
      setEditingId(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al agregar');
    } finally {
      setBusyId(null);
    }
  };

  const handleIgnore = (s: RuleSuggestion) => {
    ignore(s.id);
    toast(`${s.merchant} ignorado`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Posibles gastos recurrentes
          </DialogTitle>
        </DialogHeader>

        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No hay sugerencias pendientes ✓
          </p>
        ) : (
          <div className="space-y-2 pt-2">
            {suggestions.map(s => {
              const d = getDraft(s);
              const isEditing = editingId === s.id;
              const isBusy = busyId === s.id;
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-border/60 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {s.merchant}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        ~${(s.avgAmount || 0).toFixed(2)} USD/mes ·{' '}
                        {s.count} {s.count === 1 ? 'mes' : 'meses'}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      recurrente
                    </Badge>
                  </div>

                  {isEditing && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <Label className="text-[11px]">Nombre</Label>
                        <Input
                          className="h-8 mt-0.5"
                          value={d.name}
                          onChange={e => updateDraft(s.id, { name: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <Label className="text-[11px]">Monto</Label>
                          <Input
                            type="number"
                            className="h-8 mt-0.5"
                            value={d.amount}
                            onChange={e => updateDraft(s.id, { amount: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-[11px]">Moneda</Label>
                          <Select
                            value={d.currency}
                            onValueChange={v => updateDraft(s.id, { currency: v })}
                          >
                            <SelectTrigger className="h-8 mt-0.5">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="ARS">ARS</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px]">Categoría</Label>
                        <Select
                          value={d.categoryId}
                          onValueChange={v => updateDraft(s.id, { categoryId: v })}
                        >
                          <SelectTrigger className="h-8 mt-0.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {tree.map(c => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.icon} {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleIgnore(s)}
                      disabled={isBusy}
                    >
                      <X className="h-3 w-3 mr-1" /> Ignorar
                    </Button>
                    {!isEditing ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setEditingId(s.id)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleAdd(s)}
                          disabled={isBusy}
                        >
                          Agregar a Recurrentes
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleAdd(s)}
                        disabled={isBusy}
                      >
                        {isBusy ? 'Agregando…' : 'Confirmar'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Button + dialog combo. Shows nothing when there are zero suggestions. */
export function RecurringSuggestionsBadge() {
  const suggestions = useRecurringSuggestions();
  const [open, setOpen] = useState(false);
  if (suggestions.length === 0) return null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs">Sugerencias</span>
        <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
          {suggestions.length}
        </Badge>
      </Button>
      <RecurringSuggestionsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
