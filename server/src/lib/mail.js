import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport = null;

/**
 * Sends an email when MAIL_ENABLED=true; otherwise prints it to the console so
 * local testing never emails real customers. Never throws.
 */
export async function sendMail({ to, subject, text, replyTo }) {
  if (!to) return false;
  if (!config.mail.enabled) {
    if (config.isProduction) {
      console.warn(`[mail disabled] not sent: "${subject}" — set MAIL_ENABLED=true`);
      return false;
    }
    console.log(`\n✉️  [mail disabled] to: ${to}\n   subject: ${subject}\n   ${text.split('\n').join('\n   ')}\n`);
    return false;
  }
  try {
    transport ??= nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.port === 465,
      auth: { user: config.mail.user, pass: config.mail.password },
    });
    await transport.sendMail({
      from: { name: config.mail.fromName, address: config.mail.fromAddress },
      to,
      subject,
      text,
      replyTo,
    });
    return true;
  } catch (error) {
    console.error('Mail failed:', error.message);
    return false;
  }
}
