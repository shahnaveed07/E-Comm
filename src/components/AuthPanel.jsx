import React, { useState } from 'react';
import { Lock, LogIn, UserPlus } from 'lucide-react';
import { validateRegistrationInput } from '../utils/commerce.js';

export const AuthPanel = ({
  initialMode = 'login',
  heading,
  headingLevel = 2,
  headingId,
  description,
  onLogin,
  onRegister,
  onAuthenticated,
  compact = false,
}) => {
  const [mode, setMode] = useState(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === 'register';
  const HeadingTag = headingLevel === 1 ? 'h1' : 'h2';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (isRegister) {
      const check = validateRegistrationInput({ fullName, email, password });
      if (!check.valid) {
        setError(check.errors.fullName || check.errors.email || check.errors.password);
        return;
      }
    } else if (!email.trim() || !password) {
      setError('Enter both your email address and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = isRegister
        ? await onRegister({ fullName: fullName.trim(), email: email.trim(), password })
        : await onLogin({ email: email.trim(), password });
      if (onAuthenticated) {
        onAuthenticated(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`${
        compact
          ? 'space-y-4'
          : 'rounded-xl border border-[#D8CCB8] bg-[#FCFAF6] p-6 sm:p-8 max-w-md mx-auto space-y-5'
      }`}
    >
      {(heading || description) && (
        <div>
          {heading && (
            <HeadingTag id={headingId} className="font-display text-2xl font-semibold text-[#1C1915]">
              {heading}
            </HeadingTag>
          )}
          {description && <p className="text-sm text-[#4B5548] mt-1">{description}</p>}
        </div>
      )}

      {/* Mode Switcher */}
      <div
        role="tablist"
        aria-label="Account authentication mode"
        className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#F6F1E9] border border-[#D8CCB8]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={!isRegister}
          onClick={() => {
            setMode('login');
            setError(null);
          }}
          className={`min-h-[40px] px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
            !isRegister
              ? 'bg-[#1B3B2B] text-[#FCFAF6]'
              : 'text-[#4B5548] hover:text-[#1C1915]'
          }`}
        >
          <LogIn className="w-4 h-4" aria-hidden="true" />
          <span>Sign In</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={isRegister}
          onClick={() => {
            setMode('register');
            setError(null);
          }}
          className={`min-h-[40px] px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
            isRegister
              ? 'bg-[#1B3B2B] text-[#FCFAF6]'
              : 'text-[#4B5548] hover:text-[#1C1915]'
          }`}
        >
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          <span>Create Account</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-md bg-[#9E2A2B]/10 border border-[#9E2A2B]/30 text-xs font-medium text-[#9E2A2B]"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {isRegister && (
          <div>
            <label
              htmlFor={compact ? 'cart-auth-name' : 'auth-full-name'}
              className="block text-xs font-semibold text-[#1C1915] mb-1"
            >
              Full Name
            </label>
            <input
              id={compact ? 'cart-auth-name' : 'auth-full-name'}
              type="text"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Maya Lin"
              className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
            />
          </div>
        )}

        <div>
          <label
            htmlFor={compact ? 'cart-auth-email' : 'auth-email'}
            className="block text-xs font-semibold text-[#1C1915] mb-1"
          >
            Email Address
          </label>
          <input
            id={compact ? 'cart-auth-email' : 'auth-email'}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
          />
        </div>

        <div>
          <label
            htmlFor={compact ? 'cart-auth-password' : 'auth-password'}
            className="block text-xs font-semibold text-[#1C1915] mb-1"
          >
            Password
          </label>
          <input
            id={compact ? 'cart-auth-password' : 'auth-password'}
            type="password"
            required
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? 'Minimum 8 characters' : 'Enter your password'}
            className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[46px] px-4 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#142C20] disabled:opacity-60 cursor-pointer"
        >
          <Lock className="w-4 h-4" aria-hidden="true" />
          <span>
            {isSubmitting
              ? isRegister
                ? 'Creating Account...'
                : 'Signing In...'
              : isRegister
                ? 'Create Account & Continue'
                : 'Sign In'}
          </span>
        </button>
      </form>
    </div>
  );
};

export default AuthPanel;
