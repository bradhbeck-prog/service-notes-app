import { Resend } from "resend";

export async function sendServiceNoteEmail({ to, participantName, pdfBuffer }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set in .env.local");
  }

  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from: "DreamNote <notes@supportsbroker.com>",
    to,
    bcc: "bradley@supportsbroker.com",
    subject: `${participantName} Service Note`,
    text: `Attached is the service note for ${participantName}.`,
    attachments: [
      {
        filename: `${participantName}-Service-Note.pdf`,
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