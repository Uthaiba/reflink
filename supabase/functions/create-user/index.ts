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
  const origins = allowedOrigins();

  if (origin && !origins.has(origin)) {
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

    const { data: { user: requester }, error: authError } =
      await callerClient.auth.getUser();

    if (authError || !requester) {
      return response({ success: false, error: "A valid signed-in session is required." }, 401, origin);
    }

    const { data: requesterProfile, error: requesterProfileError } =
      await adminClient
        .from("profiles")
        .select("id, role")
        .eq("id", requester.id)
        .maybeSingle();

    if (requesterProfileError || !requesterProfile || requesterProfile.role !== "administrator") {
      return response({ success: false, error: "Administrator access required." }, 403, origin);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return response({ success: false, error: "Request body must be valid JSON." }, 400, origin);
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : null;
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const facilityId = typeof body.facility_id === "string" && body.facility_id.trim()
      ? body.facility_id.trim()
      : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !password || !fullName || !role) {
      return response({
        success: false,
        error: "A valid email, password, full name and role are required.",
      }, 400, origin);
    }

    // These are the exact role values enforced by public.profiles.role_check.
    const allowedRoles = ["administrator", "phc_staff", "receiving_staff"];
    if (!allowedRoles.includes(role)) {
      return response({ success: false, error: "Invalid user role." }, 400, origin);
    }

    if (facilityId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(facilityId)) {
      return response({ success: false, error: "Invalid facility identifier." }, 400, origin);
    }

    // Enforce the role/facility relationship before creating an Auth identity.
    // Administrators are platform-wide and must not be assigned to a facility.
    if (role === "administrator" && facilityId !== null) {
      return response({ success: false, error: "Administrators cannot be assigned to a facility." }, 400, origin);
    }
    if (role !== "administrator") {
      if (!facilityId) {
        return response({ success: false, error: "Clinical staff must be assigned to an active facility." }, 400, origin);
      }
      const { data: facility, error: facilityError } = await adminClient
        .from("facilities")
        .select("id, facility_type, is_active")
        .eq("id", facilityId)
        .maybeSingle();
      if (facilityError || !facility || facility.is_active !== true) {
        return response({ success: false, error: "An active facility is required." }, 400, origin);
      }
      const requiredType = role === "phc_staff"
        ? "primary_health_centre"
        : "general_hospital";
      if (facility.facility_type !== requiredType) {
        return response({ success: false, error: "The facility type does not match the clinical staff role." }, 400, origin);
      }
    }

    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone },
      });

    if (createError || !created.user) {
      return response({
        success: false,
        error: "User account could not be created. Check the supplied details.",
      }, 400, origin);
    }

    const newUser = created.user;
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .insert({
        id: newUser.id,
        full_name: fullName,
        phone,
        role,
        facility_id: facilityId,
      })
      .select("id, full_name, phone, role, facility_id")
      .single();

    if (profileError || !profile) {
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(newUser.id);
      if (rollbackError) {
        // Do not leak internal error details; record only the cleanup failure.
        console.error("create-user rollback failed", { userId: newUser.id });
      }
      return response({
        success: false,
        error: "Profile creation failed; account creation was rolled back where possible.",
      }, 500, origin);
    }

    return response({
      success: true,
      message: "User created successfully.",
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: profile.full_name,
        phone: profile.phone,
        role: profile.role,
        facility_id: profile.facility_id,
      },
    }, 201, origin);
  } catch (error) {
    console.error("create-user request failed", error instanceof Error ? error.name : "unknown");
    return response({ success: false, error: "Unexpected server error." }, 500, origin);
  }
});
