import { createClient } from "@supabase/supabase-js";
import { sendAccountSetupEmail } from "../../../../lib/sendEmail";

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

export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Worker invitations are not configured." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json({ error: "Sign in again before adding a worker." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return json({ error: "Your login session is invalid or expired." }, 401);

  const { data: membership, error: membershipError } = await admin
    .from("workspace_memberships")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) {
    return json({ error: "You do not have permission to add workers." }, 403);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid worker request." }, 400); }

  const workerId = String(body.workerId || "").trim();
  const participantId = String(body.participantId || "").trim();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !validEmail(email)) return json({ error: "Enter a valid worker email address." }, 400);
  if (!workerId && !name) return json({ error: "Enter the worker's name." }, 400);
  if (!participantId && !workerId) return json({ error: "Choose the participant this worker supports." }, 400);

  if (participantId) {
    const { data: participant, error: participantError } = await admin
      .from("participants")
      .select("id")
      .eq("id", participantId)
      .eq("workspace_id", membership.workspace_id)
      .eq("active", true)
      .maybeSingle();
    if (participantError || !participant) {
      return json({ error: "That participant is not available in your workspace." }, 404);
    }
  }

  let worker;
  if (workerId) {
    const { data, error } = await admin.from("workers")
      .select("id, name, email, auth_user_id, active")
      .eq("id", workerId).eq("active", true).maybeSingle();
    if (error || !data) return json({ error: "Active worker record not found." }, 404);
    worker = data;
  } else {
    const { data: existingWorker } = await admin.from("workers")
      .select("id, name, email, auth_user_id, active")
      .ilike("email", email).limit(1).maybeSingle();

    if (existingWorker) {
      if (!existingWorker.active) {
        const { data: restored, error: restoreError } = await admin.from("workers")
          .update({ active: true, name, pin_login_enabled: false })
          .eq("id", existingWorker.id)
          .select("id, name, email, auth_user_id, active").single();
        if (restoreError) return json({ error: restoreError.message }, 400);
        worker = restored;
      } else {
        worker = existingWorker;
      }
    } else {
      const { data: created, error: createError } = await admin.from("workers")
        .insert({ name, email, active: true, pin: null, pin_login_enabled: false })
        .select("id, name, email, auth_user_id, active").single();
      if (createError) {
        return json({ error: createError.message.includes("pin")
          ? "The database still requires a PIN. Run the Retire PIN Access SQL migration, then try again."
          : createError.message }, 400);
      }
      worker = created;
    }
  }

  if (participantId) {
    const { data: existingAssignment } = await admin.from("worker_participants")
      .select("worker_id").eq("worker_id", worker.id)
      .eq("participant_id", participantId).maybeSingle();
    if (!existingAssignment) {
      const { error: assignmentError } = await admin.from("worker_participants")
        .insert({ worker_id: worker.id, participant_id: participantId });
      if (assignmentError) {
        return json({ error: `Worker saved, but assignment failed: ${assignmentError.message}` }, 400);
      }
    }
  }

  let authUser;
  try {
    authUser = worker.auth_user_id ? { id: worker.auth_user_id } : await findAuthUserByEmail(admin, email);
  } catch (error) {
    return json({ error: `Worker saved, but account lookup failed: ${error.message}` }, 500);
  }

  if (authUser) {
    const { error: linkError } = await admin.from("workers").update({
      name: name || worker.name, email, auth_user_id: authUser.id, pin_login_enabled: false,
    }).eq("id", worker.id);
    if (linkError) return json({ error: `Worker assigned, but account linking failed: ${linkError.message}` }, 500);
    return json({
      message: `${worker.name} was assigned. This email already has a DreamNote account, so no new setup email was needed.`,
      workerId: worker.id,
      accountAlreadyExists: true,
    });
  }

  const redirectTo = `${new URL(request.url).origin}/reset-password`;
  const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
    type: "invite", email,
    options: { redirectTo, data: { worker_id: worker.id, worker_name: worker.name } },
  });
  const actionLink = generated?.properties?.action_link;
  const invitedUser = generated?.user;
  if (generateError || !actionLink || !invitedUser) {
    return json({ error: generateError?.message || "The secure setup link could not be created." }, 400);
  }

  const { error: updateError } = await admin.from("workers").update({
    name: name || worker.name,
    email,
    auth_user_id: invitedUser.id,
    invited_at: new Date().toISOString(),
    pin_login_enabled: false,
  }).eq("id", worker.id);
  if (updateError) {
    return json({ error: "The account was created, but the worker record could not be linked. Do not resend; contact the administrator." }, 500);
  }

  try {
    await sendAccountSetupEmail({ to: email, name: worker.name, actionLink });
    return json({
      message: `Setup email sent to ${email}. A backup link is also available below.`,
      workerId: worker.id, setupLink: actionLink, emailSent: true,
    });
  } catch (emailError) {
    return json({
      message: "The worker and assignment were saved, but the email could not be delivered. Copy and send the backup link below.",
      warning: emailError.message,
      workerId: worker.id, setupLink: actionLink, emailSent: false,
    });
  }
}
