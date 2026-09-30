import { useState, type ReactNode } from 'react';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  testId: string;
  error?: string;
  hint?: ReactNode;
}

/**
 * A password input with a reveal toggle.
 *
 * It matters most when choosing a new password, where a typo is only
 * discovered at the next sign-in — and on this application there is no
 * password reset to fall back on.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  testId,
  error,
  hint,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);

  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>

      <div className="password-input">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          data-testid={testId}
        />
        <button
          type="button"
          className="password-reveal"
          // aria-pressed carries the state, so the name stays stable for a
          // locator while screen readers still hear whether it is on.
          aria-pressed={revealed}
          aria-controls={id}
          aria-label="Show password"
          onClick={() => setRevealed((current) => !current)}
          data-testid={`${testId}-reveal-toggle`}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>

      {error ? (
        <p id={errorId} className="field-error" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="field-hint" data-testid={`${testId}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
