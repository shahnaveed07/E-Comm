import React, { useState } from 'react';
import { KeyRound, Lock, LogIn, UserPlus } from 'lucide-react';
import { apiFetch } from '../services/api.js';
import { validateRegistrationInput } from '../utils/commerce.js';

export const AuthPanel = ({
  initialMode = 'login',
  initialResetToken = '',
  heading,
  headingLevel = 2,
  headingId,
  description,
  onLogin,
  onRegister,
  onAuthenticated,
  compact = false,
}) => {
  const [mode, setMode] = useState(initialResetToken ? 'reset' : initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken || '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
  const HeadingTag = headingLevel === 1 ? 'h1' : 'h2';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (isForgot) {
      if (!email.trim()) {
        setError('Enter your registered email address.');
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await apiFetch('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim() }),
        });
        setInfoMessage(res.message || 'If an account matches that email, a reset link has been sent.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to send password reset.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (isReset) {
      if (!resetToken.trim() || newPassword.length < 8) {
        setError('Enter the reset token and a new password (min 8 characters).');
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await apiFetch('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken.trim(), newPassword }),
        });
        setInfoMessage(res.message || 'Password updated. Sign in with your new password.');
        setMode('login');
        setPassword('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to reset password.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

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
          aria-selected={mode === 'login'}
          onClick={() => {
            setMode('login');
            setError(null);
            setInfoMessage(null);
          }}
          className={`min-h-[40px] px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
            mode === 'login'
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
            setInfoMessage(null);
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

      {infoMessage && (
        <div
          role="status"
          className="p-3.5 rounded-md bg-[#E6EDE8] border border-[#1B3B2B]/30 text-xs font-medium text-[#1B3B2B]"
        >
          {infoMessage}
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

        {!isReset && (
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
        )}

        {!isForgot && !isReset && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor={compact ? 'cart-auth-password' : 'auth-password'}
                className="block text-xs font-semibold text-[#1C1915]"
              >
                Password
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                    setInfoMessage(null);
                  }}
                  className="text-xs font-medium text-[#1B3B2B] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              )}
            </div>
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
        )}

        {isReset && (
          <>
            <div>
              <label htmlFor="auth-reset-token" className="block text-xs font-semibold text-[#1C1915] mb-1">
                Password Reset Token
              </label>
              <input
                id="auth-reset-token"
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Paste reset token"
                className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm font-mono text-[#1C1915]"
              />
            </div>
            <div>
              <label htmlFor="auth-new-password" className="block text-xs font-semibold text-[#1C1915] mb-1">
                New Password
              </label>
              <input
                id="auth-new-password"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8CCB8] bg-[#F6F1E9] text-sm text-[#1C1915]"
              />
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[46px] px-4 py-2.5 rounded-md bg-[#1B3B2B] text-[#FCFAF6] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#142C20] disabled:opacity-60 cursor-pointer"
        >
          {isForgot || isReset ? (
            <KeyRound className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Lock className="w-4 h-4" aria-hidden="true" />
          )}
          <span>
            {isSubmitting
              ? isForgot
                ? 'Sending Link...'
                : isReset
                  ? 'Updating Password...'
                  : isRegister
                    ? 'Creating Account...'
                    : 'Signing In...'
              : isForgot
                ? 'Send Password Reset Link'
                : isReset
                  ? 'Set New Password'
                  : isRegister
                    ? 'Create Account & Continue'
                    : 'Sign In'}
          </span>
        </button>

        {(isForgot || isReset) && (
          <div className="flex items-center justify-between text-xs pt-1">
            <button
              type="button"
              onClick={() => {
                setMode(isForgot ? 'reset' : 'forgot');
                setError(null);
              }}
              className="font-medium text-[#4B5548] hover:text-[#1C1915] hover:underline cursor-pointer"
            >
              {isForgot ? 'Have a reset token? Enter it' : 'Request a new reset link'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className="font-semibold text-[#1B3B2B] hover:underline cursor-pointer"
            >
              Back to Sign In
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default AuthPanel;
