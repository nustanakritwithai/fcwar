export const CLIENT_MESSAGES = new Set([
  'hello', 'selectFaction', 'selectClass', 'selectItem', 'input',
  'primary', 'secondary', 'gather', 'deposit', 'build', 'respawn'
]);

export function parseClientMessage(raw) {
  try {
    const value = JSON.parse(String(raw));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (typeof value.type !== 'string' || !CLIENT_MESSAGES.has(value.type)) return null;
    return value;
  } catch {
    return null;
  }
}

export function encode(type, payload = {}) {
  return JSON.stringify({ type, ...payload });
}

export function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
