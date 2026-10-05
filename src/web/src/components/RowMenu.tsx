import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  /** Styles the item as destructive. It still only opens a confirmation. */
  danger?: boolean;
  testId: string;
}

interface RowMenuProps {
  /** Names the row, since the trigger itself is only three dots. */
  label: string;
  items: RowMenuItem[];
  testId: string;
}

/**
 * The actions for one row, behind one button.
 *
 * A row with every action spelled out reads as a row of buttons with a name
 * attached, and the buttons repeat down the page as many times as there are
 * rows. Collapsing them puts the name first and the verbs one click away.
 *
 * Radix brings the keyboard behaviour a menu is expected to have — arrows to
 * move, Escape to close, focus returning to the trigger — which is most of the
 * reason not to build this out of a button and a div.
 */
export function RowMenu({ label, items, testId }: RowMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="button row-menu-trigger"
          aria-label={label}
          data-testid={testId}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <circle cx="3" cy="9" r="1.6" fill="currentColor" />
            <circle cx="9" cy="9" r="1.6" fill="currentColor" />
            <circle cx="15" cy="9" r="1.6" fill="currentColor" />
          </svg>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="row-menu"
          align="end"
          sideOffset={6}
          data-testid={`${testId}-menu`}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.testId}
              className={`row-menu-item${item.danger ? ' row-menu-item-danger' : ''}`}
              onSelect={item.onSelect}
              data-testid={item.testId}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
