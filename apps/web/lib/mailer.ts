// Shared email sender using SMTP env vars (same credentials as notification_service).
// Uses nodemailer — already installed in package.json.
import nodemailer from "nodemailer";

function createTransport() {
  const host = process.env.SMTP_HOST ?? "mailhog";
  const port = parseInt(process.env.SMTP_PORT ?? "1025", 10);
  const user = process.env.SMTP_USERNAME ?? "";
  const pass = process.env.SMTP_PASSWORD ?? "";

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  try {
    const transporter = createTransport();
    const from = process.env.SMTP_FROM ?? "noreply@aistaff.app";
    await transporter.sendMail({ from, to, subject, text });
    return true;
  } catch (err) {
    console.error("[mailer] send failed:", err);
    return false;
  }
}
