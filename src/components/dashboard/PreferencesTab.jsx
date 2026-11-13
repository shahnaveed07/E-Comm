import React, { useState } from 'react';
import { Check } from 'lucide-react';

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

export const PreferencesTab = ({ preferences, onUpdatePreferences }) => {
  const [address, setAddress] = useState(preferences.shippingAddress);
  const [savedFlag, setSavedFlag] = useState(false);

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

  return (
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

        {/* Roast Profile Radio Group */}
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

        {/* Dietary Goals */}
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

        {/* Allergen Exclusions */}
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

      {/* Right: Shipping Address & Alerts */}
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
    </div>
  );
};
