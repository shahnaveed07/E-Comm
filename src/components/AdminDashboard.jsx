import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  ImagePlus,
  Package,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Tag,
  Truck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE, WEIGHT_OPTIONS } from '../data/catalog.js';
import { apiFetch } from '../services/api.js';
import {
  calculateAdminOrderMetrics,
  calculateUnitPrice,
  filterAdminOrders,
  formatCurrency,
  formatReadableDate,
  roundCurrency,
} from '../utils/commerce.js';

const STATUS_OPTIONS = [
  { id: 'awaiting_payment', label: 'Awaiting Payment' },
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

const ADMIN_TABS = [
  { id: 'orders', label: 'Orders & Publisher', icon: Package },
  { id: 'payments', label: 'UPI & Payments Queue', icon: QrCode },
  { id: 'catalog', label: 'Catalog, Stock & Promos', icon: Boxes },
  { id: 'operations', label: 'Customers, Returns & Reports', icon: BarChart3 },
];

function getStatusLabel(status) {
  return STATUS_OPTIONS.find((s) => s.id === status)?.label || 'Order Placed';
}

function getPaymentBadge(status) {
  switch (String(status || '').toUpperCase()) {
    case 'CAPTURED':
      return { text: 'Captured / Verified', cls: 'bg-[#E6EDE8] text-[#1B3B2B] border-[#1B3B2B]/30' };
    case 'PENDING_MANUAL_VERIFICATION':
      return {
        text: 'Pending Verification',
        cls: 'bg-[#7A3E1C]/10 text-[#7A3E1C] border-[#7A3E1C]/30',
      };
    case 'REJECTED':
    case 'FAILED':
      return { text: status, cls: 'bg-[#9E2A2B]/10 text-[#9E2A2B] border-[#9E2A2B]/30' };
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      return { text: status, cls: 'bg-[#EBE2D3] text-[#4B5548] border-[#D8CCB8]' };
    case 'PENDING':
      return { text: 'Pending Payment', cls: 'bg-[#F6F1E9] text-[#7A3E1C] border-[#D8CCB8]' };
    default:
      return null;
  }
}

export const AdminDashboard = ({
  state,
  onNavigateShop,
  onCreateAdminOrder,
  onUpdateAdminOrder,
  onDeleteAdminOrder,
  onRefreshState,
  onNotify,
}) => {
  const { catalog, orders, storeConfig } = state;
  const currency = storeConfig?.currency || 'USD';

  const [adminTab, setAdminTab] = useState('orders');
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

  // Payments Queue State
  const [payments, setPayments] = useState([]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('PENDING_MANUAL_VERIFICATION');
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentActionError, setPaymentActionError] = useState(null);
  const [confirmChecks, setConfirmChecks] = useState({});
  const [verifyNotes, setVerifyNotes] = useState({});
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Catalog, Inventory & Promos State
  const [adminProducts, setAdminProducts] = useState([]);
  const [lowStockVariants, setLowStockVariants] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [catalogError, setCatalogError] = useState(null);
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProd, setNewProd] = useState({
    name: '',
    category: 'walnuts',
    origin: 'Willamette Valley, OR',
    harvestBatch: '2026 Autumn Batch',
    roastProfile: 'raw_sprouted',
    roastLabel: 'Raw & Sprouted',
    basePrice16oz: '22.00',
    shortDescription: '',
    tastingNotes: 'Crisp, buttery finish with clean orchard sweetness.',
    imageUrl: '/src/assets/images/product_chandler_walnuts_1794573483798.jpg',
  });
  const [stockDrafts, setStockDrafts] = useState({});
  const [priceDrafts, setPriceDrafts] = useState({});
  const [imageUrlDrafts, setImageUrlDrafts] = useState({});
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discountType: 'PERCENT',
    discountValue: '15',
    description: 'Seasonal harvest savings',
  });

  // Operations (Customers, Returns, Reports, Audit Logs) State
  const [reports, setReports] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [returnsList, setReturnsList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [opsError, setOpsError] = useState(null);

  const metrics = useMemo(() => calculateAdminOrderMetrics(orders), [orders]);
  const filteredOrders = useMemo(
    () => filterAdminOrders(orders, statusFilter, liveFilter, query),
    [orders, statusFilter, liveFilter, query]
  );

  const threshold =
    storeConfig?.freeShippingThresholdMinor != null
      ? storeConfig.freeShippingThresholdMinor / 100
      : FREE_SHIPPING_THRESHOLD;
  const standardFee =
    storeConfig?.standardShippingFeeMinor != null
      ? storeConfig.standardShippingFeeMinor / 100
      : STANDARD_SHIPPING_FEE;

  const draftTotals = useMemo(() => {
    let subtotal = 0;
    for (const item of draftItems) {
      const product = catalog.find((p) => p.id === item.productId);
      if (!product) continue;
      subtotal += calculateUnitPrice(product.basePrice16oz, item.weightSize, product) * item.quantity;
    }
    subtotal = roundCurrency(subtotal);
    const shipping =
      draftItems.length === 0 ? 0 : subtotal >= threshold ? 0 : standardFee;
    return {
      subtotal,
      shipping,
      total: roundCurrency(subtotal + shipping),
    };
  }, [draftItems, catalog, threshold, standardFee]);

  const loadPayments = useCallback(async (filter = paymentStatusFilter) => {
    setPaymentsLoading(true);
    setPaymentActionError(null);
    try {
      const qs = filter && filter !== 'ALL' ? `?status=${encodeURIComponent(filter)}` : '';
      const data = await apiFetch(`/api/admin/payments${qs}`);
      setPayments(data.payments || []);
    } catch (err) {
      setPaymentActionError(err instanceof Error ? err.message : 'Unable to load payments queue.');
    } finally {
      setPaymentsLoading(false);
    }
  }, [paymentStatusFilter]);

  const loadCatalogAdmin = useCallback(async () => {
    setCatalogError(null);
    try {
      const [prodData, lowData, couponData] = await Promise.all([
        apiFetch('/api/admin/products'),
        apiFetch('/api/admin/inventory/low-stock'),
        apiFetch('/api/admin/coupons'),
      ]);
      setAdminProducts(prodData.products || []);
      setLowStockVariants(lowData.lowStock || []);
      setCoupons(couponData.coupons || []);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Unable to load catalog & inventory.');
    }
  }, []);

  const loadOperations = useCallback(async (search = customerSearch) => {
    setOpsError(null);
    try {
      const [repData, custData, retData, logData] = await Promise.all([
        apiFetch('/api/admin/reports'),
        apiFetch(`/api/admin/customers?q=${encodeURIComponent(search)}`),
        apiFetch('/api/admin/returns'),
        apiFetch('/api/admin/audit-logs?limit=30'),
      ]);
      setReports(repData);
      setCustomers(custData.users || []);
      setReturnsList(retData.returns || []);
      setAuditLogs(logData.logs || []);
    } catch (err) {
      setOpsError(err instanceof Error ? err.message : 'Unable to load operations reports.');
    }
  }, [customerSearch]);

  useEffect(() => {
    if (adminTab === 'payments') {
      loadPayments(paymentStatusFilter);
    } else if (adminTab === 'catalog') {
      loadCatalogAdmin();
    } else if (adminTab === 'operations') {
      loadOperations(customerSearch);
    }
  }, [adminTab, paymentStatusFilter, loadPayments, loadCatalogAdmin, loadOperations, customerSearch]);

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

  const handleVerifyPayment = async (payment) => {
    setPaymentActionError(null);
    if (!confirmChecks[payment.id]) {
      setPaymentActionError('Check the confirmation box verifying bank/UPI settlement before approving.');
      return;
    }
    try {
      const data = await apiFetch(`/api/admin/payments/${encodeURIComponent(payment.id)}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          confirmVerified: true,
          notes: verifyNotes[payment.id]?.trim() || 'Verified against bank/UPI statement',
        }),
      });
      if (data.state && onRefreshState) onRefreshState(data.state);
      onNotify?.(`Verified payment for order #${data.order?.orderNumber || payment.orderNumber}.`);
      loadPayments(paymentStatusFilter);
    } catch (err) {
      setPaymentActionError(err instanceof Error ? err.message : 'Failed to verify payment.');
    }
  };

  const handleRejectPayment = async (e, payment) => {
    e.preventDefault();
    setPaymentActionError(null);
    if (rejectReason.trim().length < 4) {
      setPaymentActionError('Enter a rejection reason (at least 4 characters).');
      return;
    }
    try {
      const data = await apiFetch(`/api/admin/payments/${encodeURIComponent(payment.id)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (data.state && onRefreshState) onRefreshState(data.state);
      onNotify?.(`Rejected payment for ${payment.orderNumber || payment.id}.`);
      setRejectingId(null);
      setRejectReason('');
      loadPayments(paymentStatusFilter);
    } catch (err) {
      setPaymentActionError(err instanceof Error ? err.message : 'Failed to reject payment.');
    }
  };

  const handleRefundPayment = async (payment) => {
    setPaymentActionError(null);
    try {
      const data = await apiFetch(`/api/admin/payments/${encodeURIComponent(payment.id)}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Admin issued full refund' }),
      });
      if (data.state && onRefreshState) onRefreshState(data.state);
      onNotify?.(`Refund issued for payment ${payment.id}.`);
      loadPayments(paymentStatusFilter);
    } catch (err) {
      setPaymentActionError(err instanceof Error ? err.message : 'Refund failed.');
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setCatalogError(null);
    try {
      const slug = newProd.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const data = await apiFetch('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          slug: `${slug}-${Date.now().toString().slice(-4)}`,
          name: newProd.name.trim(),
          category: newProd.category,
          origin: newProd.origin.trim(),
          harvestBatch: newProd.harvestBatch.trim(),
          roastProfile: newProd.roastProfile,
          roastLabel: newProd.roastLabel,
          basePrice16oz: Number(newProd.basePrice16oz),
          shortDescription: newProd.shortDescription.trim(),
          tastingNotes: newProd.tastingNotes.trim(),
          nutritionPerServing: {
            servingSize: '1 oz (28g)',
            calories: 185,
            proteinGrams: 5,
            healthyFatsGrams: 17,
            fiberGrams: 3,
            highlightNutrient: 'Single-orchard harvest',
          },
          dietaryTags: ['heart_healthy'],
          allergens: [],
          imageUrl: newProd.imageUrl.trim(),
        }),
      });
      if (data.state && onRefreshState) onRefreshState(data.state);
      onNotify?.(`Added ${data.product.name} to storefront catalog.`);
      setShowNewProductForm(false);
      setNewProd((prev) => ({ ...prev, name: '', shortDescription: '' }));
      loadCatalogAdmin();
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Could not create product.');
    }
  };

  const handleToggleProductField = async (product, patch, msg) => {
    setCatalogError(null);
    try {
      const data = await apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (data.state && onRefreshState) onRefreshState(data.state);
      onNotify?.(msg);
      loadCatalogAdmin();
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Could not update product.');
    }
  };

  const handleSaveVariantStock = async (variantId) => {
    const qty = stockDrafts[variantId];
    if (qty === undefined || qty === '') return;
    setCatalogError(null);
    try {
      const data = await apiFetch(`/api/admin/variants/${encodeURIComponent(variantId)}/inventory`, {
        method: 'PATCH',
        body: JSON.stringify({ setQuantity: Number(qty), reason: 'Admin stock adjustment' }),
      });
      if (data.state && onRefreshState) onRefreshState(data.state);
      onNotify?.(`Updated inventory for ${data.variant.sku}.`);
      loadCatalogAdmin();
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Could not update stock.');
    }
  };

  const handleUploadImageFile = async (productId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await apiFetch(`/api/admin/products/${encodeURIComponent(productId)}/images`, {
          method: 'POST',
          body: JSON.stringify({
            base64Data: String(reader.result),
            filename: file.name,
            isPrimary: false,
          }),
        });
        onNotify?.('Uploaded product image.');
        loadCatalogAdmin();
      } catch (err) {
        setCatalogError(err instanceof Error ? err.message : 'Image upload failed.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddImageUrl = async (productId) => {
    const url = imageUrlDrafts[productId]?.trim();
    if (!url) return;
    try {
      await apiFetch(`/api/admin/products/${encodeURIComponent(productId)}/images`, {
        method: 'POST',
        body: JSON.stringify({ imageUrl: url, isPrimary: false }),
      });
      setImageUrlDrafts((prev) => ({ ...prev, [productId]: '' }));
      onNotify?.('Added product gallery image.');
      loadCatalogAdmin();
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Could not attach image URL.');
    }
  };

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    setCatalogError(null);
    try {
      await apiFetch('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: newCoupon.code.trim().toUpperCase(),
          description: newCoupon.description.trim(),
          discountType: newCoupon.discountType,
          discountValue: Number(newCoupon.discountValue),
        }),
      });
      onNotify?.(`Promo code ${newCoupon.code.toUpperCase()} created.`);
      setNewCoupon({
        code: '',
        discountType: 'PERCENT',
        discountValue: '15',
        description: 'Seasonal harvest savings',
      });
      loadCatalogAdmin();
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Could not create promo code.');
    }
  };

  const handleToggleCustomerStatus = async (customer) => {
    const nextStatus = customer.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    setOpsError(null);
    try {
      await apiFetch(`/api/admin/customers/${encodeURIComponent(customer.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      onNotify?.(`${customer.email} status updated to ${nextStatus}.`);
      loadOperations(customerSearch);
    } catch (err) {
      setOpsError(err instanceof Error ? err.message : 'Could not update customer status.');
    }
  };

  const handleReturnDecision = async (returnReq, status) => {
    setOpsError(null);
    try {
      await apiFetch(`/api/admin/returns/${encodeURIComponent(returnReq.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onNotify?.(`Return request marked ${status}.`);
      loadOperations(customerSearch);
    } catch (err) {
      setOpsError(err instanceof Error ? err.message : 'Could not update return request.');
    }
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
              Admin Operations Console
            </h1>
            <p className="text-sm text-[#4B5548] mt-1">
              Publish live orders, manually verify UPI settlements, adjust variant inventory, and oversee fulfillment.
            </p>
          </div>

          {adminTab === 'orders' && (
            <button
              type="button"
              onClick={() => setShowComposer((prev) => !prev)}
              aria-expanded={showComposer}
              className="min-h-[44px] px-4 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#142C20] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{showComposer ? 'Hide Order Publisher' : 'Put New Order Live'}</span>
            </button>
          )}
        </div>

        {/* Admin Section Tabs */}
        <div role="tablist" aria-label="Admin console sections" className="flex flex-wrap gap-2">
          {ADMIN_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = adminTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                id={`admin-tab-${tab.id}`}
                aria-selected={active}
                type="button"
                onClick={() => setAdminTab(tab.id)}
                className={`min-h-[42px] px-4 py-2 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#1B3B2B] text-[#FCFAF6]'
                    : 'bg-[#FCFAF6] text-[#1C1915] border border-[#D8CCB8] hover:bg-[#EBE2D3]'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
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
            <dt className="text-xs text-[#4B5548]">Awaiting Payment / Packing</dt>
            <dd className="mt-1 font-mono tabular-nums text-xl font-semibold text-[#1C1915]">
              {metrics.awaitingPacking}
              <span className="block font-sans text-xs font-normal text-[#4B5548]">
                {metrics.awaitingPayment} awaiting payment
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
            <dt className="text-xs text-[#4B5548]">Verified Paid Revenue</dt>
            <dd className="mt-1 font-mono tabular-nums text-xl font-semibold text-[#1C1915]">
              {formatCurrency(metrics.revenue, currency)}
              <span className="block font-sans text-xs font-normal text-[#4B5548]">
                Excludes unpaid &amp; cancelled
              </span>
            </dd>
          </div>
        </dl>

        {/* TAB 1: ORDERS & PUBLISHER */}
        {adminTab === 'orders' && (
          <>
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
                          {STATUS_OPTIONS.filter((s) => s.id !== 'cancelled' && s.id !== 'awaiting_payment').map((s) => (
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
                            const unitPrice = calculateUnitPrice(
                              product.basePrice16oz,
                              item.weightSize,
                              product
                            );
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
                                    {WEIGHT_OPTIONS[item.weightSize].label} ·{' '}
                                    {formatCurrency(unitPrice, currency)} each
                                  </span>
                                </div>

                                <div className="flex items-center gap-3">
                                  <span className="font-mono tabular-nums font-semibold text-[#1C1915]">
                                    {formatCurrency(unitPrice * item.quantity, currency)}
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
                          <dd className="font-mono tabular-nums">
                            {formatCurrency(draftTotals.subtotal, currency)}
                          </dd>
                        </div>
                        <div className="flex justify-between text-[#4B5548]">
                          <dt>Shipping</dt>
                          <dd className="font-mono tabular-nums">
                            {draftTotals.shipping === 0
                              ? 'Free'
                              : formatCurrency(draftTotals.shipping, currency)}
                          </dd>
                        </div>
                        <div className="flex justify-between font-semibold text-[#1C1915] text-base pt-1">
                          <dt>Order Total</dt>
                          <dd className="font-mono tabular-nums">
                            {formatCurrency(draftTotals.total, currency)}
                          </dd>
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
                    Publish draft orders live, advance fulfillment stages, update tracking numbers, or safely archive orders.
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
                    const paymentBadge = getPaymentBadge(order.paymentStatus);

                    return (
                      <li key={order.id} className="py-5 space-y-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
                              <span className={`font-semibold ${isLive ? 'text-[#1B3B2B]' : 'text-[#7A3E1C]'}`}>
                                {isLive ? 'Live' : 'Draft'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{order.source === 'admin' ? 'Admin Entry' : 'Storefront Checkout'}</span>
                              {paymentBadge && (
                                <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${paymentBadge.cls}`}>
                                  {paymentBadge.text}
                                </span>
                              )}
                            </div>

                            <p className="font-display text-lg font-semibold text-[#1C1915]">
                              {order.shippingAddress?.fullName} —{' '}
                              <span className="font-sans text-sm font-normal text-[#4B5548]">
                                {order.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
                              </span>
                            </p>

                            <p className="text-xs text-[#4B5548]">
                              {order.shippingAddress?.street}, {order.shippingAddress?.city},{' '}
                              {order.shippingAddress?.state} {order.shippingAddress?.postalCode} · Tracking:{' '}
                              <span className="font-mono tabular-nums text-[#1C1915]">
                                {order.trackingNumber}
                              </span>{' '}
                              · Est. {formatReadableDate(order.estimatedDelivery)}
                            </p>

                            {order.notes && <p className="text-xs text-[#7A3E1C]">Note: {order.notes}</p>}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <span className="font-mono tabular-nums text-base font-semibold text-[#1C1915] mr-2">
                              {formatCurrency(order.total, order.currency || currency)}
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
                              aria-label={`Archive order ${order.orderNumber}`}
                              title="Safely archive order"
                              className="w-10 h-10 rounded-md text-[#7A3E1C] hover:bg-[#EBE2D3] flex items-center justify-center cursor-pointer"
                            >
                              <Archive className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

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
          </>
        )}

        {/* TAB 2: UPI & PAYMENT VERIFICATION QUEUE */}
        {adminTab === 'payments' && (
          <section
            aria-labelledby="admin-payments-heading"
            className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBE2D3]">
              <div>
                <h2 id="admin-payments-heading" className="font-display text-2xl font-semibold text-[#1C1915]">
                  UPI QR &amp; Settlement Verification Queue
                </h2>
                <p className="text-sm text-[#4B5548] mt-0.5">
                  Reconcile submitted UTR transaction references against your bank statement before marking orders Paid.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadPayments(paymentStatusFilter)}
                className="min-h-[40px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-xs font-semibold text-[#1C1915] inline-flex items-center gap-1.5 hover:bg-[#EBE2D3] cursor-pointer self-start"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Refresh Queue</span>
              </button>
            </div>

            {paymentActionError && (
              <div role="alert" className="p-3.5 rounded-md bg-[#9E2A2B]/10 border border-[#9E2A2B]/30 text-xs font-medium text-[#9E2A2B]">
                {paymentActionError}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {[
                { id: 'PENDING_MANUAL_VERIFICATION', label: 'Pending UTR Verification' },
                { id: 'CAPTURED', label: 'Verified / Captured' },
                { id: 'REJECTED', label: 'Rejected' },
                { id: 'ALL', label: 'All Payment Records' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPaymentStatusFilter(opt.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                    paymentStatusFilter === opt.id
                      ? 'bg-[#1B3B2B] text-[#FCFAF6]'
                      : 'bg-[#F6F1E9] text-[#1C1915] border border-[#D8CCB8] hover:bg-[#EBE2D3]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {paymentsLoading ? (
              <p className="py-8 text-center text-sm text-[#4B5548]">Loading payment records...</p>
            ) : payments.length === 0 ? (
              <div className="py-10 text-center border-t border-[#EBE2D3]">
                <p className="font-display text-lg font-semibold text-[#1C1915]">
                  No payment records in this queue
                </p>
                <p className="text-sm text-[#4B5548] mt-1">
                  Submitted UPI UTR references and gateway transactions appear here for audit and reconciliation.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#EBE2D3] border-t border-[#EBE2D3]">
                {payments.map((payment) => {
                  const badge = getPaymentBadge(payment.status);
                  const canVerify =
                    payment.status === 'PENDING_MANUAL_VERIFICATION' || payment.status === 'PENDING';
                  const canRefund = payment.status === 'CAPTURED';

                  return (
                    <li key={payment.id} className="py-5 space-y-3">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-semibold text-[#1C1915]">
                              {payment.provider}
                            </span>
                            {badge && (
                              <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${badge.cls}`}>
                                {badge.text}
                              </span>
                            )}
                            {payment.duplicateUtrWarning && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#9E2A2B]/15 text-[#9E2A2B] text-[11px] font-semibold">
                                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                                Duplicate UTR Warning
                              </span>
                            )}
                          </div>
                          <p className="font-display text-lg font-semibold text-[#1C1915]">
                            {formatCurrency((payment.amountMinor || 0) / 100, payment.currency || currency)}
                            {payment.utrNumber && (
                              <span className="ml-2 font-mono text-sm text-[#7A3E1C]">
                                · UTR: {payment.utrNumber}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[#4B5548]">
                            Order ID: <span className="font-mono">{payment.orderId}</span> · Created{' '}
                            {formatReadableDate(payment.createdAt)}
                          </p>
                          {payment.rejectionReason && (
                            <p className="text-xs text-[#9E2A2B]">Rejected: {payment.rejectionReason}</p>
                          )}
                        </div>

                        {canVerify && (
                          <div className="flex flex-col gap-2.5 lg:w-[420px]">
                            <label className="flex items-center gap-2 text-xs font-medium text-[#1C1915] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(confirmChecks[payment.id])}
                                onChange={(e) =>
                                  setConfirmChecks((prev) => ({
                                    ...prev,
                                    [payment.id]: e.target.checked,
                                  }))
                                }
                                className="w-4 h-4 accent-[#1B3B2B]"
                              />
                              <span>I confirmed this exact UTR &amp; amount in the merchant bank statement</span>
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={verifyNotes[payment.id] || ''}
                                onChange={(e) =>
                                  setVerifyNotes((prev) => ({ ...prev, [payment.id]: e.target.value }))
                                }
                                placeholder="Verification note (optional)"
                                className="flex-1 min-h-[38px] px-3 py-1 rounded border border-[#D8CCB8] bg-[#F6F1E9] text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => handleVerifyPayment(payment)}
                                className="min-h-[38px] px-3.5 py-1.5 rounded bg-[#1B3B2B] text-[#FCFAF6] text-xs font-semibold inline-flex items-center gap-1 hover:bg-[#142C20] cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Mark Verified &amp; Paid</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingId(rejectingId === payment.id ? null : payment.id);
                                  setRejectReason('');
                                }}
                                className="min-h-[38px] px-3 py-1.5 rounded border border-[#9E2A2B]/40 text-[#9E2A2B] text-xs font-semibold hover:bg-[#9E2A2B]/10 cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )}

                        {canRefund && (
                          <button
                            type="button"
                            onClick={() => handleRefundPayment(payment)}
                            className="min-h-[38px] px-3.5 py-1.5 rounded border border-[#7A3E1C]/40 bg-[#F6F1E9] text-[#7A3E1C] text-xs font-semibold hover:bg-[#EBE2D3] cursor-pointer"
                          >
                            Issue Refund
                          </button>
                        )}
                      </div>

                      {rejectingId === payment.id && (
                        <form
                          onSubmit={(e) => handleRejectPayment(e, payment)}
                          className="p-3.5 rounded-lg bg-[#F6F1E9] border border-[#D8CCB8] flex flex-col sm:flex-row gap-2.5"
                        >
                          <input
                            type="text"
                            required
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejection (e.g. UTR mismatch or short payment)"
                            className="flex-1 min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-xs"
                          />
                          <button
                            type="submit"
                            className="min-h-[38px] px-4 rounded bg-[#9E2A2B] text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirm Reject
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* TAB 3: CATALOG, INVENTORY & PROMO CODES */}
        {adminTab === 'catalog' && (
          <div className="space-y-6">
            {catalogError && (
              <div role="alert" className="p-3.5 rounded-md bg-[#9E2A2B]/10 border border-[#9E2A2B]/30 text-xs font-medium text-[#9E2A2B]">
                {catalogError}
              </div>
            )}

            {/* Low-Stock Alert Strip */}
            {lowStockVariants.length > 0 && (
              <div className="rounded-xl border border-[#7A3E1C]/40 bg-[#7A3E1C]/5 p-5 space-y-2">
                <h2 className="font-display text-lg font-semibold text-[#7A3E1C] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  <span>Low Stock Variants ({lowStockVariants.length})</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {lowStockVariants.map((v) => (
                    <span
                      key={v.id}
                      className="px-3 py-1 rounded-md border border-[#7A3E1C]/30 bg-[#FCFAF6] text-xs font-mono text-[#1C1915]"
                    >
                      {v.productName} ({v.weightSize}): <strong>{v.availableStock}</strong> left
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Products & Variant Stock Editor */}
            <section className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#EBE2D3]">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-[#1C1915]">
                    Harvest Catalog &amp; Variant Inventory
                  </h2>
                  <p className="text-sm text-[#4B5548] mt-0.5">
                    Add harvests, manage prices &amp; visibility, upload photos, and update per-variant stock quantities.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewProductForm((p) => !p)}
                  className="min-h-[40px] px-4 py-2 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#142C20] cursor-pointer"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>{showNewProductForm ? 'Cancel' : 'Add Harvest Product'}</span>
                </button>
              </div>

              {showNewProductForm && (
                <form
                  onSubmit={handleCreateProduct}
                  className="p-5 rounded-lg bg-[#F6F1E9] border border-[#D8CCB8] space-y-4"
                >
                  <h3 className="text-sm font-semibold text-[#1C1915]">New Storefront Harvest</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      required
                      value={newProd.name}
                      onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                      placeholder="Product name"
                      className="min-h-[40px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm"
                    />
                    <select
                      value={newProd.category}
                      onChange={(e) => setNewProd({ ...newProd, category: e.target.value })}
                      className="min-h-[40px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm"
                    >
                      <option value="walnuts">Walnuts</option>
                      <option value="almonds">Almonds</option>
                      <option value="pistachios_hazelnuts">Pistachios &amp; Hazelnuts</option>
                      <option value="pecans_medleys">Pecans &amp; Medleys</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={newProd.basePrice16oz}
                      onChange={(e) => setNewProd({ ...newProd, basePrice16oz: e.target.value })}
                      placeholder="16oz Base Price"
                      className="min-h-[40px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      value={newProd.origin}
                      onChange={(e) => setNewProd({ ...newProd, origin: e.target.value })}
                      placeholder="Origin (e.g. Sonoma, CA)"
                      className="min-h-[40px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm"
                    />
                    <input
                      type="text"
                      required
                      value={newProd.imageUrl}
                      onChange={(e) => setNewProd({ ...newProd, imageUrl: e.target.value })}
                      placeholder="Primary Image URL"
                      className="min-h-[40px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={newProd.shortDescription}
                    onChange={(e) => setNewProd({ ...newProd, shortDescription: e.target.value })}
                    placeholder="Short orchard tasting summary"
                    className="w-full min-h-[40px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-sm"
                  />
                  <button
                    type="submit"
                    className="min-h-[40px] px-5 py-2 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-xs font-semibold hover:bg-[#142C20] cursor-pointer"
                  >
                    Create Product
                  </button>
                </form>
              )}

              <div className="space-y-4">
                {adminProducts.map((prod) => (
                  <article
                    key={prod.id}
                    className="p-4 rounded-xl border border-[#D8CCB8] bg-[#F6F1E9]/60 space-y-4"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="w-14 h-14 rounded-lg object-cover border border-[#D8CCB8] shrink-0"
                        />
                        <div>
                          <h3 className="font-display text-lg font-semibold text-[#1C1915]">
                            {prod.name}
                            {prod.isArchived && (
                              <span className="ml-2 text-xs font-sans text-[#9E2A2B]">(Archived)</span>
                            )}
                          </h3>
                          <p className="text-xs text-[#4B5548]">
                            {prod.origin} · Base 16oz:{' '}
                            <strong className="font-mono text-[#1C1915]">
                              {formatCurrency(prod.basePrice16oz, prod.currency || currency)}
                            </strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            value={priceDrafts[prod.id] ?? prod.basePrice16oz}
                            onChange={(e) =>
                              setPriceDrafts((prev) => ({ ...prev, [prod.id]: e.target.value }))
                            }
                            aria-label={`Base 16oz price for ${prod.name}`}
                            className="w-24 min-h-[36px] px-2.5 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleProductField(
                                prod,
                                { basePrice16oz: Number(priceDrafts[prod.id] ?? prod.basePrice16oz) },
                                `Updated price for ${prod.name}.`
                              )
                            }
                            className="min-h-[36px] px-3 rounded bg-[#1B3B2B] text-[#FCFAF6] text-xs font-semibold cursor-pointer"
                          >
                            Save Price
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleToggleProductField(
                              prod,
                              { isVisible: prod.isVisible === false },
                              `Updated storefront visibility for ${prod.name}.`
                            )
                          }
                          className="min-h-[36px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          {prod.isVisible === false ? (
                            <>
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Show</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Hide</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Variant Stock Matrix */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {(prod.variants || []).map((v) => (
                        <div
                          key={v.id}
                          className="p-2.5 rounded-lg border border-[#D8CCB8] bg-[#FCFAF6] flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <p className="font-mono font-semibold text-[#1C1915]">{v.weightSize}</p>
                            <p className="text-[11px] text-[#4B5548]">
                              Avail: {v.availableStock} (Res: {v.reservedStock})
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={stockDrafts[v.id] ?? v.stockQuantity}
                              onChange={(e) =>
                                setStockDrafts((prev) => ({ ...prev, [v.id]: e.target.value }))
                              }
                              aria-label={`Stock quantity for ${prod.name} ${v.weightSize}`}
                              className="w-16 min-h-[32px] px-2 rounded border border-[#D8CCB8] bg-[#F6F1E9] font-mono text-center"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveVariantStock(v.id)}
                              className="min-h-[32px] px-2.5 rounded border border-[#1B3B2B] text-[#1B3B2B] font-semibold hover:bg-[#E6EDE8] cursor-pointer"
                            >
                              Set
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Image Attachment Row */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#EBE2D3] text-xs">
                      <input
                        type="url"
                        value={imageUrlDrafts[prod.id] || ''}
                        onChange={(e) =>
                          setImageUrlDrafts((prev) => ({ ...prev, [prod.id]: e.target.value }))
                        }
                        placeholder="Add gallery image URL..."
                        className="flex-1 min-w-[200px] min-h-[34px] px-2.5 rounded border border-[#D8CCB8] bg-[#FCFAF6]"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddImageUrl(prod.id)}
                        className="min-h-[34px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Add URL</span>
                      </button>
                      <label className="min-h-[34px] px-3 rounded border border-[#1B3B2B]/40 bg-[#E6EDE8] text-[#1B3B2B] font-semibold inline-flex items-center gap-1 cursor-pointer">
                        <span>Upload File</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => handleUploadImageFile(prod.id, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* Promo Coupons */}
            <section className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-4">
              <h2 className="font-display text-xl font-semibold text-[#1C1915] flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#1B3B2B]" aria-hidden="true" />
                <span>Promo Codes ({coupons.length})</span>
              </h2>
              <form onSubmit={handleCreateCoupon} className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                <input
                  type="text"
                  required
                  value={newCoupon.code}
                  onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
                  placeholder="CODE (e.g. AUTUMN15)"
                  className="min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#F6F1E9] text-xs font-mono uppercase"
                />
                <select
                  value={newCoupon.discountType}
                  onChange={(e) => setNewCoupon({ ...newCoupon, discountType: e.target.value })}
                  className="min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#F6F1E9] text-xs"
                >
                  <option value="PERCENT">Percent (%)</option>
                  <option value="FIXED">Fixed (Minor Units)</option>
                </select>
                <input
                  type="number"
                  min={1}
                  required
                  value={newCoupon.discountValue}
                  onChange={(e) => setNewCoupon({ ...newCoupon, discountValue: e.target.value })}
                  placeholder="Value"
                  className="min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#F6F1E9] text-xs font-mono"
                />
                <input
                  type="text"
                  value={newCoupon.description}
                  onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })}
                  placeholder="Description"
                  className="min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#F6F1E9] text-xs"
                />
                <button
                  type="submit"
                  className="min-h-[38px] px-4 rounded bg-[#1B3B2B] text-[#FCFAF6] text-xs font-semibold cursor-pointer"
                >
                  Create Promo
                </button>
              </form>
              <div className="flex flex-wrap gap-2">
                {coupons.map((c) => (
                  <span
                    key={c.id}
                    className="px-3 py-1.5 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-xs font-mono text-[#1C1915]"
                  >
                    <strong>{c.code}</strong> · {c.discountType === 'PERCENT' ? `${c.discountValue}%` : c.discountValue} ({c.usageCount} used)
                  </span>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: CUSTOMERS, RETURNS & REPORTS */}
        {adminTab === 'operations' && (
          <div className="space-y-6">
            {opsError && (
              <div role="alert" className="p-3.5 rounded-md bg-[#9E2A2B]/10 border border-[#9E2A2B]/30 text-xs font-medium text-[#9E2A2B]">
                {opsError}
              </div>
            )}

            {/* Financial & Top Products Report */}
            {reports && (
              <section className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-4">
                <h2 className="font-display text-2xl font-semibold text-[#1C1915]">
                  Verified Financial Summary
                </h2>
                <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <div className="p-3.5 rounded-lg border border-[#D8CCB8] bg-[#F6F1E9]">
                    <dt className="text-xs text-[#4B5548]">Verified Revenue</dt>
                    <dd className="font-mono font-semibold text-lg text-[#1B3B2B] mt-0.5">
                      {formatCurrency(reports.metrics?.verifiedRevenue || 0, reports.currency || currency)}
                    </dd>
                  </div>
                  <div className="p-3.5 rounded-lg border border-[#D8CCB8] bg-[#F6F1E9]">
                    <dt className="text-xs text-[#4B5548]">Paid Orders</dt>
                    <dd className="font-mono font-semibold text-lg text-[#1C1915] mt-0.5">
                      {reports.metrics?.paidOrderCount || 0} / {reports.metrics?.totalOrderCount || 0}
                    </dd>
                  </div>
                  <div className="p-3.5 rounded-lg border border-[#D8CCB8] bg-[#F6F1E9]">
                    <dt className="text-xs text-[#4B5548]">Pending UPI Checks</dt>
                    <dd className="font-mono font-semibold text-lg text-[#7A3E1C] mt-0.5">
                      {reports.metrics?.pendingVerificationCount || 0}
                    </dd>
                  </div>
                  <div className="p-3.5 rounded-lg border border-[#D8CCB8] bg-[#F6F1E9]">
                    <dt className="text-xs text-[#4B5548]">Failed / Rejected Payments</dt>
                    <dd className="font-mono font-semibold text-lg text-[#9E2A2B] mt-0.5">
                      {reports.metrics?.failedPaymentCount || 0}
                    </dd>
                  </div>
                </dl>

                {reports.topProducts?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-[#1C1915] mb-2">Top Selling Products (Verified Paid Only)</h3>
                    <ul className="divide-y divide-[#EBE2D3] text-xs">
                      {reports.topProducts.map((tp) => (
                        <li key={tp.productId} className="py-2 flex items-center justify-between">
                          <span className="font-medium text-[#1C1915]">{tp.productName}</span>
                          <span className="font-mono text-[#4B5548]">
                            {tp.unitsSold} units · {formatCurrency(tp.revenue, reports.currency || currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* Customers Directory */}
            <section className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold text-[#1C1915] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#1B3B2B]" aria-hidden="true" />
                  <span>Registered Customers ({customers.length})</span>
                </h2>
                <input
                  type="search"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search email or name..."
                  className="min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#F6F1E9] text-xs w-full sm:w-64"
                />
              </div>
              <ul className="divide-y divide-[#EBE2D3] text-xs">
                {customers.map((c) => (
                  <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1C1915]">
                        {c.fullName}{' '}
                        <span className="font-mono font-normal text-[#4B5548]">({c.email})</span>
                      </p>
                      <p className="text-[#4B5548]">
                        Role: {c.role} · Status:{' '}
                        <strong className={c.status === 'SUSPENDED' ? 'text-[#9E2A2B]' : 'text-[#1B3B2B]'}>
                          {c.status}
                        </strong>
                      </p>
                    </div>
                    {String(c.role).toUpperCase() !== 'ADMIN' && (
                      <button
                        type="button"
                        onClick={() => handleToggleCustomerStatus(c)}
                        className={`min-h-[34px] px-3 rounded border text-xs font-semibold cursor-pointer ${
                          c.status === 'SUSPENDED'
                            ? 'border-[#1B3B2B] text-[#1B3B2B] bg-[#E6EDE8]'
                            : 'border-[#9E2A2B]/40 text-[#9E2A2B] bg-[#FCFAF6]'
                        }`}
                      >
                        {c.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend Account'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* Returns & Audit Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-4">
                <h2 className="font-display text-xl font-semibold text-[#1C1915]">
                  Return &amp; Refund Requests ({returnsList.length})
                </h2>
                {returnsList.length === 0 ? (
                  <p className="text-xs text-[#4B5548]">No return requests submitted yet.</p>
                ) : (
                  <ul className="divide-y divide-[#EBE2D3] text-xs">
                    {returnsList.map((r) => (
                      <li key={r.id} className="py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-[#1C1915]">
                            Order {r.orderId}
                          </span>
                          <span className="font-semibold text-[#7A3E1C]">{r.status}</span>
                        </div>
                        <p className="text-[#4B5548]">{r.reason}</p>
                        {r.status === 'REQUESTED' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleReturnDecision(r, 'APPROVED')}
                              className="px-2.5 py-1 rounded bg-[#1B3B2B] text-[#FCFAF6] font-semibold cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReturnDecision(r, 'REJECTED')}
                              className="px-2.5 py-1 rounded border border-[#9E2A2B]/40 text-[#9E2A2B] font-semibold cursor-pointer"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-4">
                <h2 className="font-display text-xl font-semibold text-[#1C1915] flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#1B3B2B]" aria-hidden="true" />
                  <span>Recent Audit Trail</span>
                </h2>
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-[#4B5548]">No audit entries recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-[#EBE2D3] text-xs max-h-72 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <li key={log.id} className="py-2 flex items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-semibold text-[#1C1915]">{log.action}</span>
                          <span className="block text-[#4B5548]">
                            {log.entityType} {log.entityId || ''}
                          </span>
                        </div>
                        <span className="font-mono text-[#4B5548] shrink-0">
                          {formatReadableDate(log.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default AdminDashboard;
