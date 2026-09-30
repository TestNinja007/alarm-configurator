import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import { PasswordField } from './PasswordField';
import { useToast } from './Toaster';

/**
 * Changing a password while signed in, which needs the current one. Someone
 * locked out entirely uses the forgotten-password flow instead.
 */
export function ChangePassword() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const change = useMutation({
    mutationFn: () => api.put<void>('/me/password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      toast.push('success', 'Password changed. Other devices have been signed out.');
    },
  });

  const error = change.error instanceof ApiError ? change.error : undefined;
  const currentError = error?.fieldError('currentPassword');
  const newError = error?.fieldError('newPassword');
  const generalError = error && !currentError && !newError ? error.message : undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    change.mutate();
  }

  return (
    <section
      className="card"
      aria-labelledby="change-password-heading"
      data-testid="change-password-container"
    >
      <h2 id="change-password-heading" className="card-title">
        Password
      </h2>

      <form className="form" onSubmit={onSubmit} noValidate data-testid="change-password-form">
        {generalError ? (
          <p className="alert alert-error" role="alert" data-testid="change-password-error">
            {generalError}
          </p>
        ) : null}

        <PasswordField
          id="current-password"
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          testId="current-password-input"
          error={currentError}
        />

        <PasswordField
          id="new-password"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          testId="new-password-input"
          error={newError}
          hint="At least 10 characters. Every other device is signed out when you change it; this one stays."
        />

        <button
          type="submit"
          className="button button-primary"
          disabled={
            change.isPending || currentPassword.length === 0 || newPassword.length < 10
          }
          data-testid="change-password-submit-button"
        >
          {change.isPending ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </section>
  );
}
