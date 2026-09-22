import React, { useEffect, useRef } from 'react';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** The control the popover hangs off; rendered in place. */
  trigger: React.ReactNode;
  placement?: 'below' | 'above';
  align?: 'start' | 'end';
  className?: string;
  children: React.ReactNode;
}

/**
 * A small panel anchored to its trigger: menus, pickers, inline forms.
 * Closes on a click outside or Escape; the caller owns the open state.
 */
export const Popover: React.FC<PopoverProps> = ({ open, onClose, trigger, placement = 'below', align = 'start', className, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);
  return (
    <div className={`ui-popover-anchor${className ? ` ${className}` : ''}`} ref={ref}>
      {trigger}
      {open && (
        <div className={`ui-popover ${placement} ${align}`} role="menu">
          {children}
        </div>
      )}
    </div>
  );
};

interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean;
  /** A second, quieter line under the label. */
  hint?: string;
  icon?: React.ReactNode;
  tone?: 'danger' | 'quiet';
}

export const MenuItem: React.FC<MenuItemProps> = ({ checked, hint, icon, tone, className, children, ...rest }) => (
  <button type="button" role="menuitem" className={`ui-menu-item${checked ? ' checked' : ''}${tone ? ` ${tone}` : ''}${className ? ` ${className}` : ''}`} {...rest}>
    {checked !== undefined && <span className="ui-menu-check">{checked ? '✓' : ''}</span>}
    {icon}
    <span className="ui-menu-text">
      <span>{children}</span>
      {hint && <span className="ui-menu-hint">{hint}</span>}
    </span>
  </button>
);

export default Popover;
