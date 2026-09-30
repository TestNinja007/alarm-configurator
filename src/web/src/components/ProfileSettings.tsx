import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import type { Session, User } from '../api/types';
import { useToast } from './Toaster';

/** The display name. The email address is fixed once an account is confirmed. */
export function ProfileSettings({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(user.name);

  const save = useMutation({
    mutationFn: () => api.patch<User>('/me/profile', { name }),
    onSuccess: (updated) => {
      // The name is shown in the top bar, so the cached session has to follow.
      queryClient.setQueryData<Session>(['session'], (current) =>
        current ? { ...current, user: updated } : current,
      );
      toast.push('success', 'Name updated.');
    },
  });

  const error = save.error instanceof ApiError ? save.error : undefined;
  const nameError = error?.fieldError('name') ?? (error ? error.message : undefined);
  const unchanged = name.trim() === user.name;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <section className="card" aria-labelledby="profile-settings-heading" data-testid="profile-settings-container">
      <h2 id="profile-settings-heading" className="card-title">
        Profile
      </h2>

      <form className="form" onSubmit={onSubmit} noValidate data-testid="profile-settings-form">
        <div className="field">
          <label htmlFor="profile-email">Email</label>
          <input
            id="profile-email"
            value={user.email}
            readOnly
            aria-describedby="profile-email-hint"
            data-testid="profile-email-input"
          />
          <p id="profile-email-hint" className="field-hint" data-testid="profile-email-hint">
            The address cannot be changed once it has been confirmed.
          </p>
        </div>

        <div className="field">
          <label htmlFor="profile-name">Name</label>
          <input
            id="profile-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'profile-name-error' : undefined}
            data-testid="profile-name-input"
          />
          {nameError ? (
            <p id="profile-name-error" className="field-error" data-testid="profile-name-error">
              {nameError}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          className="button button-primary"
          disabled={save.isPending || unchanged || name.trim().length === 0}
          data-testid="profile-save-button"
        >
          {save.isPending ? 'Saving…' : 'Save name'}
        </button>
      </form>
    </section>
  );
}
