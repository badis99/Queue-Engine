import nodemailer from "nodemailer";
import { env } from "../config/env";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) {
    return transporter;
  }

  if (env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE === "true",
      auth: env.SMTP_USER && env.SMTP_PASS
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
          }
        : undefined
    });

    return transporter;
  }

  // Local fallback for development when SMTP is not configured.
  transporter = nodemailer.createTransport({
    jsonTransport: true
  });

  return transporter;
}

export async function emailHandler(payload: { receiver: string; subject: string; message: string }): Promise<void> {
  if (!env.SMTP_HOST && env.NODE_ENV === "production") {
    throw new Error("SMTP is not configured. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS and MAIL_FROM.");
  }

  const mailer = getTransporter();

  const info = await mailer.sendMail({
    from: env.MAIL_FROM ?? "noreply@queue.local",
    to: payload.receiver,
    subject: payload.subject,
    text: payload.message
  });

  if (!env.SMTP_HOST) {
    console.log("[email-handler] SMTP not configured; email simulated with jsonTransport", info.messageId);
  }
}
