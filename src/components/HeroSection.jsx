import { useState } from 'react';
import { ArrowRight, Leaf } from 'lucide-react';

export const HeroSection = ({ onShopClick, onTrackOrdersClick }) => {
  const [imgError, setImgError] = useState(false);

  return (
    <section aria-labelledby="hero-heading" className="bg-[#F6F1E9] border-b border-[#D8CCB8]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-5 flex flex-col justify-center">
            <p className="text-xs sm:text-sm font-medium tracking-wide text-[#4B5548] mb-3">
              CCOF Certified Organic · 2026 Autumn Orchard Harvest
            </p>
            <h1
              id="hero-heading"
              className="font-display text-3xl sm:text-4xl lg:text-[2.85rem] leading-[1.12] font-semibold text-[#1C1915] mb-5"
              style={{ textWrap: 'balance' }}
            >
              Heirloom walnuts &amp; almonds, cold-shelled to order.
            </h1>
            <p className="text-base text-[#4B5548] leading-relaxed max-w-xl mb-8">
              Direct from small family groves in California and Oregon. Freshly shelled each week
              and shipped plastic-free with complimentary carbon-neutral delivery on orders over $65.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onShopClick}
                className="inline-flex items-center gap-2 min-h-[48px] px-6 py-3 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold hover:bg-[#142C20] transition-colors cursor-pointer"
              >
                <span>Explore Harvest</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onTrackOrdersClick}
                className="inline-flex items-center min-h-[48px] px-5 py-3 rounded-md border border-[#1B3B2B]/30 bg-[#FCFAF6] text-[#1B3B2B] text-sm font-semibold hover:bg-[#EBE2D3]/70 transition-colors cursor-pointer"
              >
                Track Orders
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="h-full min-h-[260px] sm:min-h-[340px] lg:min-h-[420px] rounded-xl overflow-hidden border border-[#D8CCB8] bg-[#EBE2D3]">
              {!imgError ? (
                <img
                  src="/src/assets/images/hero_walnut_orchard_1794573485472.jpg"
                  alt="Raw organic walnut halves and whole almonds in a stoneware bowl on a sunlit orchard oak table"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#EBE2D3] to-[#D8CCB8] text-[#1B3B2B]">
                  <Leaf className="w-10 h-10 mb-3" aria-hidden="true" />
                  <p className="font-display text-xl font-semibold">Sylvan Grove Autumn Harvest</p>
                  <p className="text-sm text-[#4B5548] mt-1">
                    Yolo County Walnuts &amp; Capay Valley Almonds
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-[#D8CCB8] grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="font-display text-lg font-semibold text-[#1C1915]">
              Cold-Shelled Weekly
            </p>
            <p className="text-sm text-[#4B5548] mt-1">
              Stored in-shell until order week to preserve natural oils and sweet crunch.
            </p>
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-[#1C1915]">
              Free Delivery Over $65
            </p>
            <p className="text-sm text-[#4B5548] mt-1">
              Carbon-neutral ground courier with live 4-stage tracking from shelling to doorstep.
            </p>
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-[#1C1915]">
              Zero Seed Oils or Glazes
            </p>
            <p className="text-sm text-[#4B5548] mt-1">
              Pure organic tree nuts—raw, sprouted, or dry-roasted with Pacific flake salt.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
