import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface SettlementPdfRow {
  date: string;
  description: string;
  amountARS: number;
  amountUSD: number;
  matched: boolean;
  categoryName?: string;
}

export interface SettlementPdfItem {
  label: string;
  amountARS: number;
  categoryName?: string;
}

export interface SettlementPdfData {
  monthLabel: string;
  mamaRows?: SettlementPdfRow[];
  papaRows?: SettlementPdfRow[];
  santRows?: SettlementPdfRow[];
  manualItems?: SettlementPdfItem[];
  /** Optional: aggregated ARS totals per category name (already computed) */
  categoryBreakdown?: Record<string, number>;
  totalARS: number;
  tcBlue: number;
  usdAPagar: number;
  vueltoARS: number;
}

// ---------- Brand palette ----------
const BRAND = {
  primary: [79, 110, 247] as [number, number, number],   // #4F6EF7
  primaryDark: [59, 84, 207] as [number, number, number],
  accent: [16, 185, 129] as [number, number, number],
  ink: [17, 24, 39] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  light: [243, 244, 246] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
  surface: [249, 250, 251] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

// Palette for category bars (HSL-equivalent hex)
const CATEGORY_PALETTE: [number, number, number][] = [
  [79, 110, 247],   // primary blue
  [16, 185, 129],   // green
  [249, 115, 22],   // orange
  [217, 70, 239],   // fuchsia
  [14, 165, 233],   // sky
  [234, 179, 8],    // amber
  [239, 68, 68],    // red
  [139, 92, 246],   // violet
  [20, 184, 166],   // teal
  [236, 72, 153],   // pink
];

const fmtARS = (n: number) =>
  '$' + Math.round(n).toLocaleString('es-AR');
const fmtUSD = (n: number) =>
  'US$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso;
};

function rgb(doc: jsPDF, fn: 'setFillColor' | 'setTextColor' | 'setDrawColor', c: [number, number, number]) {
  doc[fn](c[0], c[1], c[2]);
}

// ---------- Category emoji mapping ----------
const CATEGORY_EMOJI: Record<string, string> = {
  // Comida
  'Comida': '🍽️', 'Comida fuera': '🍽️', 'Food': '🍽️', 'Food & Drink': '🍽️', 'Food & Drinks': '🍽️',
  'Restaurantes': '🍽️', 'Restaurants': '🍽️', 'Delivery': '🛵',
  'Supermercado': '🛒', 'Groceries': '🛒', 'Mercado': '🛒',
  // Transporte
  'Transporte': '🚗', 'Transport': '🚗', 'Transportation': '🚗',
  'Auto': '🚙', 'Nafta': '⛽', 'Combustible': '⛽', 'Fuel': '⛽',
  'Taxi': '🚕', 'Uber': '🚕',
  // Casa / Servicios
  'Casa': '🏠', 'Hogar': '🏠', 'Housing': '🏠', 'Rent': '🏠', 'Alquiler': '🏠',
  'Expensas': '🏢',
  'Servicios': '💡', 'Utilities': '💡', 'Luz': '💡', 'Gas': '🔥', 'Agua': '💧',
  'Internet': '🌐',
  // Salud
  'Salud': '💊', 'Health': '💊', 'Healthcare': '💊', 'Farmacia': '💊', 'Médico': '🏥',
  'Obra Social': '🏥',
  // Digital / Suscripciones
  'Digital': '💻', 'Suscripciones': '💳', 'Subscriptions': '💳', 'Software': '🧰',
  'IA': '🤖', 'AI': '🤖', 'Creatividad': '🎨', 'Productividad': '⚡',
  'Entretenimiento': '🎬', 'Entertainment': '🎬', 'Streaming': '📺',
  // Shopping
  'Shopping': '🛍️', 'Compras': '🛍️', 'Ropa': '👕', 'Clothing': '👕',
  // Educación / Viajes
  'Educación': '📚', 'Education': '📚', 'Cursos': '📚',
  'Viajes': '✈️', 'Travel': '✈️',
  // Personal / Otros
  'Personal': '🧖', 'Gimnasio': '🏋️', 'Gym': '🏋️',
  'Regalos': '🎁', 'Gifts': '🎁',
  'Mascotas': '🐶', 'Pets': '🐶',
  'Seguros': '🛡️', 'Insurance': '🛡️',
  'Préstamo': '💵', 'Prestamo': '💵', 'Loan': '💵',
  'Impuestos': '🧾', 'Taxes': '🧾',
  'Trabajo': '💼', 'Work': '💼',
  'Otros': '📦', 'Other': '📦', 'Uncategorized': '📦',
};

function getCategoryEmoji(name?: string): string {
  if (!name) return '📦';
  if (CATEGORY_EMOJI[name]) return CATEGORY_EMOJI[name];
  // case-insensitive fallback
  const lower = name.toLowerCase();
  for (const k of Object.keys(CATEGORY_EMOJI)) {
    if (k.toLowerCase() === lower) return CATEGORY_EMOJI[k];
  }
  // partial match
  for (const k of Object.keys(CATEGORY_EMOJI)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return CATEGORY_EMOJI[k];
  }
  return '📦';
}

// ---------- Shared table column widths (consistent across all tables) ----------
const COL = {
  date: 58,
  category: 110,
  amount: 92,
};

// ---------- Font loaders (Poppins + Noto Emoji) ----------
const POPPINS_URLS = {
  regular: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-Regular.ttf',
  bold:    'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-Bold.ttf',
};
const NOTO_EMOJI_URL = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/fonts/NotoEmoji-Regular.ttf';

let poppinsCache: { regular: string; bold: string } | null = null;
let poppinsLoading: Promise<{ regular: string; bold: string } | null> | null = null;
let emojiCache: string | null = null;
let emojiLoading: Promise<string | null> | null = null;

async function fetchNotoEmoji(): Promise<string | null> {
  if (emojiCache) return emojiCache;
  if (emojiLoading) return emojiLoading;
  emojiLoading = (async () => {
    try {
      const buf = await fetch(NOTO_EMOJI_URL).then((r) => r.arrayBuffer());
      emojiCache = arrayBufferToBase64(buf);
      return emojiCache;
    } catch (e) {
      console.warn('Noto Emoji load failed', e);
      return null;
    }
  })();
  return emojiLoading;
}

function registerNotoEmoji(doc: jsPDF, base64: string): string {
  try {
    doc.addFileToVFS('NotoEmoji-Regular.ttf', base64);
    doc.addFont('NotoEmoji-Regular.ttf', 'NotoEmoji', 'normal');
    return 'NotoEmoji';
  } catch (e) {
    console.warn('Failed to register NotoEmoji', e);
    return '';
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

async function fetchPoppins(): Promise<{ regular: string; bold: string } | null> {
  if (poppinsCache) return poppinsCache;
  if (poppinsLoading) return poppinsLoading;
  poppinsLoading = (async () => {
    try {
      const [r, b] = await Promise.all([
        fetch(POPPINS_URLS.regular).then((res) => res.arrayBuffer()),
        fetch(POPPINS_URLS.bold).then((res) => res.arrayBuffer()),
      ]);
      poppinsCache = {
        regular: arrayBufferToBase64(r),
        bold: arrayBufferToBase64(b),
      };
      return poppinsCache;
    } catch (e) {
      console.warn('Poppins font load failed; falling back to helvetica.', e);
      return null;
    }
  })();
  return poppinsLoading;
}

function registerPoppins(doc: jsPDF, fonts: { regular: string; bold: string }): string {
  try {
    doc.addFileToVFS('Poppins-Regular.ttf', fonts.regular);
    doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal');
    doc.addFileToVFS('Poppins-Bold.ttf', fonts.bold);
    doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold');
    return 'Poppins';
  } catch (e) {
    console.warn('Failed to register Poppins; using helvetica.', e);
    return 'helvetica';
  }
}

function rowsToTableBody(rows: SettlementPdfRow[]) {
  return rows.map((r) => [
    fmtDate(r.date),
    r.description,
    r.categoryName || 'Otros',
    r.matched ? fmtUSD(r.amountUSD) : fmtARS(r.amountARS),
  ]);
}

/** Renders the Categoría cell with an emoji prefix using the emoji font. */
function makeCategoryCellRenderer(
  doc: jsPDF,
  textFont: string,
  emojiFont: string | null,
  colIndex: number,
) {
  return {
    willDrawCell: (data: any) => {
      if (data.section !== 'body' || data.column.index !== colIndex) return;
      data.cell.text = [''];
    },
    didDrawCell: (data: any) => {
      if (data.section !== 'body' || data.column.index !== colIndex) return;
      const raw = String((data.row.raw as any[])[colIndex] ?? '');
      if (!raw) return;
      const emoji = getCategoryEmoji(raw);
      const padLeft = 8;
      const padRight = 8;
      const padTop = 6;
      const fontSize = data.cell.styles.fontSize || 9;
      const x = data.cell.x + padLeft;
      const y = data.cell.y + padTop + fontSize * 0.85;

      if (emojiFont) {
        rgb(doc, 'setTextColor', BRAND.ink);
        doc.setFont(emojiFont, 'normal');
        doc.setFontSize(fontSize);
        doc.text(emoji, x, y);
      }
      const emojiW = emojiFont ? fontSize * 1.4 : 0;

      doc.setFont(textFont, 'normal');
      doc.setFontSize(fontSize);
      rgb(doc, 'setTextColor', BRAND.muted);
      const maxW = data.cell.width - padLeft - padRight - emojiW;
      let label = raw;
      while (doc.getTextWidth(label) > maxW && label.length > 3) {
        label = label.slice(0, -2);
      }
      if (label !== raw) label = label.slice(0, -1) + '…';
      doc.text(label, x + emojiW, y);
    },
  };
}

interface SectionMeta {
  title: string;
  subtitle?: string;
  rows: SettlementPdfRow[];
  accent: [number, number, number];
}

function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 60) {
    doc.addPage();
    return margin + 30;
  }
  return y;
}

function drawSection(doc: jsPDF, section: SectionMeta, y: number, margin: number, pageW: number, font: string, emojiFont: string | null): number {
  const { title, subtitle, rows, accent } = section;
  if (rows.length === 0) return y;

  y = ensureSpace(doc, y, 80, margin);

  const ars = rows.filter((r) => !r.matched);
  const usd = rows.filter((r) => r.matched);
  const subtotalARS = ars.reduce((s, r) => s + r.amountARS, 0);
  const subtotalUSD = usd.reduce((s, r) => s + r.amountUSD, 0);

  rgb(doc, 'setFillColor', accent);
  doc.rect(margin, y - 4, 4, 22, 'F');

  rgb(doc, 'setTextColor', BRAND.ink);
  doc.setFont(font, 'bold');
  doc.setFontSize(13);
  doc.text(title, margin + 12, y + 8);

  if (subtitle) {
    rgb(doc, 'setTextColor', BRAND.muted);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(subtitle, margin + 12, y + 20);
  }

  const totalParts: string[] = [];
  if (subtotalARS > 0) totalParts.push(fmtARS(subtotalARS));
  if (subtotalUSD > 0) totalParts.push(fmtUSD(subtotalUSD));
  if (totalParts.length > 0) {
    rgb(doc, 'setTextColor', BRAND.ink);
    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.text(totalParts.join('  ·  '), pageW - margin, y + 8, { align: 'right' });
  }

  y += subtitle ? 28 : 22;

  const catHook = makeCategoryCellRenderer(doc, font, emojiFont, 2);

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Descripción', 'Categoría', 'Monto']],
    body: rowsToTableBody(rows),
    theme: 'plain',
    styles: {
      font,
      fontSize: 9,
      cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
      textColor: BRAND.ink,
      lineColor: BRAND.border,
      lineWidth: 0.4,
    },
    headStyles: {
      font,
      fillColor: BRAND.surface,
      textColor: BRAND.muted,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 5, right: 8, bottom: 5, left: 8 },
    },
    alternateRowStyles: { fillColor: [252, 252, 253] as any },
    columnStyles: {
      0: { cellWidth: COL.date, textColor: BRAND.muted },
      1: { cellWidth: 'auto' },
      2: { cellWidth: COL.category, textColor: BRAND.muted, fontSize: 9 },
      3: { cellWidth: COL.amount, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
    willDrawCell: catHook.willDrawCell,
    didDrawCell: catHook.didDrawCell,
  });

  return (doc as any).lastAutoTable.finalY + 22;
}

function drawCategoryBreakdown(
  doc: jsPDF,
  breakdown: Record<string, number>,
  totalARS: number,
  y: number,
  margin: number,
  pageW: number,
  font: string,
  emojiFont: string | null,
): number {
  const entries = Object.entries(breakdown)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  if (entries.length === 0) return y;

  const sum = entries.reduce((s, [, v]) => s + Number(v), 0) || 1;
  const rowH = 28;
  const headerH = 38;
  const blockH = headerH + entries.length * rowH + 16;

  y = ensureSpace(doc, y, blockH + 20, margin);

  // Header band
  rgb(doc, 'setFillColor', BRAND.primary);
  doc.rect(margin, y - 4, 4, 22, 'F');

  rgb(doc, 'setTextColor', BRAND.ink);
  doc.setFont(font, 'bold');
  doc.setFontSize(13);
  doc.text('Distribución por categoría', margin + 12, y + 8);

  rgb(doc, 'setTextColor', BRAND.muted);
  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  doc.text('Cómo se reparte el total entre categorías', margin + 12, y + 20);

  rgb(doc, 'setTextColor', BRAND.ink);
  doc.setFont(font, 'bold');
  doc.setFontSize(11);
  doc.text(fmtARS(sum), pageW - margin, y + 8, { align: 'right' });

  y += headerH;

  // Card surface
  const cardX = margin;
  const cardW = pageW - margin * 2;
  rgb(doc, 'setFillColor', BRAND.surface);
  doc.roundedRect(cardX, y, cardW, entries.length * rowH + 12, 8, 8, 'F');

  let ry = y + 6;
  const labelX = cardX + 14;
  const labelW = 170;
  const barX = cardX + labelW + 14;
  const amountW = 100;
  const pctW = 50;
  const barMaxW = cardW - (barX - cardX) - amountW - pctW - 14;
  const amountX = pageW - margin - 14;

  entries.forEach(([name, val], idx) => {
    const v = Number(val);
    const pct = (v / sum) * 100;
    const color = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];

    // Color dot
    rgb(doc, 'setFillColor', color);
    doc.circle(labelX + 4, ry + 12, 3.8, 'F');

    // Emoji
    const emoji = getCategoryEmoji(name);
    if (emojiFont) {
      rgb(doc, 'setTextColor', BRAND.ink);
      doc.setFont(emojiFont, 'normal');
      doc.setFontSize(11);
      doc.text(emoji, labelX + 14, ry + 16);
    }
    const emojiW = emojiFont ? 16 : 0;

    // Label
    rgb(doc, 'setTextColor', BRAND.ink);
    doc.setFont(font, 'bold');
    doc.setFontSize(10);
    const maxLabelW = labelW - 18 - emojiW;
    let labelText = name;
    while (doc.getTextWidth(labelText) > maxLabelW && labelText.length > 3) {
      labelText = labelText.slice(0, -2);
    }
    if (labelText !== name) labelText = labelText.slice(0, -1) + '…';
    doc.text(labelText, labelX + 14 + emojiW, ry + 16);

    // Bar background
    rgb(doc, 'setFillColor', BRAND.border);
    doc.roundedRect(barX, ry + 8, barMaxW, 8, 2, 2, 'F');
    // Bar fill
    rgb(doc, 'setFillColor', color);
    const w = Math.max(2, (pct / 100) * barMaxW);
    doc.roundedRect(barX, ry + 8, w, 8, 2, 2, 'F');

    // % label
    rgb(doc, 'setTextColor', BRAND.muted);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(pct.toFixed(1) + '%', barX + barMaxW + 8, ry + 16);

    // Amount
    rgb(doc, 'setTextColor', BRAND.ink);
    doc.setFont(font, 'bold');
    doc.setFontSize(10);
    doc.text(fmtARS(v), amountX, ry + 16, { align: 'right' });

    ry += rowH;
  });

  return y + entries.length * rowH + 12 + 16;
}

export async function generateSettlementPdf(data: SettlementPdfData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  const fonts = await fetchPoppins();
  const font = fonts ? registerPoppins(doc, fonts) : 'helvetica';
  doc.setFont(font, 'normal');

  // ---------- COVER HEADER ----------
  rgb(doc, 'setFillColor', BRAND.primary);
  doc.rect(0, 0, pageW, 130, 'F');

  rgb(doc, 'setFillColor', BRAND.primaryDark);
  doc.circle(pageW - 60, 40, 80, 'F');

  rgb(doc, 'setTextColor', BRAND.white);
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  doc.text('LIQUIDACIÓN MENSUAL', margin, 50);

  doc.setFont(font, 'bold');
  doc.setFontSize(26);
  doc.text('Cuenta con el Viejo', margin, 80);

  doc.setFont(font, 'normal');
  doc.setFontSize(13);
  const cap = data.monthLabel.charAt(0).toUpperCase() + data.monthLabel.slice(1);
  doc.text(cap, margin, 105);

  // ---------- SUMMARY STRIP ----------
  let y = 160;
  const stripY = y;
  const stripH = 70;

  rgb(doc, 'setFillColor', BRAND.surface);
  doc.roundedRect(margin, stripY, pageW - margin * 2, stripH, 8, 8, 'F');

  const cellW = (pageW - margin * 2) / 3;
  const drawStat = (idx: number, label: string, value: string, accent?: boolean) => {
    const cx = margin + cellW * idx + cellW / 2;
    rgb(doc, 'setTextColor', BRAND.muted);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), cx, stripY + 22, { align: 'center' });

    rgb(doc, 'setTextColor', accent ? BRAND.primary : BRAND.ink);
    doc.setFont(font, 'bold');
    doc.setFontSize(15);
    doc.text(value, cx, stripY + 48, { align: 'center' });
  };

  drawStat(0, 'Total ARS', fmtARS(data.totalARS));
  drawStat(1, 'TC Blue', fmtARS(data.tcBlue));
  drawStat(2, 'USD a pagar', fmtUSD(data.usdAPagar), true);

  rgb(doc, 'setDrawColor', BRAND.border);
  doc.setLineWidth(0.5);
  doc.line(margin + cellW, stripY + 14, margin + cellW, stripY + stripH - 14);
  doc.line(margin + cellW * 2, stripY + 14, margin + cellW * 2, stripY + stripH - 14);

  y = stripY + stripH + 28;

  // ---------- CATEGORY BREAKDOWN (highlighted, near the top) ----------
  if (data.categoryBreakdown && Object.keys(data.categoryBreakdown).length > 0) {
    y = drawCategoryBreakdown(doc, data.categoryBreakdown, data.totalARS, y, margin, pageW, font);
  }

  // ---------- SECTIONS ----------
  const sections: SectionMeta[] = [
    { title: 'VISA Ciudad — Mamá', subtitle: 'Resumen Banco Ciudad (titular mamá)', rows: data.mamaRows || [], accent: BRAND.primary },
    { title: 'VISA Ciudad — Papá', subtitle: 'Obra Social y Poder Judicial', rows: data.papaRows || [], accent: [168, 85, 247] as [number, number, number] },
    { title: 'VISA Santander', subtitle: 'Resumen Santander', rows: data.santRows || [], accent: [239, 68, 68] as [number, number, number] },
  ];

  for (const s of sections) {
    y = drawSection(doc, s, y, margin, pageW, font);
  }

  // ---------- MANUAL ITEMS ----------
  if (data.manualItems && data.manualItems.length > 0) {
    y = ensureSpace(doc, y, 80, margin);

    rgb(doc, 'setFillColor', BRAND.accent);
    doc.rect(margin, y - 4, 4, 22, 'F');

    rgb(doc, 'setTextColor', BRAND.ink);
    doc.setFont(font, 'bold');
    doc.setFontSize(13);
    doc.text('Otros conceptos', margin + 12, y + 8);

    rgb(doc, 'setTextColor', BRAND.muted);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text('Expensas, Auto, Préstamo y demás', margin + 12, y + 20);

    const totalManual = data.manualItems.reduce((s, i) => s + i.amountARS, 0);
    rgb(doc, 'setTextColor', BRAND.ink);
    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.text(fmtARS(totalManual), pageW - margin, y + 8, { align: 'right' });

    y += 28;

    autoTable(doc, {
      startY: y,
      head: [['Concepto', 'Categoría', 'Monto']],
      body: data.manualItems.map((i) => [i.label, i.categoryName || '—', fmtARS(i.amountARS)]),
      theme: 'plain',
      styles: {
        font,
        fontSize: 9,
        cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
        textColor: BRAND.ink,
        lineColor: BRAND.border,
        lineWidth: 0.4,
      },
      headStyles: {
        font,
        fillColor: BRAND.surface,
        textColor: BRAND.muted,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 5, right: 8, bottom: 5, left: 8 },
      },
      alternateRowStyles: { fillColor: [252, 252, 253] as any },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 110, textColor: BRAND.muted, fontSize: 8 },
        2: { cellWidth: 95, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 22;
  }

  // ---------- TOTALS BLOCK ----------
  const totalsH = data.vueltoARS > 0 ? 150 : 130;
  y = ensureSpace(doc, y, totalsH + 20, margin);

  rgb(doc, 'setFillColor', BRAND.primary);
  doc.roundedRect(margin, y, pageW - margin * 2, totalsH, 10, 10, 'F');

  rgb(doc, 'setTextColor', BRAND.white);
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  doc.text('RESUMEN FINAL', margin + 20, y + 28);

  let lineY = y + 56;
  const lineGap = 22;

  const drawTotalLine = (label: string, value: string, big?: boolean) => {
    doc.setFont(font, 'normal');
    doc.setFontSize(big ? 12 : 10);
    rgb(doc, 'setTextColor', BRAND.white);
    doc.text(label, margin + 20, lineY);
    doc.setFont(font, 'bold');
    doc.setFontSize(big ? 16 : 11);
    doc.text(value, pageW - margin - 20, lineY, { align: 'right' });
    lineY += big ? lineGap + 4 : lineGap;
  };

  drawTotalLine('Total ARS', fmtARS(data.totalARS));
  drawTotalLine('Tipo de cambio (Blue)', fmtARS(data.tcBlue));
  drawTotalLine('USD a pagar', fmtUSD(data.usdAPagar), true);

  if (data.vueltoARS > 0) {
    doc.setLineWidth(0.4);
    doc.setDrawColor(255, 255, 255);
    doc.line(margin + 20, lineY - 14, pageW - margin - 20, lineY - 14);
    doc.setFont(font, 'normal');
    doc.setFontSize(10);
    doc.text('Vuelto en ARS', margin + 20, lineY);
    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.text('+ ' + fmtARS(data.vueltoARS), pageW - margin - 20, lineY, { align: 'right' });
  }

  y += totalsH + 16;

  // ---------- FOOTER (every page) ----------
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    rgb(doc, 'setDrawColor', BRAND.border);
    doc.setLineWidth(0.5);
    doc.line(margin, pageH - 30, pageW - margin, pageH - 30);

    rgb(doc, 'setTextColor', BRAND.muted);
    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    doc.text(
      `Generado el ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      margin,
      pageH - 16,
    );
    doc.text(
      `Página ${p} de ${totalPages}`,
      pageW - margin,
      pageH - 16,
      { align: 'right' },
    );
  }

  return doc;
}

export async function downloadSettlementPdf(data: SettlementPdfData, filename: string): Promise<void> {
  const doc = await generateSettlementPdf(data);
  doc.save(filename);
}
