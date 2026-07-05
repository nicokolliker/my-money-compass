import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Wifi, Eye, EyeOff, Loader2, RefreshCw, ExternalLink, Bitcoin } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserSettings, useUpsertUserSettings } from '@/hooks/useUserSettings';
import { useAccounts } from '@/hooks/useAccounts';
import { formatDistanceToNow } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { getBrandLogo } from '@/lib/brandLogos';
import { MerchantLogo } from '@/components/MerchantLogo';

export default function IntegrationsPage() {
  const { data: settings, isLoading } = useUserSettings();
  const upsert = useUpsertUserSettings();
  const { data: accounts } = useAccounts();
  const qc = useQueryClient();

  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [binanceKey, setBinanceKey] = useState('');
  const [binanceSecret, setBinanceSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [connectingBinance, setConnectingBinance] = useState(false);
  const [syncingBinance, setSyncingBinance] = useState(false);

  const isBinanceConnected = !!(settings as any)?.binance_api_key;
  const binanceLastSync = (settings as any)?.binance_last_sync as string | null | undefined;
  const binanceBalances: any[] = (settings as any)?.binance_balances || [];
  const binanceTotalUsd = binanceBalances.reduce((s: number, b: any) => s + (b.value_usd || 0), 0);

  async function handleConnectBinance() {
    if (!binanceKey.trim() || !binanceSecret.trim()) {
      toast.error('Ingresá API Key y Secret');
      return;
    }
    setConnectingBinance(true);
    try {
      await upsert.mutateAsync({
        binance_api_key: binanceKey.trim(),
        binance_api_secret: binanceSecret.trim(),
      } as any);
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('sync-binance', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['user-settings'] });
      toast.success('Binance conectado y sincronizado');
      setBinanceKey(''); setBinanceSecret('');
    } catch (e: any) {
      toast.error(e.message || 'Error al conectar');
    } finally {
      setConnectingBinance(false);
    }
  }

  async function handleSyncBinance() {
    setSyncingBinance(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('sync-binance', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['user-settings'] });
      toast.success('Binance sincronizado');
    } catch (e: any) {
      toast.error(e.message || 'Error al sincronizar');
    } finally {
      setSyncingBinance(false);
    }
  }

  async function handleDisconnectBinance() {
    await upsert.mutateAsync({
      binance_api_key: null,
      binance_api_secret: null,
      binance_last_sync: null,
      binance_balances: null,
    } as any);
    toast.success('Binance desconectado');
  }

  const isConnected = !!settings?.wise_token && !!settings?.wise_profile_id;
  const wiseAccounts = (accounts || []).filter(a => /wise/i.test(a.name));
  const brand = getBrandLogo('Wise');

  async function handleConnect() {
    if (!token.trim()) {
      toast.error('Ingresá el token');
      return;
    }
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('wise-sync', {
        body: { action: 'get-profiles', apiToken: token.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const profiles = data?.profiles || [];
      const personal = profiles.find((p: any) => p.type === 'personal') || profiles[0];
      if (!personal) throw new Error('No se encontraron perfiles');

      await upsert.mutateAsync({
        wise_token: token.trim(),
        wise_profile_id: String(personal.id),
      });
      qc.invalidateQueries({ queryKey: ['user-settings'] });
      toast.success('Wise conectado');
      setToken('');
    } catch (e: any) {
      toast.error(e.message || 'Error al conectar');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    await upsert.mutateAsync({
      wise_token: null,
      wise_profile_id: null,
      wise_last_sync: null,
    });
    toast.success('Wise desconectado');
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-wise', { body: {} });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['user-settings'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['merchants'] });

      const userId = (await supabase.auth.getUser()).data.user?.id;
      const r = userId ? data?.results?.[userId] : Object.values(data?.results || {})[0] as any;

      if (!r || r.ok === false) {
        toast.error(r?.error || 'Error al sincronizar');
      } else {
        const parts = [`${r.imported ?? 0} nuevas`];
        if (r.skipped) parts.push(`${r.skipped} ya existían`);
        toast.success(`Wise sincronizado: ${parts.join(' · ')}`);
        if (r.diagnostics?.length) {
          console.info('[sync-wise diagnostics]', r.diagnostics);
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integraciones</h1>
        <p className="text-sm text-muted-foreground">Sincronizá tus cuentas automáticamente</p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <MerchantLogo name="Wise" size={40} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground">Wise</p>
                {isConnected && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Conectado
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Sincronización automática de movimientos USD y EUR
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !isConnected ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Token de API</label>
                <div className="flex gap-2">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowToken(s => !s)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button onClick={handleConnect} disabled={connecting} className="w-full">
                {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wifi className="h-4 w-4 mr-2" />}
                Conectar Wise
              </Button>

              <div className="text-xs text-muted-foreground border-t pt-3">
                <p className="font-medium mb-1 text-foreground">¿Dónde encontrar tu token?</p>
                <p>
                  wise.com → Configuración → API tokens.{' '}
                  <a
                    href="https://wise.com/settings/api-tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-0.5 hover:underline"
                  >
                    Abrir <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs space-y-1 text-muted-foreground">
                <p>
                  Último sync:{' '}
                  <span className="text-foreground font-medium">
                    {settings?.wise_last_sync
                      ? `hace ${formatDistanceToNow(new Date(settings.wise_last_sync))}`
                      : 'nunca'}
                  </span>
                </p>
                {wiseAccounts.length > 0 && (
                  <p>
                    Cuentas:{' '}
                    <span className="text-foreground">
                      {wiseAccounts.map(a => a.name).join(' · ')}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSyncNow} disabled={syncing} className="flex-1">
                  {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Sincronizar ahora
                </Button>
                <Button variant="outline" onClick={handleDisconnect} disabled={upsert.isPending}>
                  Desconectar
                </Button>
              </div>

              <div className="border-t pt-3 text-xs text-muted-foreground">
                <p className="mb-1">¿Problemas con la API?</p>
                <Link
                  to="/import?section=wise"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Importar CSV manual →
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Binance Card */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Bitcoin className="h-6 w-6 text-yellow-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground">Binance</p>
                {isBinanceConnected && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Conectado
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isBinanceConnected
                  ? binanceLastSync
                    ? `Última sync: ${formatDistanceToNow(new Date(binanceLastSync), { addSuffix: true })}`
                    : 'Nunca sincronizado'
                  : 'Conectá tu cuenta de Binance con read-only API key'}
              </p>
            </div>
          </div>

          {isBinanceConnected && (
            <div className="flex gap-2">
              <Button onClick={handleSyncBinance} disabled={syncingBinance} className="flex-1">
                {syncingBinance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sincronizar ahora
              </Button>
              <Button variant="outline" onClick={handleDisconnectBinance} disabled={upsert.isPending}>
                Desconectar
              </Button>
            </div>
          )}

          {isBinanceConnected && binanceBalances.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              {binanceBalances.map((b: any) => (
                <div key={b.asset} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-semibold text-foreground">{b.asset}</span>
                    <span className="text-xs text-muted-foreground ml-2 tabular-nums">
                      {Number(b.total).toFixed(b.asset === 'BTC' ? 8 : 4)}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground tabular-nums">
                      ${Number(b.value_usd).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </p>
                    {b.asset !== 'USDT' && b.price_usd > 0 && (
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        @ ${Number(b.price_usd).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t text-sm">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-bold text-foreground tabular-nums">
                  ${binanceTotalUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {!isBinanceConnected && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">API Key (read-only)</label>
                <Input
                  value={binanceKey}
                  onChange={(e) => setBinanceKey(e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">API Secret</label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={binanceSecret}
                    onChange={(e) => setBinanceSecret(e.target.value)}
                    placeholder="••••••••••••••••••••••••••••••••"
                    className="font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Creá una API key con permisos de solo lectura (Read Info) en Binance →{' '}
                <a
                  href="https://www.binance.com/en/my/settings/api-management"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-0.5 hover:underline"
                >
                  API Management <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <Button onClick={handleConnectBinance} disabled={connectingBinance} className="w-full">
                {connectingBinance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wifi className="h-4 w-4 mr-2" />}
                Conectar Binance
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
