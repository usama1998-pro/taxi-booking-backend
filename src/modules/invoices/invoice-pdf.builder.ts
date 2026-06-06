import type { InvoiceAddressKind } from '@prisma/client';
import PDFDocument from 'pdfkit';

export type DriverInvoicePdfModel = {
  id: string;
  fullName: string;
  phoneNumber: string;
  bookingReference: string;
  pickupDate: string;
  pickupKind: InvoiceAddressKind;
  pickupAddress: string | null;
  pickupAirline: string | null;
  pickupFlightNo: string | null;
  dropoffKind: InvoiceAddressKind;
  dropoffAddress: string | null;
  dropoffAirline: string | null;
  dropoffFlightNo: string | null;
  priceAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  sourceBookingUuid: string | null;
  passengerCount: number;
  childSeatsSummary: string | null;
  createdAt: string;
};

const COMPANY_NAME = 'BarcelonaTaxi24';
const COMPANY_LINES = [
  'Barcelona International Airport, 08820 El Prat de Llobregat, Barcelona, Spain',
  '0034663619000',
  'www.taxibarcelona24.com',
  'info@taxibarcelona24.com',
];

const TERMS_TEXT = 'Payment received via bank transfer';

const pdfTimeZone = process.env.TZ || 'Europe/Madrid';

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595;
const CONTENT_W = PAGE_WIDTH - PAGE_MARGIN * 2;

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatEuro(amount: number): string {
  return `€ ${formatMoney(amount)}`;
}

function formatEndpoint(
  kind: InvoiceAddressKind,
  address: string | null,
  airline: string | null,
  flightNo: string | null,
): string {
  if (kind === 'LOCATION') {
    return (address ?? '').trim() || '—';
  }
  const a = (airline ?? '').trim();
  const f = (flightNo ?? '').trim();
  if (!a && !f) {
    return '—';
  }
  return [a, f].filter(Boolean).join(' · ');
}

function invoiceDisplayNumber(id: string): string {
  const hex = id.replace(/-/g, '').slice(0, 12);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) {
    return id.replace(/-/g, '').slice(0, 8).toUpperCase();
  }
  return String((n % 900000) + 100000);
}

function invoiceDateYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso.slice(0, 10);
  }
  return d.toLocaleDateString('en-CA', { timeZone: pdfTimeZone });
}

function transferDescription(pickup: string, dropoff: string): string {
  const pu = pickup.trim() === '—' ? '' : pickup.trim();
  const dr = dropoff.trim() === '—' ? '' : dropoff.trim();
  if (!pu && !dr) {
    return 'Transfer';
  }
  if (pu && dr) {
    return `Transfer from ${pu} to ${dr}`;
  }
  if (pu) {
    return `Transfer from ${pu}`;
  }
  return `Transfer to ${dr}`;
}

/** A4 invoice layout aligned with company reference PDF (taxibarcelona24). */
export function buildDriverInvoicePdf(inv: DriverInvoicePdfModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pickup = formatEndpoint(
      inv.pickupKind,
      inv.pickupAddress,
      inv.pickupAirline,
      inv.pickupFlightNo,
    );
    const dropoff = formatEndpoint(
      inv.dropoffKind,
      inv.dropoffAddress,
      inv.dropoffAirline,
      inv.dropoffFlightNo,
    );

    const gross = inv.priceAmount;
    const tax = inv.taxAmount;
    const net = inv.totalAmount;

    let y = PAGE_MARGIN;

    doc.fontSize(20).font('Helvetica-Bold').text(COMPANY_NAME, PAGE_MARGIN, y, {
      width: CONTENT_W,
    });
    y = doc.y + 6;
    doc.fontSize(9).font('Helvetica').fillColor('#000000');
    for (const line of COMPANY_LINES) {
      doc.text(line, PAGE_MARGIN, y, { width: CONTENT_W });
      y = doc.y + 2;
    }
    y += 18;

    const lx = PAGE_MARGIN;
    const rx = PAGE_MARGIN + 268;
    const lw = 250;
    const rw = CONTENT_W - 268;

    let yL = y;
    let yR = y;

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('BILL TO', lx, yL, { width: lw });
    doc.text('INVOICE #', rx, yR, { width: rw });
    yL += 14;
    yR += 14;

    doc.font('Helvetica').fontSize(10);
    doc.text(inv.fullName, lx, yL, { width: lw });
    doc.text(invoiceDisplayNumber(inv.id), rx, yR, { width: rw });
    yL += 14;
    yR += 14;

    doc.text(inv.phoneNumber, lx, yL, { width: lw });
    yL += 14;

    doc.text(inv.bookingReference, lx, yL, { width: lw });
    yL += 14;

    const paxLabel =
      inv.passengerCount === 1 ? '1 passenger' : `${inv.passengerCount} passengers`;
    doc.text(paxLabel, lx, yL, { width: lw });
    yL += 14;

    doc.font('Helvetica-Bold').text('INVOICE DATE', rx, yR, { width: rw });
    yR += 14;
    doc.font('Helvetica').text(invoiceDateYmd(inv.pickupDate), rx, yR, { width: rw });
    yR += 14;

    y = Math.max(yL, yR) + 16;

    doc.save();
    doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_W, y).lineWidth(3).strokeColor('#000000').stroke();
    doc.restore();
    y += 16;

    const rowMoney = (label: string, amount: number) => {
      const rowY = y;
      doc.font('Helvetica-Bold').fontSize(11).text(label, PAGE_MARGIN, rowY);
      doc.text(formatEuro(amount), PAGE_MARGIN, rowY, { width: CONTENT_W, align: 'right' });
      y = rowY + 20;
    };

    rowMoney('PRICE', net);
    rowMoney('10% TAX', tax);
    rowMoney('TOTAL', gross);
    y += 8;

    doc.save();
    doc.moveTo(PAGE_MARGIN, y)
      .lineTo(PAGE_MARGIN + CONTENT_W, y)
      .lineWidth(0.75)
      .strokeColor('#CCCCCC')
      .stroke();
    doc.restore();
    y += 14;

    const hdrY = y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Description', PAGE_MARGIN, hdrY, { width: CONTENT_W * 0.62 });
    doc.text('Amount', PAGE_MARGIN, hdrY, { width: CONTENT_W, align: 'right' });
    y = hdrY + 14;
    doc.font('Helvetica').fontSize(10);
    const desc = transferDescription(pickup, dropoff);
    const bodyY = y;
    doc.font('Helvetica').fontSize(10);
    const descW = CONTENT_W * 0.62;
    const hDesc = doc.heightOfString(desc, { width: descW });
    doc.text(desc, PAGE_MARGIN, bodyY, { width: descW });
    doc.text(formatMoney(gross), PAGE_MARGIN, bodyY, { width: CONTENT_W, align: 'right' });
    y = bodyY + Math.max(hDesc, 14) + 20;

    if (inv.childSeatsSummary?.trim()) {
      doc.font('Helvetica').fontSize(9).fillColor('#444444');
      doc.text(`Child seats: ${inv.childSeatsSummary.trim()}`, PAGE_MARGIN, y, { width: CONTENT_W });
      doc.fillColor('#000000');
      y = doc.y + 16;
    }

    doc.font('Helvetica-Bold').fontSize(10).text('TERMS AND CONDITIONS', PAGE_MARGIN, y, {
      width: CONTENT_W,
    });
    y = doc.y + 8;
    doc.font('Helvetica').fontSize(10).text(TERMS_TEXT, PAGE_MARGIN, y, { width: CONTENT_W });

    doc.end();
  });
}
