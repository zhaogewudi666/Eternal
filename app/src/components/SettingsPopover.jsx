export function SettingsPopover({
  theme,
  onThemeChange,
  onClose,
  shortcutLabel,
  shortcutError,
  isRecordingShortcut,
  onStartRecording,
  onResetShortcut,
  pinShortcutLabel,
  autostartEnabled,
  autostartPending,
  autostartError,
  onAutostartChange,
  onRetryAutostartLoad,
}) {
  const status = isRecordingShortcut
    ? "正在等待新的组合，按 Esc 取消录制。"
    : shortcutError || "在任何应用中呼出或收起 Eternal。";
  const autostartKnown = typeof autostartEnabled === "boolean";
  const autostartBusy = Boolean(autostartPending);
  const showReadRetry =
    !autostartKnown && !autostartPending && Boolean(autostartError);
  function handleSwitchKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.altKey) return;
    if (event.metaKey || event.ctrlKey) return;
    if (autostartBusy || !autostartKnown) return;
    event.preventDefault();
    onAutostartChange?.(!autostartEnabled);
  }

  return (
    <section className="popover settings-popover" aria-label="设置">
      <header className="popover-header">
        <div>
          <strong>外观</strong>
          <span>选择面板显示方式</span>
        </div>
        <button className="text-button" type="button" onClick={onClose}>
          完成
        </button>
      </header>
      <div className="segmented-control" role="radiogroup" aria-label="主题">
        {[
          ["system", "跟随系统"],
          ["light", "浅色"],
          ["dark", "深色"],
        ].map(([value, label]) => (
          <label key={value} className={theme === value ? "is-active" : ""}>
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              autoFocus={theme === value}
              onChange={() => onThemeChange(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <section className="shortcut-section" aria-label="全局快捷键">
        <div className="shortcut-heading">
          <strong>全局快捷键</strong>
        </div>
        <div className="shortcut-row">
          <button
            className={`shortcut-recorder ${
              isRecordingShortcut ? "is-recording" : ""
            }`}
            type="button"
            aria-label={
              isRecordingShortcut
                ? "录制全局快捷键，正在等待按键"
                : "录制全局快捷键"
            }
            aria-pressed={isRecordingShortcut}
            onClick={onStartRecording}
          >
            {isRecordingShortcut ? "按下新的组合…" : shortcutLabel}
          </button>
          <button
            className="text-button"
            type="button"
            aria-label="恢复默认快捷键"
            onClick={onResetShortcut}
          >
            恢复默认
          </button>
        </div>
        <p
          className={`shortcut-hint ${shortcutError ? "is-error" : ""}`}
          role="status"
        >
          {status}
        </p>
      </section>

      <section className="shortcut-section" aria-label="钉板快捷键">
        <div className="shortcut-heading">
          <strong>钉板快捷键</strong>
        </div>
        <p className="shortcut-hint" role="note">
          {pinShortcutLabel || "CommandOrControl+Shift+P"}{" "}
          切换固定面板。固定后切换应用不会自动收起；全局呼出快捷键不变。
        </p>
      </section>

      <section className="autostart-section" aria-label="开机启动">
        <div className="autostart-row">
          <span>开机时启动 Eternal</span>
          {autostartKnown ? (
            <input
              type="checkbox"
              role="switch"
              aria-label="开机时启动 Eternal"
              checked={autostartEnabled}
              disabled={autostartBusy}
              onChange={(event) => onAutostartChange?.(event.target.checked)}
              onKeyDown={handleSwitchKeyDown}
            />
          ) : autostartError ? (
            <span className="shortcut-hint" aria-hidden="true">
              —
            </span>
          ) : (
            <span
              className="shortcut-hint"
              role="status"
              aria-live="polite"
              aria-label="正在读取开机启动状态"
            >
              正在读取开机启动状态…
            </span>
          )}
        </div>
        {autostartError ? (
          <p className="shortcut-hint is-error" role="status">
            {autostartError}
          </p>
        ) : null}
        {showReadRetry ? (
          <button
            className="text-button autostart-retry"
            type="button"
            aria-label="重试读取开机启动状态"
            onClick={() => onRetryAutostartLoad?.()}
          >
            重试
          </button>
        ) : null}
      </section>
    </section>
  );
}
