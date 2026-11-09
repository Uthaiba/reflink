import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildInitialProfile,
  isAdministratorProfile,
  normalizeProvisioningInput,
} from "../_shared/accountProvisioningPolicy.js";

const canonicalOrigin = "https://reflink-yobe.vercel.app";
const configuredOrigins = (Deno.env.get("REFLINK_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([canonicalOrigin, ...configuredOrigins]);

const corsHeadersFor = (origin: string | null): HeadersInit => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
};

const json = (
  body: Record<string, unknown>,
  status = 200,
  origin: string | null = null,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = corsHeadersFor(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405, origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: "Account provisioning is temporarily unavailable." }, 500, origin);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ success: false, error: "Authentication required." }, 401, origin);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authorization.slice("Bearer ".length);
    const { data: { user: requester }, error: authError } = await admin.auth.getUser(token);
    if (authError || !requester) {
      return json({ success: false, error: "Authentication could not be verified." }, 401, origin);
    }

    const { data: requesterProfile, error: requesterProfileError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", requester.id)
      .maybeSingle();

    if (requesterProfileError || !isAdministratorProfile(requesterProfile)) {
      return json({ success: false, error: "Administrator access required." }, 403, origin);
    }

    const parsedInput = normalizeProvisioningInput(await req.json());
    if (!parsedInput.ok) {
      return json({ success: false, error: parsedInput.error }, 400, origin);
    }

    const { email, password, fullName, phone, role, facilityId } = parsedInput.value;

    if (facilityId) {
      const { data: facility, error: facilityError } = await admin
        .from("facilities")
        .select("id, is_active")
        .eq("id", facilityId)
        .maybeSingle();

      if (facilityError || !facility || facility.is_active !== true) {
        return json({ success: false, error: "Select an active facility." }, 400, origin);
      }
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created.user) {
      return json({ success: false, error: "The account could not be created. Check the details or contact the system administrator." }, 400, origin);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert(buildInitialProfile({
        id: created.user.id,
        fullName,
        phone,
        role,
        facilityId,
      }))
      .select("id, full_name, phone, role, facility_id")
      .single();

    if (profileError || !profile) {
      // Compensate for the Auth identity created before the profile insert failed.
      const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id);
      if (rollbackError) {
        return json({
          success: false,
          error: "The profile could not be created and account cleanup requires administrator review.",
        }, 500, origin);
      }
      return json({
        success: false,
        error: "The profile could not be created; the account creation was rolled back.",
      }, 500, origin);
    }

    return json({
      success: true,
      message: "User created successfully.",
      user: { id: profile.id, email: created.user.email, ...profile },
    }, 201, origin);
  } catch {
    // Never log request bodies, credentials, tokens or patient information.
    return json({ success: false, error: "Unexpected account-provisioning error." }, 500, origin);
  }
});
