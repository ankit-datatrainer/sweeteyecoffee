/** An error with an HTTP status and a message that is safe to show the customer. */
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

/** Small validation helpers — return trimmed strings or throw a 422. */
export function requireString(value, message, max = 255) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) fail(422, message);
  if (text.length > max) fail(422, `${message.replace(/^Please (enter|choose) /, '').replace(/\.$/, '')} is too long.`);
  return text;
}

export function optionalString(value, max = 255) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) fail(422, `Please keep this under ${max} characters.`);
  return text;
}

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || ''));

export const money = (value) => Math.round(Number(value) * 100) / 100;
