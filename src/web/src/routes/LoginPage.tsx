import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { Session } from '../api/types';

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
      <h1 className="page-title">Alarm Configurator</h1>

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

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={error ? 'login-error-text' : undefined}
            data-testid="login-password-input"
          />
        </div>

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
      </form>
    </main>
  );
}
