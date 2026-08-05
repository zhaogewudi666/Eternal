import { useEffect } from "react";
import { MagnifyingGlass, PencilSimple, Plus, X } from "@phosphor-icons/react";

import { isSubmitKey } from "../model/task-state";

// The composer textarea grows with its content but stops at three rows
// (3 × 20px line-height); longer drafts scroll inside the box instead of
// stretching the whole panel.
const MAX_COMPOSER_HEIGHT = 60;

function autoGrow(element) {
  // Reset first so the height follows the content, not its previous size.
  element.style.height = "auto";
  const next = Math.min(element.scrollHeight, MAX_COMPOSER_HEIGHT);
  element.style.height = `${next}px`;
}

export function TaskComposer({
  mode,
  value,
  inputRef,
  onChange,
  onSubmit,
  onExitSearch,
  onFocusInput,
  editing = false,
}) {
  const isSearch = mode === "search";

  // Keep the box in step with the value: shrink after a submit, and grow to
  // fit a prefilled multi-line title when an edit starts.
  useEffect(() => {
    if (isSearch || !inputRef.current) return;
    if (!value) {
      inputRef.current.style.height = "";
      return;
    }
    autoGrow(inputRef.current);
  }, [isSearch, value, inputRef]);

  if (isSearch) {
    return (
      <div className="composer is-search">
        <span className="composer-icon" aria-hidden="true">
          <MagnifyingGlass size={18} weight="regular" />
        </span>
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          aria-label="搜索待办"
          placeholder="搜索待办…"
          value={value}
          autoComplete="off"
          spellCheck="false"
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => onFocusInput?.()}
        />
        <button
          className="icon-button composer-clear"
          type="button"
          aria-label="退出搜索"
          onClick={onExitSearch}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={`composer ${editing ? "is-editing" : ""}`}>
      <span className="composer-icon" aria-hidden="true">
        {editing ? (
          <PencilSimple size={18} weight="regular" />
        ) : (
          <Plus size={20} weight="regular" />
        )}
      </span>
      <textarea
        ref={inputRef}
        rows={1}
        aria-label={editing ? "编辑任务标题" : "添加任务"}
        placeholder={editing ? "编辑任务标题…" : "添加任务"}
        value={value}
        autoComplete="off"
        spellCheck="false"
        onChange={(event) => {
          autoGrow(event.currentTarget);
          onChange(event.target.value);
        }}
        onFocus={() => onFocusInput?.()}
        onKeyDown={(event) => {
          // Plain Enter submits; Shift+Enter stays a newline.
          if (event.shiftKey) return;
          if (isSubmitKey(event.nativeEvent) && value.trim()) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
    </div>
  );
}
