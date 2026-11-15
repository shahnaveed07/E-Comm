import React, { useState } from 'react';
import { Check, Heart, MapPin, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../../services/api.js';
import { formatCurrency } from '../../utils/commerce.js';

const ROAST_OPTIONS = [
  {
    id: 'raw_sprouted',
    label: 'Raw & Sprouted',
    description: 'Unroasted or gently dehydrated below 110°F for maximum enzymes.',
  },
  {
    id: 'dry_roasted_unsalted',
    label: 'Dry-Roasted Unsalted',
    description: 'Slow oak-drum toasted for warm aroma without added sodium.',
  },
  {
    id: 'lightly_salted',
    label: 'Lightly Sea Salted',
    description: 'Dry-roasted and misted with mineral-rich Pacific flake salt.',
  },
];

const DIETARY_GOALS = [
  { id: 'omega3', label: 'Plant Omega-3 ALA Focus' },
  { id: 'high_protein', label: 'High Plant Protein' },
  { id: 'keto', label: 'Low-Carb / Keto Friendly' },
  { id: 'heart_healthy', label: 'Heart-Healthy Monounsaturated Fats' },
];

const ALLERGEN_OPTIONS = [
  { id: 'peanuts', label: 'Exclude Peanuts' },
  { id: 'cashews', label: 'Exclude Cashews' },
  { id: 'walnuts', label: 'Exclude Walnuts' },
  { id: 'almonds', label: 'Exclude Almonds' },
  { id: 'hazelnuts', label: 'Exclude Hazelnuts' },
  { id: 'pecans', label: 'Exclude Pecans' },
  { id: 'pistachios', label: 'Exclude Pistachios' },
];

export const PreferencesTab = ({
  preferences,
  addresses = [],
  wishlistProductIds = [],
  catalog = [],
  currency = 'USD',
  onUpdatePreferences,
  onRefreshState,
  onToggleWishlist,
}) => {
  const [address, setAddress] = useState(preferences.shippingAddress);
  const [savedFlag, setSavedFlag] = useState(false);

  // Additional Address Form
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');
  const [newFullName, setNewFullName] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('OR');
  const [newPostal, setNewPostal] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const wishlistedProducts = catalog.filter((p) => wishlistProductIds.includes(p.id));

  const toggleGoal = (goal) => {
    const exists = preferences.dietaryGoals.includes(goal);
    const next = exists
      ? preferences.dietaryGoals.filter((g) => g !== goal)
      : [...preferences.dietaryGoals, goal];
    onUpdatePreferences({ dietaryGoals: next }, 'Dietary goals updated — recommendations refreshed.');
  };

  const toggleAllergen = (allergen) => {
    const exists = preferences.excludedAllergens.includes(allergen);
    const next = exists
      ? preferences.excludedAllergens.filter((a) => a !== allergen)
      : [...preferences.excludedAllergens, allergen];
    onUpdatePreferences(
      { excludedAllergens: next },
      'Allergen exclusions updated — recommendations filtered.'
    );
  };

  const handleSaveAddress = async (e) => {
    e.preventDefault();
    await onUpdatePreferences({ shippingAddress: address }, 'Shipping address and alerts saved.');
    setSavedFlag(true);
    window.setTimeout(() => setSavedFlag(false), 2000);
  };

  const handleCreateAddress = async (e) => {
    e.preventDefault();
    const res = await apiFetch('/api/addresses', {
      method: 'POST',
      body: JSON.stringify({
        label: newLabel,
        fullName: newFullName,
        street: newStreet,
        city: newCity,
        state: newState,
        postalCode: newPostal,
        phone: newPhone,
        isDefault: addresses.length === 0,
      }),
    });
    if (res.state && onRefreshState) onRefreshState(res.state);
    setNewFullName('');
    setNewStreet('');
    setNewCity('');
    setNewPostal('');
    setNewPhone('');
    setShowAddrForm(false);
  };

  const handleSetDefaultAddress = async (id) => {
    const state = await apiFetch(`/api/addresses/${encodeURIComponent(id)}/default`, {
      method: 'PATCH',
    });
    onRefreshState?.(state);
  };

  const handleDeleteAddress = async (id) => {
    const state = await apiFetch(`/api/addresses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    onRefreshState?.(state);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Taste, Nutrition & Allergen Engine */}
        <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-6">
          <div>
            <h3 className="font-display text-xl font-semibold text-[#1C1915]">
              Harvest &amp; Roast Preferences
            </h3>
            <p className="text-sm text-[#4B5548] mt-1">
              Changes update your personalized recommendations immediately across the storefront.
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-[#1C1915] mb-3">
              Preferred Roast Profile
            </legend>
            <div className="space-y-2.5">
              {ROAST_OPTIONS.map((option) => {
                const checked = preferences.preferredRoast === option.id;
                return (
                  <label
                    key={option.id}
                    className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? 'border-[#1B3B2B] bg-[#E6EDE8]'
                        : 'border-[#D8CCB8] bg-[#F6F1E9] hover:bg-[#EBE2D3]/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="preferredRoast"
                      value={option.id}
                      checked={checked}
                      onChange={() =>
                        onUpdatePreferences(
                          { preferredRoast: option.id },
                          `Preferred roast set to ${option.label}.`
                        )
                      }
                      className="mt-1 w-4 h-4 accent-[#1B3B2B]"
                    />
                    <div>
                      <span className="block text-sm font-semibold text-[#1C1915]">
                        {option.label}
                      </span>
                      <span className="block text-xs text-[#4B5548] mt-0.5">
                        {option.description}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-[#1C1915] mb-3">
              Nutritional Focus
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {DIETARY_GOALS.map((goal) => {
                const checked = preferences.dietaryGoals.includes(goal.id);
                return (
                  <label
                    key={goal.id}
                    className={`flex items-center gap-2.5 min-h-[44px] px-3.5 py-2 rounded-lg border text-sm cursor-pointer ${
                      checked
                        ? 'border-[#1B3B2B] bg-[#E6EDE8] text-[#1B3B2B] font-medium'
                        : 'border-[#D8CCB8] bg-[#F6F1E9] text-[#1C1915]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleGoal(goal.id)}
                      className="w-4 h-4 accent-[#1B3B2B]"
                    />
                    <span>{goal.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-[#1C1915] mb-1">
              Allergens &amp; Exclusions
            </legend>
            <p className="text-xs text-[#4B5548] mb-3">
              Excluded tree nuts will never appear in your personalized recommendations.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ALLERGEN_OPTIONS.map((item) => {
                const checked = preferences.excludedAllergens.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex items-center gap-2.5 min-h-[44px] px-3.5 py-2 rounded-lg border text-sm cursor-pointer ${
                      checked
                        ? 'border-[#7A3E1C] bg-[#7A3E1C]/10 text-[#7A3E1C] font-medium'
                        : 'border-[#D8CCB8] bg-[#F6F1E9] text-[#1C1915]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAllergen(item.id)}
                      className="w-4 h-4 accent-[#7A3E1C]"
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        {/* Right: Primary Shipping Address, Saved Address Book & Alerts */}
        <div className="space-y-6">
          <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6">
            <h3 className="font-display text-xl font-semibold text-[#1C1915]">
              Delivery Address &amp; Notifications
            </h3>
            <p className="text-sm text-[#4B5548] mt-1 mb-5">
              Where your recurring orchard boxes and one-time orders ship.
            </p>

            <form onSubmit={handleSaveAddress} className="space-y-4">
              <div>
                <label htmlFor="pref-fullname" className="block text-xs font-semibold text-[#1C1915] mb-1.5">
                  Recipient Full Name
                </label>
                <input
                  id="pref-fullname"
                  type="text"
                  required
                  value={address.fullName}
                  onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                />
              </div>

              <div>
                <label htmlFor="pref-street" className="block text-xs font-semibold text-[#1C1915] mb-1.5">
                  Street Address
                </label>
                <input
                  id="pref-street"
                  type="text"
                  required
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="pref-city" className="block text-xs font-semibold text-[#1C1915] mb-1.5">
                    City
                  </label>
                  <input
                    id="pref-city"
                    type="text"
                    required
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                  />
                </div>
                <div>
                  <label htmlFor="pref-state" className="block text-xs font-semibold text-[#1C1915] mb-1.5">
                    State
                  </label>
                  <input
                    id="pref-state"
                    type="text"
                    required
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                  />
                </div>
                <div>
                  <label htmlFor="pref-zip" className="block text-xs font-semibold text-[#1C1915] mb-1.5">
                    Postal Code
                  </label>
                  <input
                    id="pref-zip"
                    type="text"
                    required
                    value={address.postalCode}
                    onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915] font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pref-phone" className="block text-xs font-semibold text-[#1C1915] mb-1.5">
                  Phone for Delivery Updates
                </label>
                <input
                  id="pref-phone"
                  type="tel"
                  required
                  value={address.phone}
                  onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
                />
              </div>

              <div className="pt-3 border-t border-[#EBE2D3] space-y-2.5">
                <label className="flex items-center gap-3 min-h-[40px] text-sm text-[#1C1915] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.emailUpdates}
                    onChange={(e) =>
                      onUpdatePreferences({ emailUpdates: e.target.checked }, 'Email harvest updates saved.')
                    }
                    className="w-4 h-4 accent-[#1B3B2B]"
                  />
                  <span>Send seasonal harvest release and order confirmation emails</span>
                </label>
                <label className="flex items-center gap-3 min-h-[40px] text-sm text-[#1C1915] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.smsDeliveryAlerts}
                    onChange={(e) =>
                      onUpdatePreferences({ smsDeliveryAlerts: e.target.checked }, 'SMS tracking alerts updated.')
                    }
                    className="w-4 h-4 accent-[#1B3B2B]"
                  />
                  <span>Send SMS tracking notifications when courier dispatches</span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="min-h-[44px] px-6 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#142C20] transition-colors cursor-pointer"
                >
                  {savedFlag && <Check className="w-4 h-4" aria-hidden="true" />}
                  <span>{savedFlag ? 'Address Saved' : 'Save Address & Settings'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Saved Address Book */}
          <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-[#1C1915] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#1B3B2B]" aria-hidden="true" />
                <span>Saved Address Book ({addresses.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddrForm((p) => !p)}
                className="min-h-[36px] px-3 py-1.5 rounded border border-[#1B3B2B] text-xs font-semibold text-[#1B3B2B] inline-flex items-center gap-1 hover:bg-[#E6EDE8] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showAddrForm ? 'Cancel' : 'Add Address'}</span>
              </button>
            </div>

            {showAddrForm && (
              <form onSubmit={handleCreateAddress} className="p-4 rounded-lg bg-[#F6F1E9] border border-[#D8CCB8] space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Label (Home, Office)"
                    className="min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-xs"
                  />
                  <input
                    type="text"
                    required
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="Recipient Full Name"
                    className="min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-xs"
                  />
                </div>
                <input
                  type="text"
                  required
                  value={newStreet}
                  onChange={(e) => setNewStreet(e.target.value)}
                  placeholder="Street Address"
                  className="w-full min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-xs"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="City"
                    className="min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-xs"
                  />
                  <input
                    type="text"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value)}
                    placeholder="State"
                    className="min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-xs"
                  />
                  <input
                    type="text"
                    required
                    value={newPostal}
                    onChange={(e) => setNewPostal(e.target.value)}
                    placeholder="Postal Code"
                    className="min-h-[38px] px-3 rounded border border-[#D8CCB8] bg-[#FCFAF6] text-xs font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[38px] px-4 py-1.5 rounded bg-[#1B3B2B] text-[#FCFAF6] text-xs font-semibold cursor-pointer"
                >
                  Save to Address Book
                </button>
              </form>
            )}

            {addresses.length > 0 && (
              <ul className="divide-y divide-[#EBE2D3] text-xs">
                {addresses.map((a) => (
                  <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1C1915]">
                        {a.label || 'Address'} · {a.fullName}
                        {a.isDefault && <span className="ml-2 text-[#1B3B2B]">(Default)</span>}
                      </p>
                      <p className="text-[#4B5548]">
                        {a.street}, {a.city}, {a.state} {a.postalCode}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!a.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefaultAddress(a.id)}
                          className="px-2.5 py-1 rounded border border-[#D8CCB8] bg-[#F6F1E9] font-medium cursor-pointer"
                        >
                          Default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteAddress(a.id)}
                        aria-label={`Delete address ${a.label}`}
                        className="p-1.5 text-[#7A3E1C] hover:bg-[#EBE2D3] rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Saved Harvest Wishlist */}
      {wishlistedProducts.length > 0 && (
        <div className="rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6">
          <h3 className="font-display text-xl font-semibold text-[#1C1915] flex items-center gap-2 mb-4">
            <Heart className="w-4 h-4 fill-[#7A3E1C] text-[#7A3E1C]" aria-hidden="true" />
            <span>Saved Harvests Wishlist ({wishlistedProducts.length})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {wishlistedProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[#EBE2D3] bg-[#F6F1E9]">
                <div className="min-w-0">
                  <p className="font-display font-semibold text-sm text-[#1C1915] truncate">{p.name}</p>
                  <p className="font-mono text-xs text-[#4B5548]">
                    {formatCurrency(p.basePrice16oz, p.currency || currency)} (16 oz)
                  </p>
                </div>
                {onToggleWishlist && (
                  <button
                    type="button"
                    onClick={() => onToggleWishlist(p.id, false)}
                    className="text-xs font-medium text-[#7A3E1C] hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
