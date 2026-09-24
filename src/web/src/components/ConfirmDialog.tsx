import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  testId: string;
}

/**
 * Radix handles the focus trap, the Escape key and the aria wiring, which the
 * accessibility requirement asks for and which is tedious to get right by hand.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy = false,
  testId,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        {/*
          Radix traps focus and marks the rest of the page aria-hidden, but does
          not set aria-modal itself, so it is set here explicitly.
        */}
        <Dialog.Content className="dialog-content" aria-modal="true" data-testid={testId}>
          <Dialog.Title className="dialog-title" data-testid={`${testId}-title`}>
            {title}
          </Dialog.Title>
          <Dialog.Description className="dialog-description" data-testid={`${testId}-description`}>
            {description}
          </Dialog.Description>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="button" data-testid={`${testId}-cancel-button`}>
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="button button-danger"
              onClick={onConfirm}
              disabled={busy}
              data-testid={`${testId}-confirm-button`}
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
