/**
 * Email sender. Uses Resend if RESEND_API_KEY is set; otherwise logs to stdout
 * so the system stays functional in dev / before email is configured.
 *
 * Production note: until RESEND_API_KEY is set, OTP codes are visible in
 * server logs. This is acceptable as a transitional state but should be
 * replaced with a real provider before opening to real users.
 */

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_FROM = process.env["RESEND_FROM_EMAIL"] ?? "SlyncPay <onboarding@resend.dev>";
const RESEND_API_KEY = process.env["RESEND_API_KEY"] ?? "";

export async function sendEmail(msg: EmailMessage): Promise<{ delivered: boolean; channel: "resend" | "log" }> {
  if (!RESEND_API_KEY) {
    console.log("[email:LOG-FALLBACK]", { to: msg.to, subject: msg.subject, text: msg.text });
    return { delivered: false, channel: "log" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[email] Resend send failed:", res.status, body);
    // Fall back to log so the user is not locked out
    console.log("[email:LOG-FALLBACK]", { to: msg.to, subject: msg.subject, text: msg.text });
    return { delivered: false, channel: "log" };
  }

  return { delivered: true, channel: "resend" };
}

export function otpEmail(to: string, code: string, purpose: "login" | "setup"): EmailMessage {
  const action = purpose === "login" ? "to sign in" : "to enable two-factor authentication";
  return {
    to,
    subject: `Your SlyncPay verification code: ${code}`,
    text: `Your SlyncPay verification code is ${code}. It expires in 5 minutes. Use it ${action}. If you did not request this code, ignore this email and consider changing your password.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px;">SlyncPay verification code</h2>
        <p style="color: #555; margin: 0 0 24px; font-size: 14px; line-height: 1.5;">
          Use the code below ${action}. It expires in 5 minutes.
        </p>
        <div style="background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 8px; padding: 24px; text-align: center; font-family: monospace; font-size: 32px; letter-spacing: 8px; font-weight: 600;">
          ${code}
        </div>
        <p style="color: #71717a; margin: 24px 0 0; font-size: 12px; line-height: 1.5;">
          If you did not request this code, please ignore this email and consider changing your password.
        </p>
      </div>
    `,
  };
}
