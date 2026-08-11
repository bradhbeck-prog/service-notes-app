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
    return json({ error: "Password resets are not configured." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return json({ error: "Sign in again before sending a password reset." }, 401);
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
    return json({ error: "You do not have permission to reset worker passwords." }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid password reset request." }, 400);
  }

  const workerId = String(body.workerId || "").trim();

  if (!workerId) {
    return json({ error: "Choose a worker before sending a password reset." }, 400);
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

  if (!worker.auth_user_id || !worker.email) {
    return json(
      { error: `${worker.name} does not have a linked email/password account yet.` },
      400
    );
  }

  const redirectTo = `${new URL(request.url).origin}/reset-password`;
  const { error: resetError } = await admin.auth.resetPasswordForEmail(worker.email, {
    redirectTo,
  });

  if (resetError) {
    return json(
      { error: resetError.message || "Supabase could not send the reset email." },
      400
    );
  }

  return json({
    message: `Password reset link sent to ${worker.email}.`,
  });
}
