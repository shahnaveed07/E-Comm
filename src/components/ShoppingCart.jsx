import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Lock, Minus, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD, WEIGHT_OPTIONS } from '../data/catalog.js';
import {
  calculateCartTotals,
  calculateUnitPrice,
  canCheckout,
  formatCurrency,
  validatePaymentCard,
} from '../utils/commerce.js';
import { AuthPanel } from './AuthPanel.jsx';

export const ShoppingCart = ({
  isOpen,
  items,
  catalog,
  currentUser,
  paymentMethods,
  shippingAddress,
  onClose,
  onUpdateQuantity,
  onPlaceOrder,
  onAddPaymentMethod,
  onLogin,
  onRegister,
  onTrackNewOrder,
}) => {
  const [step, setStep] = useState('bag');
  const [selectedCardId, setSelectedCardId] = useState(
    paymentMethods.find((pm) => pm.isDefault)?.id || paymentMethods[0]?.id || ''
  );
  const [address, setAddress] = useState(shippingAddress);
  const [showNewCard, setShowNewCard] = useState(paymentMethods.length === 0);
  const [cardNumber, setCardNumber] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvc, setCvc] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [cardErrors, setCardErrors] = useState({});
  const [checkoutError, setCheckoutError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  const isAuthenticated = canCheckout(currentUser);

  useEffect(() => {
    setAddress(shippingAddress);
  }, [shippingAddress]);

  useEffect(() => {
    if (paymentMethods.length === 0) {
      setShowNewCard(true);
      setSelectedCardId('');
    } else if (!selectedCardId || !paymentMethods.some((pm) => pm.id === selectedCardId)) {
      setSelectedCardId(paymentMethods.find((pm) => pm.isDefault)?.id || paymentMethods[0].id);
      setShowNewCard(false);
    }
  }, [paymentMethods, selectedCardId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totals = calculateCartTotals(items, catalog);
  const progressPct = Math.min(100, Math.round((totals.subtotal / FREE_SHIPPING_THRESHOLD) * 100));

  const handleProceedToCheckout = () => {
    setCheckoutError(null);
    if (!isAuthenticated) {
      setStep('auth');
      return;
    }
    setStep('checkout');
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    setCheckoutError(null);

    if (!isAuthenticated) {
      setStep('auth');
      return;
    }

    if (
      !address.fullName?.trim() ||
      !address.street?.trim() ||
      !address.city?.trim() ||
      !address.postalCode?.trim()
    ) {
      setCheckoutError('Please complete all required shipping address fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      let paymentMethodIdToUse = selectedCardId;

      if (showNewCard || paymentMethods.length === 0) {
        const validation = validatePaymentCard({
          cardNumber,
          cardholderName,
          expMonth,
          expYear,
          cvc,
          billingZip,
        });
        if (!validation.valid) {
          setCardErrors(validation.errors);
          setIsSubmitting(false);
          return;
        }
        setCardErrors({});
        const newCard = await onAddPaymentMethod({
          cardNumber,
          cardholderName,
          expMonth,
          expYear,
          billingZip,
          setAsDefault: true,
        });
        paymentMethodIdToUse = newCard.id;
      }

      const order = await onPlaceOrder({
        items,
        paymentMethodId: paymentMethodIdToUse,
        shippingAddress: address,
      });
      setConfirmedOrder(order);
      setStep('confirmed');
      setShowNewCard(false);
      setCardNumber('');
      setCardholderName('');
      setExpMonth('');
      setExpYear('');
      setCvc('');
      setBillingZip('');
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Unable to process checkout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (step === 'confirmed' || step === 'auth') {
      setStep('bag');
      if (step === 'confirmed') setConfirmedOrder(null);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shopping-cart-title"
      className="fixed inset-0 z-50 flex justify-end bg-[#1C1915]/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-lg h-full bg-[#FCFAF6] border-l border-[#D8CCB8] flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-[#D8CCB8] flex items-center justify-between gap-4 bg-[#F6F1E9]">
          <h2 id="shopping-cart-title" className="font-display text-xl font-semibold text-[#1C1915]">
            {step === 'bag' && `Your Harvest Bag (${totals.itemCount})`}
            {step === 'auth' && 'Account Required to Checkout'}
            {step === 'checkout' && 'Secure Orchard Checkout'}
            {step === 'confirmed' && 'Order Confirmed'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close shopping cart"
            className="w-10 h-10 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-[#1C1915] flex items-center justify-center hover:bg-[#EBE2D3] cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'confirmed' && confirmedOrder ? (
            <div className="py-6 space-y-6">
              <div className="p-5 rounded-xl bg-[#E6EDE8] border border-[#1B3B2B]/30 text-[#1B3B2B]">
                <div className="flex items-center gap-2.5 font-semibold text-base">
                  <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span>Order #{confirmedOrder.orderNumber} Confirmed</span>
                </div>
                <p className="text-sm mt-1.5 text-[#1C1915]">
                  Thank you, {confirmedOrder.shippingAddress.fullName}. Your organic harvest is
                  queued for cold-shelling and dispatch.
                </p>
              </div>

              <dl className="space-y-2.5 text-sm border-y border-[#D8CCB8] py-4">
                <div className="flex justify-between">
                  <dt className="text-[#4B5548]">Tracking ID</dt>
                  <dd className="font-mono tabular-nums font-medium text-[#1C1915]">
                    {confirmedOrder.trackingNumber}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#4B5548]">Payment Processed</dt>
                  <dd className="font-medium text-[#1C1915]">{confirmedOrder.paymentSummary}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#4B5548]">Total Charged</dt>
                  <dd className="font-mono tabular-nums font-semibold text-[#1C1915]">
                    {formatCurrency(confirmedOrder.total)}
                  </dd>
                </div>
              </dl>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    onTrackNewOrder();
                  }}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold hover:bg-[#142C20] cursor-pointer"
                >
                  Track Order in Account
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full min-h-[44px] px-4 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-medium text-[#1C1915] hover:bg-[#EBE2D3] cursor-pointer"
                >
                  Continue Browsing
                </button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-display text-xl font-semibold text-[#1C1915]">
                Your harvest bag is empty
              </p>
              <p className="text-sm text-[#4B5548] mt-1.5 mb-6">
                Explore raw Chandler walnuts, sprouted almonds, pistachios, and orchard medleys.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[44px] px-5 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold cursor-pointer"
              >
                Browse Harvests
              </button>
            </div>
          ) : step === 'bag' ? (
            <div className="space-y-5">
              {/* Free Shipping Status */}
              <div className="p-3.5 rounded-lg bg-[#F6F1E9] border border-[#D8CCB8]">
                <p className="text-xs font-medium text-[#1C1915]">
                  {totals.shippingFee === 0
                    ? 'Free carbon-neutral orchard shipping unlocked!'
                    : `Add ${formatCurrency(totals.freeShippingRemaining)} more for free shipping.`}
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-[#D8CCB8] overflow-hidden">
                  <div
                    className="h-full bg-[#1B3B2B] transition-all duration-300"
                    style={{ width: `${totals.shippingFee === 0 ? 100 : progressPct}%` }}
                  />
                </div>
              </div>

              {/* Cart Items */}
              <ul className="divide-y divide-[#EBE2D3]">
                {items.map((item) => {
                  const product = catalog.find((p) => p.id === item.productId);
                  if (!product) return null;
                  const unitPrice = calculateUnitPrice(product.basePrice16oz, item.weightSize);

                  return (
                    <li
                      key={`${item.productId}-${item.weightSize}`}
                      className="py-4 space-y-3"
                    >
                      <div className="flex items-start gap-3.5">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 rounded-lg object-cover bg-[#EBE2D3] border border-[#D8CCB8] shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-display text-base font-semibold text-[#1C1915]">
                              {product.name}
                            </p>
                            <span className="font-mono tabular-nums text-sm font-semibold text-[#1C1915] shrink-0">
                              {formatCurrency(unitPrice * item.quantity)}
                            </span>
                          </div>
                          <p className="text-xs text-[#4B5548] mt-0.5">
                            {WEIGHT_OPTIONS[item.weightSize].label} ·{' '}
                            <span className="font-mono tabular-nums">
                              {formatCurrency(unitPrice)}
                            </span>{' '}
                            each
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <div className="inline-flex items-center border border-[#D8CCB8] rounded bg-[#F6F1E9]">
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.productId, item.weightSize, -1)}
                            aria-label={`Decrease quantity of ${product.name}`}
                            className="w-8 h-8 flex items-center justify-center text-[#1C1915] hover:bg-[#EBE2D3] cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <span className="w-8 text-center font-mono tabular-nums text-xs font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.productId, item.weightSize, 1)}
                            aria-label={`Increase quantity of ${product.name}`}
                            className="w-8 h-8 flex items-center justify-center text-[#1C1915] hover:bg-[#EBE2D3] cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            onUpdateQuantity(item.productId, item.weightSize, -item.quantity)
                          }
                          aria-label={`Remove ${product.name} from bag`}
                          className="w-8 h-8 flex items-center justify-center text-[#7A3E1C] hover:bg-[#EBE2D3] rounded cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : step === 'auth' ? (
            <div className="space-y-5 py-2">
              <div className="p-4 rounded-lg bg-[#E6EDE8] border border-[#1B3B2B]/25 text-sm text-[#1C1915] flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[#1B3B2B] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-[#1B3B2B]">Create an account to check out</p>
                  <p className="text-xs text-[#4B5548] mt-1">
                    Anyone can browse our orchard catalog, while checkout and order tracking require a
                    registered Sylvan Grove account. Your {totals.itemCount}{' '}
                    {totals.itemCount === 1 ? 'item' : 'items'} stay saved in your bag.
                  </p>
                </div>
              </div>

              <AuthPanel
                compact
                initialMode="register"
                onLogin={onLogin}
                onRegister={onRegister}
                onAuthenticated={() => setStep('checkout')}
              />

              <button
                type="button"
                onClick={() => setStep('bag')}
                className="w-full min-h-[42px] px-4 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm font-medium text-[#1C1915] hover:bg-[#EBE2D3] cursor-pointer"
              >
                Back to Bag
              </button>
            </div>
          ) : (
            /* Checkout Form (Authenticated Users Only) */
            <form id="checkout-form" onSubmit={handleCheckoutSubmit} noValidate className="space-y-6">
              {checkoutError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-md bg-[#9E2A2B]/10 border border-[#9E2A2B]/30 text-xs font-medium text-[#9E2A2B]"
                >
                  {checkoutError}
                </div>
              )}

              {/* Shipping Address */}
              <fieldset className="space-y-3">
                <legend className="font-display text-lg font-semibold text-[#1C1915]">
                  1. Delivery Destination
                </legend>
                <div>
                  <label htmlFor="chk-name" className="block text-xs font-semibold text-[#1C1915] mb-1">
                    Full Name
                  </label>
                  <input
                    id="chk-name"
                    type="text"
                    required
                    value={address.fullName}
                    onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                    placeholder="Maya Lin"
                    className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="chk-street" className="block text-xs font-semibold text-[#1C1915] mb-1">
                    Street Address
                  </label>
                  <input
                    id="chk-street"
                    type="text"
                    required
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                    placeholder="418 Alderwood Terrace"
                    className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label htmlFor="chk-city" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      City
                    </label>
                    <input
                      id="chk-city"
                      type="text"
                      required
                      value={address.city}
                      onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      placeholder="Portland"
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="chk-state" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      State
                    </label>
                    <input
                      id="chk-state"
                      type="text"
                      required
                      value={address.state}
                      onChange={(e) => setAddress({ ...address, state: e.target.value })}
                      placeholder="OR"
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="chk-zip" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      ZIP
                    </label>
                    <input
                      id="chk-zip"
                      type="text"
                      required
                      value={address.postalCode}
                      onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                      placeholder="97205"
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Payment Selection */}
              <fieldset className="space-y-3 pt-4 border-t border-[#D8CCB8]">
                <legend className="font-display text-lg font-semibold text-[#1C1915]">
                  2. Payment Method
                </legend>

                <div className="space-y-2">
                  {paymentMethods.map((card) => (
                    <label
                      key={card.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer ${
                        !showNewCard && selectedCardId === card.id
                          ? 'border-[#1B3B2B] bg-[#E6EDE8]'
                          : 'border-[#D8CCB8] bg-[#F6F1E9]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 text-sm font-medium text-[#1C1915]">
                        <input
                          type="radio"
                          name="checkoutCard"
                          checked={!showNewCard && selectedCardId === card.id}
                          onChange={() => {
                            setShowNewCard(false);
                            setSelectedCardId(card.id);
                          }}
                          className="w-4 h-4 accent-[#1B3B2B]"
                        />
                        <CreditCard className="w-4 h-4 text-[#1B3B2B]" aria-hidden="true" />
                        <span>
                          {card.brand} •••• <span className="font-mono tabular-nums">{card.last4}</span>
                        </span>
                      </span>
                      <span className="text-xs font-mono tabular-nums text-[#4B5548]">
                        {card.expMonth}/{card.expYear}
                      </span>
                    </label>
                  ))}

                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer text-sm font-medium ${
                      showNewCard || paymentMethods.length === 0
                        ? 'border-[#1B3B2B] bg-[#E6EDE8] text-[#1B3B2B]'
                        : 'border-[#D8CCB8] bg-[#F6F1E9] text-[#1C1915]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="checkoutCard"
                      checked={showNewCard || paymentMethods.length === 0}
                      onChange={() => setShowNewCard(true)}
                      className="w-4 h-4 accent-[#1B3B2B]"
                    />
                    <span>Use a new credit or debit card</span>
                  </label>
                </div>

                {(showNewCard || paymentMethods.length === 0) && (
                  <div className="p-4 rounded-lg bg-[#F6F1E9] border border-[#D8CCB8] space-y-3">
                    <div>
                      <label htmlFor="chk-card-name" className="block text-xs font-semibold mb-1">
                        Cardholder Name
                      </label>
                      <input
                        id="chk-card-name"
                        type="text"
                        value={cardholderName}
                        onChange={(e) => setCardholderName(e.target.value)}
                        placeholder="Maya Lin"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm"
                      />
                      {cardErrors.cardholderName && (
                        <p className="text-xs text-[#9E2A2B] mt-1">{cardErrors.cardholderName}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="chk-card-num" className="block text-xs font-semibold mb-1">
                        Card Number
                      </label>
                      <input
                        id="chk-card-num"
                        type="text"
                        inputMode="numeric"
                        value={cardNumber}
                        onChange={(e) => {
                          const d = e.target.value.replace(/\D/g, '').slice(0, 16);
                          setCardNumber(d.replace(/(\d{4})(?=\d)/g, '$1 '));
                        }}
                        placeholder="4242 4242 4242 4242"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums"
                      />
                      {cardErrors.cardNumber && (
                        <p className="text-xs text-[#9E2A2B] mt-1">{cardErrors.cardNumber}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label htmlFor="chk-mm" className="block text-xs font-semibold mb-1">
                          MM
                        </label>
                        <input
                          id="chk-mm"
                          type="text"
                          maxLength={2}
                          value={expMonth}
                          onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, ''))}
                          placeholder="08"
                          className="w-full min-h-[40px] px-2.5 py-1.5 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label htmlFor="chk-yy" className="block text-xs font-semibold mb-1">
                          YYYY
                        </label>
                        <input
                          id="chk-yy"
                          type="text"
                          maxLength={4}
                          value={expYear}
                          onChange={(e) => setExpYear(e.target.value.replace(/\D/g, ''))}
                          placeholder="2028"
                          className="w-full min-h-[40px] px-2.5 py-1.5 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label htmlFor="chk-cvc" className="block text-xs font-semibold mb-1">
                          CVC
                        </label>
                        <input
                          id="chk-cvc"
                          type="text"
                          maxLength={4}
                          value={cvc}
                          onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                          placeholder="482"
                          className="w-full min-h-[40px] px-2.5 py-1.5 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label htmlFor="chk-bzip" className="block text-xs font-semibold mb-1">
                          ZIP
                        </label>
                        <input
                          id="chk-bzip"
                          type="text"
                          value={billingZip}
                          onChange={(e) => setBillingZip(e.target.value)}
                          placeholder="97205"
                          className="w-full min-h-[40px] px-2.5 py-1.5 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums"
                        />
                      </div>
                    </div>
                    {(cardErrors.expiry || cardErrors.cvc || cardErrors.billingZip) && (
                      <p className="text-xs text-[#9E2A2B]">
                        {cardErrors.expiry || cardErrors.cvc || cardErrors.billingZip}
                      </p>
                    )}
                  </div>
                )}
              </fieldset>
            </form>
          )}
        </div>

        {/* Drawer Footer Totals & Actions */}
        {step !== 'confirmed' && step !== 'auth' && items.length > 0 && (
          <div className="px-6 py-5 border-t border-[#D8CCB8] bg-[#F6F1E9] space-y-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[#4B5548]">
                <dt>Subtotal</dt>
                <dd className="font-mono tabular-nums">{formatCurrency(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-[#4B5548]">
                <dt>Shipping</dt>
                <dd className="font-mono tabular-nums">
                  {totals.shippingFee === 0 ? 'Free' : formatCurrency(totals.shippingFee)}
                </dd>
              </div>
              <div className="pt-2 border-t border-[#D8CCB8] flex justify-between items-baseline font-semibold text-[#1C1915]">
                <dt>Total</dt>
                <dd className="font-mono tabular-nums text-lg">{formatCurrency(totals.total)}</dd>
              </div>
            </dl>

            {step === 'bag' ? (
              <button
                type="button"
                onClick={handleProceedToCheckout}
                className="w-full min-h-[48px] px-4 py-3 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold hover:bg-[#142C20] transition-colors cursor-pointer"
              >
                {isAuthenticated ? 'Proceed to Checkout' : 'Sign In / Register to Checkout'}
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep('bag')}
                  className="min-h-[48px] px-4 py-3 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-medium text-[#1C1915] hover:bg-[#EBE2D3] cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={isSubmitting}
                  className="flex-1 min-h-[48px] px-4 py-3 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#142C20] disabled:opacity-60 cursor-pointer"
                >
                  <Lock className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {isSubmitting
                      ? 'Processing...'
                      : `Complete Order · ${formatCurrency(totals.total)}`}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ShoppingCart;
