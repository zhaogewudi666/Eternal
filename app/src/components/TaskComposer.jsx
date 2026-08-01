import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";

import { isSubmitKey } from "../model/task-state";

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

  return (
    <div className={`composer ${isSearch ? "is-search" : ""}`}>
      <span className="composer-icon" aria-hidden="true">
        {isSearch ? (
          <MagnifyingGlass size={18} weight="regular" />
        ) : (
          <Plus size={20} weight="regular" />
        )}
      </span>
      <input
        ref={inputRef}
        type={isSearch ? "search" : "text"}
        role={isSearch ? "searchbox" : undefined}
        aria-label={isSearch ? "搜索待办" : "添加任务"}
        placeholder={isSearch ? "搜索待办…" : "添加任务"}
        value={value}
        autoComplete="off"
        spellCheck="false"
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => onFocusInput?.()}
        onKeyDown={(event) => {
          if (!isSearch && isSubmitKey(event.nativeEvent) && value.trim()) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      {isSearch && (
        <button
          className="icon-button composer-clear"
          type="button"
          aria-label="退出搜索"
          onClick={onExitSearch}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
