import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  /** Secondary line under the label, in the popup only. */
  hint?: string;
  /** Marks the option as problematic — used for the broken demo process. */
  warning?: boolean;
}

/**
 * A themed replacement for <select>.
 *
 * The native element's popup is drawn by the OS, so it ignores the page's
 * palette entirely — a white list with a blue highlight on top of a dark page.
 * This is the ARIA select-only combobox: focus stays on the button and the
 * active option is tracked with aria-activedescendant.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", at: 0 });

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const selected = options[selectedIndex];

  // Close when the click lands anywhere else on the page.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const openList = (index = selectedIndex) => {
    setActiveIndex(index);
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  /** Jump to the next option starting with what was just typed. */
  const jumpTo = (char: string) => {
    const now = Date.now();
    const text = now - typeahead.current.at < 600 ? typeahead.current.text + char : char;
    typeahead.current = { text, at: now };

    const from = open ? activeIndex : selectedIndex;
    const found = options.findIndex((option, i) => {
      const rotated = (from + 1 + i) % options.length;
      return options[rotated].label.toLowerCase().startsWith(text.toLowerCase()) && rotated >= 0;
    });
    if (found === -1) return;

    const index = (from + 1 + found) % options.length;
    if (open) setActiveIndex(index);
    else commit(index);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = options.length - 1;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList();
        else setActiveIndex((index) => Math.min(last, index + 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList();
        else setActiveIndex((index) => Math.max(0, index - 1));
        return;
      case "Home":
        if (!open) return;
        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        if (!open) return;
        event.preventDefault();
        setActiveIndex(last);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) commit(activeIndex);
        else openList();
        return;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        setOpen(false);
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          jumpTo(event.key);
        }
    }
  };

  return (
    <div className={`select${className ? ` ${className}` : ""}`} ref={rootRef}>
      <span className="select-label" id={`${baseId}-label`}>
        {label}
      </span>

      <button
        type="button"
        ref={buttonRef}
        className={`select-button${open ? " is-open" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${baseId}-list`}
        aria-labelledby={`${baseId}-label`}
        aria-activedescendant={open ? `${baseId}-option-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">
          {selected?.warning && (
            <span className="select-warning" aria-hidden>
              !
            </span>
          )}
          {selected?.label ?? "Select…"}
        </span>
        <span className="select-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <ul
          className="select-list"
          id={`${baseId}-list`}
          role="listbox"
          aria-labelledby={`${baseId}-label`}
          ref={listRef}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${baseId}-option-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === selectedIndex}
              className={
                "select-option" +
                (index === activeIndex ? " is-active" : "") +
                (index === selectedIndex ? " is-selected" : "")
              }
              // mousedown would fire before the outside-click handler closes us.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span className="select-option-main">
                {option.warning && (
                  <span className="select-warning" aria-hidden>
                    !
                  </span>
                )}
                <span className="select-option-label">{option.label}</span>
                <span className="select-check" aria-hidden>
                  {index === selectedIndex ? "✓" : ""}
                </span>
              </span>
              {option.hint && <span className="select-option-hint">{option.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
