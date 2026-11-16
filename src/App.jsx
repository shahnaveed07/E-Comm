import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { DEFAULT_PUBLIC_PREFERENCES, INITIAL_CATALOG, INITIAL_REVIEWS } from './data/catalog.js';
import { apiFetch, ensureCsrfToken } from './services/api.js';
import { AdminDashboard } from './components/AdminDashboard.jsx';
import { AuthPanel } from './components/AuthPanel.jsx';
import { Dashboard } from './components/Dashboard.jsx';
import { Footer } from './components/Footer.jsx';
import { HeroSection } from './components/HeroSection.jsx';
import { Navbar } from './components/Navbar.jsx';
import { ProductCatalog } from './components/ProductCatalog.jsx';
import { ProductModal } from './components/ProductModal.jsx';
import { RecommendationsSection } from './components/RecommendationsSection.jsx';
import { ShoppingCart } from './components/ShoppingCart.jsx';
import {
  addCartItem,
  calculateCartTotals,
  canAccessAdminConsole,
  canAccessUserDashboard,
  getPersonalizedRecommendations,
  updateCartItemQuantity,
} from './utils/commerce.js';

const CART_STORAGE_KEY = 'sylvan-grove-cart-v2';

const PUBLIC_FALLBACK_STATE = {
  user: null,
  catalog: INITIAL_CATALOG,
  reviews: INITIAL_REVIEWS,
  preferences: DEFAULT_PUBLIC_PREFERENCES,
  addresses: [],
  wishlistProductIds: [],
  paymentMethods: [],
  invoices: [],
  orders: [],
  returnRequests: [],
  storeConfig: {
    currency: 'USD',
    paymentMethods: { cardToken: true, upiQr: false, razorpay: false, stripe: false },
  },
};

const ROAST_LABELS = {
  raw_sprouted: 'Raw & Sprouted',
  dry_roasted_unsalted: 'Dry-Roasted Unsalted',
  lightly_salted: 'Lightly Sea Salted',
};

function getInitialViewFromHash() {
  if (typeof window === 'undefined') return 'shop';
  const params = new URLSearchParams(window.location.search);
  if (params.get('resetToken')) return 'auth';
  const hash = window.location.hash.toLowerCase();
  if (hash === '#admin') return 'admin';
  if (hash === '#account') return 'account';
  if (hash === '#login' || hash === '#register') return 'auth';
  return 'shop';
}

export default function App() {
  const [storeState, setStoreState] = useState(PUBLIC_FALLBACK_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState(getInitialViewFromHash);
  const [accountTab, setAccountTab] = useState('overview');
  const [initialResetToken, setInitialResetToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('resetToken') || '';
  });
  const [authMode, setAuthMode] = useState(() => {
    if (typeof window === 'undefined') return 'login';
    if (new URLSearchParams(window.location.search).get('resetToken')) return 'reset';
    return window.location.hash.toLowerCase() === '#register' ? 'register' : 'login';
  });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [resumeUpiOrder, setResumeUpiOrder] = useState(null);
  const [liveNotice, setLiveNotice] = useState(null);

  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = window.localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage failures
    }
    return [];
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // Ignore storage failures
    }
  }, [cartItems]);

  const showNotice = useCallback((message) => {
    setLiveNotice(message);
    window.setTimeout(() => {
      setLiveNotice((curr) => (curr === message ? null : curr));
    }, 4500);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const next = getInitialViewFromHash();
      setActiveView(next);
      if (window.location.hash.toLowerCase() === '#register') {
        setAuthMode('register');
      } else if (window.location.hash.toLowerCase() === '#login') {
        setAuthMode('login');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let mounted = true;
    ensureCsrfToken().catch(() => {});

    apiFetch('/api/state')
      .then((data) => {
        if (mounted && data && Array.isArray(data.catalog)) {
          setStoreState(data);
        }
      })
      .catch(() => {
        // Keep fallback public state if backend unreachable
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const verifyToken = params.get('verifyToken');
      if (verifyToken) {
        apiFetch('/api/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token: verifyToken }),
        })
          .then(() => {
            if (mounted) showNotice('Email address verified. Thank you!');
          })
          .catch(() => {});
      }
    }

    return () => {
      mounted = false;
    };
  }, [showNotice]);

  const currentUserId = storeState.user?.id || 'guest';

  useEffect(() => {
    if (typeof window === 'undefined' || !('EventSource' in window)) return undefined;
    let mounted = true;
    const eventSource = new window.EventSource('/api/events');
    eventSource.addEventListener('state', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (mounted && payload?.state && Array.isArray(payload.state.catalog)) {
          setStoreState(payload.state);
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    return () => {
      mounted = false;
      eventSource.close();
    };
  }, [currentUserId]);

  const currentUser = storeState.user || null;
  const currency = storeState.storeConfig?.currency || 'USD';

  const cartTotals = useMemo(
    () => calculateCartTotals(cartItems, storeState.catalog, 0, storeState.storeConfig),
    [cartItems, storeState.catalog, storeState.storeConfig]
  );

  const recommendations = useMemo(
    () =>
      getPersonalizedRecommendations(
        storeState.catalog,
        storeState.preferences,
        storeState.orders,
        3
      ),
    [storeState]
  );

  const updateHash = (hash) => {
    if (typeof window !== 'undefined' && window.location.hash !== hash) {
      window.history.replaceState(null, '', hash || '#top');
    }
  };

  const handleNavigateShop = (sectionId) => {
    setActiveView('shop');
    updateHash(sectionId ? `#${sectionId}` : '#top');
    if (sectionId) {
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNavigateAccount = (tab = 'overview') => {
    setAccountTab(tab);
    setActiveView('account');
    updateHash('#account');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateAdmin = () => {
    setActiveView('admin');
    updateHash('#admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateAuth = (mode = 'login') => {
    setInitialResetToken('');
    setAuthMode(mode);
    setActiveView('auth');
    updateHash(mode === 'register' ? '#register' : '#login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogin = async ({ email, password }) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoreState(data.state);
    showNotice(`Welcome back, ${data.user.fullName}.`);
    return data;
  };

  const handleRegister = async ({ fullName, email, password }) => {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, password }),
    });
    setStoreState(data.state);
    showNotice(`Account created for ${data.user.fullName}.`);
    return data;
  };

  const handleLogout = async () => {
    try {
      const data = await apiFetch('/api/auth/logout', { method: 'POST' });
      setStoreState(data.state);
    } catch {
      setStoreState((prev) => ({
        ...PUBLIC_FALLBACK_STATE,
        catalog: prev.catalog,
      }));
    }
    setActiveView('shop');
    updateHash('#top');
    showNotice('You have signed out.');
  };

  const handleAddToCart = (product, weightSize) => {
    setCartItems((prev) => addCartItem(prev, product.id, weightSize, 1));
    showNotice(`Added ${product.name} (${weightSize}) to your harvest bag.`);
  };

  const handleUpdateCartQuantity = (productId, weightSize, delta) => {
    setCartItems((prev) => updateCartItemQuantity(prev, productId, weightSize, delta));
  };

  const handleToggleWishlist = async (productId, shouldAdd) => {
    if (!currentUser) {
      handleNavigateAuth('login');
      return;
    }
    const updated = await apiFetch(`/api/wishlist/${encodeURIComponent(productId)}`, {
      method: shouldAdd ? 'POST' : 'DELETE',
    });
    setStoreState(updated);
    showNotice(shouldAdd ? 'Saved harvest to your wishlist.' : 'Removed from wishlist.');
  };

  const handleUpdatePreferences = async (patch, notice) => {
    const updated = await apiFetch('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    setStoreState(updated);
    if (notice) showNotice(notice);
  };

  const handleAddPaymentMethod = async (payload) => {
    const data = await apiFetch('/api/payment-methods', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoreState(data.state);
    showNotice(`Saved ${data.card.brand} ending in ${data.card.last4}.`);
    return data.card;
  };

  const handleSetDefaultCard = async (id) => {
    const updated = await apiFetch(`/api/payment-methods/${encodeURIComponent(id)}/default`, {
      method: 'PATCH',
    });
    setStoreState(updated);
    showNotice('Updated default checkout card.');
  };

  const handleRemoveCard = async (id) => {
    const updated = await apiFetch(`/api/payment-methods/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    setStoreState(updated);
    showNotice('Payment method removed.');
  };

  const handlePlaceOrder = async (payload) => {
    const data = await apiFetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoreState(data.state);
    setCartItems([]);
    showNotice(
      data.order.status === 'awaiting_payment'
        ? `Order #${data.order.orderNumber} created — complete payment to dispatch.`
        : `Order #${data.order.orderNumber} placed successfully.`
    );
    return data.order;
  };

  const handlePayOrderUpi = (order) => {
    setResumeUpiOrder(order);
    setIsCartOpen(true);
  };

  const handleCreateAdminOrder = async (payload) => {
    const data = await apiFetch('/api/admin/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoreState(data.state);
    showNotice(
      data.order.isLive
        ? `Order #${data.order.orderNumber} published live.`
        : `Draft order #${data.order.orderNumber} saved.`
    );
    return data.order;
  };

  const handleUpdateAdminOrder = async (id, patch, notice) => {
    const data = await apiFetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setStoreState(data.state);
    if (notice) showNotice(notice);
  };

  const handleDeleteAdminOrder = async (id, orderNumber) => {
    const updated = await apiFetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    setStoreState(updated);
    showNotice(`Archived order #${orderNumber}.`);
  };

  const handleReorderOrder = (order) => {
    setCartItems((prev) => {
      let next = prev;
      for (const item of order.items) {
        next = addCartItem(next, item.productId, item.weightSize, item.quantity);
      }
      return next;
    });
    setIsCartOpen(true);
    showNotice(`Loaded items from order #${order.orderNumber} into your bag.`);
  };

  const handleSubmitReview = async (productId, payload) => {
    const data = await apiFetch(`/api/products/${encodeURIComponent(productId)}/reviews`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoreState(data.state);
    showNotice('Thank you! Your harvest review is now live.');
    return data.review;
  };

  const handleDeleteReview = async (reviewId) => {
    const updated = await apiFetch(`/api/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'DELETE',
    });
    setStoreState(updated);
    showNotice('Review removed.');
  };

  const handleReviewProduct = (productId) => {
    const prod = storeState.catalog.find((p) => p.id === productId);
    if (prod) {
      setSelectedProduct(prod);
    }
  };

  const renderMainContent = () => {
    if (isLoading) {
      return (
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
          <div className="h-64 rounded-xl bg-[#EBE2D3] animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-80 rounded-xl bg-[#EBE2D3] animate-pulse" />
            <div className="h-80 rounded-xl bg-[#EBE2D3] animate-pulse" />
            <div className="h-80 rounded-xl bg-[#EBE2D3] animate-pulse" />
          </div>
        </div>
      );
    }

    if (activeView === 'auth') {
      return (
        <section
          aria-labelledby="auth-page-heading"
          className="py-12 sm:py-16 bg-[#F6F1E9] min-h-[70vh]"
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="max-w-md mx-auto">
              <button
                type="button"
                onClick={() => handleNavigateShop()}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1B3B2B] hover:underline mb-4 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Back to Orchard Storefront</span>
              </button>
            </div>

            <AuthPanel
              key={`${authMode}-${initialResetToken}`}
              initialMode={authMode}
              initialResetToken={initialResetToken}
              headingLevel={1}
              headingId="auth-page-heading"
              heading={authMode === 'register' ? 'Create Orchard Account' : 'Sign In to Sylvan Grove'}
              description="Register or sign in to complete checkout, track live shipments, and manage your saved delivery preferences."
              onLogin={handleLogin}
              onRegister={handleRegister}
              onAuthenticated={(data) => {
                if (data.user.role === 'admin') {
                  handleNavigateAdmin();
                } else {
                  handleNavigateAccount('overview');
                }
              }}
            />
          </div>
        </section>
      );
    }

    if (activeView === 'account') {
      if (!canAccessUserDashboard(currentUser)) {
        return (
          <section
            aria-labelledby="account-gate-heading"
            className="py-12 sm:py-16 bg-[#F6F1E9] min-h-[70vh]"
          >
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              <div className="max-w-md mx-auto">
                <button
                  type="button"
                  onClick={() => handleNavigateShop()}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1B3B2B] hover:underline mb-4 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Back to Orchard Storefront</span>
                </button>
              </div>

              <AuthPanel
                initialMode="login"
                headingLevel={1}
                headingId="account-gate-heading"
                heading="Account Sign-In Required"
                description="Sign in or create a free customer account to view your dashboard, order history, and saved payment cards."
                onLogin={handleLogin}
                onRegister={handleRegister}
                onAuthenticated={() => setActiveView('account')}
              />
            </div>
          </section>
        );
      }

      return (
        <Dashboard
          state={storeState}
          activeTab={accountTab}
          onChangeTab={setAccountTab}
          onNavigateShop={handleNavigateShop}
          onUpdatePreferences={handleUpdatePreferences}
          onAddPaymentMethod={handleAddPaymentMethod}
          onSetDefaultCard={handleSetDefaultCard}
          onRemoveCard={handleRemoveCard}
          onReorderOrder={handleReorderOrder}
          onReviewProduct={handleReviewProduct}
          onPayOrderUpi={handlePayOrderUpi}
          onRefreshState={setStoreState}
          onToggleWishlist={handleToggleWishlist}
        />
      );
    }

    if (activeView === 'admin') {
      if (!currentUser) {
        return (
          <section
            aria-labelledby="admin-signin-heading"
            className="py-12 sm:py-16 bg-[#F6F1E9] min-h-[70vh]"
          >
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              <div className="max-w-md mx-auto">
                <button
                  type="button"
                  onClick={() => handleNavigateShop()}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1B3B2B] hover:underline mb-4 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Back to Orchard Storefront</span>
                </button>
              </div>

              <AuthPanel
                initialMode="login"
                headingLevel={1}
                headingId="admin-signin-heading"
                heading="Administrator Authorization Required"
                description="Sign in with an authorized administrator account to access the Admin Operations Console."
                onLogin={handleLogin}
                onRegister={handleRegister}
                onAuthenticated={(data) => {
                  if (data.user.role === 'admin') {
                    setActiveView('admin');
                  } else {
                    handleNavigateAccount('overview');
                  }
                }}
              />
            </div>
          </section>
        );
      }

      if (!canAccessAdminConsole(currentUser)) {
        return (
          <section
            aria-labelledby="admin-denied-heading"
            className="py-14 sm:py-20 bg-[#F6F1E9] min-h-[70vh]"
          >
            <div className="max-w-lg mx-auto px-4">
              <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#9E2A2B]/10 text-[#9E2A2B] flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-6 h-6" aria-hidden="true" />
                </div>
                <h1
                  id="admin-denied-heading"
                  className="font-display text-2xl font-semibold text-[#1C1915]"
                >
                  Administrator Access Restricted
                </h1>
                <p className="text-sm text-[#4B5548]">
                  You are signed in as <span className="font-medium text-[#1C1915]">{currentUser.email}</span>{' '}
                  with customer permissions. Only authorized administrators may open or manage the Admin Operations Console.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleNavigateShop()}
                    className="min-h-[44px] px-5 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold hover:bg-[#142C20] cursor-pointer"
                  >
                    Return to Storefront
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigateAccount('overview')}
                    className="min-h-[44px] px-4 py-2.5 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm font-medium text-[#1C1915] hover:bg-[#EBE2D3] cursor-pointer"
                  >
                    Open My Account
                  </button>
                </div>
              </div>
            </div>
          </section>
        );
      }

      return (
        <AdminDashboard
          state={storeState}
          onNavigateShop={handleNavigateShop}
          onCreateAdminOrder={handleCreateAdminOrder}
          onUpdateAdminOrder={handleUpdateAdminOrder}
          onDeleteAdminOrder={handleDeleteAdminOrder}
          onRefreshState={setStoreState}
          onNotify={showNotice}
        />
      );
    }

    return (
      <>
        <HeroSection
          onShopClick={() => handleNavigateShop('catalog-section')}
          onTrackOrdersClick={() =>
            currentUser ? handleNavigateAccount('orders') : handleNavigateAuth('login')
          }
        />
        <ProductCatalog
          catalog={storeState.catalog}
          reviews={storeState.reviews}
          wishlistProductIds={storeState.wishlistProductIds || []}
          currency={currency}
          onAddToCart={handleAddToCart}
          onSelectProduct={setSelectedProduct}
          onToggleWishlist={handleToggleWishlist}
        />
        <RecommendationsSection
          recommendations={recommendations}
          preferredRoastLabel={ROAST_LABELS[storeState.preferences.preferredRoast]}
          currency={currency}
          onAddToCart={handleAddToCart}
          onSelectProduct={setSelectedProduct}
          onOpenPreferences={() =>
            currentUser ? handleNavigateAccount('preferences') : handleNavigateAuth('login')
          }
        />
      </>
    );
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F6F1E9] text-[#1C1915]">
      <Navbar
        activeView={activeView}
        activeDashboardTab={accountTab}
        authMode={authMode}
        cartCount={cartTotals.itemCount}
        currentUser={currentUser}
        onNavigateShop={handleNavigateShop}
        onNavigateAccount={handleNavigateAccount}
        onNavigateAdmin={handleNavigateAdmin}
        onNavigateAuth={handleNavigateAuth}
        onLogout={handleLogout}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* Accessible Live Status Notification */}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-40 max-w-sm">
        {liveNotice && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#1B3B2B] text-[#FCFAF6] shadow-lg border border-[#142C20] text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#D8CCB8]" aria-hidden="true" />
            <span>{liveNotice}</span>
            <button
              type="button"
              onClick={() => setLiveNotice(null)}
              aria-label="Dismiss notification"
              className="p-1 rounded hover:bg-[#FCFAF6]/10 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <main id="main-content" className="flex-1">
        {renderMainContent()}
      </main>

      <Footer
        currentUser={currentUser}
        onNavigateShop={handleNavigateShop}
        onNavigateAccount={handleNavigateAccount}
        onNavigateAdmin={handleNavigateAdmin}
        onNavigateAuth={handleNavigateAuth}
        onLogout={handleLogout}
      />

      <ProductModal
        product={selectedProduct}
        reviews={storeState.reviews}
        orders={storeState.orders}
        currentUser={currentUser}
        currency={currency}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onSubmitReview={handleSubmitReview}
        onDeleteReview={handleDeleteReview}
        onRequestAuth={(mode) => handleNavigateAuth(mode)}
      />

      <ShoppingCart
        isOpen={isCartOpen}
        items={cartItems}
        catalog={storeState.catalog}
        currentUser={currentUser}
        paymentMethods={storeState.paymentMethods}
        addresses={storeState.addresses || []}
        shippingAddress={storeState.preferences.shippingAddress}
        storeConfig={storeState.storeConfig}
        resumeUpiOrder={resumeUpiOrder}
        onClearResumeOrder={() => setResumeUpiOrder(null)}
        onClose={() => setIsCartOpen(false)}
        onUpdateQuantity={handleUpdateCartQuantity}
        onPlaceOrder={handlePlaceOrder}
        onAddPaymentMethod={handleAddPaymentMethod}
        onRefreshState={setStoreState}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onTrackNewOrder={() => handleNavigateAccount('orders')}
      />
    </div>
  );
}
