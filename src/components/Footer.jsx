export const Footer = ({
  currentUser,
  onNavigateShop,
  onNavigateAccount,
  onNavigateAdmin,
  onNavigateAuth,
  onLogout,
}) => {
  const isAdmin = currentUser?.role === 'admin';

  return (
    <footer className="bg-[#1B3B2B] text-[#F6F1E9] border-t border-[#142C20]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="sm:col-span-2">
            <p className="font-display text-2xl font-semibold text-[#FCFAF6]">Sylvan Grove</p>
            <p className="text-sm text-[#D8CCB8] mt-2 max-w-md leading-relaxed">
              Single-orchard organic walnuts, almonds, hazelnuts, and pecans harvested sustainably
              and shipped cold-fresh to order.
            </p>
          </div>

          <div>
            <h3 className="font-sans text-sm font-semibold text-[#FCFAF6] mb-3">Provisions</h3>
            <ul className="space-y-2 text-sm text-[#D8CCB8]">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateShop('catalog-section')}
                  className="hover:text-white hover:underline cursor-pointer"
                >
                  Shop All Harvests
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateShop('recommendations-section')}
                  className="hover:text-white hover:underline cursor-pointer"
                >
                  Personalized Picks
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-sans text-sm font-semibold text-[#FCFAF6] mb-3">
              {currentUser ? 'Account & Access' : 'Member Access'}
            </h3>
            <ul className="space-y-2 text-sm text-[#D8CCB8]">
              {currentUser ? (
                <>
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigateAccount('overview')}
                      className="hover:text-white hover:underline cursor-pointer"
                    >
                      Account Dashboard
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigateAccount('orders')}
                      className="hover:text-white hover:underline cursor-pointer"
                    >
                      Track Order History
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigateAccount('billing')}
                      className="hover:text-white hover:underline cursor-pointer"
                    >
                      Saved Payment Cards
                    </button>
                  </li>
                  {isAdmin && (
                    <li>
                      <button
                        type="button"
                        onClick={onNavigateAdmin}
                        className="hover:text-white hover:underline cursor-pointer"
                      >
                        Admin Order Console
                      </button>
                    </li>
                  )}
                  <li>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="hover:text-white hover:underline cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigateAuth('login')}
                      className="hover:text-white hover:underline cursor-pointer"
                    >
                      Sign In
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigateAuth('register')}
                      className="hover:text-white hover:underline cursor-pointer"
                    >
                      Create Account
                    </button>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[#FCFAF6]/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#D8CCB8]">
          <p>© 2026 Sylvan Grove Orchard Co. · CCOF Organic Certified · WCAG 2.1 AA Accessible</p>
          <p>Free carbon-neutral delivery on orders over $65</p>
        </div>
      </div>
    </footer>
  );
};
