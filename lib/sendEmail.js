import { Resend } from "resend";

function getInitials(name) {
  if (!name) return "PR";
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function formatDateForSubject(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = String(dateStr).split("-");
  if (!year || !month || !day) return String(dateStr);
  return `${Number(month)}-${Number(day)}-${String(year).slice(-2)}`;
}

export async function sendServiceNoteEmail({
  to,
  participantName,
  workerName,
  pdfBuffer,
  fileName,
  shiftDate,
  service,
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set in .env.local");
  }

  const resend = new Resend(apiKey);

  const initials = getInitials(participantName);
  const datePart = formatDateForSubject(shiftDate);
  const servicePart = service ? ` ${service}` : "";
  const noteTitle = [initials, datePart, service, "Service Note"].filter(Boolean).join(" ");

  const result = await resend.emails.send({
    from: `${workerName} <notes@supportsbroker.com>`,
    to,
    bcc: "bradley@supportsbroker.com",
    subject: noteTitle,
    text: `Attached is the service note for ${initials}${datePart ? ` dated ${datePart}` : ""}${servicePart}.`,
    attachments: [
      {
        filename: fileName || `${initials}-Service-Note.pdf`,
        content: pdfBuffer.toString("base64"),
      },
    ],
  });

  console.log("RESEND RESULT:", result);

  if (result?.error) {
    throw new Error(
      `Resend error: ${result.error.message || JSON.stringify(result.error)}`
    );
  }

  return result;
}

export async function sendAccountSetupEmail({ to, name, actionLink }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(apiKey);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const plainName = String(name || "there").trim();
  const safeName = escapeHtml(plainName);
  const safeLink = escapeHtml(actionLink);

  const result = await resend.emails.send({
    from: "DreamNote <notes@supportsbroker.com>",
    to,
    replyTo: "bradley@supportsbroker.com",
    subject: "Set up your DreamNote account",
    text: `Hello ${plainName},\n\nBradley has created your DreamNote access. Use this secure link to choose your password:\n\n${actionLink}\n\nIf the link has expired or you did not expect this email, contact Bradley at bradley@supportsbroker.com.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;max-width:560px;margin:0 auto">
        <h1 style="color:#159f8c;font-size:28px">Welcome to DreamNote</h1>
        <p>Hello ${safeName},</p>
        <p>Bradley has created your DreamNote access. Select the button below to choose your password.</p>
        <p style="margin:28px 0">
          <a href="${safeLink}" style="display:inline-block;background:#159f8c;color:white;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">Set up my DreamNote account</a>
        </p>
        <p style="font-size:14px;color:#596273">If the button does not work, copy and paste this address into your browser:<br><a href="${safeLink}">${safeLink}</a></p>
        <p style="font-size:14px;color:#596273">If the link has expired or you did not expect this email, contact <a href="mailto:bradley@supportsbroker.com">bradley@supportsbroker.com</a>.</p>
      </div>
    `,
  });

  if (result?.error) {
    throw new Error(result.error.message || "The setup email could not be sent.");
  }

  return result;
}
