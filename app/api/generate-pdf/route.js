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
      dateCompleted,
      signedAt,
      attestationText,
    } = body;

    function formatDate(dateStr) {
      if (!dateStr) return "Not set";
      const [year, month, day] = String(dateStr).slice(0, 10).split("-");
      if (year && month && day) return `${Number(month)}/${Number(day)}/${year}`;
      const d = new Date(dateStr);
      return Number.isNaN(d.getTime()) ? String(dateStr) : d.toLocaleDateString("en-US");
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
        .replace(/[^a-zA-Z0-9-]/g, "") || "Service";
    }

    function getParticipantInitials(name) {
      const parts = String(name || "Participant")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      if (!parts.length) return "PR";

      return parts
        .slice(0, 3)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
    }

    function formatFileDate(dateStr) {
      if (!dateStr) return "unknown-date";
      const [year, month, day] = String(dateStr).split("-");
      if (!year || !month || !day) return String(dateStr);
      return `${Number(month)}-${Number(day)}-${String(year).slice(-2)}`;
    }

    function createServiceNoteFileName(participantName, shiftDate, service) {
      const initials = getParticipantInitials(participantName);
      const date = formatFileDate(shiftDate);
      const servicePart = makeSafeFilenamePart(service || "Service");
      return `${initials}-${date}-${servicePart}-Service-Note.pdf`;
    }

    function formatSignedAt(value) {
      if (!value) return "Not set";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString("en-US", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });
    }

    function wrapText(text, font, size, maxWidth) {
      const words = (text || "").split(/\s+/).filter(Boolean);
      const lines = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, size);

        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            lines.push(word);
          }
        }
      }

      if (currentLine) lines.push(currentLine);
      return lines.length ? lines : [""];
    }

    function drawWrappedLines(page, lines, x, y, lineHeight, font, size) {
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

    function drawWrappedText(page, text, x, y, maxWidth, lineHeight, font, size) {
      const lines = wrapText(text, font, size, maxWidth);
      return drawWrappedLines(page, lines, x, y, lineHeight, font, size);
    }

    function getWrappedTextHeight(text, font, size, maxWidth, lineHeight) {
      const lines = wrapText(text, font, size, maxWidth);
      return lines.length * lineHeight;
    }

    const formattedDate = formatDate(shiftDate);
    const formattedDateCompleted = formatDate(dateCompleted);
    const formattedSignedAt = formatSignedAt(signedAt);
    const formattedTimeIn = formatTime(timeIn);
    const formattedTimeOut = formatTime(timeOut);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    let page = pdfDoc.addPage([612, 792]);
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

    const PAGE_WIDTH = 612;
    const PAGE_HEIGHT = 792;
    const LEFT = 50;
    const RIGHT = 562;
    const TOP = 750;
    const BOTTOM = 55;
    const CONTENT_WIDTH = RIGHT - LEFT;

    let y = TOP;

    function newPage() {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = TOP;
    }

    function ensureSpace(requiredHeight) {
      if (y - requiredHeight < BOTTOM) {
        newPage();
      }
    }

    function estimateGoalsHeight(groupedGoals) {
      let total = 0;
      total += 20; // "Goals worked on today:"
      total += 20;

      Object.entries(groupedGoals).forEach(([, goals]) => {
        total += 6;
        total += 16; // category heading
        const half = Math.ceil(goals.length / 2);
        total += half * 16;
        total += 12;
      });

      return total;
    }

    function estimateNoteHeight(text) {
      const paragraphs = (text || "").split("\n");
      let lineCount = 0;

      paragraphs.forEach((paragraph) => {
        const lines = wrapText(paragraph || " ", font, 12, CONTENT_WIDTH);
        lineCount += Math.max(lines.length, 1);
      });

      return 20 + lineCount * 16; // label + content
    }

    function estimateSignatureHeight() {
      return 125;
    }

    function getOutcomeLayout(size) {
      const labelSize = 11;
      const textSize = size;
      const labelGap = 14;
      const afterBlockGap = 8;
      const lineHeight = size <= 8 ? 9 : size + 1.5;
      const textWidth = 470;

      const phraseHeight = getWrappedTextHeight(
        outcomePhrase || "Not set",
        font,
        textSize,
        textWidth,
        lineHeight
      );

      const statementHeight = getWrappedTextHeight(
        outcomeStatement || "Not set",
        font,
        textSize,
        textWidth,
        lineHeight
      );

      const planHeight = getWrappedTextHeight(
        outcomeActionPlan || "Not set",
        font,
        textSize,
        textWidth,
        lineHeight
      );

      const totalHeight =
        18 + // top padding / first label area
        phraseHeight +
        labelGap +
        afterBlockGap +
        statementHeight +
        labelGap +
        afterBlockGap +
        planHeight +
        16; // bottom padding

      return {
        labelSize,
        textSize,
        lineHeight,
        textWidth,
        totalHeight,
      };
    }

    const groupedGoals = (selectedGoals || []).reduce((acc, goal) => {
      const category = goal.category_name || "Goals";
      if (!acc[category]) acc[category] = [];

      const parts = [goal.goal_label || goal];

      if (goal.prompt_level) {
        parts.push(`Prompt level: ${goal.prompt_level}`);
      }

      if (goal.detail_value) {
        parts.push(`Detail: ${goal.detail_value}`);
      }

      acc[category].push(parts.join(" | "));
      return acc;
    }, {});

    const headerHeight = 40 + 20 + 20 + 20 + 20 + 20 + 20 + 20 + 20;

    const goalsHeight = estimateGoalsHeight(groupedGoals);
    const noteHeight = estimateNoteHeight(noteText);
    const signatureHeight = estimateSignatureHeight();

    page.drawText("Daily Service Note", {
      x: LEFT,
      y,
      size: 18,
      font,
    });

    y -= 40;
    page.drawText(`Support Service Professional: ${workerName}`, {
      x: LEFT,
      y,
      size: 12,
      font,
    });

    y -= 20;
    page.drawText(`Person Receiving Services: ${participantName}`, {
      x: LEFT,
      y,
      size: 12,
      font,
    });

    y -= 20;
    page.drawText(`Date of Service: ${formattedDate}`, { x: LEFT, y, size: 12, font });

    y -= 20;
    page.drawText(`Date Completed: ${formattedDateCompleted}`, { x: LEFT, y, size: 12, font });

    y -= 20;
    page.drawText(`Time In: ${formattedTimeIn}`, { x: LEFT, y, size: 12, font });

    y -= 20;
    page.drawText(`Time Out: ${formattedTimeOut}`, { x: LEFT, y, size: 12, font });

    y -= 20;
    page.drawText(`Service: ${service}`, {
      x: LEFT,
      y,
      size: 12,
      font,
    });

    y -= 20;
    page.drawText(
      `Location: ${location === "community" ? "Community" : "Home"}`,
      { x: LEFT, y, size: 12, font }
    );

    y -= 20;

    ensureSpace(goalsHeight);

    page.drawText("Goals worked on today:", { x: 50, y, size: 13, font });

    y -= 20;

    Object.entries(groupedGoals).forEach(([category, goals]) => {
      y -= 6;

      page.drawText(category, {
        x: 60,
        y,
        size: 12,
        font: boldFont,
      });

      y -= 16;

      goals.forEach((goal) => {
        const lines = wrapText(`- ${goal}`, font, 11, CONTENT_WIDTH - 40);

        lines.forEach((line) => {
          if (y < BOTTOM + 70) {
            newPage();
            page.drawText("Goals worked on today (continued):", { x: 50, y, size: 13, font });
            y -= 20;
          }

          page.drawText(line, {
            x: 70,
            y,
            size: 11,
            font,
          });

          y -= 14;
        });

        y -= 4;
      });

      y -= 8;
    });

    y -= 10;

    const noteParagraphs = (noteText || "").split("\n");
    const noteLinesByParagraph = noteParagraphs.map((paragraph) =>
      wrapText(paragraph || " ", font, 12, CONTENT_WIDTH)
    );

  page.drawText("Note:", { x: 50, y, size: 12, font });

y -= 20;

for (const paragraphLines of noteLinesByParagraph) {
  for (const line of paragraphLines) {
    if (y < BOTTOM + 70) {
      newPage();
      page.drawText("Note (continued):", { x: 50, y, size: 12, font });
      y -= 20;
    }

    page.drawText(line, {
      x: 50,
      y,
      size: 12,
      font,
    });

    y -= 16;
  }

  y -= 4;
}

    y -= 24;

    ensureSpace(signatureHeight);

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

    page.drawText(`Signed: ${formattedSignedAt}`, {
      x: 50,
      y,
      size: 12,
      font,
    });

    y -= 18;

    const attestationLines = wrapText(
      attestationText || "I certify that this service note accurately reflects the services I provided.",
      font,
      10,
      CONTENT_WIDTH
    );

    page.drawText("Attestation:", { x: 50, y, size: 10, font: boldFont });
    y -= 14;
    y = drawWrappedLines(page, attestationLines, 50, y, 12, font, 10);

const pages = pdfDoc.getPages();
const totalPages = pages.length;

pages.forEach((p, index) => {
  p.drawText(
    `${participantName} – ${formattedDate} – Page ${index + 1} of ${totalPages}`,
    {
      x: 50,
      y: 20,
      size: 9,
      font,
    }
  );
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
          fileName: createServiceNoteFileName(participantName, shiftDate, service),
          shiftDate,
          service,
        });
      } catch (emailError) {
        console.error("Email send failed:", emailError);
      }
    }

    const fileName = createServiceNoteFileName(participantName, shiftDate, service);

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