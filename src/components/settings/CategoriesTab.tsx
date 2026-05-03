import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/useCategories';
import { Plus, Trash2, Pencil, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

const ICON_OPTIONS = [
  '🍔', '🥬', '🍕', '☕', '🍷',
  '🚗', '🚕', '✈️', '🏠', '🏢',
  '🎬', '🎵', '🎮', '📺', '🎭',
  '🛍️', '👗', '👟', '💄', '🛒',
  '💊', '🏥', '🏋️', '🧘', '💪',
  '📚', '🎓', '💻', '📱', '🔧',
  '🔄', '💰', '📈', '💳', '🏦',
  '⚡', '🛡️', '🎁', '👤', '📌',
  '🐕', '🍼', '🧹', '🔑', '🎪',
  '💵', '🤖', '☁️', '🌐', '📝',
];

const COLOR_OPTIONS = [
  { label: 'Orange', value: '24, 100%, 50%', hex: '#f97316' },
  { label: 'Blue', value: '217, 91%, 60%', hex: '#3b82f6' },
  { label: 'Violet', value: '258, 90%, 66%', hex: '#8b5cf6' },
  { label: 'Pink', value: '330, 81%, 60%', hex: '#ec4899' },
  { label: 'Amber', value: '38, 92%, 50%', hex: '#f59e0b' },
  { label: 'Emerald', value: '160, 84%, 39%', hex: '#10b981' },
  { label: 'Cyan', value: '189, 94%, 43%', hex: '#06b6d4' },
  { label: 'Indigo', value: '239, 84%, 67%', hex: '#6366f1' },
  { label: 'Teal', value: '168, 76%, 42%', hex: '#14b8a6' },
  { label: 'Rose', value: '347, 77%, 50%', hex: '#f43f5e' },
  { label: 'Green', value: '142, 71%, 45%', hex: '#22c55e' },
  { label: 'Sky', value: '199, 89%, 48%', hex: '#0ea5e9' },
  { label: 'Lime', value: '84, 81%, 44%', hex: '#84cc16' },
  { label: 'Fuchsia', value: '292, 84%, 61%', hex: '#d946ef' },
  { label: 'Slate', value: '215, 16%, 47%', hex: '#64748b' },
];

export default function CategoriesTab() {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', icon: '📌', color: '215, 16%, 47%' });

  const openNew = () => {
    setEditId(null);
    setForm({ name: '', icon: '📌', color: '215, 16%, 47%' });
    setShowForm(true);
  };

  const openEdit = (cat: any) => {
    setEditId(cat.id);
    setForm({ name: cat.name, icon: cat.icon || '📌', color: cat.color || '215, 16%, 47%' });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editId) {
        await updateCategory.mutateAsync({ id: editId, name: form.name.trim(), icon: form.icon, color: form.color });
        toast.success('Category updated');
      } else {
        await createCategory.mutateAsync({ name: form.name.trim(), icon: form.icon, color: form.color, sort_order: categories?.length || 0 });
        toast.success('Category created');
      }
      setShowForm(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory.mutateAsync(id);
      toast.success('Category deleted');
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{categories?.length || 0} categories</p>
        <Button size="sm" className="rounded-xl" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>

      <div className="space-y-1">
        {categories?.map(c => (
          <button
            key={c.id}
            onClick={() => openEdit(c)}
            className="flex items-center gap-3 w-full py-3 px-3 rounded-xl hover:bg-accent/60 active:bg-accent transition-colors text-left"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
              style={{ backgroundColor: c.color ? `hsl(${c.color} / 0.15)` : 'hsl(var(--muted))' }}
            >
              {c.icon || '📌'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{c.name}</p>
              {c.is_system && <span className="text-[10px] text-muted-foreground">System</span>}
            </div>
            <div
              className="w-4 h-4 rounded-full border-2 border-background shadow-sm"
              style={{ backgroundColor: c.color ? `hsl(${c.color})` : '#9ca3af' }}
            />
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        ))}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Category' : 'New Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-4 pb-4">
            {/* Preview */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-accent/30">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                style={{ backgroundColor: `hsl(${form.color} / 0.15)` }}
              >
                {form.icon}
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{form.name || 'Category Name'}</p>
                <p className="text-xs text-muted-foreground">Preview</p>
              </div>
            </div>

            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="mt-1 rounded-xl"
                placeholder="e.g. Food & Drink"
              />
            </div>

            {/* Icon Picker */}
            <div>
              <Label>Icon</Label>
              <div className="grid grid-cols-10 gap-1.5 mt-2">
                {ICON_OPTIONS.map(icon => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, icon }))}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg hover:bg-accent transition-colors ${form.icon === icon ? 'ring-2 ring-primary bg-primary/10' : ''}`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Picker */}
            <div>
              <Label>Color</Label>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {COLOR_OPTIONS.map(color => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, color: color.value }))}
                    className={`h-10 rounded-lg flex items-center justify-center text-xs font-medium transition-all ${form.color === color.value ? 'ring-2 ring-offset-2 ring-primary scale-105' : 'hover:scale-105'}`}
                    style={{ backgroundColor: `hsl(${color.value} / 0.2)`, color: color.hex }}
                  >
                    {color.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {editId && (
                <Button
                  variant="destructive"
                  className="rounded-xl"
                  onClick={() => { handleDelete(editId); setShowForm(false); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button className="flex-1 h-12 rounded-xl" onClick={handleSave} disabled={createCategory.isPending || updateCategory.isPending}>
                {editId ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
