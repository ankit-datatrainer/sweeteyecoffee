import { config } from '../config.js';
import { first, query } from '../db.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatters = new Map();
const formatterFor = (timeZone) => {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short', hourCycle: 'h23',
    }));
  }
  return formatters.get(timeZone);
};

/** Wall-clock parts of `date` in the shop's timezone. */
export function shopClock(date = new Date(), timeZone = config.store.timezone) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    monthDay: `${parts.month}-${parts.day}`,
    dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const label12h = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Clean a {0..6: [open, close] | null} map; anything invalid falls back to the default for that day. */
export function normalizeHours(raw, fallback = config.store.hours) {
  const out = {};
  for (let d = 0; d < 7; d++) {
    const v = raw?.[d] ?? raw?.[String(d)];
    if (v === null) out[d] = null;
    else if (Array.isArray(v) && HHMM.test(v[0]) && HHMM.test(v[1]) && toMinutes(v[1]) > toMinutes(v[0])) out[d] = [v[0], v[1]];
    else out[d] = fallback[d] ?? null;
  }
  return out;
}

/** Opening hours by weekday: the staff setting, else the defaults in config. */
export async function storeHours() {
  try {
    const saved = await getSetting('store_hours');
    return normalizeHours(saved ? JSON.parse(saved) : null);
  } catch {
    return normalizeHours(null);
  }
}

/** "Sun – Thu: 7:30 AM – 9:00 PM" style rows, grouping neighbouring days with the same times (Sunday first). */
export function hoursDisplay(hours) {
  const rows = [];
  for (let d = 0; d < 7; d++) {
    const time = hours[d] ? `${label12h(hours[d][0])} – ${label12h(hours[d][1])}` : 'Closed';
    const last = rows.at(-1);
    if (last && last.time === time) last.to = d;
    else rows.push({ from: d, to: d, time });
  }
  return rows.map((r) => ({ days: r.from === r.to ? DAY_SHORT[r.from] : `${DAY_SHORT[r.from]} – ${DAY_SHORT[r.to]}`, time: r.time }));
}

/** Port of App\Support\StoreHours::status — "Open now · until 9:00 PM". */
export function storeStatus(date = new Date(), hours = config.store.hours) {
  const { dayOfWeek, minutes } = shopClock(date);
  const [open, close] = hours[dayOfWeek] ?? [];

  if (open && close) {
    if (minutes >= toMinutes(open) && minutes < toMinutes(close)) {
      return { open: true, label: 'Open now', detail: `until ${label12h(close)}`, closes_at: close };
    }
    if (minutes < toMinutes(open)) {
      return { open: false, label: 'Closed', detail: `opens today at ${label12h(open)}` };
    }
  }

  for (let i = 1; i <= 7; i++) {
    const day = (dayOfWeek + i) % 7;
    if (hours[day]?.[0]) {
      return {
        open: false,
        label: 'Closed',
        detail: `opens ${i === 1 ? 'tomorrow' : WEEKDAYS[day]} at ${label12h(hours[day][0])}`,
      };
    }
  }
  return { open: false, label: 'Closed', detail: '' };
}

/** Seasonal menus show only between season_start and season_end ("MM-DD", inclusive, may wrap the new year). */
export function isInSeason(category, date = new Date()) {
  if (!category.season_start || !category.season_end) return true;
  const today = shopClock(date).monthDay;
  return category.season_start <= category.season_end
    ? today >= category.season_start && today <= category.season_end
    : today >= category.season_start || today <= category.season_end;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function seasonLabel(category) {
  if (!category.season_start || !category.season_end) return null;
  const fmt = (md) => {
    const [m, d] = md.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}`;
  };
  return `${fmt(category.season_start)} – ${fmt(category.season_end)}`;
}

// ── settings table (same keys the Laravel admin writes) ─────────────────────

export async function getSetting(key, fallback = null) {
  const row = await first('SELECT `value` FROM settings WHERE `key` = ?', [key]);
  return row ? row.value : fallback;
}

export async function getSettings(keys) {
  const rows = await query('SELECT `key`, `value` FROM settings WHERE `key` IN (?)', [keys]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function taxRate() {
  return Number(await getSetting('tax_rate', 8)) / 100;
}

export async function curbsideEnabled() {
  return Number(await getSetting('curbside_enabled', '1')) === 1;
}
