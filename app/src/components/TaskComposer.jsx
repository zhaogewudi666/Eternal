import { useEffect } from "react";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";

import { isSubmitKey } from "../model/task-state";

function autoGrow(element) {
  // Reset first so the height follows the content, not its previous size.
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

export function TaskComposer({
  mode,
  value,
  inputRef,
  onChange,
  onSubmit,
  onExitSearch,
  onFocusInput,
}) {
  const isSearch = mode === "search";

  // After a submit the App clears the draft; shrink back to a single row.
  useEffect(() => {
    if (!isSearch && !value && inputRef.current) {
      inputRef.current.style.height = "";
    }
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
    <div className="composer">
      <span className="composer-icon" aria-hidden="true">
        <Plus size={20} weight="regular" />
      </span>
      <textarea
        ref={inputRef}
        rows={1}
        aria-label="添加任务"
        placeholder="添加任务"
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
