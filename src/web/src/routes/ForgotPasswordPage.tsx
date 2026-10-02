import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { PasswordResetIssued } from '../api/types';

/**
 * Asks for the address, then sends a code to it.
 *
 * The server answers identically whether or not the address has an account, so
 * this page must not imply otherwise — it always moves on to the next step.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const request = useMutation({
    mutationFn: () => api.post<PasswordResetIssued>('/auth/forgot-password', { email }),
    onSuccess: (issued) => {
      const query = new URLSearchParams({ email: issued.email });
      if (issued.code) query.set('code', issued.code);
      if (!issued.emailSent) query.set('undelivered', '1');
      void navigate(`/reset-password?${query.toString()}`);
    },
  });

  const error = request.error instanceof ApiError ? request.error : undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.mutate();
  }

  return (
    <main className="page page-narrow" data-testid="forgot-password-page">
      <header className="auth-brand" data-testid="auth-brand">
        <h1 className="auth-wordmark">Nudge</h1>
        <p className="auth-tagline">Alarms that actually find you.</p>
      </header>

      <form className="card form" onSubmit={onSubmit} noValidate data-testid="forgot-password-form">
        <h2 className="card-title">Reset your password</h2>

        <p className="form-intro" data-testid="forgot-password-intro">
          Enter the address on your account and we will send a six-digit code. If the
          address has no account, no email is sent — the next screen looks the same
          either way.
        </p>

        {error ? (
          <p className="alert alert-error" role="alert" data-testid="forgot-password-error">
            {error.message}
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            data-testid="forgot-password-email-input"
          />
        </div>

        <button
          type="submit"
          className="button button-primary"
          disabled={request.isPending || email.trim().length === 0}
          data-testid="forgot-password-submit-button"
        >
          {request.isPending ? 'Sending…' : 'Send reset code'}
        </button>

        <p className="form-footer">
          <Link to="/login" data-testid="login-link">
            Back to sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
