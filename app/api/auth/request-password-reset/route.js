import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const GENERIC_MESSAGE =
  "If that email has an active DreamNote account, a reset link has been sent. Check your inbox and spam folder.";

export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ message: GENERIC_MESSAGE });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ message: GENERIC_MESSAGE });
  }

  const email = String(body.email || "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ message: GENERIC_MESSAGE });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: worker } = await admin
    .from("workers")
    .select("id, email, auth_user_id, active")
    .ilike("email", email)
    .eq("active", true)
    .not("auth_user_id", "is", null)
    .limit(1)
    .maybeSingle();

  const { data: cleParticipant } = await admin
    .from("participants")
    .select("id, cle_email, cle_auth_user_id, active")
    .ilike("cle_email", email)
    .eq("active", true)
    .not("cle_auth_user_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!worker && !cleParticipant) {
    return json({ message: GENERIC_MESSAGE });
  }

  const redirectTo = `${new URL(request.url).origin}/reset-password`;
  await admin.auth.resetPasswordForEmail(email, { redirectTo });

  return json({ message: GENERIC_MESSAGE });
}
