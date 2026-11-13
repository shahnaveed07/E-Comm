import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { DEFAULT_PUBLIC_PREFERENCES, INITIAL_CATALOG, INITIAL_REVIEWS } from './data/catalog.js';
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
  paymentMethods: [],
  invoices: [],
  orders: [],
};

const ROAST_LABELS = {
  raw_sprouted: 'Raw & Sprouted',
  dry_roasted_unsalted: 'Dry-Roasted Unsalted',
  lightly_salted: 'Lightly Sea Salted',
};

function getInitialViewFromHash() {
  if (typeof window === 'undefined') return 'shop';
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
  const [authMode, setAuthMode] = useState(() =>
    typeof window !== 'undefined' && window.location.hash.toLowerCase() === '#register'
      ? 'register'
      : 'login'
  );
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
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
    fetch('/api/state')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load state'))))
      .then((data) => {
        if (mounted && data && Array.isArray(data.catalog)) {
          setStoreState(data);
        }
      })
      .catch(() => {
        // Keep neutral public state if API unavailable
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

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

  const showNotice = useCallback((message) => {
    setLiveNotice(message);
    window.setTimeout(() => {
      setLiveNotice((curr) => (curr === message ? null : curr));
    }, 4000);
  }, []);

  const currentUser = storeState.user || null;

  const cartTotals = useMemo(
    () => calculateCartTotals(cartItems, storeState.catalog),
    [cartItems, storeState.catalog]
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
    setAuthMode(mode);
    setActiveView('auth');
    updateHash(mode === 'register' ? '#register' : '#login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogin = async ({ email, password }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Sign in failed.');
    }
    setStoreState(data.state);
    showNotice(`Welcome back, ${data.user.fullName}.`);
    return data;
  };

  const handleRegister = async ({ fullName, email, password }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Account registration failed.');
    }
    setStoreState(data.state);
    showNotice(`Account created for ${data.user.fullName}.`);
    return data;
  };

  const handleLogout = async () => {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setStoreState(data.state);
    } else {
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

  const handleUpdatePreferences = async (patch, notice) => {
    const res = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setStoreState(updated);
      if (notice) showNotice(notice);
    }
  };

  const handleAddPaymentMethod = async (payload) => {
    const res = await fetch('/api/payment-methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Could not save payment method.');
    }
    const data = await res.json();
    setStoreState(data.state);
    showNotice(`Saved ${data.card.brand} ending in ${data.card.last4}.`);
    return data.card;
  };

  const handleSetDefaultCard = async (id) => {
    const res = await fetch(`/api/payment-methods/${id}/default`, {
      method: 'PATCH',
    });
    if (res.ok) {
      const updated = await res.json();
      setStoreState(updated);
      showNotice('Updated default checkout card.');
    }
  };

  const handleRemoveCard = async (id) => {
    const res = await fetch(`/api/payment-methods/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const updated = await res.json();
      setStoreState(updated);
      showNotice('Payment method removed.');
    }
  };

  const handlePlaceOrder = async (payload) => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Checkout failed.');
    }
    const data = await res.json();
    setStoreState(data.state);
    setCartItems([]);
    showNotice(`Order #${data.order.orderNumber} placed successfully.`);
    return data.order;
  };

  const handleCreateAdminOrder = async (payload) => {
    const res = await fetch('/api/admin/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Could not publish order.');
    }
    const data = await res.json();
    setStoreState(data.state);
    showNotice(
      data.order.isLive
        ? `Order #${data.order.orderNumber} published live.`
        : `Draft order #${data.order.orderNumber} saved.`
    );
    return data.order;
  };

  const handleUpdateAdminOrder = async (id, patch, notice) => {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      setStoreState(data.state);
      if (notice) showNotice(notice);
    }
  };

  const handleDeleteAdminOrder = async (id, orderNumber) => {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const updated = await res.json();
      setStoreState(updated);
      showNotice(`Removed order #${orderNumber}.`);
    }
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
    const res = await fetch(`/api/products/${encodeURIComponent(productId)}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not post your review.');
    }
    setStoreState(data.state);
    showNotice('Thank you! Your harvest review is now live.');
    return data.review;
  };

  const handleDeleteReview = async (reviewId) => {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const updated = await res.json();
      setStoreState(updated);
      showNotice('Review removed.');
    }
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
              key={authMode}
              initialMode={authMode}
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
                description="Sign in with an authorized administrator account to access the Admin Order Console."
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
                  with customer permissions. Only authorized administrators may open or manage the Admin Order Console.
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
          onAddToCart={handleAddToCart}
          onSelectProduct={setSelectedProduct}
        />
        <RecommendationsSection
          recommendations={recommendations}
          preferredRoastLabel={ROAST_LABELS[storeState.preferences.preferredRoast]}
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
        shippingAddress={storeState.preferences.shippingAddress}
        onClose={() => setIsCartOpen(false)}
        onUpdateQuantity={handleUpdateCartQuantity}
        onPlaceOrder={handlePlaceOrder}
        onAddPaymentMethod={handleAddPaymentMethod}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onTrackNewOrder={() => handleNavigateAccount('orders')}
      />
    </div>
  );
}
