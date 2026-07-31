export function SettingsPopover({
  theme,
  onThemeChange,
  onClose,
  shortcutLabel,
  shortcutError,
  isRecordingShortcut,
  onStartRecording,
  onResetShortcut,
}) {
  const status = isRecordingShortcut
    ? "正在等待新的组合，按 Esc 取消录制。"
    : shortcutError || "在任何应用中呼出或收起 Eternal。";

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
    </section>
  );
}
