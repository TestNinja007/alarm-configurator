import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { PendingVerification, Session } from '../api/types';

/**
 * The second half of registration: enter the code that was emailed.
 *
 * When the server has no working mail transport it hands the code back in the
 * response, and the page shows it. That keeps a sandbox usable without a mail
 * provider, and the page says plainly why the code is on screen.
 */
export function VerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const email = params.get('email') ?? '';
  const [code, setCode] = useState('');
  // Carried through the redirect from registration, when mail is not really sent.
  const [shownCode, setShownCode] = useState(params.get('code') ?? '');

  const verify = useMutation({
    mutationFn: () => api.post<Session>('/auth/verify', { email, code: code.trim() }),
    onSuccess: (session) => {
      queryClient.setQueryData(['session'], session);
      void navigate('/folders');
    },
  });

  const resend = useMutation({
    mutationFn: () => api.post<PendingVerification>('/auth/resend-verification', { email }),
    onSuccess: (pending) => {
      setShownCode(pending.code ?? '');
      setCode('');
    },
  });

  const error = verify.error instanceof ApiError ? verify.error : undefined;
  const codeError = error?.fieldError('code');
  const generalError = error && !codeError ? error.message : undefined;
  const resendError = resend.error instanceof ApiError ? resend.error : undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    verify.mutate();
  }

  return (
    <main className="page page-narrow" data-testid="verify-page">
      <h1 className="page-title">Alarm Configurator</h1>

      <form className="card form" onSubmit={onSubmit} noValidate data-testid="verify-form">
        <h2 className="card-title">Confirm your email</h2>

        <p className="form-intro" data-testid="verify-intro">
          We sent a six-digit code to <strong data-testid="verify-email">{email}</strong>. It
          expires in fifteen minutes. Check your spam folder — this instance sends from a
          free relay, so messages often land there.
        </p>

        {shownCode ? (
          <p className="alert alert-info" data-testid="verify-code-shown">
            This instance has no mail provider configured, so the code is shown here instead
            of being emailed: <strong data-testid="verify-code-value">{shownCode}</strong>
          </p>
        ) : null}

        {generalError ? (
          <p className="alert alert-error" role="alert" data-testid="verify-error">
            {generalError}
          </p>
        ) : null}

        {resendError ? (
          <p className="alert alert-error" role="alert" data-testid="verify-resend-error">
            {resendError.message}
          </p>
        ) : null}

        {resend.isSuccess && !shownCode ? (
          <p className="alert alert-info" data-testid="verify-resent">
            A new code is on its way. The previous one no longer works.
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="verify-code">Six-digit code</label>
          <input
            id="verify-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            aria-invalid={codeError ? true : undefined}
            aria-describedby={codeError ? 'verify-code-error' : undefined}
            data-testid="verify-code-input"
          />
          {codeError ? (
            <p id="verify-code-error" className="field-error" data-testid="verify-code-error">
              {codeError}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          className="button button-primary"
          disabled={verify.isPending || code.length !== 6}
          data-testid="verify-submit-button"
        >
          {verify.isPending ? 'Confirming…' : 'Confirm'}
        </button>

        <button
          type="button"
          className="button"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
          data-testid="verify-resend-button"
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
