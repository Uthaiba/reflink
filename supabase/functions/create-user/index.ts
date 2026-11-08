import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: "Account provisioning is temporarily unavailable." }, 500);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ success: false, error: "Authentication required." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authorization.slice("Bearer ".length);
    const { data: { user: requester }, error: authError } = await admin.auth.getUser(token);
    if (authError || !requester) {
      return json({ success: false, error: "Authentication could not be verified." }, 401);
    }

    const { data: requesterProfile, error: requesterProfileError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", requester.id)
      .maybeSingle();

    if (requesterProfileError || requesterProfile?.role !== "administrator") {
      return json({ success: false, error: "Administrator access required." }, 403);
    }

    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const facilityId = typeof body.facility_id === "string" ? body.facility_id : null;

    const allowedRoles = new Set(["administrator", "phc_staff", "receiving_staff"]);
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: "A valid email address is required." }, 400);
    }
    if (!password || !fullName || fullName.length > 160) {
      return json({ success: false, error: "Password and a valid full name are required." }, 400);
    }
    if (phone.length > 30) {
      return json({ success: false, error: "Phone number is too long." }, 400);
    }
    if (!allowedRoles.has(role)) {
      return json({ success: false, error: "Unsupported REFLINK role." }, 400);
    }
    if (role !== "administrator" && !facilityId) {
      return json({ success: false, error: "A facility assignment is required for this role." }, 400);
    }

    if (facilityId) {
      const { data: facility, error: facilityError } = await admin
        .from("facilities")
        .select("id, is_active")
        .eq("id", facilityId)
        .maybeSingle();

      if (facilityError || !facility || facility.is_active !== true) {
        return json({ success: false, error: "Select an active facility." }, 400);
      }
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created.user) {
      return json({ success: false, error: "The account could not be created. Check the details or contact the system administrator." }, 400);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        id: created.user.id,
        full_name: fullName,
        phone: phone || null,
        role,
        facility_id: facilityId,
        must_change_password: true,
      })
      .select("id, full_name, phone, role, facility_id")
      .single();

    if (profileError || !profile) {
      // Best-effort rollback: do not leave an Auth identity without its REFLINK profile.
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ success: false, error: "The profile could not be created; the account creation was rolled back." }, 500);
    }

    return json({
      success: true,
      message: "User created successfully.",
      user: { id: profile.id, email: created.user.email, ...profile },
    }, 201);
  } catch {
    // Never log request bodies, credentials, tokens or patient information.
    return json({ success: false, error: "Unexpected account-provisioning error." }, 500);
  }
});
