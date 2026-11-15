import { AppError } from '../../middleware/errorHandler.js';
import { verifyRazorpayWebhookSignature } from './RazorpayAdapter.js';

export function createWebhookProcessor({ config, repo, stripeAdapter, broadcastEvent, logger }) {
  return {
    async processRazorpayWebhook({ rawBody, signatureHeader }) {
      const secret = config.razorpay.webhookSecret || config.razorpay.keySecret;
      if (!secret) {
        throw new AppError(503, 'Razorpay webhook secret not configured.', 'WEBHOOK_UNCONFIGURED');
      }
      const valid = verifyRazorpayWebhookSignature({
        rawBody,
        signature: signatureHeader,
        webhookSecret: secret,
      });
      if (!valid) {
        throw new AppError(401, 'Invalid Razorpay webhook signature.', 'INVALID_WEBHOOK_SIGNATURE');
      }

      const payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : String(rawBody));
      const eventType = payload.event || 'unknown';
      const entity = payload.payload?.payment?.entity || {};
      const eventId = payload.id || `${eventType}:${entity.id || Date.now()}`;

      const dedup = await repo.recordWebhookEventIfNew({
        provider: 'RAZORPAY',
        eventId,
        eventType,
        signatureValid: true,
        payload,
      });
      if (dedup.duplicate) {
        return { duplicate: true, eventId };
      }

      const payment = entity.order_id
        ? await repo.findPaymentByExternalOrderId(entity.order_id)
        : null;

      if (payment) {
        if (eventType === 'payment.captured' || eventType === 'order.paid') {
          if (entity.amount === payment.amountMinor && String(entity.currency).toUpperCase() === payment.currency) {
            await repo.confirmPaymentAndCommitOrder({
              paymentId: payment.id,
              externalPaymentId: entity.id,
              verificationNotes: `Razorpay webhook: ${eventType}`,
              actorRole: 'SYSTEM',
            });
            broadcastEvent?.('orders:changed', { orderId: payment.orderId, action: 'webhook_captured' });
          } else {
            logger?.warn('razorpay_amount_mismatch', { paymentId: payment.id, entity });
          }
        } else if (eventType === 'payment.failed') {
          await repo.updatePaymentRecord(payment.id, {
            status: 'FAILED',
            rejectionReason: entity.error_description || 'Razorpay payment failed',
          });
          broadcastEvent?.('payments:changed', { paymentId: payment.id, action: 'failed' });
        } else if (eventType === 'refund.processed') {
          const refundEntity = payload.payload?.refund?.entity || {};
          await repo.markPaymentRefunded({
            paymentId: payment.id,
            refundMinor: refundEntity.amount || payment.amountMinor,
            actorUserId: null,
            reason: 'Razorpay refund webhook',
          });
        }
      }

      return { duplicate: false, eventId, eventType };
    },

    async processStripeWebhook({ rawBody, signatureHeader }) {
      let event;
      try {
        event = stripeAdapter.constructWebhookEvent(rawBody, signatureHeader);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(401, 'Invalid Stripe webhook signature.', 'INVALID_WEBHOOK_SIGNATURE');
      }

      const dedup = await repo.recordWebhookEventIfNew({
        provider: 'STRIPE',
        eventId: event.id,
        eventType: event.type,
        signatureValid: true,
        payload: event,
      });
      if (dedup.duplicate) {
        return { duplicate: true, eventId: event.id };
      }

      const obj = event.data?.object || {};
      const paymentReference = obj.metadata?.paymentReference;
      const payment =
        (paymentReference ? await repo.findPaymentByReference(paymentReference) : null) ||
        (obj.id ? await repo.findPaymentByExternalOrderId(obj.id) : null);

      if (payment) {
        if (
          event.type === 'checkout.session.completed' ||
          event.type === 'checkout.session.async_payment_succeeded'
        ) {
          if (obj.payment_status === 'paid' && obj.amount_total === payment.amountMinor) {
            await repo.confirmPaymentAndCommitOrder({
              paymentId: payment.id,
              externalPaymentId: obj.payment_intent || obj.id,
              verificationNotes: `Stripe webhook: ${event.type}`,
              actorRole: 'SYSTEM',
            });
            broadcastEvent?.('orders:changed', { orderId: payment.orderId, action: 'webhook_captured' });
          }
        } else if (
          event.type === 'checkout.session.async_payment_failed' ||
          event.type === 'payment_intent.payment_failed'
        ) {
          await repo.updatePaymentRecord(payment.id, {
            status: 'FAILED',
            rejectionReason: obj.last_payment_error?.message || 'Stripe payment failed',
          });
          broadcastEvent?.('payments:changed', { paymentId: payment.id, action: 'failed' });
        } else if (event.type === 'charge.refunded') {
          await repo.markPaymentRefunded({
            paymentId: payment.id,
            refundMinor: obj.amount_refunded || payment.amountMinor,
            actorUserId: null,
            reason: 'Stripe charge.refunded webhook',
          });
        }
      }

      return { duplicate: false, eventId: event.id, eventType: event.type };
    },
  };
}
