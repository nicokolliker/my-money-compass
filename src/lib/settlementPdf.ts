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
  totalARS: number;
  tcBlue: number;
  usdAPagar: number;
  vueltoARS: number;
}

// ---------- Brand palette ----------
const BRAND = {
  primary: [79, 110, 247] as [number, number, number],   // #4F6EF7
  primaryDark: [59, 84, 207] as [number, number, number],
  accent: [16, 185, 129] as [number, number, number],    // success green
  ink: [17, 24, 39] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  light: [243, 244, 246] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
  surface: [249, 250, 251] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

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

function rowsToTableBody(rows: SettlementPdfRow[]) {
  return rows.map((r) => [
    fmtDate(r.date),
    r.description,
    r.categoryName || '—',
    r.matched ? fmtUSD(r.amountUSD) : fmtARS(r.amountARS),
  ]);
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

function drawSection(doc: jsPDF, section: SectionMeta, y: number, margin: number, pageW: number): number {
  const { title, subtitle, rows, accent } = section;
  if (rows.length === 0) return y;

  y = ensureSpace(doc, y, 80, margin);

  const ars = rows.filter((r) => !r.matched);
  const usd = rows.filter((r) => r.matched);
  const subtotalARS = ars.reduce((s, r) => s + r.amountARS, 0);
  const subtotalUSD = usd.reduce((s, r) => s + r.amountUSD, 0);

  // Colored accent bar
  rgb(doc, 'setFillColor', accent);
  doc.rect(margin, y - 4, 4, 22, 'F');

  // Title
  rgb(doc, 'setTextColor', BRAND.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, margin + 12, y + 8);

  if (subtitle) {
    rgb(doc, 'setTextColor', BRAND.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(subtitle, margin + 12, y + 20);
  }

  // Subtotals on the right
  const totalParts: string[] = [];
  if (subtotalARS > 0) totalParts.push(fmtARS(subtotalARS));
  if (subtotalUSD > 0) totalParts.push(fmtUSD(subtotalUSD));
  if (totalParts.length > 0) {
    rgb(doc, 'setTextColor', BRAND.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(totalParts.join('  ·  '), pageW - margin, y + 8, { align: 'right' });
  }

  y += subtitle ? 28 : 22;

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Descripción', 'Categoría', 'Monto']],
    body: rowsToTableBody(rows),
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
      textColor: BRAND.ink,
      lineColor: BRAND.border,
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: BRAND.surface,
      textColor: BRAND.muted,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 5, right: 8, bottom: 5, left: 8 },
    },
    alternateRowStyles: { fillColor: [252, 252, 253] as any },
    columnStyles: {
      0: { cellWidth: 55, textColor: BRAND.muted },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 90, textColor: BRAND.muted, fontSize: 8 },
      3: { cellWidth: 80, halign: 'right', font: 'helvetica', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      // Add header on new pages
    },
  });

  return (doc as any).lastAutoTable.finalY + 22;
}

export function generateSettlementPdf(data: SettlementPdfData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // ---------- COVER HEADER ----------
  // Gradient-ish: solid primary + lighter band
  rgb(doc, 'setFillColor', BRAND.primary);
  doc.rect(0, 0, pageW, 130, 'F');

  // Decorative circle
  rgb(doc, 'setFillColor', BRAND.primaryDark);
  doc.circle(pageW - 60, 40, 80, 'F');

  rgb(doc, 'setTextColor', BRAND.white);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('LIQUIDACIÓN MENSUAL', margin, 50);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text('Cuenta con el Viejo', margin, 80);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  // capitalize first letter of month
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
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), cx, stripY + 22, { align: 'center' });

    rgb(doc, 'setTextColor', accent ? BRAND.primary : BRAND.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(value, cx, stripY + 48, { align: 'center' });
  };

  drawStat(0, 'Total ARS', fmtARS(data.totalARS));
  drawStat(1, 'TC Blue', fmtARS(data.tcBlue));
  drawStat(2, 'USD a pagar', fmtUSD(data.usdAPagar), true);

  // Vertical dividers
  rgb(doc, 'setDrawColor', BRAND.border);
  doc.setLineWidth(0.5);
  doc.line(margin + cellW, stripY + 14, margin + cellW, stripY + stripH - 14);
  doc.line(margin + cellW * 2, stripY + 14, margin + cellW * 2, stripY + stripH - 14);

  y = stripY + stripH + 28;

  // ---------- SECTIONS ----------
  const sections: SectionMeta[] = [
    { title: 'VISA Ciudad — Mamá', subtitle: 'Resumen Banco Ciudad (titular mamá)', rows: data.mamaRows || [], accent: BRAND.primary },
    { title: 'VISA Ciudad — Papá', subtitle: 'Obra Social y Poder Judicial', rows: data.papaRows || [], accent: [168, 85, 247] as [number, number, number] },
    { title: 'VISA Santander', subtitle: 'Resumen Santander', rows: data.santRows || [], accent: [239, 68, 68] as [number, number, number] },
  ];

  for (const s of sections) {
    y = drawSection(doc, s, y, margin, pageW);
  }

  // ---------- MANUAL ITEMS ----------
  if (data.manualItems && data.manualItems.length > 0) {
    y = ensureSpace(doc, y, 80, margin);

    rgb(doc, 'setFillColor', BRAND.accent);
    doc.rect(margin, y - 4, 4, 22, 'F');

    rgb(doc, 'setTextColor', BRAND.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Otros conceptos', margin + 12, y + 8);

    rgb(doc, 'setTextColor', BRAND.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Expensas, Auto, Préstamo y demás', margin + 12, y + 20);

    const totalManual = data.manualItems.reduce((s, i) => s + i.amountARS, 0);
    rgb(doc, 'setTextColor', BRAND.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(fmtARS(totalManual), pageW - margin, y + 8, { align: 'right' });

    y += 28;

    autoTable(doc, {
      startY: y,
      head: [['Concepto', 'Categoría', 'Monto']],
      body: data.manualItems.map((i) => [i.label, i.categoryName || '—', fmtARS(i.amountARS)]),
      theme: 'plain',
      styles: {
        fontSize: 9,
        cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
        textColor: BRAND.ink,
        lineColor: BRAND.border,
        lineWidth: 0.4,
      },
      headStyles: {
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
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('RESUMEN FINAL', margin + 20, y + 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  let lineY = y + 56;
  const lineGap = 22;

  const drawTotalLine = (label: string, value: string, big?: boolean) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(big ? 12 : 10);
    rgb(doc, 'setTextColor', BRAND.white);
    doc.text(label, margin + 20, lineY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(big ? 16 : 11);
    doc.text(value, pageW - margin - 20, lineY, { align: 'right' });
    lineY += big ? lineGap + 4 : lineGap;
  };

  drawTotalLine('Total ARS', fmtARS(data.totalARS));
  drawTotalLine('Tipo de cambio (Blue)', fmtARS(data.tcBlue));
  drawTotalLine('USD a pagar', fmtUSD(data.usdAPagar), true);

  if (data.vueltoARS > 0) {
    // Subtle separator
    doc.setLineWidth(0.4);
    doc.setDrawColor(255, 255, 255);
    doc.line(margin + 20, lineY - 14, pageW - margin - 20, lineY - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Vuelto en ARS', margin + 20, lineY);
    doc.setFont('helvetica', 'bold');
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
    doc.setFont('helvetica', 'normal');
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

export function downloadSettlementPdf(data: SettlementPdfData, filename: string) {
  const doc = generateSettlementPdf(data);
  doc.save(filename);
}
