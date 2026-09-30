import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';

/**
 * Deleting an account is irreversible and takes every folder and alarm with
 * it, so it asks for the password rather than a single click, and the server
 * asks for a confirmation flag on top of that.
 */
export function DeleteAccount() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');

  const remove = useMutation({
    mutationFn: () => api.delete<void>('/me?confirm=true', { password }),
    onSuccess: () => {
      queryClient.clear();
      void navigate('/login');
    },
  });

  const error = remove.error instanceof ApiError ? remove.error : undefined;

  return (
    <section
      className="card danger-zone"
      aria-labelledby="delete-account-heading"
      data-testid="delete-account-container"
    >
      <h2 id="delete-account-heading" className="card-title">
        Delete account
      </h2>
      <p className="empty-state" data-testid="delete-account-warning">
        This removes your account, every folder and every alarm in it. It cannot be
        undone, and there is no way to recover the data afterwards.
      </p>

      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPassword('');
            remove.reset();
          }
        }}
      >
        <Dialog.Trigger asChild>
          <button type="button" className="button button-danger" data-testid="delete-account-button">
            Delete my account
          </button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            aria-modal="true"
            data-testid="delete-account-dialog"
          >
            <Dialog.Title className="dialog-title" data-testid="delete-account-dialog-title">
              Delete your account
            </Dialog.Title>
            <Dialog.Description
              className="dialog-description"
              data-testid="delete-account-dialog-description"
            >
              Everything you have created is deleted immediately and permanently. Enter
              your password to confirm.
            </Dialog.Description>

            {error ? (
              <p className="alert alert-error" role="alert" data-testid="delete-account-error">
                {error.message}
              </p>
            ) : null}

            <div className="field">
              <label htmlFor="delete-account-password">Password</label>
              <input
                id="delete-account-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'delete-account-error-text' : undefined}
                data-testid="delete-account-password-input"
              />
              {error ? (
                <p id="delete-account-error-text" className="field-error">
                  {error.message}
                </p>
              ) : null}
            </div>

            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="button" data-testid="delete-account-cancel-button">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="button button-danger"
                onClick={() => remove.mutate()}
                disabled={remove.isPending || password.length === 0}
                data-testid="delete-account-confirm-button"
              >
                {remove.isPending ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
