import { useNotifications } from './NotificationProvider';

/**
 * The controls for desktop notifications, plus enough visible state that a test
 * can tell what the browser has decided without inspecting the browser itself.
 */
export function NotificationSettings() {
  const notifications = useNotifications();

  return (
    <section
      className="card"
      aria-labelledby="notification-settings-heading"
      data-testid="notification-settings-container"
    >
      <h2 id="notification-settings-heading" className="card-title">
        Desktop notifications
      </h2>

      <p
        className="empty-state"
        data-testid="notification-permission-state"
        data-permission={notifications.permission}
        data-active={notifications.active}
        data-upcoming-count={notifications.upcomingCount}
      >
        {notifications.permission === 'unsupported'
          ? 'This browser cannot show desktop notifications.'
          : notifications.permission === 'denied'
            ? 'Notifications are blocked for this site. Allow them in your browser settings, then reload.'
            : notifications.permission === 'granted'
              ? notifications.enabled
                ? 'Alarms will appear as desktop notifications while this page is open.'
                : 'Permission granted, but notifications are switched off.'
              : 'Allow notifications to be told when an alarm comes due.'}
      </p>

      {notifications.nextOccurrence ? (
        <p className="empty-state" data-testid="notification-next-occurrence">
          Next: <strong>{notifications.nextOccurrence.alarmName}</strong> at{' '}
          {notifications.nextOccurrence.local}
        </p>
      ) : null}

      <div className="notification-actions">
        {notifications.permission === 'default' ? (
          <button
            type="button"
            className="button button-primary"
            onClick={() => void notifications.request()}
            data-testid="notification-permission-button"
          >
            Allow notifications
          </button>
        ) : null}

        {notifications.permission === 'granted' ? (
          <>
            <button
              type="button"
              role="switch"
              aria-checked={notifications.enabled}
              className={`toggle ${notifications.enabled ? 'toggle-on' : 'toggle-off'}`}
              onClick={() => notifications.toggle(!notifications.enabled)}
              aria-label={
                notifications.enabled ? 'Turn notifications off' : 'Turn notifications on'
              }
              data-testid="notification-enabled-toggle"
            >
              {notifications.enabled ? 'On' : 'Off'}
            </button>

            <button
              type="button"
              className="button"
              onClick={notifications.sendTest}
              data-testid="notification-test-button"
            >
              Send a test notification
            </button>
          </>
        ) : null}
      </div>

      <p className="field-hint" data-testid="notification-caveat">
        Notifications appear while the app is open in a tab, on any page. Closing the
        browser stops them.
      </p>
    </section>
  );
}
