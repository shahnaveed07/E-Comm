import Stripe from 'stripe';
import { isStripeAvailable } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';

export function createStripeAdapter({ config, repo }) {
  function getClient() {
    if (!isStripeAvailable(config)) {
      throw new AppError(
        503,
        'Stripe gateway is not configured in this environment.',
        'GATEWAY_UNCONFIGURED'
      );
    }
    return new Stripe(config.stripe.secretKey);
  }

  return {
    isAvailable() {
      return isStripeAvailable(config);
    },

    async createCheckoutSession({ order, user }) {
      const stripe = getClient();
      const paymentReference = `STR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: user.email,
        client_reference_id: order.id,
        line_items: [
          {
            price_data: {
              currency: String(order.currency || 'USD').toLowerCase(),
              product_data: {
                name: `${config.storeName} · Order ${order.orderNumber}`,
              },
              unit_amount: order.totalMinor,
            },
            quantity: 1,
          },
        ],
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentReference,
        },
        success_url: `${config.appUrl}/?checkout=success&orderId=${encodeURIComponent(order.id)}`,
        cancel_url: `${config.appUrl}/?checkout=cancelled&orderId=${encodeURIComponent(order.id)}`,
      });

      const payment = await repo.createPaymentRecord({
        orderId: order.id,
        userId: user.id,
        provider: 'STRIPE',
        status: 'PENDING',
        currency: order.currency,
        amountMinor: order.totalMinor,
        paymentReference,
        externalOrderId: session.id,
      });

      return {
        payment,
        stripe: {
          sessionId: session.id,
          checkoutUrl: session.url,
          publishableKey: config.stripe.publishableKey,
        },
      };
    },

    constructWebhookEvent(rawBody, signatureHeader) {
      if (!config.stripe.webhookSecret) {
        throw new AppError(503, 'Stripe webhook secret is not configured.', 'WEBHOOK_UNCONFIGURED');
      }
      const stripe = getClient();
      return stripe.webhooks.constructEvent(rawBody, signatureHeader, config.stripe.webhookSecret);
    },

    async refundPayment({ payment, amountMinor, reason, actorUserId }) {
      const stripe = getClient();
      if (!payment.externalPaymentId) {
        throw new AppError(400, 'No Stripe PaymentIntent recorded.', 'MISSING_EXTERNAL_PAYMENT');
      }
      const refundAmt = amountMinor || payment.amountMinor - (payment.refundedMinor || 0);
      await stripe.refunds.create({
        payment_intent: payment.externalPaymentId,
        amount: refundAmt,
        reason: 'requested_by_customer',
      });
      return repo.markPaymentRefunded({
        paymentId: payment.id,
        refundMinor: refundAmt,
        actorUserId,
        reason,
      });
    },
  };
}
