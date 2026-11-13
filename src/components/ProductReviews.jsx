import React, { useMemo, useState } from 'react';
import { CheckCircle2, MessageSquarePlus, Star, Trash2 } from 'lucide-react';
import {
  calculateProductRatingSummary,
  formatReadableDate,
  hasUserPurchasedProduct,
  validateProductReviewInput,
} from '../utils/commerce.js';

function StarDisplay({ rating, size = 'sm' }) {
  const iconClass = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const rounded = Math.round(Number(rating) || 0);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${iconClass} ${
            star <= rounded
              ? 'fill-[#7A3E1C] text-[#7A3E1C]'
              : 'fill-transparent text-[#D8CCB8]'
          }`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export const ProductReviews = ({
  product,
  reviews,
  orders,
  currentUser,
  onSubmitReview,
  onDeleteReview,
  onRequestAuth,
}) => {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const productReviews = useMemo(
    () =>
      (reviews || [])
        .filter((r) => r.productId === product.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [reviews, product.id]
  );

  const summary = useMemo(
    () => calculateProductRatingSummary(reviews, product.id),
    [reviews, product.id]
  );

  const isVerifiedBuyer = currentUser
    ? hasUserPurchasedProduct(orders, product.id, currentUser.id)
    : false;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const check = validateProductReviewInput({ rating, title, comment });
    if (!check.valid) {
      setFormError(check.errors.rating || check.errors.title || check.errors.comment);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitReview(product.id, {
        rating,
        title: title.trim(),
        comment: comment.trim(),
      });
      setRating(5);
      setTitle('');
      setComment('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to submit review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="product-reviews-heading"
      className="border-t border-[#D8CCB8] bg-[#F6F1E9]/60 p-6 sm:p-8 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h3
            id="product-reviews-heading"
            className="font-display text-xl sm:text-2xl font-semibold text-[#1C1915]"
          >
            Customer Reviews &amp; Harvest Ratings
          </h3>
          <p className="text-xs sm:text-sm text-[#4B5548] mt-1">
            Tasting notes, kernel freshness, and roast feedback from Sylvan Grove members.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono tabular-nums text-2xl font-semibold text-[#1C1915]">
            {summary.totalReviews > 0 ? summary.averageRating.toFixed(1) : '—'}
          </span>
          <div>
            <StarDisplay rating={summary.averageRating} size="md" />
            <p className="text-xs text-[#4B5548] font-mono tabular-nums mt-0.5">
              {summary.totalReviews} {summary.totalReviews === 1 ? 'review' : 'reviews'}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Distribution + Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Rating Breakdown */}
        <div className="lg:col-span-5 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-4 space-y-2.5 h-fit">
          <p className="text-xs font-semibold text-[#1C1915]">Rating Breakdown</p>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.distribution[star] || 0;
            const pct =
              summary.totalReviews > 0 ? Math.round((count / summary.totalReviews) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-2.5 text-xs">
                <span className="w-11 font-mono tabular-nums text-[#1C1915] shrink-0">
                  {star} star
                </span>
                <div className="flex-1 h-2 rounded-full bg-[#EBE2D3] overflow-hidden">
                  <div
                    className="h-full bg-[#1B3B2B] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono tabular-nums text-[#4B5548]">
                  {count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Logged-in Review Composer or Auth Gate */}
        <div className="lg:col-span-7 rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-5">
          {currentUser ? (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#1C1915] flex items-center gap-1.5">
                  <MessageSquarePlus className="w-4 h-4 text-[#1B3B2B]" aria-hidden="true" />
                  <span>Share Your Feedback</span>
                </p>
                {isVerifiedBuyer && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B3B2B]">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Verified Purchaser</span>
                  </span>
                )}
              </div>

              {formError && (
                <div
                  role="alert"
                  className="p-3 rounded-md bg-[#9E2A2B]/10 border border-[#9E2A2B]/30 text-xs font-medium text-[#9E2A2B]"
                >
                  {formError}
                </div>
              )}

              <div>
                <span id="review-star-label" className="block text-xs font-semibold text-[#1C1915] mb-1.5">
                  Your Rating
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="review-star-label"
                  className="inline-flex items-center gap-1.5"
                >
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = (hoverRating || rating) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={rating === star}
                        aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="w-9 h-9 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] flex items-center justify-center hover:border-[#1B3B2B] cursor-pointer"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            active
                              ? 'fill-[#7A3E1C] text-[#7A3E1C]'
                              : 'fill-transparent text-[#4B5548]'
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                  <span className="ml-2 text-xs font-mono tabular-nums text-[#4B5548]">
                    {rating}/5
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="rev-title" className="block text-xs font-semibold text-[#1C1915] mb-1">
                  Review Headline
                </label>
                <input
                  id="rev-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Crisp texture and sweet fresh flavor"
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                />
              </div>

              <div>
                <label htmlFor="rev-comment" className="block text-xs font-semibold text-[#1C1915] mb-1">
                  Tasting &amp; Freshness Notes
                </label>
                <textarea
                  id="rev-comment"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="How were the crunch, roast balance, and packaging on arrival?"
                  className="w-full px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[42px] px-5 py-2 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-xs sm:text-sm font-semibold hover:bg-[#142C20] disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? 'Posting Review...' : 'Post Review'}
              </button>
            </form>
          ) : (
            <div className="space-y-3 py-1">
              <p className="font-display text-lg font-semibold text-[#1C1915]">
                Have you tasted this harvest?
              </p>
              <p className="text-sm text-[#4B5548]">
                Sign in or create a free Sylvan Grove account to leave a star rating and share feedback on your purchases.
              </p>
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onRequestAuth('login')}
                  className="min-h-[40px] px-4 py-2 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-xs font-semibold hover:bg-[#142C20] cursor-pointer"
                >
                  Sign In to Review
                </button>
                <button
                  type="button"
                  onClick={() => onRequestAuth('register')}
                  className="min-h-[40px] px-4 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-xs font-semibold text-[#1C1915] hover:bg-[#EBE2D3] cursor-pointer"
                >
                  Create Account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reviews List */}
      <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] px-5">
        {productReviews.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#4B5548]">
            No customer reviews yet for {product.name}. Be the first member to share tasting notes.
          </p>
        ) : (
          <ul className="divide-y divide-[#EBE2D3]">
            {productReviews.map((rev) => {
              const canDelete =
                currentUser && (currentUser.id === rev.userId || currentUser.role === 'admin');
              return (
                <li key={rev.id} className="py-4 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <StarDisplay rating={rev.rating} />
                      <span className="font-semibold text-[#1C1915]">{rev.authorName}</span>
                      {rev.verifiedPurchase && (
                        <span className="text-[#1B3B2B] font-semibold">· Verified Purchase</span>
                      )}
                      <span className="text-[#4B5548] font-mono tabular-nums">
                        · {formatReadableDate(rev.createdAt)}
                      </span>
                    </div>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDeleteReview(rev.id)}
                        aria-label={`Delete review titled ${rev.title}`}
                        className="w-8 h-8 rounded text-[#7A3E1C] hover:bg-[#EBE2D3] flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <p className="text-sm font-semibold text-[#1C1915]">{rev.title}</p>
                  <p className="text-sm text-[#4B5548] leading-relaxed">{rev.comment}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ProductReviews;
