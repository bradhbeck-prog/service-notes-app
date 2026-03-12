import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { sendServiceNoteEmail } from "../../../lib/sendEmail";
import path from "path";

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      workerName,
      participantName,
      cleEmail,
      shiftDate,
      timeIn,
      timeOut,
      service,
      location,
      outcomePhrase,
      outcomeStatement,
      outcomeActionPlan,
      selectedGoals,
      noteText,
      signatureMode,
      typedSignature,
      drawnSignature,
      signatureFont,
    } = body;

    function formatDate(dateStr) {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US");
    }

    function formatTime(timeStr) {
      const [h, m] = timeStr.split(":");
      const d = new Date();
      d.setHours(h);
      d.setMinutes(m);
      return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    function makeSafeFilenamePart(text) {
      return (text || "Participant")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-]/g, "");
    }

    function drawWrappedText(page, text, x, y, maxWidth, lineHeight, font, size) {
      const words = (text || "").split(/\s+/);
      const lines = [];
      let currentLine = "";

      words.forEach((word) => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, size);

        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      });

      if (currentLine) lines.push(currentLine);

      lines.forEach((line, index) => {
        page.drawText(line, {
          x,
          y: y - index * lineHeight,
          size,
          font,
        });
      });

      return y - lines.length * lineHeight;
    }

    const formattedDate = formatDate(shiftDate);
    const formattedTimeIn = formatTime(timeIn);
    const formattedTimeOut = formatTime(timeOut);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

const fontPathMap = {
  Pacifico: path.join(process.cwd(), "public/fonts/Pacifico-Regular.ttf"),
  GreatVibes: path.join(process.cwd(), "public/fonts/GreatVibes-Regular.ttf"),
  Allura: path.join(process.cwd(), "public/fonts/Allura-Regular.ttf"),
  AlexBrush: path.join(process.cwd(), "public/fonts/AlexBrush-Regular.ttf"),
};

const selectedSignatureFontPath =
  fontPathMap[signatureFont] ?? fontPathMap.Pacifico;

    const fs = await import("fs/promises");
    const signatureFontBytes = await fs.readFile(selectedSignatureFontPath);
    const signatureScriptFont = await pdfDoc.embedFont(signatureFontBytes);

    let y = 750;

    page.drawText("Daily Service Note", {
      x: 50,
      y,
      size: 18,
      font,
    });

    y -= 40;
    page.drawText(`Support Service Professional: ${workerName}`, {
      x: 50,
      y,
      size: 12,
      font,
    });

    y -= 20;
    page.drawText(`Person Receiving Services: ${participantName}`, {
      x: 50,
      y,
      size: 12,
      font,
    });

    y -= 20;
    page.drawText(`Date: ${formattedDate}`, { x: 50, y, size: 12, font });

    y -= 20;
    page.drawText(`Time In: ${formattedTimeIn}`, { x: 50, y, size: 12, font });

    y -= 20;
    page.drawText(`Time Out: ${formattedTimeOut}`, { x: 50, y, size: 12, font });

    page.drawText(`Service: ${service}`, {
      x: 50,
      y: y - 20,
      size: 12,
      font,
    });
    y -= 18;

    y -= 20;
    page.drawText(
      `Location: ${location === "community" ? "Community" : "Home"}`,
      { x: 50, y, size: 12, font }
    );

    y -= 20;

    const outcomeBoxTop = y + 4;
    const outcomeBoxX = 45;
    const outcomeBoxWidth = 520;

    page.drawText("Outcome Phrase:", { x: 50, y, size: 12, font });

    y -= 16;
    y = drawWrappedText(
      page,
      outcomePhrase || "Not set",
      70,
      y,
      470,
      16,
      font,
      12
    );

    y -= 10;
    page.drawText("Outcome Statement:", { x: 50, y, size: 12, font });

    y -= 16;
    y = drawWrappedText(
      page,
      outcomeStatement || "Not set",
      70,
      y,
      470,
      16,
      font,
      12
    );

    y -= 10;
    page.drawText("Outcome Action Plan:", { x: 50, y, size: 12, font });

    y -= 16;
    y = drawWrappedText(
      page,
      outcomeActionPlan || "Not set",
      70,
      y,
      470,
      16,
      font,
      12
    );

    const outcomeBoxBottom = y;

    y -= 30;

    page.drawRectangle({
      x: outcomeBoxX,
      y: outcomeBoxBottom,
      width: outcomeBoxWidth,
      height: outcomeBoxTop - outcomeBoxBottom + 10,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });

    y = outcomeBoxBottom - 20;

    page.drawText("Goals worked on today:", { x: 50, y, size: 13, font });

    y -= 20;

    const leftX = 70;
    const rightX = 300;

    const groupedGoals = (selectedGoals || []).reduce((acc, goal) => {
      const category = goal.category_name || "Goals";
      if (!acc[category]) acc[category] = [];
      acc[category].push(goal.goal_label || goal);
      return acc;
    }, {});

    Object.entries(groupedGoals).forEach(([category, goals]) => {
      y -= 6;

      page.drawText(category, {
        x: 60,
        y,
        size: 12,
        font: boldFont,
      });

      y -= 16;

      const half = Math.ceil(goals.length / 2);
      const leftGoals = goals.slice(0, half);
      const rightGoals = goals.slice(half);

      let columnY = y;

      leftGoals.forEach((goal, i) => {
        page.drawText(`- ${goal}`, {
          x: leftX,
          y: columnY,
          size: 12,
          font,
        });

        if (rightGoals[i]) {
          page.drawText(`- ${rightGoals[i]}`, {
            x: rightX,
            y: columnY,
            size: 12,
            font,
          });
        }

        columnY -= 16;
      });

      y = columnY - 12;
    });

    y -= 10;
    page.drawText("Note:", { x: 50, y, size: 12, font });

    y -= 20;

    const lines = [];
    const rawLines = (noteText || "").split("\n");

    rawLines.forEach((rawLine) => {
      const chunks = rawLine.match(/.{1,90}/g) || [""];
      chunks.forEach((chunk) => lines.push(chunk));
    });

    lines.forEach((line) => {
      page.drawText(line, {
        x: 50,
        y,
        size: 12,
        font,
      });
      y -= 16;
    });

    y -= 30;

    page.drawText("SSP Signature:", { x: 50, y, size: 12, font });

    page.drawLine({
      start: { x: 150, y: y - 2 },
      end: { x: 300, y: y - 2 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    if (signatureMode === "typed") {
      page.drawText(`${typedSignature || ""}`, {
        x: 150,
        y: y - 1,
        size: 16,
        font: signatureScriptFont,
      });
    }

    if (signatureMode === "draw" && drawnSignature) {
      const base64Data = drawnSignature.split(",")[1];
      const imageBytes = Uint8Array.from(Buffer.from(base64Data, "base64"));
      const signatureImage = await pdfDoc.embedPng(imageBytes);

      const maxWidth = 140;
      const scale = maxWidth / signatureImage.width;
      const width = signatureImage.width * scale;
      const height = signatureImage.height * scale;

      page.drawImage(signatureImage, {
        x: 150,
        y: y - 12,
        width,
        height,
      });
    }

    y -= 30;

    page.drawText(`Signature Date: ${formattedDate}`, {
      x: 50,
      y,
      size: 12,
      font,
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    if (cleEmail) {
      try {
     await sendServiceNoteEmail({
  to: cleEmail,
  participantName,
  workerName,
  pdfBuffer,
});
      } catch (emailError) {
        console.error("Email send failed:", emailError);
      }
    }

    const safeParticipantName = makeSafeFilenamePart(participantName);
    const safeShiftDate = shiftDate || "unknown-date";
    const fileName = `${safeParticipantName}-${safeShiftDate}-Service-Note.pdf`;

    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("PDF generation failed", { status: 500 });
  }
}