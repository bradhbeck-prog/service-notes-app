import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function responseText(message, status = 400) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store" } });
}
function initials(name) {
  return String(name || "Participant").trim().split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]).join("").toUpperCase() || "PR";
}

export async function GET(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return responseText("Support Coordinator archive access is not configured.", 500);
  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return responseText("Sign in again before downloading an archive.", 401);
  const url = new URL(request.url);
  const participantId = String(url.searchParams.get("participantId") || "");
  const month = String(url.searchParams.get("month") || "");
  if (!participantId || !/^\d{4}-\d{2}$/.test(month)) return responseText("Choose a participant and valid archive month.", 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return responseText("Your login session is invalid or expired.", 401);
  const { data: coordinator } = await admin.from("support_coordinators")
    .select("id, workspace_id").eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (!coordinator) return responseText("No active Support Coordinator profile is linked to this login.", 403);
  const { data: assignment } = await admin.from("support_coordinator_participants")
    .select("support_coordinator_id").eq("support_coordinator_id", coordinator.id).eq("participant_id", participantId).maybeSingle();
  if (!assignment) return responseText("You do not have access to this participant.", 403);
  const { data: participant } = await admin.from("participants").select("id, name")
    .eq("id", participantId).eq("workspace_id", coordinator.workspace_id).eq("active", true).maybeSingle();
  if (!participant) return responseText("Participant not found.", 404);

  const monthStart = `${month}-01`;
  const end = new Date(`${monthStart}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1);
  const { data: notes, error: notesError } = await admin.from("service_notes").select("id")
    .eq("participant_id", participantId).eq("status", "submitted")
    .gte("shift_date", monthStart).lt("shift_date", end.toISOString().slice(0, 10))
    .order("shift_date", { ascending: true }).order("created_at", { ascending: true });
  if (notesError) return responseText(notesError.message, 500);
  if (!notes?.length) return responseText("No submitted notes were found for that month.", 404);

  const archive = await PDFDocument.create();
  for (const note of notes) {
    const response = await fetch(new URL(`/api/sc/note-pdf/${note.id}`, request.url), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return responseText("One of the service notes could not be regenerated for the archive.", 500);
    const source = await PDFDocument.load(await response.arrayBuffer());
    const pages = await archive.copyPages(source, source.getPageIndices());
    pages.forEach((page) => archive.addPage(page));
  }
  const [year, monthNumber] = month.split("-");
  const monthName = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const fileName = `${initials(participant.name)}-${monthName}-${year}-Service-Notes.pdf`;
  return new Response(await archive.save(), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store" },
  });
}
