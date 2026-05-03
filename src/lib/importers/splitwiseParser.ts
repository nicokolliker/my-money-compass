import type { ParsedTransaction } from './arqParser';

export interface SplitwiseRow extends ParsedTransaction {
  category_hint?: string;
  swType: 'expense' | 'receivable';
}

const CATEGORY_MAP: Record<string, string> = {
  Alimentos: 'Supermercado',
  Taxi: 'Travel',
  Licor: 'Ocio',
  General: 'Ocio',
  Entretenimiento: 'Ocio',
};

const DEFAULT_CUTOFF = '2026-05-01';

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
export function parseSplitwise(
  csvText: string,
  userColumn: string = 'nicolaskolliker',
  arsToUsd: number = 0,
  cutoffDate?: string,
): SplitwiseRow[] {
  const CUTOFF = cutoffDate || DEFAULT_CUTOFF;
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
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

  if (userIdx < 0 || dateIdx < 0) return [];

  const out: SplitwiseRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    const date = normalizeDate(cols[dateIdx] || '');
    if (!date || date < CUTOFF) continue;
    const category = (catIdx >= 0 ? cols[catIdx] : '').trim();
    if (category === 'Pago') continue;
    const userRaw = (cols[userIdx] || '').trim();
    if (!userRaw) continue;
    const userAmount = parseFloat(userRaw.replace(/,/g, ''));
    if (!isFinite(userAmount) || Math.abs(userAmount) < 0.01) continue;

    const description = (descIdx >= 0 ? cols[descIdx] : '').trim() || 'Splitwise';
    const currency = ((curIdx >= 0 ? cols[curIdx] : 'USD') || 'USD').trim().toUpperCase();
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

    out.push({
      date,
      description,
      amountUSD,
      amountARS,
      type: swType === 'expense' ? 'expense' : 'income',
      external_id: `sw-${date}-${description}-${userAmount}`,
      matched: false,
      swType,
      category_hint: CATEGORY_MAP[category] || category || undefined,
    });
  }
  return out;
}
