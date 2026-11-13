import React from 'react';
import {
  ArrowLeft,
  CreditCard,
  LayoutDashboard,
  MapPin,
  Package,
  PackageCheck,
  RotateCcw,
  SlidersHorizontal,
  Truck,
  User,
} from 'lucide-react';
import { formatCurrency, formatReadableDate } from '../utils/commerce.js';
import { BillingTab } from './dashboard/BillingTab.jsx';
import { OrdersTab } from './dashboard/OrdersTab.jsx';
import { PreferencesTab } from './dashboard/PreferencesTab.jsx';

const ROAST_LABELS = {
  raw_sprouted: 'Raw & Sprouted',
  dry_roasted_unsalted: 'Dry-Roasted Unsalted',
  lightly_salted: 'Lightly Sea Salted',
};

const GOAL_LABELS = {
  omega3: 'Plant Omega-3 ALA',
  high_protein: 'High Plant Protein',
  keto: 'Low-Carb / Keto',
  heart_healthy: 'Heart-Healthy Fats',
};

const TABS = [
  { id: 'overview', label: 'Account Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Order History', icon: Package },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'billing', label: 'Payment Cards', icon: CreditCard },
];

function getOrderStatusLabel(status) {
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

export const Dashboard = ({
  state,
  activeTab = 'overview',
  onChangeTab,
  onNavigateShop,
  onUpdatePreferences,
  onAddPaymentMethod,
  onSetDefaultCard,
  onRemoveCard,
  onReorderOrder,
  onReviewProduct,
}) => {
  const { preferences, paymentMethods, invoices, orders, user } = state;
  const displayName = preferences.shippingAddress.fullName || user?.fullName || 'Orchard Member';
  const liveOrders = orders.filter((o) => o.isLive !== false);
  const recentOrders = liveOrders.slice(0, 4);
  const activeShipments = liveOrders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  ).length;
  const totalSpent = liveOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);
  const defaultCard = paymentMethods.find((pm) => pm.isDefault) || paymentMethods[0];

  return (
    <section
      aria-labelledby="account-dashboard-heading"
      className="py-10 sm:py-12 bg-[#F6F1E9] min-h-[75vh]"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
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
              id="account-dashboard-heading"
              className="font-display text-3xl sm:text-4xl font-semibold text-[#1C1915]"
            >
              Account &amp; Order Dashboard
            </h1>
            <p className="text-sm text-[#4B5548] mt-1">
              Review your account profile, shipping details, saved payment cards, and live order tracking.
            </p>
          </div>
        </div>

        {/* 4-Column Account Summary Strip */}
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 py-6 border-b border-[#D8CCB8]">
          <div className="p-4 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6]">
            <dt className="text-xs text-[#4B5548]">Account Holder</dt>
            <dd className="mt-1 font-display text-base sm:text-lg font-semibold text-[#1C1915]">
              {displayName}
              <span className="block font-sans text-xs font-normal text-[#4B5548]">
                {preferences.shippingAddress.city
                  ? `${preferences.shippingAddress.city}, ${preferences.shippingAddress.state}`
                  : user?.email || 'No address saved'}
              </span>
            </dd>
          </div>

          <div className="p-4 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6]">
            <dt className="text-xs text-[#4B5548]">Active Shipments</dt>
            <dd className="mt-1 font-mono tabular-nums text-base sm:text-lg font-semibold text-[#1B3B2B]">
              {activeShipments}
              <span className="block font-sans text-xs font-normal text-[#4B5548]">
                In fulfillment or transit
              </span>
            </dd>
          </div>

          <div className="p-4 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6]">
            <dt className="text-xs text-[#4B5548]">Total Orders</dt>
            <dd className="mt-1 font-mono tabular-nums text-base sm:text-lg font-semibold text-[#1C1915]">
              {liveOrders.length}
              <span className="block font-sans text-xs font-normal text-[#4B5548]">
                {formatCurrency(totalSpent)} spent
              </span>
            </dd>
          </div>

          <div className="p-4 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6]">
            <dt className="text-xs text-[#4B5548]">Default Payment Card</dt>
            <dd className="mt-1 text-sm font-semibold text-[#1C1915]">
              {defaultCard
                ? `${defaultCard.brand} •••• ${defaultCard.last4}`
                : 'No card saved'}
              <span className="block text-xs font-normal text-[#4B5548]">
                {defaultCard ? `Expires ${defaultCard.expMonth}/${defaultCard.expYear}` : 'Add a card below'}
              </span>
            </dd>
          </div>
        </dl>

        {/* Accessible Tabs */}
        <div
          role="tablist"
          aria-label="Account sections"
          className="grid grid-cols-2 sm:flex sm:items-center gap-2 py-6"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                id={`acc-tab-${tab.id}`}
                aria-selected={isSelected}
                aria-controls={`acc-panel-${tab.id}`}
                type="button"
                onClick={() => onChangeTab(tab.id)}
                className={`min-h-[44px] px-3 sm:px-4 py-2.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center justify-center sm:justify-start gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#1B3B2B] text-[#FCFAF6]'
                    : 'bg-[#FCFAF6] text-[#1C1915] border border-[#D8CCB8] hover:bg-[#EBE2D3]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Panel */}
        <div
          role="tabpanel"
          id={`acc-panel-${activeTab}`}
          aria-labelledby={`acc-tab-${activeTab}`}
        >
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Order History Summary */}
              <section
                aria-labelledby="dash-orders-summary-heading"
                className="lg:col-span-2 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#EBE2D3]">
                  <div>
                    <h2
                      id="dash-orders-summary-heading"
                      className="font-display text-2xl font-semibold text-[#1C1915]"
                    >
                      Order History Summary
                    </h2>
                    <p className="text-sm text-[#4B5548] mt-0.5">
                      Live shipment progress and quick reorder for your recent purchases.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onChangeTab('orders')}
                    className="min-h-[40px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-xs sm:text-sm font-semibold text-[#1C1915] hover:bg-[#EBE2D3] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    View Full History ({liveOrders.length})
                  </button>
                </div>

                {recentOrders.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="font-display text-lg font-semibold text-[#1C1915]">
                      No live orders yet
                    </p>
                    <p className="text-sm text-[#4B5548] mt-1 mb-4">
                      Place an order from the harvest storefront to track delivery progress here.
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigateShop('catalog-section')}
                      className="min-h-[42px] px-4 py-2 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold cursor-pointer"
                    >
                      Explore Orchard Catalog
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-[#EBE2D3]">
                    {recentOrders.map((order) => (
                      <li
                        key={order.id}
                        className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
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
                            <span className="inline-flex items-center gap-1 font-semibold text-[#1B3B2B]">
                              {order.status === 'delivered' ? (
                                <PackageCheck className="w-3.5 h-3.5" aria-hidden="true" />
                              ) : (
                                <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                              <span>{getOrderStatusLabel(order.status)}</span>
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-[#1C1915] truncate">
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
                          <span className="font-mono tabular-nums text-base font-semibold text-[#1C1915]">
                            {formatCurrency(order.total)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onReorderOrder(order)}
                            aria-label={`Reorder items from order ${order.orderNumber}`}
                            className="min-h-[40px] px-3 py-1.5 rounded-md border border-[#1B3B2B]/30 bg-[#F6F1E9] text-xs font-semibold text-[#1B3B2B] inline-flex items-center gap-1.5 hover:bg-[#E6EDE8] whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Reorder</span>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Account Summary Card */}
              <aside
                aria-labelledby="dash-account-card-heading"
                className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 h-fit"
              >
                <div className="flex items-center gap-3 pb-5 border-b border-[#EBE2D3]">
                  <div className="w-11 h-11 rounded-lg bg-[#E6EDE8] text-[#1B3B2B] flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2
                      id="dash-account-card-heading"
                      className="font-display text-xl font-semibold text-[#1C1915]"
                    >
                      {displayName}
                    </h2>
                    <p className="text-xs text-[#4B5548]">
                      {user?.email || 'Verified Orchard Account'}
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-[#EBE2D3]">
                  <div className="py-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-[#1C1915] flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#1B3B2B]" aria-hidden="true" />
                        <span>Shipping &amp; Contact</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => onChangeTab('preferences')}
                        className="text-xs font-semibold text-[#1B3B2B] hover:underline cursor-pointer"
                      >
                        Edit
                      </button>
                    </div>
                    {preferences.shippingAddress.street ? (
                      <>
                        <p className="text-sm text-[#1C1915]">
                          {preferences.shippingAddress.street}
                          <br />
                          {preferences.shippingAddress.city}, {preferences.shippingAddress.state}{' '}
                          <span className="font-mono tabular-nums">
                            {preferences.shippingAddress.postalCode}
                          </span>
                        </p>
                        {preferences.shippingAddress.phone && (
                          <p className="text-xs font-mono tabular-nums text-[#4B5548]">
                            {preferences.shippingAddress.phone}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-[#4B5548]">
                        No delivery address saved yet. Add one in Preferences or at checkout.
                      </p>
                    )}
                  </div>

                  <div className="py-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-[#1C1915] flex items-center gap-1.5">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-[#1B3B2B]" aria-hidden="true" />
                        <span>Taste &amp; Dietary Profile</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => onChangeTab('preferences')}
                        className="text-xs font-semibold text-[#1B3B2B] hover:underline cursor-pointer"
                      >
                        Update
                      </button>
                    </div>
                    <p className="text-sm text-[#1C1915]">
                      Roast:{' '}
                      <span className="font-medium">
                        {ROAST_LABELS[preferences.preferredRoast] || 'Raw & Sprouted'}
                      </span>
                    </p>
                    <p className="text-xs text-[#4B5548]">
                      Goals:{' '}
                      {preferences.dietaryGoals.length > 0
                        ? preferences.dietaryGoals.map((g) => GOAL_LABELS[g] || g).join(' · ')
                        : 'None selected'}
                    </p>
                  </div>

                  <div className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-[#1C1915] flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-[#1B3B2B]" aria-hidden="true" />
                        <span>Saved Payment Card</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => onChangeTab('billing')}
                        className="text-xs font-semibold text-[#1B3B2B] hover:underline cursor-pointer"
                      >
                        Manage
                      </button>
                    </div>
                    {defaultCard ? (
                      <p className="text-sm font-medium text-[#1C1915]">
                        {defaultCard.brand} ••••{' '}
                        <span className="font-mono tabular-nums">{defaultCard.last4}</span> · Exp{' '}
                        <span className="font-mono tabular-nums">
                          {defaultCard.expMonth}/{defaultCard.expYear}
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm text-[#4B5548]">No card saved.</p>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          )}

          {activeTab === 'orders' && (
            <OrdersTab
              orders={orders}
              onReorderOrder={onReorderOrder}
              onReviewProduct={onReviewProduct}
            />
          )}

          {activeTab === 'preferences' && (
            <PreferencesTab
              preferences={preferences}
              onUpdatePreferences={onUpdatePreferences}
            />
          )}

          {activeTab === 'billing' && (
            <BillingTab
              paymentMethods={paymentMethods}
              invoices={invoices}
              onAddPaymentMethod={onAddPaymentMethod}
              onSetDefaultCard={onSetDefaultCard}
              onRemoveCard={onRemoveCard}
            />
          )}
        </div>
      </div>
    </section>
  );
};

export default Dashboard;
