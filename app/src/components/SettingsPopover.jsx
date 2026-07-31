export function SettingsPopover({ theme, onThemeChange, onClose }) {
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
    </section>
  );
}
