export const PROVISIONING_ROLES = Object.freeze([
  "administrator",
  "phc_staff",
  "receiving_staff",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isAdministratorProfile(profile) {
  return profile?.role === "administrator";
}

export function requiresFacility(role) {
  return role !== "administrator";
}

export function normalizeProvisioningInput(body) {
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body
    : {};

  const email = typeof input.email === "string"
    ? input.email.trim().toLowerCase()
    : "";
  const password = typeof input.password === "string" ? input.password : "";
  const fullName = typeof input.full_name === "string"
    ? input.full_name.trim()
    : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const role = typeof input.role === "string" ? input.role.trim() : "";
  const facilityId = typeof input.facility_id === "string"
    ? input.facility_id
    : null;

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "A valid email address is required." };
  }
  if (!password || !fullName || fullName.length > 160) {
    return { ok: false, error: "Password and a valid full name are required." };
  }
  if (phone.length > 30) {
    return { ok: false, error: "Phone number is too long." };
  }
  if (!PROVISIONING_ROLES.includes(role)) {
    return { ok: false, error: "Unsupported REFLINK role." };
  }
  if (requiresFacility(role) && !facilityId) {
    return {
      ok: false,
      error: "A facility assignment is required for this role.",
    };
  }

  return {
    ok: true,
    value: { email, password, fullName, phone, role, facilityId },
  };
}

export function buildInitialProfile({
  id,
  fullName,
  phone,
  role,
  facilityId,
}) {
  if (!id || !PROVISIONING_ROLES.includes(role)) {
    throw new TypeError("A valid Auth identity and supported role are required.");
  }
  if (requiresFacility(role) && !facilityId) {
    throw new TypeError("A facility assignment is required for this role.");
  }

  return {
    id,
    full_name: fullName,
    phone: phone || null,
    role,
    facility_id: facilityId || null,
    must_change_password: true,
  };
}

export async function provisionAccount({
  requesterProfile,
  body,
  findActiveFacility,
  createAuthUser,
  createProfile,
  deleteAuthUser,
}) {
  if (!isAdministratorProfile(requesterProfile)) {
    return {
      status: 403,
      body: { success: false, error: "Administrator access required." },
    };
  }

  const parsed = normalizeProvisioningInput(body);
  if (!parsed.ok) {
    return {
      status: 400,
      body: { success: false, error: parsed.error },
    };
  }

  const { email, password, fullName, phone, role, facilityId } = parsed.value;

  if (facilityId) {
    const facilityIsActive = await findActiveFacility(facilityId);
    if (!facilityIsActive) {
      return {
        status: 400,
        body: { success: false, error: "Select an active facility." },
      };
    }
  }

  const { user, error: createError } = await createAuthUser({
    email,
    password,
    fullName,
  });
  if (createError || !user) {
    return {
      status: 400,
      body: {
        success: false,
        error: "The account could not be created. Check the details or contact the system administrator.",
      },
    };
  }

  const profileInput = buildInitialProfile({
    id: user.id,
    fullName,
    phone,
    role,
    facilityId,
  });
  const { profile, error: profileError } = await createProfile(profileInput);

  if (profileError || !profile) {
    const { error: rollbackError } = await deleteAuthUser(user.id);
    if (rollbackError) {
      return {
        status: 500,
        body: {
          success: false,
          error: "The profile could not be created and account cleanup requires administrator review.",
        },
      };
    }
    return {
      status: 500,
      body: {
        success: false,
        error: "The profile could not be created; the account creation was rolled back.",
      },
    };
  }

  return {
    status: 201,
    body: {
      success: true,
      message: "User created successfully.",
      user: { id: profile.id, email: user.email, ...profile },
    },
  };
}
