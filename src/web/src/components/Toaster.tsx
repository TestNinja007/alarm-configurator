import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * A-07: toasts announce success and failure and dismiss themselves after
 * exactly five seconds. The timeout is fixed, never randomised.
 */
const TOAST_TIMEOUT_MS = 5000;

interface Toast {
  id: number;
  tone: 'success' | 'error';
  message: string;
}

interface ToastContextValue {
  push: (tone: Toast['tone'], message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let nextId = 1;

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = nextId++;
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_TIMEOUT_MS);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Announcements are polite so they never interrupt what the user is doing. */}
      <div
        className="toaster"
        role="status"
        aria-live="polite"
        data-testid="toast-region"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`} data-testid="toast">
            <span data-testid="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              onClick={() => dismiss(toast.id)}
              aria-label={`Dismiss: ${toast.message}`}
              data-testid="toast-dismiss-button"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToasterProvider');
  return context;
}
