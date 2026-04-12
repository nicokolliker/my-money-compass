import { useAuth } from '@/hooks/useAuth';
import { useDemoData } from '@/hooks/useDemoData';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useState } from 'react';
import { Bug, X } from 'lucide-react';

export function DebugPanel() {
  const { user } = useAuth();
  const { hasDemoData } = useDemoData();
  const { data: accounts } = useAccounts();
  const { data: transactions } = useTransactions();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 lg:bottom-3 z-[60] w-8 h-8 rounded-full bg-muted border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        title="Debug info"
      >
        <Bug className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-3 lg:bottom-3 z-[60] bg-card border rounded-xl shadow-elevated p-3 text-xs space-y-1 w-64">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-foreground">🐛 Debug</span>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <p className="text-muted-foreground">Email: <span className="text-foreground font-mono">{user?.email || '—'}</span></p>
      <p className="text-muted-foreground">UID: <span className="text-foreground font-mono text-[10px] break-all">{user?.id || '—'}</span></p>
      <p className="text-muted-foreground">has_demo_data: <span className="text-foreground font-mono">{String(hasDemoData)}</span></p>
      <p className="text-muted-foreground">Accounts: <span className="text-foreground font-mono">{accounts?.length ?? '…'}</span></p>
      <p className="text-muted-foreground">Transactions: <span className="text-foreground font-mono">{transactions?.length ?? '…'}</span></p>
    </div>
  );
}
