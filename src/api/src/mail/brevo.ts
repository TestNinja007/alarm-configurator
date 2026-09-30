import { config } from '../config.js';

/**
 * Brevo's transactional email API.
 *
 * This exists because hosting platforms block outbound SMTP. Render does: a
 * connection to smtp-relay.brevo.com:587 times out there regardless of
 * credentials. HTTPS on 443 is never blocked, so the same provider is reached
 * a different way.
 */

const SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const ACCOUNT_URL = 'https://api.brevo.com/v3/account';
const TIMEOUT_MS = 10_000;

/** Splits `Name <address>` into its parts; a bare address is fine too. */
export function parseAddress(value: string): { email: string; name?: string } {
  const match = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(value);
  if (match?.[2]) {
    const name = match[1]?.trim();
    return name ? { email: match[2].trim(), name } : { email: match[2].trim() };
  }
  return { email: value.trim() };
}

function requireApiKey(): string {
  const key = config.mail.apiKey;
  if (!key) throw new Error('MAIL_API_KEY is required when MAIL_TRANSPORT=brevo.');
  return key;
}

export async function sendViaBrevo(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const response = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      'api-key': requireApiKey(),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseAddress(config.mail.from),
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    // Brevo explains refusals in the body — an unverified sender, a spent
    // quota — and that is worth propagating rather than losing.
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo refused the message: ${response.status} ${detail.slice(0, 300)}`);
  }
}

/** Confirms the API key works, without sending anything. */
export async function brevoReachable(): Promise<void> {
  const response = await fetch(ACCOUNT_URL, {
    headers: { 'api-key': requireApiKey(), accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Brevo account check failed: ${response.status}`);
  }
}
