import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, PackageCheck, RotateCcw, Search, Star, Truck, XCircle } from 'lucide-react';
import { formatCurrency, formatReadableDate } from '../../utils/commerce.js';

const STEPS = [
  { key: 'placed', label: 'Order Placed' },
  { key: 'packed', label: 'Harvest Packed' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
];

function getStepIndex(status) {
  return STEPS.findIndex((s) => s.key === status);
}

function getStatusText(status) {
  switch (status) {
    case 'placed':
      return 'Order Placed';
    case 'packed':
      return 'Harvest Packed';
    case 'in_transit':
      return 'In Transit';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Order Placed';
  }
}

export const OrdersTab = ({ orders, onReorderOrder, onReviewProduct }) => {
  const [filterStatus, setFilterStatus] = useState('all');
  const [query, setQuery] = useState('');
  const liveOrders = useMemo(() => orders.filter((o) => o.isLive !== false), [orders]);
  const [expandedOrderId, setExpandedOrderId] = useState(liveOrders[0]?.id ?? null);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return liveOrders.filter((order) => {
      if (filterStatus !== 'all' && order.status !== filterStatus) return false;
      if (q) {
        const hay = `${order.orderNumber} ${order.trackingNumber} ${order.items
          .map((i) => i.productName)
          .join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [liveOrders, filterStatus, query]);

  return (
    <div className="space-y-6">
      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div role="group" aria-label="Filter order history" className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'placed', label: 'Placed' },
            { id: 'packed', label: 'Packed' },
            { id: 'in_transit', label: 'In Transit' },
            { id: 'delivered', label: 'Delivered' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filterStatus === tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-[#1B3B2B] text-[#FCFAF6]'
                  : 'bg-[#F6F1E9] text-[#1C1915] border border-[#D8CCB8] hover:bg-[#EBE2D3]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="w-full md:w-72 relative">
          <label htmlFor="order-search" className="sr-only">
            Search orders by order number, tracking ID, or nut variety
          </label>
          <Search
            className="w-4 h-4 text-[#4B5548] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="order-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Order # or product name..."
            className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
          />
        </div>
      </div>

      {/* Order Cards */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-10 text-center">
          <p className="font-display text-xl font-semibold text-[#1C1915]">No matching orders</p>
          <p className="text-sm text-[#4B5548] mt-1">
            Adjust your filter or place an order from the harvest storefront.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const currentStep = getStepIndex(order.status);

            return (
              <article
                key={order.id}
                className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] overflow-hidden"
              >
                {/* Order Summary Row */}
                <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
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
                        className={`inline-flex items-center gap-1 font-semibold ${
                          order.status === 'cancelled' ? 'text-[#9E2A2B]' : 'text-[#1B3B2B]'
                        }`}
                      >
                        {order.status === 'delivered' ? (
                          <PackageCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : order.status === 'cancelled' ? (
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{getStatusText(order.status)}</span>
                      </span>
                    </div>

                    <p className="font-display text-lg font-semibold text-[#1C1915]">
                      {order.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
                    </p>
                    <p className="text-xs text-[#4B5548]">
                      Tracking:{' '}
                      <span className="font-mono tabular-nums text-[#1C1915]">
                        {order.trackingNumber}
                      </span>{' '}
                      · Est. delivery {formatReadableDate(order.estimatedDelivery)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span className="font-mono tabular-nums text-lg font-semibold text-[#1C1915]">
                      {formatCurrency(order.total)}
                    </span>

                    <button
                      type="button"
                      onClick={() => onReorderOrder(order)}
                      className="min-h-[40px] px-3.5 py-2 rounded-md border border-[#1B3B2B]/30 bg-[#F6F1E9] text-xs font-semibold text-[#1B3B2B] inline-flex items-center gap-1.5 hover:bg-[#E6EDE8] cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Reorder</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Hide' : 'Show'} tracking details for order ${order.orderNumber}`}
                      className="min-h-[40px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-xs font-medium text-[#1C1915] inline-flex items-center gap-1 hover:bg-[#EBE2D3] cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide' : 'Track'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Tracking Timeline & Itemized Receipt */}
                {isExpanded && (
                  <div className="px-5 sm:px-6 pb-6 pt-4 border-t border-[#EBE2D3] bg-[#F6F1E9]/50 space-y-6">
                    {/* 4-Stage Tracking Stepper */}
                    {order.status === 'cancelled' ? (
                      <p className="text-sm font-medium text-[#9E2A2B]">
                        This order has been cancelled by orchard fulfillment.
                      </p>
                    ) : (
                      <div>
                        <p className="text-xs font-semibold text-[#1C1915] mb-3">
                          Shipment Progress
                        </p>
                        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {STEPS.map((step, index) => {
                            const completed = index <= currentStep;
                            return (
                              <li
                                key={step.key}
                                className={`p-3 rounded-lg border ${
                                  completed
                                    ? 'border-[#1B3B2B] bg-[#E6EDE8] text-[#1B3B2B]'
                                    : 'border-[#D8CCB8] bg-[#FCFAF6] text-[#4B5548]'
                                }`}
                              >
                                <span className="block font-mono tabular-nums text-[11px] font-semibold">
                                  0{index + 1} · {completed ? 'Completed' : 'Pending'}
                                </span>
                                <span className="block text-sm font-semibold mt-0.5">
                                  {step.label}
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    )}

                    {/* Itemized Receipt & Shipping Address */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2">
                        <p className="text-xs font-semibold text-[#1C1915] mb-2">
                          Itemized Receipt
                        </p>
                        <ul className="divide-y divide-[#D8CCB8] border-y border-[#D8CCB8] text-sm">
                          {order.items.map((item, idx) => (
                            <li key={`${item.productId}-${idx}`} className="py-2.5 flex items-center justify-between gap-4">
                              <div>
                                <span className="font-medium text-[#1C1915]">
                                  {item.quantity}× {item.productName}
                                </span>
                                <span className="block text-xs text-[#4B5548]">
                                  {item.weightLabel}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {onReviewProduct && (
                                  <button
                                    type="button"
                                    onClick={() => onReviewProduct(item.productId)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B3B2B] hover:underline cursor-pointer"
                                  >
                                    <Star className="w-3.5 h-3.5 fill-[#7A3E1C] text-[#7A3E1C]" aria-hidden="true" />
                                    <span>Review</span>
                                  </button>
                                )}
                                <span className="font-mono tabular-nums font-semibold text-[#1C1915]">
                                  {formatCurrency(item.unitPrice * item.quantity)}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="text-xs space-y-2 text-[#4B5548]">
                        <p className="font-semibold text-[#1C1915]">Delivery &amp; Payment</p>
                        <p>{order.shippingAddress.fullName}</p>
                        <p>
                          {order.shippingAddress.street}, {order.shippingAddress.city},{' '}
                          {order.shippingAddress.state} {order.shippingAddress.postalCode}
                        </p>
                        <p className="pt-2">Paid via {order.paymentSummary}</p>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
