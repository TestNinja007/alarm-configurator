import { createTransport, type Transporter } from 'nodemailer';
import { config } from '../config.js';

/**
 * Outbound email.
 *
 * Three transports, chosen by MAIL_TRANSPORT:
 *
 *   smtp     a real SMTP conversation. Points at Mailpit in development, where
 *            the message never leaves the machine, and at a provider in
 *            production. Identical code path either way.
 *   capture  keeps messages in memory and sends nothing. For running without
 *            any mail server at all.
 *   log      prints them. Useful when watching a container's output.
 *
 * The original brief forbade external network calls at runtime. `smtp` against
 * a local catcher honours that; `smtp` against a provider deliberately does
 * not, which is why the transport is a setting rather than a hard-coded choice.
 */

export interface SentMessage {
  to: string;
  subject: string;
  text: string;
  sentAt: string;
}

const captured: SentMessage[] = [];

let transporter: Transporter | undefined;

function smtpTransport(): Transporter {
  transporter ??= createTransport({
    host: config.mail.host,
    port: config.mail.port,
    // Mailpit speaks plain SMTP on 1025; a provider wants STARTTLS on 587.
    secure: config.mail.secure,
    ignoreTLS: config.mail.ignoreTls,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
    // Without these, nodemailer waits two minutes on a host that accepts the
    // connection and then says nothing, which is exactly how a filtered port
    // behaves.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
  return transporter;
}

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const record: SentMessage = { ...message, sentAt: new Date().toISOString() };

  switch (config.mail.transport) {
    case 'capture':
      captured.push(record);
      return;

    case 'log':
      captured.push(record);
      console.log(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
      return;

    case 'smtp':
      await smtpTransport().sendMail({
        from: config.mail.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      return;
  }
}

/** Everything captured so far, newest last. Empty under the smtp transport. */
export function capturedMessages(): SentMessage[] {
  return [...captured];
}

export function clearCapturedMessages(): void {
  captured.length = 0;
}

/**
 * Whether the mail server answered, as of the last time anyone asked.
 *
 * This is deliberately a cached value that is never awaited by its caller. An
 * earlier version had /health await transporter.verify(), which meant every
 * health check opened an SMTP connection. Against a host that accepts the
 * connection and then stays silent — a filtered port, for instance — that took
 * the full socket timeout, so health never responded, the platform decided the
 * service was dead, and the whole site went down. A health endpoint must not
 * depend on a third party answering.
 */
const REACHABILITY_TTL_MS = 60_000;

let lastReachable: boolean | null = null;
/**
 * Why the last check failed. Swallowing this made a broken mail setup
 * indistinguishable from a blocked port, so it is kept and surfaced.
 */
let lastMailError: string | null = null;
let lastCheckedAt = 0;
let checkInFlight = false;

function refreshReachability(): void {
  if (checkInFlight) return;
  checkInFlight = true;

  smtpTransport()
    .verify()
    .then(() => {
      lastReachable = true;
      lastMailError = null;
    })
    .catch((error: unknown) => {
      lastReachable = false;
      const candidate = error as { code?: string; responseCode?: number; message?: string };
      // The code is the useful part: EAUTH means the credentials are wrong,
      // ETIMEDOUT or ECONNREFUSED mean the port never opened.
      lastMailError = [candidate?.code, candidate?.responseCode, candidate?.message]
        .filter(Boolean)
        .join(' ')
        .slice(0, 200);
      console.warn(`[mail] SMTP check failed: ${lastMailError}`);
    })
    .finally(() => {
      lastCheckedAt = Date.now();
      checkInFlight = false;
    });
}

/**
 * Returns immediately. `null` means nobody has managed to check yet, which is
 * the honest answer during the first moments after a start.
 */
export function mailError(): string | null {
  return lastMailError;
}

export function mailReachable(): boolean | null {
  if (config.mail.transport !== 'smtp') return true;

  if (Date.now() - lastCheckedAt > REACHABILITY_TTL_MS) {
    // Kicked off in the background; this call does not wait for it.
    refreshReachability();
  }

  return lastReachable;
}
