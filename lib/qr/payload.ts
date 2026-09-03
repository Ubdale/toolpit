/**
 * Turns the QR tool's form fields into the strings scanners actually expect.
 *
 * These formats are conventions rather than one tidy standard — WIFI: comes
 * from Android, vCard from RFC 6350 — so the escaping rules differ per type and
 * are easy to get subtly wrong. Keeping them here means the tool's UI never has
 * to know about semicolon escaping.
 */

export type PayloadKind = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'sms' | 'phone';

export const payloadKinds: { value: PayloadKind; label: string }[] = [
  { value: 'url', label: 'Link' },
  { value: 'text', label: 'Plain text' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'vcard', label: 'Contact card' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'phone', label: 'Phone' },
];

/** Escapes the four characters that terminate fields in a WIFI: payload. */
function escapeWifi(value: string): string {
  return value.replace(/([\\;,":])/g, '\\$1');
}

/** vCard splits on unescaped semicolons and commas, and folds on newlines. */
function escapeVcard(value: string): string {
  return value.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
}

export type WifiFields = {
  ssid: string;
  password: string;
  security: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
};

export type VcardFields = {
  firstName: string;
  lastName: string;
  organization: string;
  jobTitle: string;
  phone: string;
  email: string;
  website: string;
};

export type EmailFields = { address: string; subject: string; body: string };
export type SmsFields = { number: string; message: string };

export function buildWifi(fields: WifiFields): string {
  const parts = [`T:${fields.security}`, `S:${escapeWifi(fields.ssid)}`];
  if (fields.security !== 'nopass') parts.push(`P:${escapeWifi(fields.password)}`);
  if (fields.hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}

export function buildVcard(fields: VcardFields): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`N:${escapeVcard(fields.lastName)};${escapeVcard(fields.firstName)};;;`);

  const fullName = [fields.firstName, fields.lastName].filter(Boolean).join(' ');
  if (fullName) lines.push(`FN:${escapeVcard(fullName)}`);
  if (fields.organization) lines.push(`ORG:${escapeVcard(fields.organization)}`);
  if (fields.jobTitle) lines.push(`TITLE:${escapeVcard(fields.jobTitle)}`);
  if (fields.phone) lines.push(`TEL;TYPE=CELL:${fields.phone}`);
  if (fields.email) lines.push(`EMAIL:${fields.email}`);
  if (fields.website) lines.push(`URL:${fields.website}`);

  lines.push('END:VCARD');
  return lines.join('\n');
}

export function buildEmail(fields: EmailFields): string {
  const query = new URLSearchParams();
  if (fields.subject) query.set('subject', fields.subject);
  if (fields.body) query.set('body', fields.body);
  const suffix = query.toString();
  return `mailto:${fields.address}${suffix ? `?${suffix}` : ''}`;
}

export function buildSms(fields: SmsFields): string {
  // The `?body=` form is what iOS and Android both accept; `:body` is Nokia-era.
  return `SMSTO:${fields.number}${fields.message ? `:${fields.message}` : ''}`;
}

export function buildPhone(number: string): string {
  return `tel:${number}`;
}

/**
 * Adds a scheme when someone types "toolpit.app" rather than the full URL —
 * without one, most scanners treat it as plain text and offer no open action.
 */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
