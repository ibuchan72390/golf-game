import { CLUBS } from '../sim/clubs';
import { upgradeCost, MAX_STAT_LEVEL, type StatKey } from '../sim/progression';
import type { ClubId } from '../sim/types';
import type { Profile } from '../save/profile';

const CLUB_IDS: ClubId[] = ['driver', 'wood3', 'iron5', 'iron7', 'iron9', 'pitchingWedge', 'sandWedge', 'putter'];
const STATS: { key: StatKey; label: string; color: string }[] = [
  { key: 'power', label: 'Power', color: '#66bb6a' },
  { key: 'accuracy', label: 'Accuracy', color: '#4fc3f7' },
  { key: 'forgiveness', label: 'Forgiveness', color: '#ffca28' },
  { key: 'spin', label: 'Spin', color: '#ba68c8' },
];

export interface UpgradeCallbacks {
  onBuy(club: ClubId, stat: StatKey): void;
  onClose(): void;
}

export function showUpgradeScreen(root: HTMLElement, profile: Profile, cb: UpgradeCallbacks, selected: ClubId = 'driver'): void {
  const overlay = 'position:absolute;inset:0;background:linear-gradient(180deg,#37474f,#263238);color:#fff;pointer-events:auto;font-family:system-ui,sans-serif;display:flex;flex-direction:column;padding:14px;gap:10px;';
  const list = CLUB_IDS.map((id) => {
    const on = id === selected;
    return `<button id="club-${id}" style="text-align:left;background:${on ? '#1b5e20' : '#455a64'};color:#fff;border:none;border-radius:8px;padding:8px 10px;font-size:13px;font-weight:${on ? 700 : 400};cursor:pointer;">${CLUBS[id].name}</button>`;
  }).join('');
  const lv = profile.clubLevels[selected];
  const detail = STATS.map((s) => {
    const level = lv[s.key];
    const cost = upgradeCost(level);
    const maxed = level >= MAX_STAT_LEVEL;
    const afford = profile.skillPoints >= cost && !maxed;
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#b0bec5;">${s.label}</span><span>Lv ${level}</span></div>
        <div style="height:10px;background:#1b2327;border-radius:5px;margin:4px 0;overflow:hidden;"><div style="width:${(level / MAX_STAT_LEVEL) * 100}%;height:100%;background:${s.color};"></div></div>
        <button id="buy-${s.key}" ${maxed || !afford ? 'disabled' : ''} style="width:100%;background:${afford ? '#ffca28' : '#546e7a'};color:#263238;border:none;border-radius:6px;padding:6px;font-size:11px;font-weight:800;cursor:${afford ? 'pointer' : 'default'};">${maxed ? 'MAX' : `+ ${s.label} · ${cost} ⭐`}</button>
      </div>`;
  }).join('');
  root.innerHTML = `
    <div style="${overlay}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:22px;font-weight:800;">Upgrade Clubs</div>
        <div style="font-size:16px;font-weight:800;color:#ffca28;">⭐ ${profile.skillPoints} SP</div>
        <button id="upgrade-close" style="background:#546e7a;color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;">Done</button>
      </div>
      <div style="display:flex;gap:10px;flex:1;min-height:0;">
        <div style="width:40%;display:flex;flex-direction:column;gap:4px;overflow:auto;">${list}</div>
        <div style="flex:1;background:#1b2327;border-radius:10px;padding:12px;overflow:auto;">
          <div style="font-weight:800;margin-bottom:10px;">${CLUBS[selected].name}</div>
          ${detail}
        </div>
      </div>
    </div>`;
  for (const id of CLUB_IDS) {
    (root.querySelector(`#club-${id}`) as HTMLElement).onclick = () => showUpgradeScreen(root, profile, cb, id);
  }
  for (const s of STATS) {
    const b = root.querySelector(`#buy-${s.key}`) as HTMLButtonElement;
    if (!b.disabled) b.onclick = () => cb.onBuy(selected, s.key);
  }
  (root.querySelector('#upgrade-close') as HTMLElement).onclick = cb.onClose;
}
