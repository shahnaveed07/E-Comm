import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Edit3,
  Package,
  Plus,
  Radio,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE, WEIGHT_OPTIONS } from '../data/catalog.js';
import {
  calculateAdminOrderMetrics,
  calculateUnitPrice,
  filterAdminOrders,
  formatCurrency,
  formatReadableDate,
  roundCurrency,
} from '../utils/commerce.js';

const STATUS_OPTIONS = [
  { id: 'placed', label: 'Order Placed' },
  { id: 'packed', label: 'Harvest Packed' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

const NEXT_STAGE_MAP = {
  placed: 'packed',
  packed: 'in_transit',
  in_transit: 'delivered',
};

function getStatusLabel(status) {
  return STATUS_OPTIONS.find((s) => s.id === status)?.label || 'Order Placed';
}

export const AdminDashboard = ({
  state,
  onNavigateShop,
  onCreateAdminOrder,
  onUpdateAdminOrder,
  onDeleteAdminOrder,
}) => {
  const { catalog, orders } = state;

  const [showComposer, setShowComposer] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [liveFilter, setLiveFilter] = useState('all');
  const [query, setQuery] = useState('');

  // Live Order Composer State
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('OR');
  const [postalCode, setPostalCode] = useState('');
  const [paymentSummary, setPaymentSummary] = useState('Direct Orchard Invoice');
  const [initialStatus, setInitialStatus] = useState('placed');
  const [estimatedDelivery, setEstimatedDelivery] = useState(() =>
    new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [orderNotes, setOrderNotes] = useState('');

  const [selectedProductId, setSelectedProductId] = useState(catalog[0]?.id || '');
  const [selectedWeight, setSelectedWeight] = useState('16oz');
  const [selectedQty, setSelectedQty] = useState(1);
  const [draftItems, setDraftItems] = useState(() =>
    catalog[0] ? [{ productId: catalog[0].id, weightSize: '16oz', quantity: 1 }] : []
  );
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline Tracking / Delivery Edit State
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editTracking, setEditTracking] = useState('');
  const [editDeliveryDate, setEditDeliveryDate] = useState('');

  const metrics = useMemo(() => calculateAdminOrderMetrics(orders), [orders]);
  const filteredOrders = useMemo(
    () => filterAdminOrders(orders, statusFilter, liveFilter, query),
    [orders, statusFilter, liveFilter, query]
  );

  const draftTotals = useMemo(() => {
    let subtotal = 0;
    for (const item of draftItems) {
      const product = catalog.find((p) => p.id === item.productId);
      if (!product) continue;
      subtotal += calculateUnitPrice(product.basePrice16oz, item.weightSize) * item.quantity;
    }
    subtotal = roundCurrency(subtotal);
    const shipping =
      draftItems.length === 0 ? 0 : subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
    return {
      subtotal,
      shipping,
      total: roundCurrency(subtotal + shipping),
    };
  }, [draftItems, catalog]);

  const handleAddDraftItem = () => {
    if (!selectedProductId || selectedQty < 1) return;
    setDraftItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.productId === selectedProductId && i.weightSize === selectedWeight
      );
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx ? { ...item, quantity: item.quantity + Number(selectedQty) } : item
        );
      }
      return [
        ...prev,
        { productId: selectedProductId, weightSize: selectedWeight, quantity: Number(selectedQty) },
      ];
    });
  };

  const handleRemoveDraftItem = (productId, weightSize) => {
    setDraftItems((prev) =>
      prev.filter((i) => !(i.productId === productId && i.weightSize === weightSize))
    );
  };

  const submitAdminOrder = async (publishLive) => {
    setFormError(null);
    if (!customerName.trim() || !street.trim() || !city.trim() || !postalCode.trim()) {
      setFormError('Please enter customer name, street address, city, and postal code.');
      return;
    }
    if (draftItems.length === 0) {
      setFormError('Add at least one harvest item before publishing the order.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateAdminOrder({
        items: draftItems,
        customerEmail: customerEmail.trim(),
        shippingAddress: {
          fullName: customerName.trim(),
          phone: customerPhone.trim(),
          street: street.trim(),
          city: city.trim(),
          state: stateCode.trim() || 'OR',
          postalCode: postalCode.trim(),
        },
        paymentSummary: paymentSummary.trim(),
        status: initialStatus,
        isLive: publishLive,
        estimatedDelivery,
        notes: orderNotes.trim(),
      });
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setStreet('');
      setCity('');
      setPostalCode('');
      setOrderNotes('');
      setDraftItems(
        catalog[0] ? [{ productId: catalog[0].id, weightSize: '16oz', quantity: 1 }] : []
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditingOrder = (order) => {
    setEditingOrderId(order.id);
    setEditTracking(order.trackingNumber || '');
    setEditDeliveryDate((order.estimatedDelivery || '').slice(0, 10));
  };

  const saveOrderEdit = async (orderId) => {
    await onUpdateAdminOrder(
      orderId,
      {
        trackingNumber: editTracking,
        estimatedDelivery: editDeliveryDate,
      },
      'Updated shipment tracking and estimated delivery.'
    );
    setEditingOrderId(null);
  };

  return (
    <section
      aria-labelledby="admin-dashboard-heading"
      className="py-10 sm:py-12 bg-[#F6F1E9] min-h-[75vh]"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Top Admin Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#D8CCB8]">
          <div>
            <button
              type="button"
              onClick={() => onNavigateShop()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1B3B2B] hover:underline mb-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Back to Orchard Storefront</span>
            </button>
            <h1
              id="admin-dashboard-heading"
              className="font-display text-3xl sm:text-4xl font-semibold text-[#1C1915]"
            >
              Admin Order Console
            </h1>
            <p className="text-sm text-[#4B5548] mt-1">
              Publish new orders live into fulfillment, update tracking stages in real time, and manage storefront orders.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowComposer((prev) => !prev)}
            aria-expanded={showComposer}
            className="min-h-[44px] px-4 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#142C20] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>{showComposer ? 'Hide Order Publisher' : 'Put New Order Live'}</span>
          </button>
        </div>

        {/* 4-Column Live Fulfillment Metrics */}
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6]">
            <dt className="text-xs text-[#4B5548]">Live Orders</dt>
            <dd className="mt-1 font-mono tabular-nums text-xl font-semibold text-[#1B3B2B]">
              {metrics.liveCount}
              <span className="block font-sans text-xs font-normal text-[#4B5548]">
                {metrics.draftCount} {metrics.draftCount === 1 ? 'draft' : 'drafts'} waiting
              </span>
            </dd>
          </div>

          <div className="p-4 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6]">
            <dt className="text-xs text-[#4B5548]">Awaiting Packing</dt>
            <dd className="mt-1 font-mono tabular-nums text-xl font-semibold text-[#1C1915]">
              {metrics.awaitingPacking}
              <span className="block font-sans text-xs font-normal text-[#4B5548]">
                Newly placed queue
              </span>
            </dd>
          </div>

          <div className="p-4 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6]">
            <dt className="text-xs text-[#4B5548]">In Transit</dt>
            <dd className="mt-1 font-mono tabular-nums text-xl font-semibold text-[#1C1915]">
              {metrics.inTransit}
              <span className="block font-sans text-xs font-normal text-[#4B5548]">
                {metrics.delivered} delivered
              </span>
            </dd>
          </div>

          <div className="p-4 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6]">
            <dt className="text-xs text-[#4B5548]">Active Gross Revenue</dt>
            <dd className="mt-1 font-mono tabular-nums text-xl font-semibold text-[#1C1915]">
              {formatCurrency(metrics.revenue)}
              <span className="block font-sans text-xs font-normal text-[#4B5548]">
                Excludes cancelled orders
              </span>
            </dd>
          </div>
        </dl>

        {/* Put New Order Live Composer */}
        {showComposer && (
          <section
            aria-labelledby="admin-composer-heading"
            className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#EBE2D3]">
              <div>
                <h2
                  id="admin-composer-heading"
                  className="font-display text-2xl font-semibold text-[#1C1915]"
                >
                  Put Order Live
                </h2>
                <p className="text-sm text-[#4B5548] mt-0.5">
                  Create a direct phone, wholesale, or concierge harvest order and publish it live to fulfillment and customer tracking.
                </p>
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                className="p-3.5 rounded-md bg-[#9E2A2B]/10 border border-[#9E2A2B]/30 text-xs font-medium text-[#9E2A2B]"
              >
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Customer & Shipping Fields */}
              <div className="lg:col-span-6 space-y-4">
                <h3 className="text-sm font-semibold text-[#1C1915]">1. Customer &amp; Destination</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="adm-cust-name" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      Customer Name
                    </label>
                    <input
                      id="adm-cust-name"
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Elena Rostova"
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                    />
                  </div>
                  <div>
                    <label htmlFor="adm-cust-email" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      Account Email (Optional)
                    </label>
                    <input
                      id="adm-cust-email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                    />
                  </div>
                  <div>
                    <label htmlFor="adm-cust-phone" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      Phone Number
                    </label>
                    <input
                      id="adm-cust-phone"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(503) 555-0192"
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="adm-street" className="block text-xs font-semibold text-[#1C1915] mb-1">
                    Street Address
                  </label>
                  <input
                    id="adm-street"
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="742 Evergreen Terrace"
                    className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label htmlFor="adm-city" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      City
                    </label>
                    <input
                      id="adm-city"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Portland"
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                    />
                  </div>
                  <div>
                    <label htmlFor="adm-state" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      State
                    </label>
                    <input
                      id="adm-state"
                      type="text"
                      value={stateCode}
                      onChange={(e) => setStateCode(e.target.value)}
                      placeholder="OR"
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                    />
                  </div>
                  <div>
                    <label htmlFor="adm-zip" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      Postal Code
                    </label>
                    <input
                      id="adm-zip"
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="97205"
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm font-mono tabular-nums text-[#1C1915]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label htmlFor="adm-payment" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      Payment Method
                    </label>
                    <select
                      id="adm-payment"
                      value={paymentSummary}
                      onChange={(e) => setPaymentSummary(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                    >
                      <option value="Direct Orchard Invoice">Direct Orchard Invoice</option>
                      <option value="Visa •••• 4242">Visa •••• 4242</option>
                      <option value="Cash on Delivery">Cash on Delivery</option>
                      <option value="Wholesale Net-30">Wholesale Net-30</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="adm-status" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      Initial Stage
                    </label>
                    <select
                      id="adm-status"
                      value={initialStatus}
                      onChange={(e) => setInitialStatus(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                    >
                      {STATUS_OPTIONS.filter((s) => s.id !== 'cancelled').map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="adm-est-date" className="block text-xs font-semibold text-[#1C1915] mb-1">
                      Est. Delivery
                    </label>
                    <input
                      id="adm-est-date"
                      type="date"
                      value={estimatedDelivery}
                      onChange={(e) => setEstimatedDelivery(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm font-mono tabular-nums text-[#1C1915]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="adm-notes" className="block text-xs font-semibold text-[#1C1915] mb-1">
                    Fulfillment Note (Optional)
                  </label>
                  <input
                    id="adm-notes"
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="e.g., Cold pack priority dispatch"
                    className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                  />
                </div>
              </div>

              {/* Line Items & Publish Controls */}
              <div className="lg:col-span-6 flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#1C1915]">2. Harvest Line Items</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-6">
                      <label htmlFor="adm-prod-select" className="sr-only">
                        Select product
                      </label>
                      <select
                        id="adm-prod-select"
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                      >
                        {catalog.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor="adm-weight-select" className="sr-only">
                        Select weight
                      </label>
                      <select
                        id="adm-weight-select"
                        value={selectedWeight}
                        onChange={(e) => setSelectedWeight(e.target.value)}
                        className="w-full min-h-[42px] px-2.5 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                      >
                        {['8oz', '16oz', '32oz'].map((size) => (
                          <option key={size} value={size}>
                            {WEIGHT_OPTIONS[size].size.replace('oz', ' oz')}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3 flex gap-2">
                      <label htmlFor="adm-qty-input" className="sr-only">
                        Quantity
                      </label>
                      <input
                        id="adm-qty-input"
                        type="number"
                        min={1}
                        max={99}
                        value={selectedQty}
                        onChange={(e) => setSelectedQty(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 min-h-[42px] px-2.5 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm font-mono tabular-nums text-center text-[#1C1915]"
                      />
                      <button
                        type="button"
                        onClick={handleAddDraftItem}
                        className="flex-1 min-h-[42px] px-3 py-2 rounded-md border border-[#1B3B2B] bg-[#FCFAF6] text-xs font-semibold text-[#1B3B2B] hover:bg-[#E6EDE8] whitespace-nowrap cursor-pointer"
                      >
                        + Add
                      </button>
                    </div>
                  </div>

                  {draftItems.length === 0 ? (
                    <p className="py-6 text-center text-sm text-[#4B5548] border-y border-[#EBE2D3]">
                      No items added yet. Select a nut variety above to build this order.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[#EBE2D3] border-y border-[#EBE2D3] text-sm">
                      {draftItems.map((item) => {
                        const product = catalog.find((p) => p.id === item.productId);
                        if (!product) return null;
                        const unitPrice = calculateUnitPrice(product.basePrice16oz, item.weightSize);
                        return (
                          <li
                            key={`${item.productId}-${item.weightSize}`}
                            className="py-2.5 flex items-center justify-between gap-3"
                          >
                            <div>
                              <span className="font-medium text-[#1C1915]">
                                <strong className="font-mono tabular-nums">{item.quantity}×</strong>{' '}
                                {product.name}
                              </span>
                              <span className="block text-xs text-[#4B5548]">
                                {WEIGHT_OPTIONS[item.weightSize].label} · {formatCurrency(unitPrice)} each
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="font-mono tabular-nums font-semibold text-[#1C1915]">
                                {formatCurrency(unitPrice * item.quantity)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveDraftItem(item.productId, item.weightSize)
                                }
                                aria-label={`Remove ${product.name} from draft order`}
                                className="w-8 h-8 rounded text-[#7A3E1C] hover:bg-[#EBE2D3] flex items-center justify-center cursor-pointer"
                              >
                                <X className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Totals + Publish Actions */}
                <div className="pt-4 border-t border-[#D8CCB8] space-y-4">
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between text-[#4B5548]">
                      <dt>Subtotal</dt>
                      <dd className="font-mono tabular-nums">{formatCurrency(draftTotals.subtotal)}</dd>
                    </div>
                    <div className="flex justify-between text-[#4B5548]">
                      <dt>Shipping</dt>
                      <dd className="font-mono tabular-nums">
                        {draftTotals.shipping === 0 ? 'Free' : formatCurrency(draftTotals.shipping)}
                      </dd>
                    </div>
                    <div className="flex justify-between font-semibold text-[#1C1915] text-base pt-1">
                      <dt>Order Total</dt>
                      <dd className="font-mono tabular-nums">{formatCurrency(draftTotals.total)}</dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => submitAdminOrder(true)}
                      className="flex-1 min-h-[44px] px-4 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#142C20] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                    >
                      <Radio className="w-4 h-4" aria-hidden="true" />
                      <span>{isSubmitting ? 'Publishing...' : 'Put Order Live'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => submitAdminOrder(false)}
                      className="min-h-[44px] px-4 py-2.5 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm font-medium text-[#1C1915] hover:bg-[#EBE2D3] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                    >
                      Save as Draft
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Manage Live & Draft Orders */}
        <section
          aria-labelledby="admin-manage-heading"
          className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-5"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#EBE2D3]">
            <div>
              <h2
                id="admin-manage-heading"
                className="font-display text-2xl font-semibold text-[#1C1915]"
              >
                Manage Storefront &amp; Live Orders
              </h2>
              <p className="text-sm text-[#4B5548] mt-0.5">
                Publish draft orders live, advance fulfillment stages, update tracking numbers, or cancel orders.
              </p>
            </div>

            <div className="w-full lg:w-72 relative">
              <label htmlFor="admin-order-search" className="sr-only">
                Search admin orders by order number, customer, tracking ID, or product
              </label>
              <Search
                className="w-4 h-4 text-[#4B5548] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="admin-order-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Order #, customer, tracking..."
                className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
              />
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div role="group" aria-label="Filter by fulfillment status" className="flex flex-wrap gap-2">
              {[{ id: 'all', label: 'All Statuses' }, ...STATUS_OPTIONS].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={statusFilter === tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-[#1B3B2B] text-[#FCFAF6]'
                      : 'bg-[#F6F1E9] text-[#1C1915] border border-[#D8CCB8] hover:bg-[#EBE2D3]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div role="group" aria-label="Filter by live status" className="flex items-center gap-2 shrink-0">
              {[
                { id: 'all', label: 'All Visibility' },
                { id: 'live', label: 'Live Only' },
                { id: 'draft', label: 'Drafts' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={liveFilter === opt.id}
                  onClick={() => setLiveFilter(opt.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                    liveFilter === opt.id
                      ? 'bg-[#EBE2D3] text-[#1C1915] border border-[#1C1915] font-semibold'
                      : 'bg-[#F6F1E9] text-[#4B5548] border border-[#D8CCB8] hover:text-[#1C1915]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Orders List */}
          {filteredOrders.length === 0 ? (
            <div className="py-10 text-center border-t border-[#EBE2D3]">
              <p className="font-display text-lg font-semibold text-[#1C1915]">
                No orders match these filters
              </p>
              <p className="text-sm text-[#4B5548] mt-1">
                Put a new order live above or clear your active search filters.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EBE2D3] border-t border-[#EBE2D3]">
              {filteredOrders.map((order) => {
                const isLive = order.isLive !== false;
                const nextStage = NEXT_STAGE_MAP[order.status];
                const isEditing = editingOrderId === order.id;

                return (
                  <li key={order.id} className="py-5 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Order Metadata & Customer */}
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#4B5548]">
                          <span className="font-mono tabular-nums font-semibold text-[#1C1915]">
                            #{order.orderNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatReadableDate(order.placedAt)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-semibold ${
                              isLive ? 'text-[#1B3B2B]' : 'text-[#7A3E1C]'
                            }`}
                          >
                            {isLive ? 'Live' : 'Draft'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{order.source === 'admin' ? 'Admin Entry' : 'Storefront Checkout'}</span>
                        </div>

                        <p className="font-display text-lg font-semibold text-[#1C1915]">
                          {order.shippingAddress?.fullName} —{' '}
                          <span className="font-sans text-sm font-normal text-[#4B5548]">
                            {order.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
                          </span>
                        </p>

                        <p className="text-xs text-[#4B5548]">
                          {order.shippingAddress?.street}, {order.shippingAddress?.city},{' '}
                          {order.shippingAddress?.state} {order.shippingAddress?.postalCode} ·
                          Tracking:{' '}
                          <span className="font-mono tabular-nums text-[#1C1915]">
                            {order.trackingNumber}
                          </span>{' '}
                          · Est. {formatReadableDate(order.estimatedDelivery)}
                        </p>

                        {order.notes && (
                          <p className="text-xs text-[#7A3E1C]">Note: {order.notes}</p>
                        )}
                      </div>

                      {/* Admin Action Controls */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="font-mono tabular-nums text-base font-semibold text-[#1C1915] mr-2">
                          {formatCurrency(order.total)}
                        </span>

                        {!isLive ? (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateAdminOrder(
                                order.id,
                                { isLive: true },
                                `Order #${order.orderNumber} is now live.`
                              )
                            }
                            className="min-h-[40px] px-3.5 py-1.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#142C20] whitespace-nowrap cursor-pointer"
                          >
                            <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Put Live</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateAdminOrder(
                                order.id,
                                { isLive: false },
                                `Order #${order.orderNumber} moved to drafts.`
                              )
                            }
                            className="min-h-[40px] px-3 py-1.5 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-xs font-medium text-[#4B5548] hover:bg-[#EBE2D3] whitespace-nowrap cursor-pointer"
                          >
                            Move to Draft
                          </button>
                        )}

                        <label htmlFor={`status-${order.id}`} className="sr-only">
                          Status for order {order.orderNumber}
                        </label>
                        <select
                          id={`status-${order.id}`}
                          value={order.status}
                          onChange={(e) =>
                            onUpdateAdminOrder(
                              order.id,
                              { status: e.target.value },
                              `Order #${order.orderNumber} updated to ${getStatusLabel(e.target.value)}.`
                            )
                          }
                          className="min-h-[40px] px-3 py-1.5 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-xs font-medium text-[#1C1915]"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>

                        {nextStage && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateAdminOrder(
                                order.id,
                                { status: nextStage, isLive: true },
                                `Order #${order.orderNumber} advanced to ${getStatusLabel(nextStage)}.`
                              )
                            }
                            className="min-h-[40px] px-3 py-1.5 rounded-md border border-[#1B3B2B]/30 bg-[#E6EDE8] text-xs font-semibold text-[#1B3B2B] inline-flex items-center gap-1.5 hover:bg-[#D5E3D9] whitespace-nowrap cursor-pointer"
                          >
                            {nextStage === 'packed' ? (
                              <Package className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : nextStage === 'delivered' ? (
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>Advance</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            isEditing ? setEditingOrderId(null) : startEditingOrder(order)
                          }
                          aria-label={`Edit tracking details for order ${order.orderNumber}`}
                          className="min-h-[40px] px-3 py-1.5 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-xs font-medium text-[#1C1915] inline-flex items-center gap-1 hover:bg-[#EBE2D3] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isEditing ? 'Close' : 'Tracking'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteAdminOrder(order.id, order.orderNumber)}
                          aria-label={`Delete order ${order.orderNumber}`}
                          className="w-10 h-10 rounded-md text-[#7A3E1C] hover:bg-[#EBE2D3] flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Inline Tracking Editor */}
                    {isEditing && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveOrderEdit(order.id);
                        }}
                        className="p-4 rounded-lg bg-[#F6F1E9] border border-[#D8CCB8] flex flex-col sm:flex-row sm:items-end gap-3"
                      >
                        <div className="flex-1">
                          <label
                            htmlFor={`trk-${order.id}`}
                            className="block text-xs font-semibold text-[#1C1915] mb-1"
                          >
                            Tracking Number
                          </label>
                          <input
                            id={`trk-${order.id}`}
                            type="text"
                            value={editTracking}
                            onChange={(e) => setEditTracking(e.target.value)}
                            className="w-full min-h-[40px] px-3 py-1.5 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`est-${order.id}`}
                            className="block text-xs font-semibold text-[#1C1915] mb-1"
                          >
                            Estimated Delivery
                          </label>
                          <input
                            id={`est-${order.id}`}
                            type="date"
                            value={editDeliveryDate}
                            onChange={(e) => setEditDeliveryDate(e.target.value)}
                            className="w-full min-h-[40px] px-3 py-1.5 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono tabular-nums"
                          />
                        </div>
                        <button
                          type="submit"
                          className="min-h-[40px] px-4 py-1.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-xs font-semibold hover:bg-[#142C20] cursor-pointer"
                        >
                          Save Tracking
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
};

export default AdminDashboard;
