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
 * Confirms the mail server is reachable. Reported by /health so a deployment
 * that cannot send is visible rather than silently swallowing registrations.
 */
export async function mailReachable(): Promise<boolean> {
  if (config.mail.transport !== 'smtp') return true;
  try {
    await smtpTransport().verify();
    return true;
  } catch {
    return false;
  }
}
