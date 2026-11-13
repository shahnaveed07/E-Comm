import { useEffect, useState } from 'react';
import { ShoppingBag, X } from 'lucide-react';
import { WEIGHT_OPTIONS } from '../data/catalog.js';
import { calculateUnitPrice, formatCurrency } from '../utils/commerce.js';
import { ProductReviews } from './ProductReviews.jsx';

export const ProductModal = ({
  product,
  reviews,
  orders,
  currentUser,
  onClose,
  onAddToCart,
  onSubmitReview,
  onDeleteReview,
  onRequestAuth,
}) => {
  const [weightSize, setWeightSize] = useState('16oz');

  useEffect(() => {
    if (!product) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [product, onClose]);

  if (!product) return null;

  const activePrice = calculateUnitPrice(product.basePrice16oz, weightSize);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-product-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1915]/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close product details"
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-md border border-[#D8CCB8] bg-[#FCFAF6] text-[#1C1915] flex items-center justify-center hover:bg-[#EBE2D3] cursor-pointer"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="aspect-[4/3] md:aspect-auto md:h-full bg-[#EBE2D3]">
            <img
              src={product.imageUrl}
              alt={`${product.name} harvest view`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <p className="text-xs text-[#4B5548] flex items-center gap-1.5 flex-wrap">
                <span>{product.origin}</span>
                <span aria-hidden="true">·</span>
                <span>{product.harvestBatch}</span>
              </p>

              <h2
                id="modal-product-title"
                className="font-display text-2xl font-semibold text-[#1C1915] mt-1.5"
              >
                {product.name}
              </h2>

              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="font-mono tabular-nums text-xl font-semibold text-[#1B3B2B]">
                  {formatCurrency(activePrice)}
                </span>
                <span className="text-xs text-[#4B5548]">
                  {WEIGHT_OPTIONS[weightSize].label}
                </span>
              </div>

              <p className="text-sm text-[#4B5548] leading-relaxed mt-4">
                {product.shortDescription}
              </p>

              <div className="mt-4 p-3.5 rounded-lg bg-[#F6F1E9] border border-[#EBE2D3]">
                <p className="text-xs font-semibold text-[#1C1915]">Tasting &amp; Texture</p>
                <p className="text-xs text-[#4B5548] mt-1">{product.tastingNotes}</p>
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold text-[#1C1915] mb-2">
                  Nutrition per {product.nutritionPerServing.servingSize}
                </p>
                <dl className="grid grid-cols-4 gap-2 text-center border border-[#D8CCB8] rounded-lg p-2.5 bg-[#FCFAF6]">
                  <div>
                    <dt className="text-[11px] text-[#4B5548]">Calories</dt>
                    <dd className="font-mono tabular-nums text-sm font-semibold text-[#1C1915]">
                      {product.nutritionPerServing.calories}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-[#4B5548]">Protein</dt>
                    <dd className="font-mono tabular-nums text-sm font-semibold text-[#1C1915]">
                      {product.nutritionPerServing.proteinGrams}g
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-[#4B5548]">Good Fats</dt>
                    <dd className="font-mono tabular-nums text-sm font-semibold text-[#1C1915]">
                      {product.nutritionPerServing.healthyFatsGrams}g
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-[#4B5548]">Fiber</dt>
                    <dd className="font-mono tabular-nums text-sm font-semibold text-[#1C1915]">
                      {product.nutritionPerServing.fiberGrams}g
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold text-[#1C1915] mb-2">Bag Size</p>
                <div role="group" aria-label="Weight size" className="grid grid-cols-3 gap-2">
                  {['8oz', '16oz', '32oz'].map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={weightSize === size}
                      onClick={() => setWeightSize(size)}
                      className={`min-h-[40px] px-2 py-1.5 rounded text-xs font-medium cursor-pointer ${
                        weightSize === size
                          ? 'bg-[#EBE2D3] text-[#1C1915] border border-[#1B3B2B] font-semibold'
                          : 'bg-[#F6F1E9] text-[#4B5548] border border-[#D8CCB8]'
                      }`}
                    >
                      {WEIGHT_OPTIONS[size].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  onAddToCart(product, weightSize);
                  onClose();
                }}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#142C20] transition-colors cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                <span>Add to Bag · {formatCurrency(activePrice)}</span>
              </button>
            </div>
          </div>
        </div>

        <ProductReviews
          product={product}
          reviews={reviews}
          orders={orders}
          currentUser={currentUser}
          onSubmitReview={onSubmitReview}
          onDeleteReview={onDeleteReview}
          onRequestAuth={(mode) => {
            onClose();
            onRequestAuth(mode);
          }}
        />
      </div>
    </div>
  );
};
