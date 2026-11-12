import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://reflink-ten.vercel.app",
  "https://reflink-yobe.vercel.app",
  "https://reflink-fwyo99chg-uthaibas-projects.vercel.app",
  "http://localhost:5173",
];

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get("REFLINK_ALLOWED_ORIGINS");
  return new Set(
    [...DEFAULT_ALLOWED_ORIGINS, ...(configured ? configured.split(",") : [])]
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function response(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (origin && !allowedOrigins().has(origin)) {
    return response({ success: false, error: "Origin not allowed." }, 403, null);
  }

  const corsHeaders = new Headers({
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  });
  if (origin) corsHeaders.set("Access-Control-Allow-Origin", origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return response({ success: false, error: "Method not allowed." }, 405, origin);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return response({ success: false, error: "Service configuration unavailable." }, 500, origin);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return response({ success: false, error: "Authentication is required." }, 401, origin);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) {
      return response({ success: false, error: "A valid signed-in session is required." }, 401, origin);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile) {
      return response({ success: false, error: "A valid REFLINK profile is required." }, 403, origin);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return response({ success: false, error: "Request body must be valid JSON." }, 400, origin);
    }

    const password = typeof body.password === "string" ? body.password : "";
    const passwordPolicy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordPolicy.test(password)) {
      return response({
        success: false,
        error: "Password must contain at least 8 characters, including lowercase, uppercase, a number and a special character.",
      }, 400, origin);
    }

    const { error: passwordError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { password },
    );
    if (passwordError) {
      return response({ success: false, error: "Password could not be updated." }, 400, origin);
    }

    const { error: flagError } = await adminClient
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);
    if (flagError) {
      console.error("change-password profile flag update failed", { userId: user.id });
      return response({
        success: false,
        password_changed: true,
        error: "Password changed, but account status could not be updated. Contact an administrator.",
      }, 500, origin);
    }

    return response({ success: true, message: "Password changed successfully." }, 200, origin);
  } catch (error) {
    console.error("change-password request failed", error instanceof Error ? error.name : "unknown");
    return response({ success: false, error: "Unexpected server error." }, 500, origin);
  }
});
