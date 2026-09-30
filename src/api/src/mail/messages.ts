import { CODE_TTL_MINUTES } from '../auth/verification.js';
import { RESET_TTL_MINUTES } from '../auth/passwordReset.js';
import { sendMail } from './mailer.js';

/**
 * Plain text only. An HTML email would need a template, inlined CSS and a text
 * fallback anyway, and none of that makes the flow any more testable.
 */
export async function sendVerificationCode(options: {
  to: string;
  name: string;
  code: string;
}): Promise<void> {
  await sendMail({
    to: options.to,
    subject: `Your Alarm Configurator code is ${options.code}`,
    text: [
      `Hello ${options.name},`,
      '',
      'Use this code to finish creating your Alarm Configurator account:',
      '',
      `    ${options.code}`,
      '',
      `The code expires in ${CODE_TTL_MINUTES} minutes. Requesting another one`,
      'replaces it.',
      '',
      'If you did not ask for an account, ignore this message: nothing happens',
      'until the code is entered.',
      '',
      '— Alarm Configurator',
    ].join('\n'),
  });
}

export async function sendPasswordResetCode(options: {
  to: string;
  name: string;
  code: string;
}): Promise<void> {
  await sendMail({
    to: options.to,
    subject: `Your Alarm Configurator password reset code is ${options.code}`,
    text: [
      `Hello ${options.name},`,
      '',
      'Use this code to choose a new Alarm Configurator password:',
      '',
      `    ${options.code}`,
      '',
      `The code expires in ${RESET_TTL_MINUTES} minutes. Requesting another one`,
      'replaces it.',
      '',
      'If you did not ask to reset your password, ignore this message. Your',
      'password has not changed and nothing happens until the code is used.',
      '',
      '— Alarm Configurator',
    ].join('\n'),
  });
}
