import { createClient } from "@supabase/supabase-js";
import { sendAccountSetupEmail, sendPasswordHelpEmail } from "../../../../lib/sendEmail";
import { buildProtectedAuthLink } from "../../../../lib/authLinks";

export const runtime = "nodejs";

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findAuthUserByEmail(admin, email) {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

async function getAdminContext(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { response: json({ error: "Support Coordinator access is not configured." }, 500) };
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return { response: json({ error: "Sign in again before continuing." }, 401) };

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return { response: json({ error: "Your login session is invalid or expired." }, 401) };

  const { data: membership, error: membershipError } = await admin.from("workspace_memberships")
    .select("workspace_id, role").eq("user_id", user.id).eq("active", true)
    .in("role", ["owner", "admin"]).limit(1).maybeSingle();
  if (membershipError || !membership) {
    return { response: json({ error: "You do not have permission to manage Support Coordinators." }, 403) };
  }
  return { admin, membership };
}

async function loadDirectory(admin, workspaceId) {
  const { data: coordinators, error } = await admin.from("support_coordinators")
    .select("id, name, email, auth_user_id, invited_at, active")
    .eq("workspace_id", workspaceId).eq("active", true).order("name");
  if (error) throw error;

  const coordinatorIds = (coordinators || []).map((item) => item.id);
  const { data: assignments, error: assignmentError } = coordinatorIds.length
    ? await admin.from("support_coordinator_participants")
        .select("support_coordinator_id, participant_id")
        .in("support_coordinator_id", coordinatorIds)
    : { data: [], error: null };
  if (assignmentError) throw assignmentError;
  return { coordinators: coordinators || [], assignments: assignments || [] };
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.response) return context.response;
  try {
    return json(await loadDirectory(context.admin, context.membership.workspace_id));
  } catch (error) {
    return json({ error: error.message }, 400);
  }
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.response) return context.response;
  const { admin, membership } = context;

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid Support Coordinator request." }, 400); }
  const action = String(body.action || "");
  const participantId = String(body.participantId || "").trim();
  const coordinatorId = String(body.coordinatorId || "").trim();

  if (action === "remove_access") {
    if (!participantId || !coordinatorId) return json({ error: "Choose the participant and Support Coordinator." }, 400);
    const { data: participant } = await admin.from("participants").select("id")
      .eq("id", participantId).eq("workspace_id", membership.workspace_id).maybeSingle();
    if (!participant) return json({ error: "Participant not found in your workspace." }, 404);
    const { error } = await admin.from("support_coordinator_participants").delete()
      .eq("support_coordinator_id", coordinatorId).eq("participant_id", participantId);
    if (error) return json({ error: error.message }, 400);
    return json({ message: "Support Coordinator access removed for this participant." });
  }

  if (action === "send_help") {
    const { data: coordinator, error } = await admin.from("support_coordinators")
      .select("id, name, email, auth_user_id").eq("id", coordinatorId)
      .eq("workspace_id", membership.workspace_id).eq("active", true).maybeSingle();
    if (error || !coordinator?.auth_user_id) return json({ error: "This Support Coordinator does not have a linked account yet." }, 404);
    const origin = new URL(request.url).origin;
    const { data: generated, error: resetError } = await admin.auth.admin.generateLink({
      type: "recovery", email: coordinator.email, options: { redirectTo: `${origin}/reset-password` },
    });
    const resetLink = buildProtectedAuthLink(origin, generated);
    if (resetError || !resetLink) return json({ error: resetError?.message || "A password link could not be created." }, 400);
    try {
      await sendPasswordHelpEmail({ to: coordinator.email, name: coordinator.name, actionLink: resetLink });
      return json({ message: `Password-help email sent to ${coordinator.email}.`, setupLink: resetLink });
    } catch (emailError) {
      return json({ message: "The link was created, but the email could not be delivered.", warning: emailError.message, setupLink: resetLink });
    }
  }

  if (action !== "assign") return json({ error: "Unknown Support Coordinator action." }, 400);
  if (!participantId) return json({ error: "Choose a participant." }, 400);
  const { data: participant } = await admin.from("participants").select("id, name")
    .eq("id", participantId).eq("workspace_id", membership.workspace_id).eq("active", true).maybeSingle();
  if (!participant) return json({ error: "Participant not found in your workspace." }, 404);

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!name) return json({ error: "Enter the Support Coordinator's name." }, 400);
  if (!validEmail(email)) return json({ error: "Enter a valid Support Coordinator email." }, 400);

  let coordinator;
  if (coordinatorId) {
    const { data } = await admin.from("support_coordinators").select("*")
      .eq("id", coordinatorId).eq("workspace_id", membership.workspace_id).maybeSingle();
    coordinator = data;
  } else {
    const { data } = await admin.from("support_coordinators").select("*")
      .eq("workspace_id", membership.workspace_id).ilike("email", email).limit(1).maybeSingle();
    coordinator = data;
  }

  if (coordinator) {
    const { data: updated, error } = await admin.from("support_coordinators")
      .update({ name, email, active: true, updated_at: new Date().toISOString() })
      .eq("id", coordinator.id).eq("workspace_id", membership.workspace_id).select("*").single();
    if (error) return json({ error: error.message }, 400);
    coordinator = updated;
  } else {
    const { data: created, error } = await admin.from("support_coordinators")
      .insert({ workspace_id: membership.workspace_id, name, email, active: true })
      .select("*").single();
    if (error) return json({ error: error.message }, 400);
    coordinator = created;
  }

  const { error: assignmentError } = await admin.from("support_coordinator_participants")
    .upsert({ support_coordinator_id: coordinator.id, participant_id: participant.id }, { onConflict: "support_coordinator_id,participant_id" });
  if (assignmentError) return json({ error: `Coordinator saved, but access could not be assigned: ${assignmentError.message}` }, 400);

  if (coordinator.auth_user_id) {
    return json({ message: `${coordinator.name} now has access to ${participant.name}. The existing account can be used immediately.`, coordinatorId: coordinator.id });
  }

  let authUser;
  try { authUser = await findAuthUserByEmail(admin, email); } catch (error) {
    return json({ error: `Access was assigned, but account lookup failed: ${error.message}` }, 500);
  }
  if (authUser) {
    const { error } = await admin.from("support_coordinators").update({ auth_user_id: authUser.id, invited_at: new Date().toISOString() }).eq("id", coordinator.id);
    if (error) return json({ error: error.message }, 400);
    return json({ message: `${coordinator.name} now has access to ${participant.name} using the existing DreamNote account.`, coordinatorId: coordinator.id });
  }

  const origin = new URL(request.url).origin;
  const { data: generated, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite", email,
    options: { redirectTo: `${origin}/reset-password`, data: { role: "support_coordinator", support_coordinator_id: coordinator.id } },
  });
  const setupLink = buildProtectedAuthLink(origin, generated);
  if (inviteError || !generated?.user || !setupLink) return json({ error: inviteError?.message || "The setup link could not be created." }, 400);
  const { error: linkError } = await admin.from("support_coordinators")
    .update({ auth_user_id: generated.user.id, invited_at: new Date().toISOString() }).eq("id", coordinator.id);
  if (linkError) return json({ error: "The account was created, but the coordinator record could not be linked." }, 500);

  try {
    await sendAccountSetupEmail({ to: email, name, actionLink: setupLink });
    return json({ message: `Setup email sent to ${email}.`, coordinatorId: coordinator.id, setupLink });
  } catch (emailError) {
    return json({ message: "Access was created, but the setup email could not be delivered. Use the backup link.", warning: emailError.message, coordinatorId: coordinator.id, setupLink });
  }
}

