import { createContext, useContext, type ReactNode } from 'react';
import { useAlarmNotifications } from '../hooks/useAlarmNotifications';

type NotificationState = ReturnType<typeof useAlarmNotifications>;

const NotificationContext = createContext<NotificationState | undefined>(undefined);

/**
 * Holds the one and only alarm scheduler, mounted in the signed-in shell so it
 * runs on every page.
 *
 * It has to be a single shared instance rather than a hook each component
 * calls. The scheduler keeps its record of what has already fired in a ref, so
 * two instances would each hold their own copy, both set a timer for the same
 * occurrence, and both raise a notification for it.
 *
 * Putting it here also fixes the narrower problem that the settings page is
 * the only thing rendering the controls: before this, alarms only fired while
 * that page happened to be open.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const notifications = useAlarmNotifications();
  return (
    <NotificationContext.Provider value={notifications}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationState {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used inside a NotificationProvider');
  }
  return context;
}
