import { formatMinorCurrency } from '../../utils/money.js';

export function createEmailService({ config, repo, logger }) {
  async function sendEmail({ toEmail, eventType, subject, html, text }) {
    if (!toEmail) return { delivered: false, skipped: true };

    const job = await repo
      .createNotificationJob({
        channel: 'EMAIL',
        recipient: toEmail,
        eventType,
        subject,
        payload: { text },
        status: 'PENDING',
      })
      .catch(() => null);

    try {
      if (config.email.provider === 'resend' && config.email.resendApiKey) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.email.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: config.email.from,
            to: [toEmail],
            subject,
            html,
            text,
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => 'Resend API error');
          throw new Error(`Resend HTTP ${res.status}: ${errText}`);
        }
        const payload = await res.json();
        if (job) {
          await repo
            .updateNotificationJob(job.id, {
              status: 'SENT',
              attempts: 1,
              sentAt: new Date(),
            })
            .catch(() => {});
        }
        return { delivered: true, provider: 'resend', id: payload.id };
      }

      // Non-blocking console/dev fallback
      logger?.info('email_notification_logged', {
        provider: config.email.provider,
        toEmail,
        eventType,
        subject,
      });

      if (job) {
        await repo
          .updateNotificationJob(job.id, {
            status: 'SENT',
            attempts: 1,
            sentAt: new Date(),
          })
          .catch(() => {});
      }
      return { delivered: true, provider: 'console' };
    } catch (err) {
      logger?.error('email_notification_failed', {
        toEmail,
        eventType,
        message: err?.message,
      });
      if (job) {
        await repo
          .updateNotificationJob(job.id, {
            status: 'FAILED',
            attempts: 1,
            lastError: err?.message || 'Delivery failed',
          })
          .catch(() => {});
      }
      return { delivered: false, error: err?.message };
    }
  }

  return {
    sendEmail,

    async sendVerificationEmail(user, verifyToken) {
      const verifyUrl = `${config.appUrl}/?verifyToken=${encodeURIComponent(verifyToken)}`;
      return sendEmail({
        toEmail: user.email,
        eventType: 'EMAIL_VERIFICATION',
        subject: `${config.storeName} — Verify your email address`,
        text: `Welcome to ${config.storeName}, ${user.fullName}. Verify your account at: ${verifyUrl}`,
        html: `<p>Welcome to <strong>${config.storeName}</strong>, ${user.fullName}.</p><p>Verify your email by opening <a href="${verifyUrl}">this verification link</a>.</p>`,
      });
    },

    async sendPasswordResetEmail(user, resetToken) {
      const resetUrl = `${config.appUrl}/?resetToken=${encodeURIComponent(resetToken)}`;
      return sendEmail({
        toEmail: user.email,
        eventType: 'PASSWORD_RESET',
        subject: `${config.storeName} — Password reset request`,
        text: `Reset your ${config.storeName} password at: ${resetUrl} (valid for 30 minutes).`,
        html: `<p>We received a password reset request for your ${config.storeName} account.</p><p><a href="${resetUrl}">Reset your password</a> (expires in 30 minutes).</p>`,
      });
    },

    async sendOrderPlacedEmail(user, order) {
      if (!user?.email) return;
      const totalLabel = formatMinorCurrency(order.totalMinor, order.currency);
      return sendEmail({
        toEmail: user.email,
        eventType: 'ORDER_PLACED',
        subject: `${config.storeName} — Order ${order.orderNumber} received (${totalLabel})`,
        text: `Order ${order.orderNumber} has been created for ${totalLabel}. Current status: ${order.status}. Payment status: ${order.paymentStatus}.`,
        html: `<p>Order <strong>${order.orderNumber}</strong> received for <strong>${totalLabel}</strong>.</p><p>Status: ${order.status} · Payment: ${order.paymentStatus}</p>`,
      });
    },

    async sendPaymentPendingVerificationEmail(user, order, payment) {
      if (!user?.email) return;
      return sendEmail({
        toEmail: user.email,
        eventType: 'PAYMENT_PENDING_VERIFICATION',
        subject: `${config.storeName} — UPI payment reference received for ${order.orderNumber}`,
        text: `UTR ${payment.utrNumber} was submitted for ${order.orderNumber}. Payment verification may take some time. Do not make another payment unless instructed.`,
        html: `<p>We received UTR <strong>${payment.utrNumber}</strong> for order <strong>${order.orderNumber}</strong>.</p><p>Payment verification may take some time. Do not make another payment unless instructed.</p>`,
      });
    },

    async sendPaymentVerifiedEmail(user, order) {
      if (!user?.email) return;
      const totalLabel = formatMinorCurrency(order.totalMinor, order.currency);
      return sendEmail({
        toEmail: user.email,
        eventType: 'PAYMENT_VERIFIED',
        subject: `${config.storeName} — Payment verified for ${order.orderNumber}`,
        text: `Your payment of ${totalLabel} for order ${order.orderNumber} is verified. We are preparing your orchard harvest for dispatch.`,
        html: `<p>Your payment of <strong>${totalLabel}</strong> for order <strong>${order.orderNumber}</strong> is verified.</p>`,
      });
    },

    async sendPaymentRejectedEmail(user, order, reason) {
      if (!user?.email) return;
      return sendEmail({
        toEmail: user.email,
        eventType: 'PAYMENT_REJECTED',
        subject: `${config.storeName} — Payment update for ${order.orderNumber}`,
        text: `We could not verify the payment for ${order.orderNumber}. Reason: ${reason}. You may retry payment from your order view.`,
        html: `<p>We could not verify payment for order <strong>${order.orderNumber}</strong>.</p><p>Reason: ${reason}</p>`,
      });
    },

    async sendOrderStatusUpdateEmail(user, order) {
      if (!user?.email) return;
      return sendEmail({
        toEmail: user.email,
        eventType: `ORDER_${String(order.status).toUpperCase()}`,
        subject: `${config.storeName} — Order ${order.orderNumber} is now ${order.status}`,
        text: `Order ${order.orderNumber} status updated to ${order.status}. Tracking: ${order.trackingNumber || 'Pending'}.`,
        html: `<p>Order <strong>${order.orderNumber}</strong> status is now <strong>${order.status}</strong>.</p><p>Tracking: ${order.trackingNumber || 'Pending'}</p>`,
      });
    },
  };
}
