import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { Session } from '../api/types';

/**
 * Registration signs the new account straight in, so there is no second step to
 * get wrong. Field errors come back from the server in the same envelope the
 * rest of the app uses and attach to the input they belong to (A-02).
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const register = useMutation({
    mutationFn: (body: { email: string; name: string; password: string }) =>
      api.post<Session>('/auth/register', body),
    onSuccess: (session) => {
      queryClient.setQueryData(['session'], session);
      void navigate('/folders');
    },
  });

  const error = register.error instanceof ApiError ? register.error : undefined;
  // A 409 on a duplicate address carries a field error; a 429 does not.
  const emailError = error?.fieldError('email');
  const nameError = error?.fieldError('name');
  const passwordError = error?.fieldError('password');
  const generalError = error && !emailError && !nameError && !passwordError ? error.message : undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    register.mutate({ email, name, password });
  }

  return (
    <main className="page page-narrow" data-testid="register-page">
      <h1 className="page-title">Alarm Configurator</h1>

      <form className="card form" onSubmit={onSubmit} noValidate data-testid="register-form">
        <h2 className="card-title">Create an account</h2>

        {generalError ? (
          <p className="alert alert-error" role="alert" data-testid="register-error">
            {generalError}
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? 'register-email-error' : undefined}
            data-testid="register-email-input"
          />
          {emailError ? (
            <p id="register-email-error" className="field-error" data-testid="register-email-error">
              {emailError}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="register-name">Name</label>
          <input
            id="register-name"
            name="name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'register-name-error' : undefined}
            data-testid="register-name-input"
          />
          {nameError ? (
            <p id="register-name-error" className="field-error" data-testid="register-name-error">
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="register-password">Password</label>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={
              passwordError ? 'register-password-error' : 'register-password-hint'
            }
            data-testid="register-password-input"
          />
          {passwordError ? (
            <p
              id="register-password-error"
              className="field-error"
              data-testid="register-password-error"
            >
              {passwordError}
            </p>
          ) : (
            <p id="register-password-hint" className="field-hint" data-testid="register-password-hint">
              At least 10 characters. There is no password reset on this instance, so
              use something you will remember.
            </p>
          )}
        </div>

        <button
          type="submit"
          className="button button-primary"
          disabled={register.isPending}
          data-testid="register-submit-button"
        >
          {register.isPending ? 'Creating account…' : 'Create account'}
        </button>

        <p className="form-footer">
          Already have an account?{' '}
          <Link to="/login" data-testid="login-link">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
