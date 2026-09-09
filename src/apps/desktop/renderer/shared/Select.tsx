import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  options: readonly SelectOption[];
  onChange(value: string): void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  disabled?: boolean;
  className?: string;
}

interface MenuPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: "top" | "bottom";
}

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 220;

type SelectKeyAction =
  "close" | "open" | "previous" | "next" | "first" | "last" | "commit" | "typeahead";

const OPEN_KEY_ACTIONS: Readonly<Record<string, SelectKeyAction>> = {
  Escape: "close",
  ArrowDown: "next",
  ArrowUp: "previous",
  Home: "first",
  End: "last",
  Enter: "commit",
  " ": "commit",
};

const CLOSED_KEY_ACTIONS: Readonly<Record<string, SelectKeyAction>> = {
  ArrowDown: "open",
  ArrowUp: "open",
  Enter: "open",
  " ": "open",
};

function actionForKey(
  event: KeyboardEvent<HTMLButtonElement>,
  open: boolean,
): SelectKeyAction | null {
  const mapped = (open ? OPEN_KEY_ACTIONS : CLOSED_KEY_ACTIONS)[event.key];
  if (mapped !== undefined) return mapped;
  const modified = event.ctrlKey || event.metaKey || event.altKey;
  return event.key.length === 1 && !modified ? "typeahead" : null;
}

/** Cross-platform desktop select. The option popup is rendered by Reqraft, not the OS. */
export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  ariaLabelledBy,
  disabled = false,
  className,
}: Readonly<SelectProps>): React.JSX.Element {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [highlighted, setHighlighted] = useState(selectedIndex);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const enabledIndexes = useMemo(
    () => options.flatMap((option, index) => (option.disabled ? [] : [index])),
    [options],
  );

  const updatePosition = (): void => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - MENU_GAP;
    const above = rect.top - MENU_GAP;
    const placement = below < 140 && above > below ? "top" : "bottom";
    const available = placement === "bottom" ? below : above;
    const maxHeight = Math.max(96, Math.min(MENU_MAX_HEIGHT, available - 10));
    setPosition({
      left: Math.min(rect.left, window.innerWidth - rect.width - 8),
      top: placement === "bottom" ? rect.bottom + MENU_GAP : rect.top - MENU_GAP,
      width: rect.width,
      maxHeight,
      placement,
    });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const onViewportChange = (): void => {
      updatePosition();
    };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    setHighlighted(selectedIndex);
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open || position === null) return;
    const option = document.getElementById(`${listboxId}-option-${String(highlighted)}`);
    if (typeof option?.scrollIntoView === "function") option.scrollIntoView({ block: "nearest" });
  }, [highlighted, listboxId, open, position]);

  useEffect(
    () => () => {
      if (typeaheadTimerRef.current !== null) clearTimeout(typeaheadTimerRef.current);
    },
    [],
  );

  const choose = (index: number): void => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setHighlighted(index);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const move = (step: 1 | -1): void => {
    if (enabledIndexes.length === 0) return;
    const current = enabledIndexes.indexOf(highlighted);
    const base = current < 0 ? enabledIndexes.indexOf(selectedIndex) : current;
    const next = (Math.max(0, base) + step + enabledIndexes.length) % enabledIndexes.length;
    setHighlighted(enabledIndexes[next] ?? 0);
  };

  const typeahead = (key: string): void => {
    typeaheadRef.current += key.toLocaleLowerCase();
    if (typeaheadTimerRef.current !== null) clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = setTimeout(() => {
      typeaheadRef.current = "";
    }, 600);
    const start = Math.max(0, highlighted + 1);
    const ordered = [...options.slice(start), ...options.slice(0, start)];
    const match = ordered.find(
      (option) =>
        !option.disabled && option.label.toLocaleLowerCase().startsWith(typeaheadRef.current),
    );
    if (match) setHighlighted(options.indexOf(match));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const action = actionForKey(event, open);
    if (action === null) return;
    event.preventDefault();
    switch (action) {
      case "close":
        setOpen(false);
        break;
      case "open":
        setHighlighted(selectedIndex);
        setOpen(true);
        break;
      case "previous":
        move(-1);
        break;
      case "next":
        move(1);
        break;
      case "first":
        setHighlighted(enabledIndexes[0] ?? 0);
        break;
      case "last":
        setHighlighted(enabledIndexes.at(-1) ?? 0);
        break;
      case "commit":
        choose(highlighted);
        break;
      case "typeahead":
        if (!open) setOpen(true);
        typeahead(event.key);
        break;
    }
  };

  const classes = ["design-select", open && "design-select-open", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rootRef} className={classes}>
      <button
        ref={triggerRef}
        type="button"
        className="design-select-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${listboxId}-option-${String(highlighted)}` : undefined}
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={onKeyDown}
      >
        <span className="design-select-value">{selected?.label ?? value}</span>
        <ChevronDown className="design-select-chevron" size={14} aria-hidden />
      </button>

      {open &&
        position !== null &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            className={`design-select-menu design-select-menu-${position.placement}`}
            role="listbox"
            aria-labelledby={ariaLabelledBy}
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
              transform: position.placement === "top" ? "translateY(-100%)" : undefined,
            }}
          >
            {options.map((option, index) => {
              const previousGroup = options[index - 1]?.group;
              return (
                <div key={option.value}>
                  {option.group && option.group !== previousGroup && (
                    <div className="design-select-group" aria-hidden>
                      {option.group}
                    </div>
                  )}
                  <div
                    id={`${listboxId}-option-${String(index)}`}
                    className={
                      index === highlighted
                        ? "design-select-option design-select-option-highlighted"
                        : "design-select-option"
                    }
                    role="option"
                    aria-selected={option.value === value}
                    aria-disabled={option.disabled ?? undefined}
                    onMouseEnter={() => {
                      if (!option.disabled) setHighlighted(index);
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      choose(index);
                    }}
                  >
                    <span>{option.label}</span>
                    {option.value === value && <Check size={13} aria-hidden />}
                  </div>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
