import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { Session } from '../api/types';
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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate({ email, password });
  }

  return (
    <main className="page page-narrow" data-testid="login-page">
      <header className="auth-brand" data-testid="auth-brand">
        <h1 className="auth-wordmark">Nudge</h1>
        <p className="auth-tagline">Alarms that actually find you.</p>
      </header>

      <form className="card form" onSubmit={onSubmit} noValidate data-testid="login-form">
        <h2 className="card-title">Sign in</h2>

        {error ? (
          <p className="alert alert-error" role="alert" data-testid="login-error">
            {error.message}
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
            aria-describedby={error ? 'login-error-text' : undefined}
            data-testid="login-email-input"
          />
        </div>

        <PasswordField
          id="login-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          testId="login-password-input"
        />

        {error ? (
          <p id="login-error-text" className="field-error">
            {error.message}
          </p>
        ) : null}

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
