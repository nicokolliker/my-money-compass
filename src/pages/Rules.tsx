import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useRules, useCreateRule, useDeleteRule } from '@/hooks/useRules';
import { useCategories } from '@/hooks/useCategories';
import { Plus, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export default function Rules() {
  const { data: rules, isLoading } = useRules();
  const { data: categories } = useCategories();
  const createRule = useCreateRule();
  const deleteRule = useDeleteRule();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ keyword: '', match_field: 'description', category_id: '', mark_as_subscription: false });

  const handleSave = async () => {
    try {
      await createRule.mutateAsync({ ...form, category_id: form.category_id || null } as any);
      toast.success('Rule created');
      setShowForm(false);
      setForm({ keyword: '', match_field: 'description', category_id: '', mark_as_subscription: false });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRule.mutateAsync(id);
      toast.success('Rule deleted');
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Rules</h1>
        <Button size="sm" onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" /> Add Rule</Button>
      </div>

      <p className="text-sm text-muted-foreground">Auto-categorize transactions by keyword matching.</p>

      <div className="space-y-2">
        {rules?.map(rule => (
          <Card key={rule.id}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center">
                <Zap className="h-4 w-4 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">"{rule.keyword}"</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Match {rule.match_field}</span>
                  <span>→</span>
                  <span>{(rule as any).categories?.name || 'No category'}</span>
                  {rule.mark_as_subscription && <Badge variant="secondary" className="text-[10px] h-4 px-1">Sub</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(rule.id)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {rules?.length === 0 && <p className="text-center py-8 text-muted-foreground">No rules yet. Create one to auto-categorize transactions.</p>}
      </div>

      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>New Rule</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Keyword</Label><Input value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} placeholder="e.g. UBER" className="mt-1" /></div>
            <div>
              <Label>Match Field</Label>
              <Select value={form.match_field} onValueChange={v => setForm(f => ({ ...f, match_field: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="description">Description</SelectItem>
                  <SelectItem value="merchant">Merchant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.mark_as_subscription} onChange={e => setForm(f => ({ ...f, mark_as_subscription: e.target.checked }))} />
              Mark as subscription
            </label>
            <Button className="w-full h-12" onClick={handleSave} disabled={createRule.isPending}>Save Rule</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
