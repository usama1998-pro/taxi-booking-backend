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
  createdAt: string;
};

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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

function pickupDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function createdLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString('en-GB');
}

/** Renders a simple A4 invoice PDF (Helvetica, en-GB money). */
export function buildDriverInvoicePdf(inv: DriverInvoicePdfModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const row = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(11).text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(value);
    };

    doc.fontSize(22).font('Helvetica-Bold').text('Invoice');
    doc.moveDown(0.35);
    doc.fontSize(10).font('Helvetica').fillColor('#444444').text(`Invoice ID: ${inv.id}`);
    doc.fillColor('#000000');
    doc.moveDown();

    doc.fontSize(15).font('Helvetica-Bold').text(inv.fullName);
    doc.fontSize(11).font('Helvetica').text(inv.bookingReference);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Customer');
    doc.moveDown(0.25);
    doc.fontSize(11);
    row('Phone', inv.phoneNumber);
    doc.moveDown();

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
    const pickupLabel = inv.pickupKind === 'LOCATION' ? 'Pick-up address' : 'Pick-up (airport)';
    const dropLabel = inv.dropoffKind === 'LOCATION' ? 'Drop-off address' : 'Drop-off (airport)';

    doc.fontSize(12).font('Helvetica-Bold').text('Trip');
    doc.moveDown(0.25);
    doc.fontSize(11);
    row('Pick-up date', pickupDateLabel(inv.pickupDate));
    row(pickupLabel, pickup);
    row(dropLabel, dropoff);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Amounts');
    doc.moveDown(0.25);
    doc.fontSize(11);
    row('Subtotal', formatMoney(inv.priceAmount));
    row(`Tax (${(inv.taxRate * 100).toFixed(0)}%)`, formatMoney(inv.taxAmount));
    row('Total', formatMoney(inv.totalAmount));
    doc.moveDown();

    if (inv.sourceBookingUuid) {
      doc.fontSize(11).font('Helvetica').fillColor('#444444');
      doc.text(
        'Linked to an assigned booking (same booking reference as in your bookings list).',
      );
      doc.fillColor('#000000');
      doc.moveDown();
    }

    doc.fontSize(12).font('Helvetica-Bold').text('Record');
    doc.moveDown(0.25);
    doc.fontSize(11);
    row('Created', createdLabel(inv.createdAt));

    doc.end();
  });
}
