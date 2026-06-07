import type { ParsedTransaction } from './arqParser';

export interface SplitwiseRow extends ParsedTransaction {
  category_hint?: string;
  swType: 'expense' | 'receivable';
  currency: 'USD' | 'ARS' | string;
  userAmount: number; // raw signed user-column amount
}

export interface SplitwiseParseResult {
  rows: SplitwiseRow[];
  netBalance: number;            // sum of all user-column amounts (in dominant currency)
  currency: 'USD' | 'ARS';       // dominant currency in the file
  groupName: string;             // best-effort group label
  earliestDate: string | null;   // ISO yyyy-mm-dd of oldest row
}

const CATEGORY_MAP: Record<string, string> = {
  Alimentos: 'Supermercado',
  Taxi: 'Travel',
  Licor: 'Ocio',
  General: 'Ocio',
  Entretenimiento: 'Ocio',
};

const DEFAULT_CUTOFF = '2015-01-01';
const TOTAL_BALANCE_RE = /total\s*balance|saldo\s*total/i;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function normalizeDate(s: string): string | null {
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    let y = m[3];
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? '19' : '20') + y;
    return `${y}-${mo}-${d}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function parseSplitwise(
  csvText: string,
  userColumn: string = 'nicolaskolliker',
  arsToUsd: number = 0,
  cutoffDate?: string,
  groupNameHint?: string,
): SplitwiseParseResult {
  const CUTOFF = cutoffDate || DEFAULT_CUTOFF;
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const empty: SplitwiseParseResult = {
    rows: [], netBalance: 0, currency: 'USD', groupName: groupNameHint || '', earliestDate: null,
  };
  if (lines.length < 2) return empty;
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());

  const userIdx = header.findIndex((h) => h === userColumn) >= 0
    ? header.findIndex((h) => h === userColumn)
    : lower.findIndex((h) => h === userColumn.toLowerCase());
  const dateIdx = lower.findIndex((h) => h === 'fecha' || h === 'date');
  const descIdx = lower.findIndex((h) => h === 'descripción' || h === 'descripcion' || h === 'description');
  const catIdx = lower.findIndex((h) => h === 'categoría' || h === 'categoria' || h === 'category');
  const curIdx = lower.findIndex((h) => h === 'moneda' || h === 'currency');
  const amtIdx = lower.findIndex((h) => h === 'importe' || h === 'monto' || h === 'cost');

  if (userIdx < 0 || dateIdx < 0) return empty;

  const out: SplitwiseRow[] = [];
  const curCount: Record<string, number> = {};
  let netByCurrency: Record<string, number> = {};
  const officialByCurrency: Record<string, number> = {};
  let earliest: string | null = null;

  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    const description = (descIdx >= 0 ? cols[descIdx] : '').trim() || 'Splitwise';
    const currencyRaw = ((curIdx >= 0 ? cols[curIdx] : 'USD') || 'USD').trim().toUpperCase();

    // Capture the trailing "Saldo total" summary row Splitwise appends (per currency) and skip it
    if (TOTAL_BALANCE_RE.test(description)) {
      const v = parseFloat(((cols[userIdx] || '').trim()).replace(/,/g, ''));
      if (isFinite(v)) officialByCurrency[currencyRaw] = v;
      continue;
    }

    const date = normalizeDate(cols[dateIdx] || '');
    if (!date || date < CUTOFF) continue;
    const category = (catIdx >= 0 ? cols[catIdx] : '').trim();
    if (category === 'Pago') continue;
    const userRaw = (cols[userIdx] || '').trim();
    if (!userRaw) continue;
    const userAmount = parseFloat(userRaw.replace(/,/g, ''));
    if (!isFinite(userAmount) || Math.abs(userAmount) < 0.01) continue;

    const currency = currencyRaw;
    const swType: 'expense' | 'receivable' = userAmount > 0 ? 'expense' : 'receivable';
    const abs = Math.abs(userAmount);

    let amountUSD = 0;
    let amountARS = 0;
    if (currency === 'USD') {
      amountUSD = abs;
    } else if (currency === 'ARS') {
      amountARS = abs;
      amountUSD = arsToUsd > 0 ? +(abs * arsToUsd).toFixed(2) : 0;
    } else {
      amountUSD = abs;
    }

    curCount[currency] = (curCount[currency] || 0) + 1;
    netByCurrency[currency] = (netByCurrency[currency] || 0) + userAmount;
    if (!earliest || date < earliest) earliest = date;

    out.push({
      date,
      description,
      amountUSD,
      amountARS,
      type: swType === 'expense' ? 'expense' : 'income',
      external_id: `sw-${date}-${description}-${userAmount}`,
      matched: false,
      swType,
      currency,
      userAmount,
      category_hint: CATEGORY_MAP[category] || category || undefined,
    });
  }

  // Prefer ARS "Saldo total" row as official balance; fall back to dominant currency from rows
  const dominant: 'USD' | 'ARS' = officialByCurrency['ARS'] !== undefined
    ? 'ARS'
    : ((Object.entries(curCount).sort((a, b) => b[1] - a[1])[0]?.[0] as 'USD' | 'ARS') || 'USD');
  const netBalance = officialByCurrency[dominant] ?? (netByCurrency[dominant] || 0);

  return {
    rows: out,
    netBalance,
    currency: dominant,
    groupName: groupNameHint || '',
    earliestDate: earliest,
  };
}
