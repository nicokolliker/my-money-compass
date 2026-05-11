import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'privacy_mode';

type Ctx = { isPrivate: boolean; togglePrivacy: () => void; setPrivacy: (v: boolean) => void };

const PrivacyContext = createContext<Ctx | null>(null);

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [isPrivate, setIsPrivate] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, isPrivate ? '1' : '0'); } catch {}
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('privacy-mode', isPrivate);
    }
  }, [isPrivate]);

  // Reset on logout
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setIsPrivate(false);
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const togglePrivacy = useCallback(() => setIsPrivate(v => !v), []);

  return (
    <PrivacyContext.Provider value={{ isPrivate, togglePrivacy, setPrivacy: setIsPrivate }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacyMode(): Ctx {
  const ctx = useContext(PrivacyContext);
  if (!ctx) return { isPrivate: false, togglePrivacy: () => {}, setPrivacy: () => {} };
  return ctx;
}

export function maskAmount(value: string | number, isPrivate: boolean): string {
  if (isPrivate) return '••••';
  return String(value);
}
