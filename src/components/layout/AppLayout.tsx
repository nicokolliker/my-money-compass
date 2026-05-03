import { ReactNode, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Wallet, ArrowLeftRight, BarChart3, Repeat, BookOpen, Plus,
  CalendarDays, Target, LogOut, Upload, ChevronDown, ChevronRight, Tag, Store, DollarSign, Plug, LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { DebugPanel } from '@/components/DebugPanel';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type NavLeaf = { path: string; label: string; icon: any };
type NavGroup = { label: string; icon: any; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

const NAV: NavEntry[] = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/transactions', label: 'Activity', icon: ArrowLeftRight },
  {
    label: 'Planning', icon: Target, children: [
      { path: '/planning/recurring', label: 'Recurring', icon: Repeat },
      { path: '/planning/calendar', label: 'Calendar', icon: CalendarDays },
      { path: '/planning/budget', label: 'Budget', icon: Target },
    ],
  },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  {
    label: 'Rules & Data', icon: BookOpen, children: [
      { path: '/rules', label: 'Rules', icon: BookOpen },
      { path: '/rules/categories', label: 'Categories', icon: Tag },
      { path: '/rules/merchants', label: 'Merchants', icon: Store },
      { path: '/rules/fx', label: 'FX Rates', icon: DollarSign },
    ],
  },
  { path: '/import', label: 'Import', icon: Upload },
  { path: '/integrations', label: 'Integrations', icon: Plug },
];

const MOBILE_TOP = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/transactions', label: 'Activity', icon: ArrowLeftRight },
];
const MOBILE_BOTTOM = [
  { path: '/planning/recurring', label: 'Planning', icon: Target },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
];

function isLeaf(e: NavEntry): e is NavLeaf {
  return (e as NavLeaf).path !== undefined;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { signOut } = useAuth();
  const qc = useQueryClient();

  const initialOpen: Record<string, boolean> = {};
  NAV.forEach(e => {
    if (!isLeaf(e)) {
      const childActive = e.children.some(c => location.pathname === c.path || location.pathname.startsWith(c.path + '/'));
      initialOpen[e.label] = childActive || ['Planning'].includes(e.label);
    }
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        qc.invalidateQueries();
      }
    });
    return () => subscription.unsubscribe();
  }, [qc]);

  const renderLeaf = (item: NavLeaf, indent = false) => {
    const active = location.pathname === item.path;
    return (
      <button
        key={item.path}
        onClick={() => navigate(item.path)}
        className={cn(
          'flex items-center gap-3 w-full rounded-xl text-sm font-medium transition-all duration-200',
          indent ? 'pl-9 pr-3 py-2 text-[13px]' : 'px-3 py-2.5',
          active
            ? 'bg-gradient-to-r from-primary to-[hsl(var(--primary-glow))] text-primary-foreground shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.5)]'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {item.label}
      </button>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — glass */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:p-3 z-30">
        <div className="flex flex-col h-full glass-panel rounded-2xl shadow-[0_8px_32px_-8px_hsl(220_40%_30%_/_0.12)]">
          <div className="flex h-16 items-center px-5 border-b border-border/40">
            <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-primary to-[hsl(var(--primary-glow))] bg-clip-text text-transparent">
              FinTrack
            </h1>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(entry => {
            if (isLeaf(entry)) return renderLeaf(entry);
            const open = openGroups[entry.label];
            const hasActive = entry.children.some(c => location.pathname === c.path);
            return (
              <div key={entry.label}>
                <button
                  onClick={() => setOpenGroups(g => ({ ...g, [entry.label]: !open }))}
                  className={cn(
                    'flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                    hasActive ? 'text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <entry.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{entry.label}</span>
                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                {open && (
                  <div className="mt-0.5 space-y-0.5">
                    {entry.children.map(c => renderLeaf(c, true))}
                  </div>
                )}
              </div>
            );
          })}
          </nav>
          <div className="p-3 border-t border-border/40 space-y-2">
            <Button className="w-full rounded-xl h-11 shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.5)]" onClick={() => setShowQuickAdd(true)}>
              <Plus className="h-4 w-4 mr-2" /> Quick Add
            </Button>
            <Button variant="ghost" className="w-full rounded-xl h-9 text-muted-foreground hover:text-foreground" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 lg:ml-64 pb-24 lg:pb-0">
        <div className="max-w-3xl mx-auto px-4 py-6 lg:px-8 lg:py-10">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav — glass */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 glass-panel border-t border-border/50 z-50 safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {MOBILE_TOP.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1.5 px-3 text-[10px] font-medium transition-colors',
                location.pathname === item.path ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5 transition-transform', location.pathname === item.path && 'scale-110')} />
              {item.label}
            </button>
          ))}
          <button
            onClick={() => setShowQuickAdd(true)}
            className="flex items-center justify-center -mt-7 rounded-2xl bg-primary text-primary-foreground shadow-elevated active:scale-95 transition-transform"
            style={{ width: 52, height: 52 }}
          >
            <Plus className="h-6 w-6" />
          </button>
          {MOBILE_BOTTOM.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1.5 px-3 text-[10px] font-medium transition-colors',
                location.pathname === item.path ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5 transition-transform', location.pathname === item.path && 'scale-110')} />
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Quick Add Dialog */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva transacción</DialogTitle>
          </DialogHeader>
          <TransactionForm onSuccess={() => setShowQuickAdd(false)} />
        </DialogContent>
      </Dialog>
      <DebugPanel />
    </div>
  );
}
