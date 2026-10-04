import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { PasswordResetIssued, Session } from '../api/types';
import { Logo } from '../components/Logo';
import { PasswordField } from '../components/PasswordField';

/**
 * The second half of a reset: enter the code and choose a new password.
 *
 * Succeeding signs the account in, because every previous session was just
 * destroyed — including any this browser was holding.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const email = params.get('email') ?? '';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [shownCode, setShownCode] = useState(params.get('code') ?? '');
  const [undelivered, setUndelivered] = useState(params.get('undelivered') === '1');

  const reset = useMutation({
    mutationFn: () =>
      api.post<Session>('/auth/reset-password', { email, code: code.trim(), password }),
    onSuccess: (session) => {
      queryClient.setQueryData(['session'], session);
      void navigate('/folders');
    },
  });

  const resend = useMutation({
    mutationFn: () => api.post<PasswordResetIssued>('/auth/forgot-password', { email }),
    onSuccess: (issued) => {
      setShownCode(issued.code ?? '');
      setUndelivered(!issued.emailSent);
      setCode('');
    },
  });

  const error = reset.error instanceof ApiError ? reset.error : undefined;
  const codeError = error?.fieldError('code');
  const passwordError = error?.fieldError('password');
  const generalError = error && !codeError && !passwordError ? error.message : undefined;
  const resendError = resend.error instanceof ApiError ? resend.error : undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset.mutate();
  }

  return (
    <main className="page page-narrow" data-testid="reset-password-page">
      <header className="auth-brand" data-testid="auth-brand">
        {/* The only way back out of a form you decided not to fill in. */}
        <Link className="auth-lockup auth-lockup-link" to="/" data-testid="auth-home-link">
          <Logo size={44} />
          <h1 className="auth-wordmark">Nudge</h1>
        </Link>
        <p className="auth-tagline">Alarms that actually work with you.</p>
      </header>

      <form className="card form" onSubmit={onSubmit} noValidate data-testid="reset-password-form">
        <h2 className="card-title">Choose a new password</h2>

        <p className="form-intro" data-testid="reset-password-intro">
          If <strong data-testid="reset-password-email">{email}</strong> has an account, a
          six-digit code is on its way. It expires in fifteen minutes. Check your spam
          folder — this instance sends from a free relay, so messages often land there.
        </p>

        {shownCode ? (
          <p className="alert alert-info" data-testid="reset-code-shown">
            This instance has no mail provider configured, so the code is shown here
            instead of being emailed:{' '}
            <strong data-testid="reset-code-value">{shownCode}</strong>
          </p>
        ) : null}

        {undelivered ? (
          <p className="alert alert-error" role="alert" data-testid="reset-undelivered">
            The code could not be sent. Try requesting a new one; if that keeps failing,
            the mail provider is refusing messages.
          </p>
        ) : null}

        {generalError ? (
          <p className="alert alert-error" role="alert" data-testid="reset-password-error">
            {generalError}
          </p>
        ) : null}

        {resendError ? (
          <p className="alert alert-error" role="alert" data-testid="reset-resend-error">
            {resendError.message}
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="reset-code">Six-digit code</label>
          <input
            id="reset-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            aria-invalid={codeError ? true : undefined}
            aria-describedby={codeError ? 'reset-code-error' : undefined}
            data-testid="reset-code-input"
          />
          {codeError ? (
            <p id="reset-code-error" className="field-error" data-testid="reset-code-error">
              {codeError}
            </p>
          ) : null}
        </div>

        <PasswordField
          id="reset-password"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          testId="reset-password-input"
          error={passwordError}
          hint="At least 10 characters. Signing in anywhere else is ended when you reset."
        />

        <button
          type="submit"
          className="button button-primary"
          disabled={reset.isPending || code.length !== 6 || password.length < 10}
          data-testid="reset-password-submit-button"
        >
          {reset.isPending ? 'Saving…' : 'Set new password'}
        </button>

        <button
          type="button"
          className="button"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
          data-testid="reset-resend-button"
        >
          {resend.isPending ? 'Sending…' : 'Send a new code'}
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
