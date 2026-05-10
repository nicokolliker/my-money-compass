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

const fmtARS = (n: number) =>
  '$' + Math.round(n).toLocaleString('es-AR');
const fmtUSD = (n: number) =>
  'US$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso;
};

function rowsToTableBody(rows: SettlementPdfRow[]) {
  return rows.map((r) => [
    fmtDate(r.date),
    r.description,
    r.categoryName || '—',
    r.matched ? fmtUSD(r.amountUSD) : fmtARS(r.amountARS),
  ]);
}

export function generateSettlementPdf(data: SettlementPdfData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Header
  doc.setFillColor(79, 110, 247);
  doc.rect(0, 0, pageW, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Liquidación con el Viejo', margin, 35);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(data.monthLabel, margin, 55);

  doc.setTextColor(0, 0, 0);
  let y = 95;

  const renderSection = (title: string, rows: SettlementPdfRow[]) => {
    if (!rows || rows.length === 0) return;
    const ars = rows.filter((r) => !r.matched);
    const usd = rows.filter((r) => r.matched);
    const subtotalARS = ars.reduce((s, r) => s + r.amountARS, 0);
    const subtotalUSD = usd.reduce((s, r) => s + r.amountUSD, 0);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    const meta: string[] = [];
    if (subtotalARS > 0) meta.push(fmtARS(subtotalARS));
    if (subtotalUSD > 0) meta.push(fmtUSD(subtotalUSD));
    if (meta.length > 0) {
      doc.text(meta.join(' · '), pageW - margin, y, { align: 'right' });
    }
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Descripción', 'Categoría', 'Monto']],
      body: rowsToTableBody(rows),
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [240, 240, 245], textColor: [40, 40, 40], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 80 },
        3: { cellWidth: 75, halign: 'right', font: 'courier' },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  };

  renderSection('VISA Ciudad — Mamá', data.mamaRows || []);
  renderSection('VISA Ciudad — Papá (Obra Social)', data.papaRows || []);
  renderSection('VISA Santander', data.santRows || []);

  if (data.manualItems && data.manualItems.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Otros conceptos', margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [['Concepto', 'Categoría', 'Monto']],
      body: data.manualItems.map((i) => [i.label, i.categoryName || '—', fmtARS(i.amountARS)]),
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [240, 240, 245], textColor: [40, 40, 40], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 100 },
        2: { cellWidth: 90, halign: 'right', font: 'courier' },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Totals box
  if (y > 700) {
    doc.addPage();
    y = 50;
  }
  doc.setDrawColor(220, 220, 230);
  doc.setFillColor(248, 249, 252);
  doc.roundedRect(margin, y, pageW - margin * 2, 110, 6, 6, 'FD');
  const lx = margin + 16;
  const rx = pageW - margin - 16;
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.setFont('helvetica', 'normal');
  let ly = y + 22;

  doc.text('Total ARS', lx, ly);
  doc.setTextColor(40, 40, 40);
  doc.setFont('courier', 'bold');
  doc.text(fmtARS(data.totalARS), rx, ly, { align: 'right' });

  ly += 18;
  doc.setTextColor(110, 110, 110);
  doc.setFont('helvetica', 'normal');
  doc.text('Tipo de cambio (Blue)', lx, ly);
  doc.setTextColor(40, 40, 40);
  doc.setFont('courier', 'bold');
  doc.text(fmtARS(data.tcBlue), rx, ly, { align: 'right' });

  ly += 18;
  doc.setTextColor(110, 110, 110);
  doc.setFont('helvetica', 'normal');
  doc.text('USD a pagar', lx, ly);
  doc.setTextColor(40, 40, 40);
  doc.setFont('courier', 'bold');
  doc.text(fmtUSD(data.usdAPagar), rx, ly, { align: 'right' });

  if (data.vueltoARS > 0) {
    ly += 18;
    doc.setTextColor(110, 110, 110);
    doc.setFont('helvetica', 'normal');
    doc.text('Vuelto ARS', lx, ly);
    doc.setTextColor(34, 139, 34);
    doc.setFont('courier', 'bold');
    doc.text('+' + fmtARS(data.vueltoARS), rx, ly, { align: 'right' });
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 170);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Generado el ${new Date().toLocaleDateString('es-AR')}`,
    margin,
    pageH - 20,
  );

  return doc;
}

export function downloadSettlementPdf(data: SettlementPdfData, filename: string) {
  const doc = generateSettlementPdf(data);
  doc.save(filename);
}
