import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { Session } from '../api/types';
import { Logo } from '../components/Logo';
import { PasswordField } from '../components/PasswordField';

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // The server decides whether accounts can be created, so the link only
  // appears where registration is actually open.
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<{ registrationOpen: boolean }>('/health'),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const login = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api.post<Session>('/auth/login', credentials),
    onSuccess: (session) => {
      queryClient.setQueryData(['session'], session);
      void navigate('/folders');
    },
  });

  const error = login.error instanceof ApiError ? login.error : undefined;

  /*
   * A-02 is field-level and inline, client- AND server-side, and this form
   * had neither half: an empty password was posted, refused, and reported in
   * a banner that did not say which field was wrong.
   *
   * The client check exists so an empty field costs nothing — no round trip,
   * and the error appears beside the thing to fix. It deliberately checks
   * only emptiness: anything about whether the credentials are RIGHT belongs
   * on the server, which answers an unknown address and a wrong password
   * identically so the form cannot be used to discover which addresses exist.
   */
  const [missing, setMissing] = useState<{ email?: string; password?: string }>({});
  const emailError = missing.email ?? error?.fieldError('email');
  const passwordError = missing.password ?? error?.fieldError('password');
  const generalError = error && !emailError && !passwordError ? error.message : undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const blank = {
      ...(email.trim() ? {} : { email: 'Enter your email address.' }),
      ...(password ? {} : { password: 'Enter your password.' }),
    };
    setMissing(blank);
    if (Object.keys(blank).length > 0) return;

    login.mutate({ email, password });
  }

  return (
    <main className="page page-narrow" data-testid="login-page">
      <header className="auth-brand" data-testid="auth-brand">
        {/* The only way back out of a form you decided not to fill in. */}
        <Link className="auth-lockup auth-lockup-link" to="/" data-testid="auth-home-link">
          <Logo size={44} />
          <h1 className="auth-wordmark">Nudge</h1>
        </Link>
        <p className="auth-tagline">Alarms that actually work with you.</p>
      </header>

      <form className="card form" onSubmit={onSubmit} noValidate data-testid="login-form">
        <h2 className="card-title">Sign in</h2>

        {generalError ? (
          <p className="alert alert-error" role="alert" data-testid="login-error">
            {generalError}
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? 'login-email-error' : undefined}
            data-testid="login-email-input"
          />
          {emailError ? (
            <p id="login-email-error" className="field-error" data-testid="login-email-error">
              {emailError}
            </p>
          ) : null}
        </div>

        <PasswordField
          id="login-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          testId="login-password-input"
          error={passwordError}
        />

        <button
          type="submit"
          className="button button-primary"
          disabled={login.isPending}
          data-testid="login-submit-button"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="form-footer">
          <Link to="/forgot-password" data-testid="forgot-password-link">
            Forgotten your password?
          </Link>
        </p>

        {health.data?.registrationOpen ? (
          <p className="form-footer">
            No account yet?{' '}
            <Link to="/register" data-testid="register-link">
              Create one
            </Link>
          </p>
        ) : null}
      </form>
    </main>
  );
}
