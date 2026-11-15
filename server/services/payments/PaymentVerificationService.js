import { AppError } from '../../middleware/errorHandler.js';

export function createPaymentVerificationService({ repo, emailService, broadcastEvent }) {
  return {
    async listVerificationQueue({ status, provider } = {}) {
      const payments = await repo.listPayments({ status, provider });
      const utrCounts = new Map();
      for (const p of payments) {
        if (p.utrNumber) {
          utrCounts.set(p.utrNumber, (utrCounts.get(p.utrNumber) || 0) + 1);
        }
      }
      return payments.map((p) => ({
        ...p,
        duplicateUtrWarning: Boolean(p.utrNumber && utrCounts.get(p.utrNumber) > 1),
      }));
    },

    async adminVerifyPayment({ paymentId, adminUser, confirmVerified, notes }) {
      if (!adminUser || String(adminUser.role).toUpperCase() !== 'ADMIN') {
        throw new AppError(403, 'Only administrators can verify manual payments.', 'FORBIDDEN');
      }
      if (confirmVerified !== true) {
        throw new AppError(
          400,
          'Explicit verification confirmation is required before marking a payment verified.',
          'CONFIRMATION_REQUIRED'
        );
      }

      const payment = await repo.findPaymentById(paymentId);
      if (!payment) throw new AppError(404, 'Payment record not found.', 'NOT_FOUND');

      if (payment.status === 'REJECTED' || payment.status === 'REFUNDED') {
        throw new AppError(
          409,
          `Cannot verify a payment with status ${payment.status}.`,
          'INVALID_PAYMENT_STATE'
        );
      }

      const result = await repo.confirmPaymentAndCommitOrder({
        paymentId,
        verifiedByUserId: adminUser.id,
        verificationNotes: notes || 'Verified by administrator against settlement statement',
        actorRole: 'ADMIN',
      });

      if (result.order.userId) {
        const customer = await repo.findUserById(result.order.userId);
        if (customer) {
          emailService?.sendPaymentVerifiedEmail(customer, result.order).catch(() => {});
        }
      }

      broadcastEvent?.('orders:changed', { orderId: result.order.id, action: 'payment_verified' });
      broadcastEvent?.('payments:changed', { paymentId: result.payment.id, action: 'verified' });

      return result;
    },

    async adminRejectPayment({ paymentId, adminUser, reason, notes }) {
      if (!adminUser || String(adminUser.role).toUpperCase() !== 'ADMIN') {
        throw new AppError(403, 'Only administrators can reject manual payments.', 'FORBIDDEN');
      }
      if (!reason || String(reason).trim().length < 4) {
        throw new AppError(400, 'Please provide a clear rejection reason.', 'VALIDATION_ERROR');
      }

      const payment = await repo.findPaymentById(paymentId);
      if (!payment) throw new AppError(404, 'Payment record not found.', 'NOT_FOUND');
      if (payment.status === 'CAPTURED') {
        throw new AppError(409, 'Cannot reject an already verified payment. Issue a refund instead.', 'ALREADY_CAPTURED');
      }

      const rejected = await repo.rejectPaymentRecord({
        paymentId,
        verifiedByUserId: adminUser.id,
        rejectionReason: String(reason).trim(),
        verificationNotes: notes || null,
      });

      const order = await repo.findOrderById(payment.orderId);
      if (order?.userId) {
        const customer = await repo.findUserById(order.userId);
        if (customer) {
          emailService?.sendPaymentRejectedEmail(customer, order, rejected.rejectionReason).catch(() => {});
        }
      }

      broadcastEvent?.('orders:changed', { orderId: payment.orderId, action: 'payment_rejected' });
      broadcastEvent?.('payments:changed', { paymentId: rejected.id, action: 'rejected' });

      return rejected;
    },
  };
}
