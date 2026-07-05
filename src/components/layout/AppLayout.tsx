import { ReactNode, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Wallet, ArrowLeftRight, BarChart3, Repeat, BookOpen, Plus,
  CalendarDays, Target, LogOut, Upload, ChevronDown, ChevronRight, Tag, Store, DollarSign, Plug, LayoutGrid, CreditCard, Receipt, Eye, EyeOff, MoreHorizontal,
  Moon, Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { DebugPanel } from '@/components/DebugPanel';
import { useAuth } from '@/hooks/useAuth';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { useTheme } from '@/hooks/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type NavLeaf = { path: string; label: string; icon: any };
type NavGroup = { label: string; icon: any; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

const NAV: NavEntry[] = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/debts', label: 'Deudas y créditos', icon: CreditCard },
  { path: '/monotributo', label: 'Monotributo', icon: Receipt },
  { path: '/transactions', label: 'Activity', icon: ArrowLeftRight },
  {
    label: 'Planning', icon: Target, children: [
      { path: '/planning/recurring', label: 'Recurring', icon: Repeat },
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
  { path: '/integrations', label: 'Integrations', icon: Plug },
];

const MOBILE_LEFT = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
];
const MOBILE_RIGHT = [
  { path: '/transactions', label: 'Activity', icon: ArrowLeftRight },
];

const MORE_ITEMS: { path: string; label: string; icon: any }[] = [
  { path: '/debts', label: 'Deudas y créditos', icon: CreditCard },
  { path: '/monotributo', label: 'Monotributo', icon: Receipt },
  { path: '/planning/recurring', label: 'Planning · Recurring', icon: Repeat },
  { path: '/planning/budget', label: 'Planning · Budget', icon: Target },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/rules', label: 'Rules', icon: BookOpen },
  { path: '/rules/categories', label: 'Categories', icon: Tag },
  { path: '/rules/merchants', label: 'Merchants', icon: Store },
  { path: '/rules/fx', label: 'FX Rates', icon: DollarSign },
  { path: '/integrations', label: 'Integrations', icon: Plug },
  { path: '/settings', label: 'Settings', icon: LayoutGrid },
];

function isLeaf(e: NavEntry): e is NavLeaf {
  return (e as NavLeaf).path !== undefined;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { signOut } = useAuth();
  const { isPrivate, togglePrivacy } = usePrivacyMode();
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
          'flex items-center gap-3 w-full rounded-lg text-sm font-medium transition-all duration-200',
          indent ? 'pl-9 pr-3 py-2 text-[13px]' : 'px-3 py-2.5',
          active
            ? 'flowit-tab-active'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {item.label}
      </button>
    );
  };

  return (
    <div className="relative flex min-h-screen">
      {/* Animated gradient orbs background — indigo/violet */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div
          className="absolute top-[-20%] left-[-10%] w-[55vw] h-[55vw] rounded-full opacity-[0.18] blur-3xl"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)',
            animation: 'drift 18s ease-in-out infinite',
          }}
        />
        <div
          className="absolute bottom-[-15%] right-[-10%] w-[50vw] h-[50vw] rounded-full opacity-[0.15] blur-3xl"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary-glow)) 0%, transparent 70%)',
            animation: 'drift 22s ease-in-out infinite reverse',
          }}
        />
      </div>

      {/* Desktop sidebar — clean white card */}
      <aside className="hidden lg:flex lg:w-72 lg:flex-col lg:fixed lg:inset-y-0 lg:p-3 z-30">
        <div className="flex flex-col h-full bg-white border border-border rounded-2xl shadow-[0_8px_28px_-18px_rgba(94,108,246,0.25)]">
          <div className="flex h-16 items-center gap-2.5 px-5 border-b border-border">
            <img src="/compass.svg" alt="My Money Compass" className="h-7 w-7 shrink-0" />
            <h1 className="font-display text-base font-semibold tracking-tight text-foreground">
              My Money Compass
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
                    'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    hasActive ? 'text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
          <div className="p-3 border-t border-border space-y-2">
            <Button
              variant="outline"
              className="w-full rounded-lg h-9 justify-start text-muted-foreground hover:text-foreground"
              onClick={togglePrivacy}
              title={isPrivate ? 'Mostrar montos' : 'Ocultar montos'}
            >
              {isPrivate ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {isPrivate ? 'Mostrar montos' : 'Modo privado'}
            </Button>
            <Button className="w-full rounded-lg h-11" onClick={() => setShowQuickAdd(true)}>
              <Plus className="h-4 w-4 mr-2" /> Quick Add
            </Button>
            <Button variant="ghost" className="w-full rounded-lg h-9 text-muted-foreground hover:text-foreground" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 lg:ml-72 pb-24 lg:pb-0">
        {/* Mobile floating privacy toggle */}
        <button
          onClick={togglePrivacy}
          className="lg:hidden fixed top-3 right-3 z-40 h-9 w-9 rounded-full glass-panel border border-border/50 flex items-center justify-center text-muted-foreground active:scale-95 transition-transform"
          aria-label={isPrivate ? 'Mostrar montos' : 'Ocultar montos'}
        >
          {isPrivate ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <div className="max-w-5xl mx-auto px-4 py-6 lg:px-6 lg:py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile bottom nav — glass */}
      {(() => {
        const moreActive = MORE_ITEMS.some(i => location.pathname === i.path || location.pathname.startsWith(i.path + '/'));
        const renderTab = (item: { path: string; label: string; icon: any }) => (
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
        );
        return (
          <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-border z-50 safe-area-bottom">
            <div className="flex items-center justify-around h-16">
              {MOBILE_LEFT.map(renderTab)}
              <button
                onClick={() => setShowQuickAdd(true)}
                className="flowit-gradient flex items-center justify-center -mt-7 rounded-2xl text-white shadow-[0_8px_20px_-8px_rgba(94,108,246,0.55)] active:scale-95 transition-transform"
                style={{ width: 52, height: 52 }}
              >
                <Plus className="h-6 w-6" />
              </button>
              {MOBILE_RIGHT.map(renderTab)}
              <button
                onClick={() => setShowMore(true)}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 py-1.5 px-3 text-[10px] font-medium transition-colors',
                  moreActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <MoreHorizontal className={cn('h-5 w-5 transition-transform', moreActive && 'scale-110')} />
                More
                {moreActive && (
                  <span className="absolute top-1 right-2 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            </div>
          </nav>
        );
      })()}

      {/* Mobile "More" drawer */}
      <Sheet open={showMore} onOpenChange={setShowMore}>
        <SheetContent
          side="bottom"
          className="lg:hidden rounded-t-2xl max-h-[80vh] overflow-y-auto p-0 border-t border-border/60"
        >
          <div className="sticky top-0 bg-background/95 backdrop-blur-sm pt-3 pb-2 px-5 border-b border-border/40">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-muted-foreground/30 mb-3" />
            <h2 className="text-sm font-semibold">Más opciones</h2>
          </div>
          <div className="p-3 space-y-1">
            {MORE_ITEMS.map(item => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setShowMore(false); }}
                  className={cn(
                    'flex items-center gap-3 w-full rounded-lg px-3 py-3 text-sm font-medium transition-all',
                    active
                      ? 'flowit-tab-active'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
            <div className="pt-2 mt-2 border-t border-border/40">
              <button
                onClick={() => { setShowMore(false); signOut(); }}
                className="flex items-center gap-3 w-full rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sign Out
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
