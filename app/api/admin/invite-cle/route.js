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
    return json({ error: "CLE invitations are not configured." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return json({ error: "Sign in again before sending a CLE invitation." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
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
    return json({ error: "You do not have permission to invite CLEs." }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid CLE invitation request." }, 400);
  }

  const participantId = String(body.participantId || "").trim();

  if (!participantId) {
    return json({ error: "Choose a participant before sending a CLE invitation." }, 400);
  }

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .select("id, name, cle_email, cle_auth_user_id, active")
    .eq("id", participantId)
    .eq("active", true)
    .maybeSingle();

  if (participantError || !participant) {
    return json({ error: "Active participant record not found." }, 404);
  }

  const email = String(participant.cle_email || "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: `Enter a valid CLE email for ${participant.name} first.` }, 400);
  }

  if (participant.cle_auth_user_id) {
    return json(
      { error: `${participant.name}'s CLE already has an invited or registered account.` },
      409
    );
  }

  const redirectTo = `${new URL(request.url).origin}/reset-password`;
  const { data: invitation, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        role: "cle",
        participant_id: participant.id,
        participant_name: participant.name,
      },
    });

  if (inviteError || !invitation.user) {
    return json(
      { error: inviteError?.message || "Supabase could not send the CLE invitation." },
      400
    );
  }

  const { error: updateError } = await admin
    .from("participants")
    .update({
      cle_email: email,
      cle_auth_user_id: invitation.user.id,
      cle_invited_at: new Date().toISOString(),
    })
    .eq("id", participant.id)
    .is("cle_auth_user_id", null);

  if (updateError) {
    return json(
      {
        error:
          "The CLE Auth invitation was created, but the participant record could not be linked. Do not resend; contact the administrator.",
      },
      500
    );
  }

  return json({
    message: `CLE setup link sent to ${email} for ${participant.name}.`,
  });
}
