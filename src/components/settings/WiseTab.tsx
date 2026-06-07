import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useWiseProfiles, useWiseBalances, useWiseSyncTransactions, useWiseSyncLog, type WiseSyncResult } from '@/hooks/useWiseSync';
import { useAccounts, useCreateAccount } from '@/hooks/useAccounts';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Wifi, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

interface WiseProfile { id: number; type: string; fullName?: string; }
interface WiseBalance { id: number; currency: string; amount: { value: number; currency: string }; }

export default function WiseTab() {
  const { data: accounts } = useAccounts();
  const createAccount = useCreateAccount();
  const getProfiles = useWiseProfiles();
  const getBalances = useWiseBalances();
  const syncTx = useWiseSyncTransactions();
  const { data: syncLog } = useWiseSyncLog();

  const [profiles, setProfiles] = useState<WiseProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [balances, setBalances] = useState<WiseBalance[]>([]);
  const [connected, setConnected] = useState(false);
  const [apiToken, setApiToken] = useState('');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, WiseSyncResult>>({});

  const handleConnect = async () => {
    if (!apiToken.trim()) {
      toast.error('Pegá tu Wise API token primero');
      return;
    }
    try {
      const res = await getProfiles.mutateAsync(apiToken.trim());
      setProfiles(res.profiles || []);
      if (res.profiles?.length > 0) {
        setSelectedProfile(res.profiles[0].id);
        setConnected(true);
        const bRes = await getBalances.mutateAsync(res.profiles[0].id);
        setBalances(bRes.balances || []);
        toast.success('Connected to Wise');
      } else {
        toast.error('No se encontraron perfiles en Wise');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRefreshBalances = async () => {
    if (!selectedProfile) return;
    try {
      const bRes = await getBalances.mutateAsync(selectedProfile);
      setBalances(bRes.balances || []);
    } catch (e: any) { toast.error(e.message); }
  };

  const findOrCreateAccount = async (currency: string): Promise<string> => {
    const existing = accounts?.find(a =>
      a.name.toLowerCase().includes('wise') && a.currency === currency
    );
    if (existing) return existing.id;

    const res = await createAccount.mutateAsync({
      name: `Wise ${currency}`,
      type: 'digital_wallet',
      currency,
      institution: 'Wise',
      source: 'wise',
    });
    return res.id;
  };

  const handleSync = async (balance: WiseBalance) => {
    if (!selectedProfile) return;
    setSyncing(balance.currency);
    try {
      const accountId = await findOrCreateAccount(balance.currency);
      const res = await syncTx.mutateAsync({
        profileId: selectedProfile,
        balanceId: balance.id,
        accountId,
        currency: balance.currency,
      });
      setSyncResults(prev => ({ ...prev, [balance.currency]: res }));
      toast.success(`Imported ${res.imported} new transactions (${balance.currency}), skipped ${res.skipped} duplicates`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSyncing(null);
  };

  const handleSyncAll = async () => {
    for (const b of balances) {
      await handleSync(b);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      {!connected ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--primary))]/10 flex items-center justify-center">
                <Wifi className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-foreground">Connect to Wise</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Sync your Wise balances and transactions automatically
                </p>
              </div>
              <div className="w-full max-w-sm space-y-2">
                <Label htmlFor="wise-token" className="text-xs">Wise API token</Label>
                <input
                  id="wise-token"
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Pegá tu API token de Wise"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  Generá uno en{' '}
                  <a
                    href="https://wise.com/settings/api-tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    wise.com/settings/api-tokens
                  </a>
                </p>
              </div>
              <Button onClick={handleConnect} disabled={getProfiles.isPending || !apiToken.trim()}>
                {getProfiles.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wifi className="h-4 w-4 mr-2" />}
                Connect Wise
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {profiles.length > 1 && (
            <Card>
              <CardContent className="pt-4">
                <Label className="text-xs">Profile</Label>
                <Select
                  value={String(selectedProfile)}
                  onValueChange={v => {
                    setSelectedProfile(Number(v));
                    getBalances.mutateAsync(Number(v)).then(r => setBalances(r.balances || []));
                  }}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.fullName || p.type} ({p.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Balances & sync */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Wise Balances</CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={!!syncing}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                  Sync All
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefreshBalances} disabled={getBalances.isPending}>
                  <RefreshCw className={`h-3.5 w-3.5 ${getBalances.isPending ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {balances.map(b => {
                const result = syncResults[b.currency];
                return (
                  <div key={b.id} className="rounded-lg border bg-accent/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-semibold text-foreground">
                          {b.amount.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <span className="ml-1.5 text-xs text-muted-foreground">{b.currency}</span>
                        <Badge variant="secondary" className="ml-2 text-[10px]">Official</Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSync(b)}
                        disabled={syncing === b.currency}
                      >
                        {syncing === b.currency ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Sync
                      </Button>
                    </div>

                    {/* Debug / reconciliation info */}
                    {result && (
                      <div className="text-xs space-y-1 border-t pt-2 text-muted-foreground">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <span>Official balance:</span>
                          <span className="font-mono text-foreground">{result.official_balance?.toFixed(2) ?? '—'}</span>
                          <span>Sum of imported txns:</span>
                          <span className="font-mono text-foreground">{result.sum_imported?.toFixed(2) ?? '—'}</span>
                          <span>Transaction count:</span>
                          <span className="font-mono text-foreground">{result.tx_count}</span>
                          <span>Date range:</span>
                          <span className="font-mono text-foreground">
                            {result.date_range.start || '—'} → {result.date_range.end || '—'}
                          </span>
                          <span>New imported:</span>
                          <span className="font-mono text-foreground">{result.imported}</span>
                          <span>Skipped (dupes):</span>
                          <span className="font-mono text-foreground">{result.skipped}</span>
                        </div>

                        {result.reconciled === false && (
                          <div className="flex items-center gap-1.5 mt-2 text-amber-500 bg-amber-500/10 rounded-md px-2 py-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-xs font-medium">
                              This account may be partially synced — imported total doesn't match official Wise balance
                            </span>
                          </div>
                        )}
                    {result.reconciled === true && (
                          <div className="flex items-center gap-1.5 mt-2 text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span className="text-xs">Reconciled ✓</span>
                          </div>
                        )}
                        {result.status && result.status !== 'success' && (
                          <div className="flex items-center gap-1.5 mt-2 text-amber-500 bg-amber-500/10 rounded-md px-2 py-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-xs font-medium">
                              Sync status: {result.status}
                            </span>
                          </div>
                        )}
                        {result.diagnostics && result.diagnostics.length > 0 && (
                          <details className="mt-2 text-xs text-muted-foreground">
                            <summary className="cursor-pointer font-medium">Diagnostics</summary>
                            <ul className="mt-1 space-y-0.5 list-disc list-inside">
                              {result.diagnostics.map((d, i) => (
                                <li key={i}>{d}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {result.tx_count === 0 && result.official_balance === 0 && (
                          <div className="flex items-center gap-1.5 mt-2 text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-xs font-medium">
                              Wise connected but no data imported
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {balances.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No balances found</p>
              )}
            </CardContent>
          </Card>

          {/* Recent syncs */}
          {syncLog && syncLog.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Recent Syncs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {syncLog.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2">
                      {log.status === 'success' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      )}
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      +{log.transactions_imported} txns
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
