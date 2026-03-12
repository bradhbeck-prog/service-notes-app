import { Resend } from "resend";

function getInitials(name) {
  if (!name) return "PR";
  return name
    .split(" ")
    .map((n) => n[0])
    .join(".")
    .toUpperCase() + ".";
}

export async function sendServiceNoteEmail({
  to,
  participantName,
  workerName,
  pdfBuffer,
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set in .env.local");
  }

  const resend = new Resend(apiKey);

  const initials = getInitials(participantName);

  const result = await resend.emails.send({
    from: `${workerName} <notes@supportsbroker.com>`,
    to,
    bcc: "bradley@supportsbroker.com",
    subject: `${initials} Service Note`,
    text: `Attached is the service note for ${initials}.`,
    attachments: [
      {
        filename: `${initials}-Service-Note.pdf`,
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