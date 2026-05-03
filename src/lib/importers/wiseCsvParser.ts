import type { ParsedTransaction } from './arqParser';

/**
 * Parses Wise CSV exports.
 * Expected columns: TransferWise ID, Date, Amount, Currency, Description, Payment Reference
 * Tolerant to extra/missing columns and quoted values.
 */
export function parseWiseCsv(csvText: string): ParsedTransaction[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.findIndex((h) => h === name.toLowerCase());

  const iId = idx('transferwise id') >= 0 ? idx('transferwise id') : idx('id');
  const iDate = idx('date');
  const iAmount = idx('amount');
  const iCurrency = idx('currency');
  const iDesc = idx('description');
  const iRef = idx('payment reference');

  if (iDate < 0 || iAmount < 0) return [];

  const out: ParsedTransaction[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    const rawDate = cols[iDate]?.trim() || '';
    const rawAmount = cols[iAmount]?.trim() || '';
    const currency = (iCurrency >= 0 ? cols[iCurrency] : 'USD').trim() || 'USD';
    const description = (iDesc >= 0 ? cols[iDesc] : '').trim() ||
      (iRef >= 0 ? cols[iRef] : '').trim() || 'Wise transaction';
    const tid = (iId >= 0 ? cols[iId] : '').trim();

    const date = normalizeDate(rawDate);
    const amount = parseFloat(rawAmount.replace(/,/g, ''));
    if (!date || isNaN(amount)) continue;

    const type: ParsedTransaction['type'] = amount >= 0 ? 'income' : 'expense';
    const abs = Math.abs(amount);
    const external_id = tid
      ? `wise-${tid}`
      : `wise-${date}-${rawAmount}-${description.slice(0, 16)}`;

    out.push({
      date,
      description,
      amountUSD: currency === 'USD' ? abs : 0,
      amountARS: 0,
      type,
      external_id,
      matched: false,
      _currency: currency,
      _amount: abs,
    } as ParsedTransaction & { _currency: string; _amount: number });
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
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
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD-MM-YYYY or DD/MM/YYYY
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
