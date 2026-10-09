import sgMail from "@sendgrid/mail";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

if (env.SENDGRID_API_KEY) {
  sgMail.setApiKey(env.SENDGRID_API_KEY);
}

/** Mirrors the light-theme tokens in client/src/index.css — emails render as their own static document, so the palette is duplicated here as literal hex rather than shared at build time. */
const COLORS = {
  bg: "#f6ecec",
  surface: "#fffafa",
  text: "#241f1f",
  textMuted: "#6b5e5d",
  primary: "#c8252f",
};

/**
 * Wraps email body content in the shared Inntena layout: a centered card with a
 * text wordmark header and a consistent footer/CTA button. There's no logo image —
 * the app's own wordmark is styled text (see HeroWordmark.tsx), and many email
 * clients block remote images by default, so this reproduces it as inline-styled
 * text instead. Table-based layout with every style inlined is the standard
 * approach for cross-client email compatibility (Outlook desktop in particular
 * ignores most CSS outside of inline attributes).
 */
function renderEmailLayout(heading: string, bodyHtml: string, ctaLabel: string, ctaUrl: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0; padding:0; background-color:${COLORS.bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.bg};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:${COLORS.surface}; border:1px solid ${COLORS.primary}22; border-radius:12px;">
            <tr>
              <td align="center" style="padding:36px 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:8px;">
                      <div style="width:10px; height:10px; border-radius:50%; background-color:${COLORS.primary};"></div>
                    </td>
                    <td>
                      <span style="font-family: Georgia, 'Times New Roman', serif; font-size:26px; font-weight:700; color:${COLORS.primary}; letter-spacing:0.02em;">inntena</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;">
                <h1 style="margin:0 0 12px; font-family: Georgia, 'Times New Roman', serif; font-size:20px; font-weight:600; color:${COLORS.text};">${heading}</h1>
                <div style="font-family: Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:${COLORS.text};">
                  ${bodyHtml}
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:6px; background-color:${COLORS.primary};">
                      <a href="${ctaUrl}" style="display:inline-block; padding:12px 28px; font-family: Arial, Helvetica, sans-serif; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:6px;">${ctaLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px;">
                <p style="margin:0; font-family: Arial, Helvetica, sans-serif; font-size:12px; line-height:1.5; color:${COLORS.textMuted};">
                  If the button doesn't work, copy and paste this link into your browser:<br />
                  <a href="${ctaUrl}" style="color:${COLORS.primary}; word-break:break-all;">${ctaUrl}</a>
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0; font-family: Arial, Helvetica, sans-serif; font-size:11px; color:${COLORS.textMuted};">Inntena &middot; open-source trend detection for Etsy sellers</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) {
    logger.info(`[email:disabled] Would send "${subject}" to ${to}`, { html });
    return;
  }
  await sgMail.send({ from: `Inntena <${env.SENDGRID_FROM_EMAIL}>`, to, subject, html });
}

/** Sends the "verify your email" link, valid for 24 hours (see TTL_MS in authToken.service.ts). */
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/verify-email?token=${token}`;
  const html = renderEmailLayout(
    "Confirm your email address",
    `<p style="margin:0 0 12px;">Click the button below to verify your email and finish setting up your Inntena account.</p>
     <p style="margin:0; color:${COLORS.textMuted};">This link expires in 24 hours.</p>`,
    "Verify email",
    link
  );
  await sendEmail(to, "Verify your Inntena email", html);
}

/** Sends the password-reset link, valid for 45 minutes (see TTL_MS in authToken.service.ts). */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/reset-password?token=${token}`;
  const html = renderEmailLayout(
    "Reset your password",
    `<p style="margin:0 0 12px;">We received a request to reset your Inntena password. Click the button below to choose a new one.</p>
     <p style="margin:0; color:${COLORS.textMuted};">This link expires in 45 minutes. If you didn't request this, you can safely ignore this email.</p>`,
    "Reset password",
    link
  );
  await sendEmail(to, "Reset your Inntena password", html);
}
