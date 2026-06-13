// src/ui/settings.ts
import type { InputScheme } from '../save/profile';

export interface SettingsPanel {
  toggle(): void;
  setScheme(scheme: InputScheme): void;
  destroy(): void;
}

export function createSettingsPanel(
  root: HTMLElement,
  initial: InputScheme,
  onChange: (scheme: InputScheme) => void,
): SettingsPanel {
  const panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.style.cssText =
    'position:absolute;top:52px;right:12px;background:rgba(38,50,56,.96);color:#fff;padding:16px;border-radius:12px;display:none;pointer-events:auto;font-size:14px;min-width:220px;';
  panel.innerHTML = `
    <div style="font-weight:700;margin-bottom:10px;">Settings</div>
    <div style="margin-bottom:6px;color:#90a4ae;font-size:12px;">SWING INPUT</div>
    <label style="display:block;margin-bottom:6px;cursor:pointer;">
      <input type="radio" name="scheme" id="scheme-holdRelease" value="holdRelease"> Hold &amp; Release
    </label>
    <label style="display:block;cursor:pointer;">
      <input type="radio" name="scheme" id="scheme-threeClick" value="threeClick"> 3-Click Meter
    </label>
  `;
  root.appendChild(panel);

  const radios = panel.querySelectorAll<HTMLInputElement>('input[name="scheme"]');
  for (const r of radios) {
    r.checked = r.value === initial;
    r.addEventListener('change', () => {
      if (r.checked) onChange(r.value as InputScheme);
    });
  }

  return {
    toggle: () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },
    setScheme: (scheme) => {
      for (const r of radios) r.checked = r.value === scheme;
    },
    destroy: () => {
      panel.remove();
    },
  };
}
