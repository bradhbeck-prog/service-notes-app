import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Worker invitations are not configured." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return json({ error: "Sign in again before sending an invitation." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user) {
    return json({ error: "Your login session is invalid or expired." }, 401);
  }

  const { data: membership, error: membershipError } = await admin
    .from("workspace_memberships")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return json({ error: "You do not have permission to invite workers." }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid invitation request." }, 400);
  }

  const workerId = String(body.workerId || "").trim();
  const email = String(body.email || "").trim().toLowerCase();

  if (!workerId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid worker email address." }, 400);
  }

  const { data: worker, error: workerError } = await admin
    .from("workers")
    .select("id, name, email, auth_user_id, active")
    .eq("id", workerId)
    .eq("active", true)
    .maybeSingle();

  if (workerError || !worker) {
    return json({ error: "Active worker record not found." }, 404);
  }

  if (worker.auth_user_id) {
    return json(
      { error: `${worker.name} already has an invited or registered account.` },
      409
    );
  }

  const { data: duplicateEmail } = await admin
    .from("workers")
    .select("id, name")
    .ilike("email", email)
    .neq("id", workerId)
    .limit(1)
    .maybeSingle();

  if (duplicateEmail) {
    return json(
      { error: `That email is already assigned to ${duplicateEmail.name}.` },
      409
    );
  }

  const redirectTo = `${new URL(request.url).origin}/reset-password`;
  const { data: invitation, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        worker_id: worker.id,
        worker_name: worker.name,
      },
    });

  if (inviteError || !invitation.user) {
    return json(
      { error: inviteError?.message || "Supabase could not send the invitation." },
      400
    );
  }

  const { error: updateError } = await admin
    .from("workers")
    .update({
      email,
      auth_user_id: invitation.user.id,
      invited_at: new Date().toISOString(),
      pin_login_enabled: true,
    })
    .eq("id", worker.id)
    .is("auth_user_id", null);

  if (updateError) {
    return json(
      {
        error:
          "The Auth invitation was created, but the worker record could not be linked. Do not resend; contact the administrator.",
      },
      500
    );
  }

  return json({
    message: `Invitation sent to ${email}. ${worker.name}'s PIN remains active.`,
  });
}
