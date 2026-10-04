import * as Dialog from '@radix-ui/react-dialog';
import type { FormEvent, ReactNode } from 'react';

interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  label: string;
  value: string;
  onValueChange: (next: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
  error?: string;
  maxLength?: number;
  testId: string;
}

/**
 * A dialog that asks for one name and nothing else.
 *
 * A form rather than a pair of buttons, so Enter submits — a one-field dialog
 * that makes you reach for the mouse is slower than the inline field it
 * replaced. Radix brings the focus trap, the Escape key and the aria wiring,
 * and focuses the input first because it is the first thing focusable.
 */
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  value,
  onValueChange,
  onSubmit,
  submitLabel,
  busy = false,
  error,
  maxLength = 60,
  testId,
}: NameDialogProps) {
  const inputId = `${testId}-input`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && value.trim().length > 0) onSubmit();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-modal="true" data-testid={testId}>
          <Dialog.Title className="dialog-title" data-testid={`${testId}-title`}>
            {title}
          </Dialog.Title>

          {description ? (
            <Dialog.Description
              className="dialog-description"
              data-testid={`${testId}-description`}
            >
              {description}
            </Dialog.Description>
          ) : (
            // Radix warns when a dialog has no description; this says the same
            // thing to a screen reader without putting a line on the screen.
            <Dialog.Description className="visually-hidden">{title}</Dialog.Description>
          )}

          <form className="dialog-form" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor={inputId}>{label}</label>
              <input
                id={inputId}
                value={value}
                maxLength={maxLength}
                onChange={(event) => onValueChange(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
                data-testid={inputId}
              />
              {error ? (
                <p id={`${inputId}-error`} className="field-error" data-testid={`${testId}-error`}>
                  {error}
                </p>
              ) : null}
            </div>

            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="button" data-testid={`${testId}-cancel-button`}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="button button-primary"
                disabled={busy || value.trim().length === 0}
                data-testid={`${testId}-submit-button`}
              >
                {busy ? 'Working…' : submitLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
