import PDFDocument from 'pdfkit';
import { formatMinorCurrency } from '../../utils/money.js';

export function createInvoiceService({ config }) {
  function generateInvoicePdfBuffer({ order, invoice }) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const currency = order.currency || invoice?.currency || config.storeCurrency || 'USD';
      const invStatus = String(invoice?.status || 'unpaid').toUpperCase();

      doc.fontSize(20).fillColor('#1B3B2B').text(config.storeName || 'Sylvan Grove');
      doc.fontSize(10).fillColor('#4B5548').text('Organic Orchard Provisions · Cold-Shelled To Order');
      doc.moveDown();

      doc.fontSize(14).fillColor('#1C1915').text(`Invoice ${invoice?.invoiceNumber || order.orderNumber}`);
      doc.fontSize(10).fillColor('#4B5548');
      doc.text(`Order Number: ${order.orderNumber}`);
      doc.text(`Issued Date: ${invoice?.date || String(order.placedAt).slice(0, 10)}`);
      doc.text(`Invoice Status: ${invStatus}`);
      doc.text(`Payment Method: ${order.paymentSummary || invoice?.paymentMethodSummary || 'Pending'}`);
      doc.moveDown();

      const addr = order.shippingAddress || {};
      doc.fontSize(11).fillColor('#1C1915').text('Ship To:');
      doc.fontSize(10).fillColor('#4B5548');
      if (addr.fullName) doc.text(addr.fullName);
      if (addr.street) doc.text(addr.street);
      if (addr.city || addr.state || addr.postalCode) {
        doc.text(`${addr.city || ''}, ${addr.state || ''} ${addr.postalCode || ''}`.trim());
      }
      if (addr.phone) doc.text(`Phone: ${addr.phone}`);
      doc.moveDown();

      doc.fontSize(11).fillColor('#1C1915').text('Line Items');
      doc.moveDown(0.5);
      for (const item of order.items || []) {
        const lineMinor =
          item.lineTotalMinor != null
            ? item.lineTotalMinor
            : Math.round(Number(item.unitPrice) * 100) * Number(item.quantity);
        doc
          .fontSize(10)
          .fillColor('#1C1915')
          .text(
            `${item.quantity}x ${item.productName} (${item.weightLabel || item.weightSize}) — ${formatMinorCurrency(
              lineMinor,
              currency
            )}`
          );
      }

      doc.moveDown();
      doc.fontSize(10).fillColor('#4B5548');
      doc.text(`Subtotal: ${formatMinorCurrency(order.subtotalMinor, currency)}`);
      if ((order.discountMinor || 0) > 0) {
        doc.text(`Discount (${order.couponCode || 'Promo'}): -${formatMinorCurrency(order.discountMinor, currency)}`);
      }
      doc.text(`Shipping: ${order.shippingFeeMinor === 0 ? 'Free' : formatMinorCurrency(order.shippingFeeMinor, currency)}`);
      doc.fontSize(12).fillColor('#1B3B2B').text(`Total: ${formatMinorCurrency(order.totalMinor, currency)}`);

      doc.end();
    });
  }

  return { generateInvoicePdfBuffer };
}
