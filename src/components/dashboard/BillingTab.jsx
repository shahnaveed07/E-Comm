import React, { useState } from 'react';
import { CreditCard, FileDown, Lock, Plus, Trash2 } from 'lucide-react';
import {
  formatCurrency,
  formatReadableDate,
  validatePaymentCard,
} from '../../utils/commerce.js';

function formatInvoiceStatus(status) {
  const s = String(status || 'paid').toLowerCase();
  if (s === 'paid') return { label: 'Paid', cls: 'text-[#1B3B2B]' };
  if (s === 'refunded') return { label: 'Refunded', cls: 'text-[#4B5548]' };
  if (s === 'void') return { label: 'Void', cls: 'text-[#9E2A2B]' };
  return { label: 'Unpaid', cls: 'text-[#7A3E1C]' };
}

export const BillingTab = ({
  paymentMethods,
  invoices,
  currency = 'USD',
  onAddPaymentMethod,
  onSetDefaultCard,
  onRemoveCard,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvc, setCvc] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCardNumberChange = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    const grouped = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumber(grouped);
  };

  const handleSubmitCard = async (e) => {
    e.preventDefault();
    const result = validatePaymentCard({
      cardNumber,
      cardholderName,
      expMonth,
      expYear,
      cvc,
      billingZip,
    });

    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await onAddPaymentMethod({
        cardNumber,
        cardholderName,
        expMonth,
        expYear,
        billingZip,
        setAsDefault,
      });
      setCardNumber('');
      setCardholderName('');
      setExpMonth('');
      setExpYear('');
      setCvc('');
      setBillingZip('');
      setShowAddForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Saved Payment Methods + Add Card Form */}
      <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#EBE2D3]">
          <div>
            <h3 className="font-display text-xl font-semibold text-[#1C1915]">
              Saved Payment Methods
            </h3>
            <p className="text-sm text-[#4B5548] mt-0.5">
              Select the default card used for quick storefront checkouts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            aria-expanded={showAddForm}
            className="min-h-[42px] px-4 py-2 rounded-md border border-[#1B3B2B] text-[#1B3B2B] bg-[#FCFAF6] text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#E6EDE8] cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>{showAddForm ? 'Cancel New Card' : 'Add Payment Method'}</span>
          </button>
        </div>

        {/* Add Card Form */}
        {showAddForm && (
          <form
            onSubmit={handleSubmitCard}
            noValidate
            aria-label="Add new payment card"
            className="mt-5 p-5 rounded-lg bg-[#F6F1E9] border border-[#D8CCB8] space-y-4"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-[#4B5548]">
              <Lock className="w-3.5 h-3.5 text-[#1B3B2B]" aria-hidden="true" />
              <span>Card details are validated and tokenized securely before storage.</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="card-holder" className="block text-xs font-semibold text-[#1C1915] mb-1">
                  Cardholder Name
                </label>
                <input
                  id="card-holder"
                  type="text"
                  autoComplete="cc-name"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  aria-invalid={Boolean(errors.cardholderName)}
                  aria-describedby={errors.cardholderName ? 'err-cardholder' : undefined}
                  placeholder="Clara Vance"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm text-[#1C1915]"
                />
                {errors.cardholderName && (
                  <p id="err-cardholder" role="alert" className="text-xs text-[#9E2A2B] mt-1 font-medium">
                    {errors.cardholderName}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="card-number" className="block text-xs font-semibold text-[#1C1915] mb-1">
                  Card Number
                </label>
                <input
                  id="card-number"
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  value={cardNumber}
                  onChange={(e) => handleCardNumberChange(e.target.value)}
                  aria-invalid={Boolean(errors.cardNumber)}
                  aria-describedby={errors.cardNumber ? 'err-cardnumber' : undefined}
                  placeholder="4242 4242 4242 4242"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums text-[#1C1915]"
                />
                {errors.cardNumber && (
                  <p id="err-cardnumber" role="alert" className="text-xs text-[#9E2A2B] mt-1 font-medium">
                    {errors.cardNumber}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="card-month" className="block text-xs font-semibold text-[#1C1915] mb-1">
                  Exp. Month (MM)
                </label>
                <input
                  id="card-month"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, ''))}
                  aria-invalid={Boolean(errors.expiry)}
                  aria-describedby={errors.expiry ? 'err-expiry' : undefined}
                  placeholder="08"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums text-[#1C1915]"
                />
              </div>

              <div>
                <label htmlFor="card-year" className="block text-xs font-semibold text-[#1C1915] mb-1">
                  Exp. Year (YYYY)
                </label>
                <input
                  id="card-year"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={expYear}
                  onChange={(e) => setExpYear(e.target.value.replace(/\D/g, ''))}
                  aria-invalid={Boolean(errors.expiry)}
                  aria-describedby={errors.expiry ? 'err-expiry' : undefined}
                  placeholder="2029"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums text-[#1C1915]"
                />
              </div>

              <div>
                <label htmlFor="card-cvc" className="block text-xs font-semibold text-[#1C1915] mb-1">
                  CVC
                </label>
                <input
                  id="card-cvc"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                  aria-invalid={Boolean(errors.cvc)}
                  aria-describedby={errors.cvc ? 'err-cvc' : undefined}
                  placeholder="482"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums text-[#1C1915]"
                />
                {errors.cvc && (
                  <p id="err-cvc" role="alert" className="text-xs text-[#9E2A2B] mt-1 font-medium">
                    {errors.cvc}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="card-zip" className="block text-xs font-semibold text-[#1C1915] mb-1">
                  Billing ZIP
                </label>
                <input
                  id="card-zip"
                  type="text"
                  inputMode="numeric"
                  value={billingZip}
                  onChange={(e) => setBillingZip(e.target.value)}
                  aria-invalid={Boolean(errors.billingZip)}
                  aria-describedby={errors.billingZip ? 'err-zip' : undefined}
                  placeholder="97205"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums text-[#1C1915]"
                />
                {errors.billingZip && (
                  <p id="err-zip" role="alert" className="text-xs text-[#9E2A2B] mt-1 font-medium">
                    {errors.billingZip}
                  </p>
                )}
              </div>
            </div>

            {errors.expiry && (
              <p id="err-expiry" role="alert" className="text-xs text-[#9E2A2B] font-medium">
                {errors.expiry}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <label className="flex items-center gap-2.5 text-sm text-[#1C1915] cursor-pointer">
                <input
                  type="checkbox"
                  checked={setAsDefault}
                  onChange={(e) => setSetAsDefault(e.target.checked)}
                  className="w-4 h-4 accent-[#1B3B2B]"
                />
                <span>Set as default checkout card</span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[44px] px-5 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold hover:bg-[#142C20] disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? 'Saving Card...' : 'Save Payment Method'}
              </button>
            </div>
          </form>
        )}

        {/* Saved Cards List */}
        <ul className="divide-y divide-[#EBE2D3] mt-2">
          {paymentMethods.map((card) => (
            <li
              key={card.id}
              className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-lg bg-[#F6F1E9] border border-[#D8CCB8] flex items-center justify-center text-[#1B3B2B] shrink-0">
                  <CreditCard className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1C1915]">
                    {card.brand} ending in{' '}
                    <span className="font-mono tabular-nums">{card.last4}</span>
                    {card.isDefault && (
                      <span className="ml-2 text-xs font-semibold text-[#1B3B2B]">
                        · Default Card
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#4B5548] mt-0.5">
                    {card.cardholderName} · Expires{' '}
                    <span className="font-mono tabular-nums">
                      {card.expMonth}/{card.expYear}
                    </span>{' '}
                    · ZIP <span className="font-mono tabular-nums">{card.billingZip}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!card.isDefault && (
                  <>
                    <button
                      type="button"
                      onClick={() => onSetDefaultCard(card.id)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-xs font-semibold text-[#1C1915] hover:bg-[#EBE2D3] cursor-pointer"
                    >
                      Make Default
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveCard(card.id)}
                      aria-label={`Remove ${card.brand} ending in ${card.last4}`}
                      className="min-h-[40px] px-3 py-1.5 rounded-md text-xs font-medium text-[#7A3E1C] hover:bg-[#EBE2D3] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Remove</span>
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Payment Ledger Table */}
      <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6">
        <h3 className="font-display text-xl font-semibold text-[#1C1915] mb-4">
          Receipt &amp; Payment History
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#D8CCB8] text-xs font-semibold text-[#4B5548]">
                <th scope="col" className="py-3 pr-4">Date</th>
                <th scope="col" className="py-3 pr-4">Description</th>
                <th scope="col" className="py-3 pr-4">Payment Method</th>
                <th scope="col" className="py-3 pr-4">Status</th>
                <th scope="col" className="py-3 pr-4 text-right">Amount</th>
                <th scope="col" className="py-3 text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBE2D3]">
              {invoices.map((inv) => {
                const st = formatInvoiceStatus(inv.status);
                return (
                  <tr key={inv.id}>
                    <td className="py-3.5 pr-4 font-mono tabular-nums text-xs text-[#4B5548] whitespace-nowrap">
                      {formatReadableDate(inv.date)}
                    </td>
                    <td className="py-3.5 pr-4 font-medium text-[#1C1915]">{inv.description}</td>
                    <td className="py-3.5 pr-4 text-[#4B5548] whitespace-nowrap">
                      {inv.paymentMethodSummary}
                    </td>
                    <td className="py-3.5 pr-4 whitespace-nowrap">
                      <span className={`font-medium ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="py-3.5 pr-4 text-right font-mono tabular-nums font-semibold text-[#1C1915] whitespace-nowrap">
                      {formatCurrency(inv.amount, inv.currency || currency)}
                    </td>
                    <td className="py-3.5 text-right whitespace-nowrap">
                      {inv.orderId ? (
                        <a
                          href={`/api/orders/${encodeURIComponent(inv.orderId)}/invoice.pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B3B2B] hover:underline"
                        >
                          <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>PDF</span>
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
