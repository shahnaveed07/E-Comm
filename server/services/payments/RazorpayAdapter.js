import Razorpay from 'razorpay';
import { isRazorpayAvailable } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';
import { signHmacSha256, timingSafeEqualStr } from '../../utils/crypto.js';

export function verifyRazorpayCheckoutSignature({ orderId, paymentId, signature, keySecret }) {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  const expected = signHmacSha256(`${orderId}|${paymentId}`, keySecret);
  return timingSafeEqualStr(expected, signature);
}

export function verifyRazorpayWebhookSignature({ rawBody, signature, webhookSecret }) {
  if (!rawBody || !signature || !webhookSecret) return false;
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf-8');
  const expected = signHmacSha256(payload, webhookSecret);
  return timingSafeEqualStr(expected, String(signature));
}

export function createRazorpayAdapter({ config, repo }) {
  function getClient() {
    if (!isRazorpayAvailable(config)) {
      throw new AppError(
        503,
        'Razorpay gateway is not configured in this environment.',
        'GATEWAY_UNCONFIGURED'
      );
    }
    return new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }

  return {
    isAvailable() {
      return isRazorpayAvailable(config);
    },

    async createCheckoutOrder({ order, user }) {
      const client = getClient();
      const paymentReference = `RZP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const rzpOrder = await client.orders.create({
        amount: order.totalMinor,
        currency: order.currency,
        receipt: order.orderNumber,
        notes: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentReference,
        },
      });

      const payment = await repo.createPaymentRecord({
        orderId: order.id,
        userId: user.id,
        provider: 'RAZORPAY',
        status: 'PENDING',
        currency: order.currency,
        amountMinor: order.totalMinor,
        paymentReference,
        externalOrderId: rzpOrder.id,
      });

      return {
        payment,
        razorpay: {
          keyId: config.razorpay.keyId,
          orderId: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          name: config.storeName,
          description: `Order ${order.orderNumber}`,
        },
      };
    },

    async verifyClientCheckout({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
      if (!isRazorpayAvailable(config)) {
        throw new AppError(503, 'Razorpay gateway is not configured.', 'GATEWAY_UNCONFIGURED');
      }
      const valid = verifyRazorpayCheckoutSignature({
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
        keySecret: config.razorpay.keySecret,
      });
      if (!valid) {
        throw new AppError(400, 'Invalid Razorpay signature.', 'INVALID_PAYMENT_SIGNATURE');
      }

      const payment = await repo.findPaymentByExternalOrderId(razorpayOrderId);
      if (!payment) {
        throw new AppError(404, 'Matching Razorpay payment order not found.', 'PAYMENT_NOT_FOUND');
      }

      return repo.confirmPaymentAndCommitOrder({
        paymentId: payment.id,
        externalPaymentId: razorpayPaymentId,
        verificationNotes: 'Verified via Razorpay checkout HMAC signature',
        actorRole: 'SYSTEM',
      });
    },

    async refundPayment({ payment, amountMinor, reason, actorUserId }) {
      const client = getClient();
      if (!payment.externalPaymentId) {
        throw new AppError(400, 'No external Razorpay payment ID recorded.', 'MISSING_EXTERNAL_PAYMENT');
      }
      const refund = await client.payments.refund(payment.externalPaymentId, {
        amount: amountMinor || payment.amountMinor - (payment.refundedMinor || 0),
        notes: { reason: reason || 'Customer refund' },
      });
      return repo.markPaymentRefunded({
        paymentId: payment.id,
        refundMinor: refund.amount || amountMinor,
        actorUserId,
        reason,
      });
    },
  };
}
