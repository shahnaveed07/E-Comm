import { isRazorpayAvailable, isStripeAvailable, isUpiQrAvailable } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';

export function createPaymentService({ config, repo, upiQrAdapter, razorpayAdapter, stripeAdapter }) {
  return {
    getAvailableMethods(orderCurrency = config.storeCurrency) {
      return {
        currency: config.storeCurrency,
        cardToken: true,
        upiQr: {
          enabled: isUpiQrAvailable(config, orderCurrency),
          currency: 'INR',
          manualVerification: true,
        },
        razorpay: {
          enabled: isRazorpayAvailable(config),
        },
        stripe: {
          enabled: isStripeAvailable(config),
          publishableKey: config.stripe.publishableKey || null,
        },
      };
    },

    async initiatePayment({ orderId, user, provider }) {
      const order = await repo.findOrderById(orderId);
      if (!order) throw new AppError(404, 'Order not found.', 'NOT_FOUND');
      if (order.userId !== user.id && String(user.role).toUpperCase() !== 'ADMIN') {
        throw new AppError(403, 'You cannot initiate payment for another user order.', 'FORBIDDEN');
      }
      if (order.paymentStatus === 'CAPTURED') {
        throw new AppError(409, 'Order is already paid.', 'ALREADY_PAID');
      }

      const norm = String(provider || '').toUpperCase();
      if (norm === 'UPI_QR') {
        return upiQrAdapter.createOrRefreshQrPayment({ order, user });
      }
      if (norm === 'RAZORPAY') {
        return razorpayAdapter.createCheckoutOrder({ order, user });
      }
      if (norm === 'STRIPE') {
        return stripeAdapter.createCheckoutSession({ order, user });
      }
      throw new AppError(400, `Unsupported payment provider: ${provider}`, 'INVALID_PAYMENT_PROVIDER');
    },

    async submitUpiUtr({ orderId, paymentId, user, utrNumber }) {
      const order = await repo.findOrderById(orderId);
      if (!order) throw new AppError(404, 'Order not found.', 'NOT_FOUND');
      if (order.userId !== user.id) {
        throw new AppError(403, 'Forbidden.', 'FORBIDDEN');
      }

      const payment =
        (paymentId ? await repo.findPaymentById(paymentId) : null) ||
        (order.payments || []).find(
          (p) => p.provider === 'UPI_QR' && (p.status === 'PENDING' || p.status === 'PENDING_MANUAL_VERIFICATION')
        );

      return upiQrAdapter.submitUtrReference({ order, payment, user, utrNumber });
    },

    async refundPayment({ paymentId, amountMinor, reason, actorUser }) {
      if (String(actorUser.role).toUpperCase() !== 'ADMIN') {
        throw new AppError(403, 'Admin role required.', 'FORBIDDEN');
      }
      const payment = await repo.findPaymentById(paymentId);
      if (!payment) throw new AppError(404, 'Payment not found.', 'NOT_FOUND');
      if (payment.status !== 'CAPTURED' && payment.status !== 'PARTIALLY_REFUNDED') {
        throw new AppError(409, 'Only captured payments can be refunded.', 'INVALID_PAYMENT_STATE');
      }

      if (payment.provider === 'RAZORPAY') {
        return razorpayAdapter.refundPayment({ payment, amountMinor, reason, actorUserId: actorUser.id });
      }
      if (payment.provider === 'STRIPE') {
        return stripeAdapter.refundPayment({ payment, amountMinor, reason, actorUserId: actorUser.id });
      }
      return repo.markPaymentRefunded({
        paymentId: payment.id,
        refundMinor: amountMinor || payment.amountMinor - (payment.refundedMinor || 0),
        actorUserId: actorUser.id,
        reason,
      });
    },
  };
}
