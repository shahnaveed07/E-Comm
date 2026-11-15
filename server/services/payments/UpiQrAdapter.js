import QRCode from 'qrcode';
import { isUpiQrAvailable } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';
import { minorToDecimalString } from '../../utils/money.js';

const UTR_REGEX = /^[A-Z0-9]{10,22}$/;

export function createUpiQrAdapter({ config, repo, emailService }) {
  return {
    isAvailable(orderCurrency = config.storeCurrency) {
      return isUpiQrAvailable(config, orderCurrency);
    },

    async createOrRefreshQrPayment({ order, user }) {
      if (!isUpiQrAvailable(config, order.currency)) {
        throw new AppError(
          400,
          'UPI QR payment is strictly available only when store currency is INR and UPI merchant VPA is configured.',
          'UPI_QR_UNAVAILABLE'
        );
      }

      if (order.paymentStatus === 'CAPTURED') {
        throw new AppError(409, 'This order is already paid.', 'ALREADY_PAID');
      }

      const existingPending = (order.payments || []).find(
        (p) =>
          p.provider === 'UPI_QR' &&
          p.status === 'PENDING' &&
          p.qrExpiresAt &&
          new Date(p.qrExpiresAt).getTime() > Date.now()
      );

      const amountDecimal = minorToDecimalString(order.totalMinor);
      const expiresAt = new Date(Date.now() + config.upiQr.expiryMinutes * 60 * 1000);

      let payment = existingPending;
      if (!payment) {
        const ref = `UPI-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const upiUri =
          `upi://pay?pa=${encodeURIComponent(config.upiQr.merchantVpa)}` +
          `&pn=${encodeURIComponent(config.upiQr.merchantName)}` +
          `&tr=${encodeURIComponent(ref)}` +
          `&tn=${encodeURIComponent(`${config.storeName} Order ${order.orderNumber}`)}` +
          `&am=${encodeURIComponent(amountDecimal)}` +
          `&cu=INR`;

        payment = await repo.createPaymentRecord({
          orderId: order.id,
          userId: user.id,
          provider: 'UPI_QR',
          status: 'PENDING',
          currency: 'INR',
          amountMinor: order.totalMinor,
          paymentReference: ref,
          upiUri,
          qrExpiresAt: expiresAt,
        });
      }

      const qrDataUrl = await QRCode.toDataURL(payment.upiUri, {
        width: 280,
        margin: 2,
        color: { dark: '#1B3B2B', light: '#FCFAF6' },
      });

      return {
        payment,
        qrDataUrl,
        upiUri: payment.upiUri,
        merchantVpa: config.upiQr.merchantVpa,
        merchantName: config.upiQr.merchantName,
        amountDecimal,
        currency: 'INR',
        expiresAt: payment.qrExpiresAt,
        notice: 'Payment verification may take some time. Do not make another payment unless instructed.',
      };
    },

    async submitUtrReference({ order, payment, user, utrNumber }) {
      if (!payment || payment.provider !== 'UPI_QR') {
        throw new AppError(404, 'UPI QR payment session not found for this order.', 'PAYMENT_NOT_FOUND');
      }
      if (payment.status === 'CAPTURED') {
        throw new AppError(409, 'Payment for this order is already verified.', 'ALREADY_PAID');
      }
      if (payment.status === 'REJECTED') {
        throw new AppError(
          409,
          'This payment attempt was rejected. Please initiate a fresh UPI QR retry.',
          'PAYMENT_REJECTED_RETRY_REQUIRED'
        );
      }
      if (payment.qrExpiresAt && new Date(payment.qrExpiresAt).getTime() < Date.now()) {
        await repo.updatePaymentRecord(payment.id, { status: 'EXPIRED' });
        throw new AppError(
          400,
          'This UPI QR session has expired. Generate a fresh QR code to pay.',
          'QR_EXPIRED'
        );
      }

      const normalizedUtr = String(utrNumber || '')
        .trim()
        .toUpperCase();
      if (!UTR_REGEX.test(normalizedUtr)) {
        throw new AppError(
          400,
          'Please enter a valid 10–22 character alphanumeric UTR / UPI transaction reference.',
          'INVALID_UTR_FORMAT'
        );
      }

      const duplicates = await repo.findPaymentsByUtr(normalizedUtr);
      const conflict = duplicates.find(
        (d) =>
          d.id !== payment.id &&
          (d.status === 'CAPTURED' || d.status === 'PENDING_MANUAL_VERIFICATION')
      );
      if (conflict) {
        throw new AppError(
          409,
          'This UTR / transaction reference has already been submitted on another order.',
          'DUPLICATE_UTR'
        );
      }

      const updated = await repo.updatePaymentRecord(payment.id, {
        utrNumber: normalizedUtr,
        utrSubmittedAt: new Date(),
        status: 'PENDING_MANUAL_VERIFICATION',
      });

      await repo.updateOrder(
        order.id,
        {
          paymentStatus: 'PENDING_MANUAL_VERIFICATION',
          statusNote: `UTR submitted: ${normalizedUtr}`,
        },
        user.id
      );

      await repo.createAuditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'UPI_UTR_SUBMITTED',
        entityType: 'Payment',
        entityId: payment.id,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          utrNumber: normalizedUtr,
        },
      });

      emailService?.sendPaymentPendingVerificationEmail(user, order, updated).catch(() => {});

      return {
        payment: updated,
        notice: 'Payment verification may take some time. Do not make another payment unless instructed.',
      };
    },
  };
}
