import { useState } from 'react';
import { LogOut, Menu, ShoppingBag, X } from 'lucide-react';

export const Navbar = ({
  activeView,
  activeDashboardTab,
  authMode,
  cartCount,
  currentUser,
  onNavigateShop,
  onNavigateAccount,
  onNavigateAdmin,
  onNavigateAuth,
  onLogout,
  onOpenCart,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLinkClick = (action) => {
    setMobileMenuOpen(false);
    action();
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <header className="sticky top-0 z-40 bg-[#F6F1E9]/95 backdrop-blur-sm border-b border-[#D8CCB8]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#1B3B2B] focus:text-white focus:rounded-md focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleLinkClick(() => onNavigateShop());
          }}
          className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[#1B3B2B] whitespace-nowrap shrink-0"
        >
          Sylvan Grove
        </a>

        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6">
          <button
            type="button"
            onClick={() => onNavigateShop('catalog-section')}
            className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activeView === 'shop'
                ? 'text-[#1B3B2B] border-[#1B3B2B]'
                : 'text-[#4B5548] border-transparent hover:text-[#1C1915] hover:border-[#D8CCB8]'
            }`}
          >
            Shop Harvest
          </button>
          <button
            type="button"
            onClick={() => onNavigateShop('recommendations-section')}
            className="text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent text-[#4B5548] hover:text-[#1C1915] hover:border-[#D8CCB8] transition-colors cursor-pointer"
          >
            For You
          </button>

          {currentUser ? (
            <>
              <button
                type="button"
                onClick={() => onNavigateAccount('overview')}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  activeView === 'account' && activeDashboardTab !== 'orders'
                    ? 'text-[#1B3B2B] border-[#1B3B2B]'
                    : 'text-[#4B5548] border-transparent hover:text-[#1C1915] hover:border-[#D8CCB8]'
                }`}
              >
                Account
              </button>
              <button
                type="button"
                onClick={() => onNavigateAccount('orders')}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  activeView === 'account' && activeDashboardTab === 'orders'
                    ? 'text-[#1B3B2B] border-[#1B3B2B]'
                    : 'text-[#4B5548] border-transparent hover:text-[#1C1915] hover:border-[#D8CCB8]'
                }`}
              >
                Order History
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onNavigateAdmin}
                  className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                    activeView === 'admin'
                      ? 'text-[#1B3B2B] border-[#1B3B2B]'
                      : 'text-[#4B5548] border-transparent hover:text-[#1C1915] hover:border-[#D8CCB8]'
                  }`}
                >
                  Admin
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onNavigateAuth('login')}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  activeView === 'auth' && authMode === 'login'
                    ? 'text-[#1B3B2B] border-[#1B3B2B]'
                    : 'text-[#4B5548] border-transparent hover:text-[#1C1915] hover:border-[#D8CCB8]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => onNavigateAuth('register')}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  activeView === 'auth' && authMode === 'register'
                    ? 'text-[#1B3B2B] border-[#1B3B2B]'
                    : 'text-[#4B5548] border-transparent hover:text-[#1C1915] hover:border-[#D8CCB8]'
                }`}
              >
                Register
              </button>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {currentUser && (
            <button
              type="button"
              onClick={onLogout}
              aria-label={`Sign out ${currentUser.fullName}`}
              className="hidden sm:inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-[#1C1915] text-xs font-medium hover:bg-[#EBE2D3] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenCart}
            aria-label={`Open shopping bag, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-medium hover:bg-[#142C20] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            <span>Bag</span>
            <span className="font-mono tabular-nums text-xs bg-[#FCFAF6]/15 px-1.5 py-0.5 rounded">
              {cartCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-[#1C1915] hover:bg-[#EBE2D3] transition-colors"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav
          id="mobile-nav-drawer"
          aria-label="Mobile navigation"
          className="md:hidden border-t border-[#D8CCB8] bg-[#FCFAF6] px-4 py-3 space-y-1"
        >
          <button
            type="button"
            onClick={() => handleLinkClick(() => onNavigateShop('catalog-section'))}
            className="w-full text-left px-3 py-3 rounded-md text-base font-medium text-[#1C1915] hover:bg-[#EBE2D3]/60 transition-colors"
          >
            Shop Harvest
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick(() => onNavigateShop('recommendations-section'))}
            className="w-full text-left px-3 py-3 rounded-md text-base font-medium text-[#1C1915] hover:bg-[#EBE2D3]/60 transition-colors"
          >
            For You
          </button>

          {currentUser ? (
            <>
              <button
                type="button"
                onClick={() => handleLinkClick(() => onNavigateAccount('overview'))}
                className="w-full text-left px-3 py-3 rounded-md text-base font-medium text-[#1C1915] hover:bg-[#EBE2D3]/60 transition-colors"
              >
                Account &amp; Profile
              </button>
              <button
                type="button"
                onClick={() => handleLinkClick(() => onNavigateAccount('orders'))}
                className="w-full text-left px-3 py-3 rounded-md text-base font-medium text-[#1C1915] hover:bg-[#EBE2D3]/60 transition-colors"
              >
                Order History
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleLinkClick(onNavigateAdmin)}
                  className="w-full text-left px-3 py-3 rounded-md text-base font-semibold text-[#1B3B2B] hover:bg-[#E6EDE8] transition-colors"
                >
                  Admin Dashboard
                </button>
              )}
              <button
                type="button"
                onClick={() => handleLinkClick(onLogout)}
                className="w-full text-left px-3 py-3 rounded-md text-base font-medium text-[#7A3E1C] hover:bg-[#EBE2D3]/60 transition-colors"
              >
                Sign Out ({currentUser.fullName})
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleLinkClick(() => onNavigateAuth('login'))}
                className="w-full text-left px-3 py-3 rounded-md text-base font-medium text-[#1C1915] hover:bg-[#EBE2D3]/60 transition-colors"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => handleLinkClick(() => onNavigateAuth('register'))}
                className="w-full text-left px-3 py-3 rounded-md text-base font-semibold text-[#1B3B2B] hover:bg-[#E6EDE8] transition-colors"
              >
                Create Account
              </button>
            </>
          )}
        </nav>
      )}
    </header>
  );
};
