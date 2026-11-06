import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { sendServiceNoteEmail } from "../../../lib/sendEmail";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function responseText(message, status = 400) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store" } });
}

function getGoalDetail(details, goalId) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  return details[String(goalId)] || details[goalId] || "";
}

function buildSelectedGoals(note) {
  const rows = Array.isArray(note.service_note_goals) ? note.service_note_goals : [];
  if (rows.length) {
    return rows.map((row) => {
      const goal = row.participant_goals;
      return goal ? {
        ...goal,
        prompt_level: row.prompt_level || getGoalDetail(note.prompt_levels, goal.id),
        detail_value: getGoalDetail(note.goal_details, goal.id),
      } : null;
    }).filter(Boolean);
  }
  const selectedIds = Array.isArray(note.goals) ? note.goals.map(String) : [];
  return (note.participants?.participant_goals || [])
    .filter((goal) => selectedIds.includes(String(goal.id)))
    .map((goal) => ({
      ...goal,
      prompt_level: getGoalDetail(note.prompt_levels, goal.id),
      detail_value: getGoalDetail(note.goal_details, goal.id),
    }));
}

async function loadAuthorizedNote(request, noteId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return { response: responseText("Secure PDF generation is not configured.", 500) };

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return { response: responseText("Sign in again before generating this PDF.", 401) };

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return { response: responseText("Your login session is invalid or expired.", 401) };

  const { data: note, error: noteError } = await admin.from("service_notes").select(`
    id, participant_id, worker_id, shift_date, date_completed, signed_at, time_in, time_out,
    service, location, narrative, goals, goal_details, prompt_levels, status,
    worker_signature_mode, worker_typed_signature, worker_drawn_signature, worker_signature_font,
    workers(id, name, auth_user_id),
    participants(
      id, name, cle_email, cle_auth_user_id, workspace_id,
      participant_goals(id, goal_label, category_name, sort_order, participant_service_id),
      participant_outcomes(outcome_phrase, outcome_statement, outcome_action_plan)
    ),
    service_note_goals(
      prompt_level,
      participant_goals(id, goal_label, category_name, sort_order, participant_service_id)
    )
  `).eq("id", noteId).eq("status", "submitted").maybeSingle();
  if (noteError || !note) return { response: responseText("Submitted service note not found.", 404) };

  const participant = note.participants || {};
  const workerOwnsNote = note.workers?.auth_user_id === user.id;
  let authorized = workerOwnsNote || participant.cle_auth_user_id === user.id;

  if (!authorized) {
    const { data: membership } = await admin.from("workspace_memberships").select("workspace_id")
      .eq("user_id", user.id).eq("workspace_id", participant.workspace_id).eq("active", true)
      .in("role", ["owner", "admin"]).maybeSingle();
    authorized = Boolean(membership);
  }

  if (!authorized) {
    const { data: coordinator } = await admin.from("support_coordinators").select("id, workspace_id")
      .eq("auth_user_id", user.id).eq("workspace_id", participant.workspace_id).eq("active", true).maybeSingle();
    if (coordinator) {
      const { data: assignment } = await admin.from("support_coordinator_participants")
        .select("support_coordinator_id").eq("support_coordinator_id", coordinator.id)
        .eq("participant_id", note.participant_id).maybeSingle();
      authorized = Boolean(assignment);
    }
  }

  if (!authorized) return { response: responseText("You do not have access to this service note.", 403) };
  const { data: corrections, error: correctionError } = await admin.from("note_corrections")
    .select("correction_text,correction_reason,signed_name,submitted_at")
    .eq("note_id", note.id).eq("status", "submitted").order("submitted_at");
  if (correctionError) return { response: responseText("Correction history could not be verified. Please try again or contact your administrator.", 503) };
  return { note, workerOwnsNote, corrections: corrections || [] };
}

export async function POST(req) {
  try {
    const authorization = req.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return responseText("Sign in again before generating this PDF.", 401);
    }
    const requestBody = await req.json();
    const noteId = String(requestBody.noteId || "").trim();
    if (!noteId) return responseText("Choose a submitted note before generating a PDF.", 400);
    const authorized = await loadAuthorizedNote(req, noteId);
    if (authorized.response) return authorized.response;
    const note = authorized.note;
    const participant = note.participants || {};
    const outcome = participant.participant_outcomes?.[0] || {};
    const body = {
      workerName: note.workers?.name || "Worker",
      participantName: participant.name || "Participant",
      cleEmail: requestBody.sendEmail === true && authorized.workerOwnsNote ? participant.cle_email : null,
      shiftDate: note.shift_date,
      timeIn: note.time_in,
      timeOut: note.time_out,
      service: note.service,
      location: note.location,
      outcomePhrase: outcome.outcome_phrase || "",
      outcomeStatement: outcome.outcome_statement || "",
      outcomeActionPlan: outcome.outcome_action_plan || "",
      selectedGoals: buildSelectedGoals(note),
      noteText: note.narrative || "",
      signatureMode: note.worker_signature_mode || "typed",
      typedSignature: note.worker_typed_signature || note.workers?.name || "",
      drawnSignature: note.worker_drawn_signature || "",
      signatureFont: note.worker_signature_font || "Pacifico",
      dateCompleted: note.date_completed,
      signedAt: note.signed_at,
      attestationText: "I certify that this service note accurately reflects the services I provided.",
    };

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
        timeZone: "America/New_York",
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
    page.drawText(`Date Completed (system recorded): ${formattedDateCompleted}`, { x: LEFT, y, size: 12, font });

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

    page.drawText(`Submitted and signed (system recorded): ${formattedSignedAt}`, {
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

    // Addenda never replace the original note, signature, or submission timestamp.
    for (const correction of authorized.corrections) {
      let correctionPage = pdfDoc.addPage();
      let correctionY = correctionPage.getHeight() - 50;
      const paragraphs = [
        "Service Note — Signed Correction",
        `Original date of service: ${formattedDate}`,
        `Original submission: ${formattedSignedAt}`,
        "The original note is preserved on the preceding pages.",
        `Correction: ${correction.correction_text}`,
        `Reason: ${correction.correction_reason}`,
        `Signed by: ${correction.signed_name}`,
        `Correction submitted (system recorded): ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "long" }).format(new Date(correction.submitted_at))}`,
        "I certify that this correction accurately reflects the services I provided.",
      ];
      for (const paragraph of paragraphs) {
        for (const line of wrapText(paragraph, font, 11, CONTENT_WIDTH)) {
          if (correctionY < 55) { correctionPage = pdfDoc.addPage(); correctionY = correctionPage.getHeight() - 50; }
          correctionPage.drawText(line, { x: 50, y: correctionY, font, size: 11 });
          correctionY -= 16;
        }
        correctionY -= 10;
      }
    }
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
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("PDF generation failed", { status: 500 });
  }
}
