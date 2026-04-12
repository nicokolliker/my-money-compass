import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useWiseProfiles, useWiseBalances, useWiseSyncTransactions, useWiseSyncLog } from '@/hooks/useWiseSync';
import { useAccounts, useCreateAccount } from '@/hooks/useAccounts';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Wifi } from 'lucide-react';
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
  const [syncing, setSyncing] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      const res = await getProfiles.mutateAsync();
      setProfiles(res.profiles || []);
      if (res.profiles?.length > 0) {
        setSelectedProfile(res.profiles[0].id);
        setConnected(true);
        // Auto-fetch balances
        const bRes = await getBalances.mutateAsync(res.profiles[0].id);
        setBalances(bRes.balances || []);
        toast.success('Connected to Wise');
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
    });
    return res.id;
  };

  const handleSync = async (balance: WiseBalance) => {
    if (!selectedProfile) return;
    setSyncing(balance.currency);
    try {
      const accountId = await findOrCreateAccount(balance.currency);
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 3);

      const res = await syncTx.mutateAsync({
        profileId: selectedProfile,
        balanceId: balance.id,
        accountId,
        currency: balance.currency,
        intervalStart: start.toISOString(),
        intervalEnd: end.toISOString(),
      });
      toast.success(`Imported ${res.imported} new transactions (${balance.currency})`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSyncing(null);
  };

  const lastSync = syncLog?.[0];

  return (
    <div className="space-y-4 mt-4">
      {!connected ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-16 h-16 rounded-2xl bg-[#9fe870]/20 flex items-center justify-center">
                <Wifi className="h-8 w-8 text-[#9fe870]" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-foreground">Connect to Wise</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Sync your Wise balances and transactions automatically
                </p>
              </div>
              <Button onClick={handleConnect} disabled={getProfiles.isPending}>
                {getProfiles.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wifi className="h-4 w-4 mr-2" />}
                Connect Wise
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Profile selector */}
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
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefreshBalances} disabled={getBalances.isPending}>
                <RefreshCw className={`h-3.5 w-3.5 ${getBalances.isPending ? 'animate-spin' : ''}`} />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {balances.map(b => (
                <div key={b.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-accent/50">
                  <div>
                    <span className="font-mono font-semibold text-foreground">
                      {b.amount.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{b.currency}</span>
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
              ))}
              {balances.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No balances found</p>
              )}
            </CardContent>
          </Card>

          {/* Last sync info */}
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
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
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
