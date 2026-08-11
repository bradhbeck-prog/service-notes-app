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