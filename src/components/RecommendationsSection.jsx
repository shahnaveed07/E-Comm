import { ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { calculateUnitPrice, formatCurrency } from '../utils/commerce.js';

export const RecommendationsSection = ({
  recommendations,
  preferredRoastLabel,
  onAddToCart,
  onSelectProduct,
  onOpenPreferences,
}) => {
  return (
    <section
      id="recommendations-section"
      aria-labelledby="recommendations-heading"
      className="py-12 sm:py-16 bg-[#EBE2D3]/55 border-t border-[#D8CCB8]"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-medium text-[#7A3E1C] mb-1">
              Tailored to your {preferredRoastLabel} profile &amp; order history
            </p>
            <h2
              id="recommendations-heading"
              className="font-display text-2xl sm:text-3xl font-semibold text-[#1C1915]"
            >
              Recommended for Your Pantry
            </h2>
          </div>

          <button
            type="button"
            onClick={onOpenPreferences}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-medium text-[#1C1915] hover:bg-[#EBE2D3] transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#1B3B2B]" aria-hidden="true" />
            <span>Tune Preferences</span>
          </button>
        </div>

        {recommendations.length === 0 ? (
          <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-8 text-center">
            <p className="font-display text-lg font-semibold text-[#1C1915]">
              All matching harvests are currently filtered by your allergen exclusions
            </p>
            <p className="text-sm text-[#4B5548] mt-1 mb-4">
              Update your allergen or roast preferences to unlock personalized orchard pairings.
            </p>
            <button
              type="button"
              onClick={onOpenPreferences}
              className="min-h-[44px] px-5 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-medium cursor-pointer"
            >
              Adjust Dietary Preferences
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recommendations.map(({ product, matchReason }) => {
              const price16oz = calculateUnitPrice(product.basePrice16oz, '16oz');
              return (
                <article
                  key={product.id}
                  className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start gap-4">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-20 h-20 rounded-lg object-cover shrink-0 bg-[#EBE2D3] border border-[#D8CCB8]"
                      />
                      <div className="min-w-0">
                        <p className="text-xs text-[#4B5548]">
                          {product.categoryLabel} · {product.roastLabel}
                        </p>
                        <h3 className="font-display text-lg font-semibold text-[#1C1915] leading-snug mt-0.5">
                          {product.name}
                        </h3>
                        <p className="font-mono tabular-nums text-sm font-semibold text-[#1B3B2B] mt-1">
                          {formatCurrency(price16oz)}{' '}
                          <span className="font-sans font-normal text-xs text-[#4B5548]">
                            / 16 oz bag
                          </span>
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-xs sm:text-sm text-[#1B3B2B] bg-[#E6EDE8] px-3 py-2 rounded-md font-medium">
                      {matchReason}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#EBE2D3]">
                    <button
                      type="button"
                      onClick={() => onAddToCart(product, '16oz')}
                      className="flex-1 min-h-[42px] px-3 py-2 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#142C20] transition-colors cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Add 16 oz to Bag</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectProduct(product)}
                      className="min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-[#1C1915] text-xs font-semibold inline-flex items-center justify-center hover:bg-[#EBE2D3] transition-colors cursor-pointer"
                    >
                      Notes
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
