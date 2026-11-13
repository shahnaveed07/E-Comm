import { useMemo, useState } from 'react';
import { Check, Leaf, Search, Star } from 'lucide-react';
import { WEIGHT_OPTIONS } from '../data/catalog.js';
import { calculateProductRatingSummary, calculateUnitPrice, formatCurrency } from '../utils/commerce.js';

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Harvests' },
  { id: 'walnuts', label: 'Walnuts' },
  { id: 'almonds', label: 'Almonds' },
  { id: 'pistachios_hazelnuts', label: 'Pistachios & Hazelnuts' },
  { id: 'pecans_medleys', label: 'Pecans & Medleys' },
];

const ROAST_FILTERS = [
  { id: 'all', label: 'All Roasts' },
  { id: 'raw_sprouted', label: 'Raw & Sprouted' },
  { id: 'dry_roasted_unsalted', label: 'Dry-Roasted Unsalted' },
  { id: 'lightly_salted', label: 'Lightly Sea Salted' },
];

export const ProductCatalog = ({ catalog, reviews = [], onAddToCart, onSelectProduct }) => {
  const [category, setCategory] = useState('all');
  const [roast, setRoast] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWeights, setSelectedWeights] = useState({});
  const [justAddedId, setJustAddedId] = useState(null);
  const [failedImages, setFailedImages] = useState({});

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((product) => {
      if (category !== 'all' && product.category !== category) return false;
      if (roast !== 'all' && product.roastProfile !== roast) return false;
      if (q) {
        const hay = `${product.name} ${product.origin} ${product.shortDescription} ${product.roastLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, category, roast, searchQuery]);

  const handleAdd = (product) => {
    const weight = selectedWeights[product.id] ?? '16oz';
    onAddToCart(product, weight);
    setJustAddedId(product.id);
    window.setTimeout(() => {
      setJustAddedId((curr) => (curr === product.id ? null : curr));
    }, 1600);
  };

  return (
    <section
      id="catalog-section"
      aria-labelledby="catalog-heading"
      className="py-12 sm:py-16 bg-[#F6F1E9]"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <h2
              id="catalog-heading"
              className="font-display text-2xl sm:text-3xl font-semibold text-[#1C1915]"
            >
              Orchard Provisions
            </h2>
            <p className="text-sm sm:text-base text-[#4B5548] mt-1.5">
              Select a bag weight and order fresh single-orchard harvests shipped directly to your door.
            </p>
          </div>

          <div className="w-full md:w-72">
            <label htmlFor="catalog-search" className="sr-only">
              Search organic nuts by name, origin, or roast
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-[#4B5548] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="catalog-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search walnuts, almonds, origin..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm text-[#1C1915] placeholder:text-[#6B7268]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-8 mb-8 border-b border-[#D8CCB8]">
          <div role="group" aria-label="Filter by nut category" className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((tab) => {
              const active = category === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategory(tab.id)}
                  aria-pressed={active}
                  className={`min-h-[40px] px-4 py-2 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1B3B2B] text-[#FCFAF6]'
                      : 'bg-[#FCFAF6] text-[#1C1915] border border-[#D8CCB8] hover:bg-[#EBE2D3]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <label htmlFor="roast-filter" className="text-xs font-medium text-[#4B5548] whitespace-nowrap">
              Roast profile
            </label>
            <select
              id="roast-filter"
              value={roast}
              onChange={(e) => setRoast(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm text-[#1C1915]"
            >
              {ROAST_FILTERS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-10 text-center">
            <p className="font-display text-xl font-semibold text-[#1C1915]">
              No harvests match those filters
            </p>
            <p className="text-sm text-[#4B5548] mt-1 mb-5">
              Try clearing your search or selecting all roast profiles.
            </p>
            <button
              type="button"
              onClick={() => {
                setCategory('all');
                setRoast('all');
                setSearchQuery('');
              }}
              className="min-h-[44px] px-5 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-medium hover:bg-[#142C20] transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {filteredProducts.map((product) => {
              const weight = selectedWeights[product.id] ?? '16oz';
              const activePrice = calculateUnitPrice(product.basePrice16oz, weight);
              const isAdded = justAddedId === product.id;

              return (
                <article
                  key={product.id}
                  className="flex flex-col rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] overflow-hidden transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <button
                    type="button"
                    onClick={() => onSelectProduct(product)}
                    aria-label={`View harvest details for ${product.name}`}
                    className="relative aspect-[4/3] w-full bg-[#EBE2D3] overflow-hidden text-left cursor-pointer group"
                  >
                    {!failedImages[product.id] ? (
                      <img
                        src={product.imageUrl}
                        alt={`${product.name} from ${product.origin}`}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [product.id]: true }))
                        }
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#EBE2D3] text-[#1B3B2B]">
                        <Leaf className="w-8 h-8 mb-2" aria-hidden="true" />
                        <span className="font-display font-medium text-base">{product.name}</span>
                      </div>
                    )}
                  </button>

                  <div className="p-5 sm:p-6 flex flex-col flex-1">
                    <p className="text-xs text-[#4B5548] flex items-center gap-1.5 flex-wrap">
                      <span>{product.origin}</span>
                      <span aria-hidden="true">·</span>
                      <span>{product.roastLabel}</span>
                      {product.featuredTag && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[#7A3E1C]">{product.featuredTag}</span>
                        </>
                      )}
                    </p>

                    <div className="mt-1.5 flex items-start justify-between gap-3">
                      <h3 className="font-display text-xl font-semibold text-[#1C1915] leading-snug">
                        <button
                          type="button"
                          onClick={() => onSelectProduct(product)}
                          className="text-left hover:text-[#1B3B2B] hover:underline cursor-pointer"
                        >
                          {product.name}
                        </button>
                      </h3>
                      <div className="text-right shrink-0">
                        <span className="font-mono tabular-nums text-base font-semibold text-[#1C1915]">
                          {formatCurrency(activePrice)}
                        </span>
                        <span className="block text-[11px] text-[#4B5548]">
                          {WEIGHT_OPTIONS[weight].label}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-[#4B5548] leading-relaxed mt-2 line-clamp-2 min-h-[2.625rem]">
                      {product.shortDescription}
                    </p>

                    <div className="mt-3 mb-4 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-[#1B3B2B]">
                        {product.nutritionPerServing.highlightNutrient}
                      </p>

                      {(() => {
                        const ratingInfo = calculateProductRatingSummary(reviews, product.id);
                        return (
                          <button
                            type="button"
                            onClick={() => onSelectProduct(product)}
                            aria-label={`Read ${ratingInfo.totalReviews} customer reviews for ${product.name}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#1C1915] hover:text-[#1B3B2B] hover:underline shrink-0 cursor-pointer"
                          >
                            <Star
                              className="w-3.5 h-3.5 fill-[#7A3E1C] text-[#7A3E1C]"
                              aria-hidden="true"
                            />
                            <span className="font-mono tabular-nums font-semibold">
                              {ratingInfo.totalReviews > 0 ? ratingInfo.averageRating.toFixed(1) : 'New'}
                            </span>
                            <span className="text-[#4B5548] font-mono tabular-nums">
                              ({ratingInfo.totalReviews})
                            </span>
                          </button>
                        );
                      })()}
                    </div>

                    <div className="mt-auto pt-4 border-t border-[#EBE2D3] space-y-3">
                      <div
                        role="group"
                        aria-label={`Select weight for ${product.name}`}
                        className="grid grid-cols-3 gap-1.5"
                      >
                        {['8oz', '16oz', '32oz'].map((size) => {
                          const selected = weight === size;
                          return (
                            <button
                              key={size}
                              type="button"
                              aria-pressed={selected}
                              onClick={() =>
                                setSelectedWeights((prev) => ({ ...prev, [product.id]: size }))
                              }
                              className={`min-h-[36px] px-2 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                                selected
                                  ? 'bg-[#EBE2D3] text-[#1C1915] border border-[#1B3B2B] font-semibold'
                                  : 'bg-[#F6F1E9] text-[#4B5548] border border-transparent hover:border-[#D8CCB8]'
                              }`}
                            >
                              {WEIGHT_OPTIONS[size].size.replace('oz', ' oz')}
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAdd(product)}
                          className={`flex-1 min-h-[44px] px-4 py-2.5 rounded-md text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                            isAdded
                              ? 'bg-[#2C593F] text-white'
                              : 'bg-[#1B3B2B] text-[#FCFAF6] hover:bg-[#142C20]'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-4 h-4" aria-hidden="true" />
                              <span>Added to Bag</span>
                            </>
                          ) : (
                            <span>Add to Bag</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectProduct(product)}
                          aria-label={`Inspect nutrition and harvest notes for ${product.name}`}
                          className="min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-sm font-medium text-[#1C1915] hover:bg-[#EBE2D3] transition-colors cursor-pointer"
                        >
                          Notes
                        </button>
                      </div>
                    </div>
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
