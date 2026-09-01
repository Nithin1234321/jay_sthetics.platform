import { config } from "../config.js";

type CodePurpose = "EMAIL_VERIFY" | "PASSWORD_RESET" | "ADMIN_LOGIN";

const purposeCopy: Record<CodePurpose, { subject: string; heading: string }> = {
  EMAIL_VERIFY: { subject: "Verify your Jay Aesthetics account", heading: "Verify your account" },
  PASSWORD_RESET: { subject: "Reset your Jay Aesthetics password", heading: "Reset your password" },
  ADMIN_LOGIN: { subject: "Jay Aesthetics admin login code", heading: "Admin verification" }
};

export async function sendAuthCode(email: string, code: string, purpose: CodePurpose) {
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM) {
    if (config.NODE_ENV === "production") {
      throw new Error("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
    }
    return { delivered: false as const };
  }

  const copy = purposeCopy[purpose];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.EMAIL_FROM,
      to: [email],
      subject: copy.subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;background:#111;color:#fff;border-radius:12px"><h2>${copy.heading}</h2><p>Your one-time code is:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</div><p>This code expires in 10 minutes and can only be used once.</p><p style="color:#aaa">If you did not request this, you can ignore this email.</p></div>`
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email delivery failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return { delivered: true as const };
}
