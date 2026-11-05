import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { isCompleteCalendarMonth } from "../../lib/rphiFacilityReporting.js";

/* =======================================================
   ADMIN DASHBOARD
   ======================================================= */

function AdminDashboard({
  profile,
  formatPatientAge,
  getStatusLabel,
}) {
  const [view, setView] = useState("home");

  /* =======================================================
     FACILITIES
     ======================================================= */

  const [facilities, setFacilities] = useState([]);
  const [facilityUserCounts, setFacilityUserCounts] =
    useState({});
  const [facilitiesLoading, setFacilitiesLoading] =
    useState(false);

  const [editingFacility, setEditingFacility] =
    useState(null);

  const [facilitySearch, setFacilitySearch] =
    useState("");

  const [facilityForm, setFacilityForm] =
    useState({
      name: "",
      facility_type: "",
      state: "",
      lga: "",
      is_active: true,
    });

  /* =======================================================
     USERS
     ======================================================= */

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] =
    useState(false);

  const [userSearch, setUserSearch] =
    useState("");

  const [editingUser, setEditingUser] =
    useState(null);

  const [userForm, setUserForm] =
    useState({
      full_name: "",
      email: "",
      password: "",
      role: "",
      facility_id: "",
    });

  /* =======================================================
     REFERRALS
     ======================================================= */

  const [referrals, setReferrals] = useState([]);
  const [referralsLoading, setReferralsLoading] =
    useState(false);

  /* =======================================================
     GENERAL STATE
     ======================================================= */

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  /* =======================================================
     LOAD FACILITY USER COUNTS
     ======================================================= */

  const loadFacilityUserCounts = async () => {
    try {
      const {
        data,
        error: countError,
      } = await supabase.rpc(
        "get_facility_user_counts"
      );

      if (countError) {
        throw countError;
      }

      const counts = {};

      (data || []).forEach((row) => {
        counts[row.facility_id] = Number(row.user_count || 0);
      });

      setFacilityUserCounts(counts);
    } catch (err) {
      console.error(
        "FACILITY USER COUNTS ERROR:",
        err
      );
      setFacilityUserCounts({});
    }
  };

  /* =======================================================
     LOAD FACILITIES
     ======================================================= */

  const loadFacilities = async () => {
    setFacilitiesLoading(true);
    setError("");

    try {
      const {
        data,
        error: facilitiesError,
      } = await supabase
        .from("facilities")
        .select(
          "id, name, facility_type, state, lga, is_active"
        )
        .order("name");

      if (facilitiesError) {
        throw facilitiesError;
      }

      setFacilities(data || []);
      await loadFacilityUserCounts();
    } catch (err) {
      console.error(
        "FACILITIES ERROR:",
        err
      );

      setError(
        err?.message ||
          "Unable to load facilities."
      );

      setFacilities([]);
    } finally {
      setFacilitiesLoading(false);
    }
  };

  /* =======================================================
     LOAD USERS / PROFILES
     ======================================================= */

  const loadUsers = async () => {
    setUsersLoading(true);
    setError("");

    try {
      const {
        data,
        error: usersError,
      } = await supabase
        .from("profiles")
        .select(
          "id, full_name, role, facility_id"
        )
        .order("full_name");

      if (usersError) {
        throw usersError;
      }

      setUsers(data || []);
    } catch (err) {
      console.error(
        "USERS ERROR:",
        err
      );

      setError(
        err?.message ||
          "Unable to load REFLINK users."
      );

      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  /* =======================================================
     LOAD REFERRALS
     ======================================================= */

  // Administrators receive aggregate reporting only. Patient-level referral rows
  // remain restricted to the PHC and receiving-facility workflows.
  const loadReferrals = async () => {
    setReferrals([]);
    setReferralsLoading(false);
  };

  /* =======================================================
     LOAD DATA WHEN VIEW CHANGES
     ======================================================= */

  useEffect(() => {
    if (view === "home") {
      loadFacilities();
      loadUsers();
      loadReferrals();
      return;
    }

    if (view === "facilities") {
      loadFacilities();
    }

    if (view === "users") {
      loadFacilities();
      loadUsers();
    }

    if (view === "referrals" || view === "active-referrals") {
      loadReferrals();
    }
  }, [view]);

  useEffect(() => {
    if (view !== "home") return undefined;

    const interval = window.setInterval(() => {
      loadFacilities();
      loadUsers();
      loadReferrals();
    }, 60000);

    return () => window.clearInterval(interval);
  }, [view]);

  /* =======================================================
     FACILITY FORM
     ======================================================= */

  const resetFacilityForm = () => {
    setFacilityForm({
      name: "",
      facility_type: "",
      state: "",
      lga: "",
      is_active: true,
    });

    setEditingFacility(null);
  };

  const handleFacilityFormChange = (e) => {
    const {
      name,
      value,
    } = e.target;

    setFacilityForm(
      (previous) => ({
        ...previous,
        [name]: value,
      })
    );
  };

  /* =======================================================
     EDIT FACILITY
     ======================================================= */

  const startEditFacility = (
    facility
  ) => {
    setEditingFacility(facility);

    setFacilityForm({
      name:
        facility.name || "",

      facility_type:
        facility.facility_type || "",

      state:
        facility.state || "",

      lga:
        facility.lga || "",

      is_active:
        facility.is_active ?? true,
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  /* =======================================================
     SAVE FACILITY
     ======================================================= */

  const saveFacility = async (
    e
  ) => {
    e.preventDefault();

    setError("");
    setMessage("");
    setSaving(true);

    try {
      if (!facilityForm.name.trim()) {
        throw new Error(
          "Facility name is required."
        );
      }

      const payload = {
        name:
          facilityForm.name.trim(),

        facility_type:
          facilityForm.facility_type
            .trim() || null,

        state:
          facilityForm.state.trim() ||
          null,

        lga:
          facilityForm.lga.trim() ||
          null,

        is_active:
          facilityForm.is_active,
      };

      if (editingFacility) {
        const {
          error: updateError,
        } = await supabase
          .from("facilities")
          .update(payload)
          .eq(
            "id",
            editingFacility.id
          );

        if (updateError) {
          throw updateError;
        }

        setMessage(
          "Facility updated successfully."
        );
      } else {
        const {
          error: insertError,
        } = await supabase
          .from("facilities")
          .insert([
            payload,
          ]);

        if (insertError) {
          throw insertError;
        }

        setMessage(
          "Facility added successfully."
        );
      }

      resetFacilityForm();

      await loadFacilities();

      // Keep referral facility names current
      if (
        view === "referrals" ||
        view === "active-referrals"
      ) {
        await loadReferrals();
      }
    } catch (err) {
      console.error(
        "SAVE FACILITY ERROR:",
        err
      );

      setError(
        err?.message ||
          "Unable to save facility."
      );
    } finally {
      setSaving(false);
    }
  };

  /* =======================================================
     TOGGLE FACILITY
     ======================================================= */

  const toggleFacilityStatus =
    async (facility) => {
      setError("");
      setMessage("");

      const newStatus =
        !facility.is_active;

      try {
        const {
          error: updateError,
        } = await supabase
          .from("facilities")
          .update({
            is_active:
              newStatus,
          })
          .eq(
            "id",
            facility.id
          );

        if (updateError) {
          throw updateError;
        }

        setMessage(
          newStatus
            ? `${facility.name} has been activated.`
            : `${facility.name} has been deactivated.`
        );

        await loadFacilities();

        if (
          view === "referrals" ||
          view === "active-referrals"
        ) {
          await loadReferrals();
        }
      } catch (err) {
        console.error(
          "FACILITY STATUS ERROR:",
          err
        );

        setError(
          err?.message ||
            "Unable to update facility status."
        );
      }
    };

  /* =======================================================
     FILTER FACILITIES
     ======================================================= */

  const filteredFacilities =
    facilities.filter(
      (facility) => {
        const searchText =
          facilitySearch
            .toLowerCase()
            .trim();

        return (
          facility.name
            ?.toLowerCase()
            .includes(
              searchText
            ) ||
          facility.facility_type
            ?.toLowerCase()
            .includes(
              searchText
            ) ||
          facility.state
            ?.toLowerCase()
            .includes(
              searchText
            ) ||
          facility.lga
            ?.toLowerCase()
            .includes(
              searchText
            )
        );
      }
    );

  /* =======================================================
     USER FORM
     ======================================================= */

  const resetUserForm = () => {
    setEditingUser(null);

    setUserForm({
      full_name: "",
      email: "",
      password: "",
      role: "",
      facility_id: "",
    });
  };

  /* =======================================================
     EDIT USER
     ======================================================= */

  const startEditUser = async (
    user
  ) => {
    setError("");
    setMessage("");

    try {
      setEditingUser(user);

      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          role,
          facility_id
        `)
        .eq("id", user.id)
        .limit(1);

      if (error) {
        console.error(
          "EDIT USER LOAD ERROR:",
          error
        );

        throw error;
      }

      const profile =
        data?.[0];

      if (!profile) {
        throw new Error(
          "The selected user profile could not be found."
        );
      }

      setUserForm({
        full_name:
          profile.full_name ||
          "",

        email: "",

        password: "",

        role:
          profile.role ||
          "",

        facility_id:
          profile.facility_id ||
          "",
      });

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (err) {
      console.error(
        "START EDIT USER ERROR:",
        err
      );

      setError(
        err?.message ||
          "Unable to load the selected user."
      );

      setEditingUser(null);
    }
  };

  const handleUserFormChange = (
    e
  ) => {
    const {
      name,
      value,
    } = e.target;

    setUserForm(
      (previous) => ({
        ...previous,
        [name]: value,
      })
    );
  };

  /* =======================================================
     CREATE OR UPDATE USER PROFILE
     ======================================================= */

  const saveUser = async (
    e
  ) => {
    e.preventDefault();

    setError("");
    setMessage("");
    setSaving(true);

    try {
      if (
        !userForm.full_name.trim()
      ) {
        throw new Error(
          "Full name is required."
        );
      }

      if (!userForm.role) {
        throw new Error(
          "User role is required."
        );
      }

      if (!userForm.facility_id) {
        throw new Error(
          "Healthcare facility is required."
        );
      }

      if (!editingUser) {
        if (!userForm.email.trim()) {
          throw new Error(
            "Email is required."
          );
        }

        if (!userForm.password) {
          throw new Error(
            "Temporary password is required."
          );
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
          throw new Error(
            "Your session has expired. Please sign in again."
          );
        }

        const {
          data: createData,
          error: createError,
        } = await supabase.functions.invoke(
          "create-user",
          {
            body: {
              full_name:
                userForm.full_name.trim(),
              email:
                userForm.email.trim(),
              password: userForm.password,
              role: userForm.role,
              facility_id:
                userForm.facility_id,
            },
            headers: {
              Authorization:
                `Bearer ${session.access_token}`,
            },
          }
        );

        if (createError || !createData?.success) {
          let functionMessage =
            createData?.error;

          if (
            !functionMessage &&
            createError?.context instanceof Response
          ) {
            const errorBody = await createError.context
              .clone()
              .json()
              .catch(() => null);

            functionMessage = errorBody?.error;
          }

          throw new Error(
            functionMessage ||
              createError?.message ||
              "Unable to create the user."
          );
        }

        // Mark newly created accounts as temporary-password accounts.
        // The profile column is optional for backward compatibility.
        try {
          await supabase
            .from("profiles")
            .update({
              must_change_password: true,
            })
            .eq("id", createData.user?.id || createData.user_id || "");
        } catch (passwordFlagError) {
          console.warn(
            "TEMPORARY PASSWORD FLAG UPDATE SKIPPED:",
            passwordFlagError
          );
        }

        setMessage(
          createData.message ||
            "User created successfully."
        );

        resetUserForm();

        await loadUsers();
        return;
      }

      const payload = {
        full_name:
          userForm.full_name.trim(),

        role:
          userForm.role,

        facility_id:
          userForm.facility_id,
      };

      const {
        error: updateError,
      } = await supabase
        .from("profiles")
        .update(payload)
        .eq(
          "id",
          editingUser.id
        );

      if (updateError) {
        throw updateError;
      }

      setMessage(
        `${payload.full_name} profile updated successfully.`
      );

      resetUserForm();

      await loadUsers();
    } catch (err) {
      console.error(
        "SAVE USER ERROR:",
        err
      );

      setError(
        err?.message ||
          "Unable to update user profile."
      );
    } finally {
      setSaving(false);
    }
  };

  /* =======================================================
     REFERRAL HELPERS
     ======================================================= */

  const getReferralFacilityName = (
    referral,
    type
  ) => {
    const facility =
      type === "referring"
        ? referral.referring_facility
        : referral.receiving_facility;

    return (
      facility?.name ||
      "Facility not assigned"
    );
  };

  const getReferralStatusLabel = (
    status
  ) => {
    if (!status) {
      return "Unknown";
    }

    return status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      );
  };

  /* =======================================================
     FILTER USERS
     ======================================================= */

  const filteredUsers =
    users.filter(
      (user) => {
        const facility =
          facilities.find(
            (item) =>
              item.id ===
              user.facility_id
          );

        const searchText =
          userSearch
            .toLowerCase()
            .trim();

        return (
          user.full_name
            ?.toLowerCase()
            .includes(
              searchText
            ) ||
          user.role
            ?.toLowerCase()
            .includes(
              searchText
            ) ||
          facility?.name
            ?.toLowerCase()
            .includes(
              searchText
            )
        );
      }
    );

  /* =======================================================
     FACILITY VIEW
     ======================================================= */

  if (
    view ===
    "facilities"
  ) {
    return (
      <>
        <div className="dashboard-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              resetFacilityForm();
              setError("");
              setMessage("");
              setView("home");
            }}
          >
            ← Back to Administration
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() => {
              resetFacilityForm();

              window.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }}
          >
            + Add Facility
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {message && (
          <div className="success-message">
            {message}
          </div>
        )}

        <div className="dashboard-card">
          <span className="eyebrow">
            FACILITY MANAGEMENT
          </span>

          <h3>
            Healthcare Facilities
          </h3>

          <p>
            Manage facilities connected
            to the REFLINK referral
            network.
          </p>

          <form
            onSubmit={
              saveFacility
            }
            className="form-grid"
          >
            <div>
              <label>
                Facility Name
              </label>

              <input
                type="text"
                name="name"
                value={
                  facilityForm.name
                }
                onChange={
                  handleFacilityFormChange
                }
                placeholder="e.g. Buni Yadi General Hospital"
                required
              />
            </div>

            <div>
              <label>
                Facility Type
              </label>

              <select
                name="facility_type"
                value={
                  facilityForm.facility_type
                }
                onChange={
                  handleFacilityFormChange
                }
              >
                <option value="">
                  Select facility type
                </option>

                <option value="PHC">
                  Primary Health Centre
                </option>

                <option value="Hospital">
                  Hospital
                </option>

                <option value="General Hospital">
                  General Hospital
                </option>

                <option value="Specialist Hospital">
                  Specialist Hospital
                </option>

                <option value="Teaching Hospital">
                  Teaching Hospital
                </option>

                <option value="Clinic">
                  Clinic
                </option>

                <option value="Maternity">
                  Maternity
                </option>

                <option value="Other">
                  Other
                </option>
              </select>
            </div>

            <div>
              <label>
                State
              </label>

              <input
                type="text"
                name="state"
                value={
                  facilityForm.state
                }
                onChange={
                  handleFacilityFormChange
                }
                placeholder="e.g. Yobe"
              />
            </div>

            <div>
              <label>
                LGA
              </label>

              <input
                type="text"
                name="lga"
                value={
                  facilityForm.lga
                }
                onChange={
                  handleFacilityFormChange
                }
                placeholder="e.g. Gujba"
              />
            </div>

            <div>
              <label>
                Status
              </label>

              <select
                value={
                  facilityForm.is_active
                    ? "active"
                    : "inactive"
                }
                onChange={(e) =>
                  setFacilityForm(
                    (previous) => ({
                      ...previous,
                      is_active:
                        e.target
                          .value ===
                        "active",
                    })
                  )
                }
              >
                <option value="active">
                  Active
                </option>

                <option value="inactive">
                  Inactive
                </option>
              </select>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingFacility
                  ? "Update Facility"
                  : "Save Facility"}
              </button>

              {editingFacility && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    resetFacilityForm
                  }
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="dashboard-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "15px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3>
                Facility Directory
              </h3>

              <p>
                {facilities.length}{" "}
                facilities registered
                in REFLINK.
              </p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={
                loadFacilities
              }
              disabled={
                facilitiesLoading
              }
            >
              {facilitiesLoading
                ? "Refreshing..."
                : "↻ Refresh"}
            </button>
          </div>

          <div
            style={{
              marginTop: "20px",
            }}
          >
            <input
              type="text"
              value={
                facilitySearch
              }
              onChange={(e) =>
                setFacilitySearch(
                  e.target.value
                )
              }
              placeholder="Search facility, type, state or LGA..."
            />
          </div>

          {facilitiesLoading ? (
            <p>
              Loading facilities...
            </p>
          ) : filteredFacilities.length ===
            0 ? (
            <p>
              No facilities found.
            </p>
          ) : (
            <div
              style={{
                overflowX: "auto",
                marginTop: "20px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "12px" }}>
                      Facility Name
                    </th>

                    <th style={{ textAlign: "left", padding: "12px" }}>
                      Type
                    </th>

                    <th style={{ textAlign: "left", padding: "12px" }}>
                      State
                    </th>

                    <th style={{ textAlign: "left", padding: "12px" }}>
                      LGA
                    </th>

                    <th style={{ textAlign: "left", padding: "12px" }}>
                      Registered Users
                    </th>

                    <th style={{ textAlign: "left", padding: "12px" }}>
                      Status
                    </th>

                    <th style={{ textAlign: "left", padding: "12px" }}>
                      Actions
                    </th>
                  </tr>
</thead>

                <tbody>
                  {filteredFacilities.map(
                    (facility) => (
                      <tr
                        key={
                          facility.id
                        }
                      >
                        <td style={{
                          padding: "12px",
                        }}>
                          <strong>
                            {
                              facility.name
                            }
                          </strong>
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          {
                            facility.facility_type ||
                            "—"
                          }
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          {
                            facility.state ||
                            "—"
                          }
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          {
                            facility.lga ||
                            "—"
                          }
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          <strong className="facility-user-count">
                            {facilityUserCounts[facility.id] ?? 0}
                          </strong>
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          {facility.is_active
                            ? "🟢 Active"
                            : "🔴 Inactive"}
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() =>
                                startEditFacility(
                                  facility
                                )
                              }
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className={
                                facility.is_active
                                  ? "secondary-button"
                                  : "primary-button"
                              }
                              onClick={() =>
                                toggleFacilityStatus(
                                  facility
                                )
                              }
                            >
                              {facility.is_active
                                ? "Deactivate"
                                : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  /* =======================================================
     USER MANAGEMENT VIEW
     ======================================================= */

  if (
    view ===
    "users"
  ) {
    return (
      <>
        <div className="dashboard-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              resetUserForm();
              setError("");
              setMessage("");
              setView("home");
            }}
          >
            ← Back to Administration
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              loadUsers();
              loadFacilities();
            }}
            disabled={
              usersLoading
            }
          >
            {usersLoading
              ? "Refreshing..."
              : "↻ Refresh Users"}
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {message && (
          <div className="success-message">
            {message}
          </div>
        )}

        <div className="dashboard-card">
          <span className="eyebrow">
            USER MANAGEMENT
          </span>

          <h3>
            REFLINK User Management
          </h3>

          <p>
            Manage the role and healthcare
            facility assigned to registered
            REFLINK profiles.
          </p>

          <form
            onSubmit={
              saveUser
            }
            className="form-grid"
          >
            <div>
              <label>
                Full Name
              </label>

              <input
                type="text"
                name="full_name"
                value={
                  userForm.full_name
                }
                onChange={
                  handleUserFormChange
                }
                placeholder="User full name"
                required
              />
            </div>

            {!editingUser && (
              <>
                <div>
                  <label>
                    Email Address
                  </label>

                  <input
                    type="email"
                    name="email"
                    value={
                      userForm.email
                    }
                    onChange={
                      handleUserFormChange
                    }
                    placeholder="name@facility.org"
                    required
                  />
                </div>

                <div>
                  <label>
                    Temporary Password
                  </label>

                  <input
                    type="password"
                    name="password"
                    value={
                      userForm.password
                    }
                    onChange={
                      handleUserFormChange
                    }
                    placeholder="Set a temporary password"
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label>
                Role
              </label>

              <select
                name="role"
                value={
                  userForm.role
                }
                onChange={
                  handleUserFormChange
                }
                required
              >
                <option value="">
                  Select user role
                </option>

                <option value="administrator">
                  Administrator
                </option>

                <option value="phc_staff">
                  PHC Staff
                </option>

                <option value="receiving_staff">
                  Receiving Staff
                </option>
              </select>
            </div>

            <div>
              <label>
                Healthcare Facility
              </label>

              <select
                name="facility_id"
                value={
                  userForm.facility_id
                }
                onChange={
                  handleUserFormChange
                }
                required
              >
                <option value="">
                  Select facility
                </option>

                {facilities
                  .filter(
                    (
                      facility
                    ) =>
                      facility.is_active
                  )
                  .map(
                    (
                      facility
                    ) => (
                      <option
                        key={
                          facility.id
                        }
                        value={
                          facility.id
                        }
                      >
                        {
                          facility.name
                        }
                      </option>
                    )
                  )}
              </select>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="submit"
                className="primary-button"
                disabled={
                  saving
                }
              >
                {saving
                  ? "Saving..."
                  : editingUser
                    ? "Update User"
                    : "Create User"}
              </button>

              {editingUser && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    resetUserForm
                  }
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {!editingUser && (
            <p
              style={{
                marginTop: "15px",
              }}
            >
              Create a new REFLINK account, or select a user below to edit
              their profile.
            </p>
          )}
        </div>

        <div className="dashboard-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "15px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3>
                REFLINK Users
              </h3>

              <p>
                {users.length} user
                profile(s) registered.
              </p>
            </div>
          </div>

          <div
            style={{
              marginTop: "20px",
            }}
          >
            <input
              type="text"
              value={
                userSearch
              }
              onChange={(e) =>
                setUserSearch(
                  e.target.value
                )
              }
              placeholder="Search user, role or facility..."
            />
          </div>

          {usersLoading ? (
            <p>
              Loading users...
            </p>
          ) : filteredUsers.length ===
            0 ? (
            <p>
              No user profiles found.
            </p>
          ) : (
            <div
              style={{
                overflowX: "auto",
                marginTop: "20px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr>
                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Name
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Role
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Facility
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      User ID
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.map(
                    (user) => {
                      const facility =
                        facilities.find(
                          (
                            item
                          ) =>
                            item.id ===
                            user.facility_id
                        );

                      return (
                        <tr
                          key={
                            user.id
                          }
                        >
                          <td style={{
                            padding: "12px",
                          }}>
                            <strong>
                              {
                                user.full_name
                              }
                            </strong>
                          </td>

                          <td style={{
                            padding: "12px",
                          }}>
                            {user.role ===
                            "administrator"
                              ? "Administrator"
                              : user.role ===
                                "phc_staff"
                              ? "PHC Staff"
                              : user.role ===
                                "receiving_staff"
                              ? "Receiving Staff"
                              : user.role ||
                                "—"}
                          </td>

                          <td style={{
                            padding: "12px",
                          }}>
                            {
                              facility?.name ||
                              "Facility not assigned"
                            }
                          </td>

                          <td
                            style={{
                              padding: "12px",
                              fontSize: "12px",
                            }}
                          >
                            {
                              user.id
                            }
                          </td>

                          <td style={{
                            padding: "12px",
                          }}>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() =>
                                startEditUser(
                                  user
                                )
                              }
                            >
                              Edit User
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  /* =======================================================
     REFERRAL NETWORK VIEW
     ======================================================= */

  if (view === "referrals" || view === "active-referrals") {
    return (
      <>
        <div className="dashboard-actions">
          <button type="button" className="secondary-button" onClick={() => setView("home")}>← Back to Administration</button>
        </div>
        <div className="dashboard-card">
          <span className="eyebrow">CLINICAL RECORD PRIVACY</span>
          <h3>Patient-level referral records are not available in the administrator workspace</h3>
          <p>REFLINK restricts identifiable clinical referral records to the authorised referring and receiving care teams. Use the aggregate reporting workspace for network-level activity. If an administrator needs an individual record for a legitimate clinical or governance purpose, that access requires a separately approved, purpose-limited and audited workflow.</p>
          <button type="button" className="primary-button" onClick={() => setView("analytics")}>Open aggregate reporting</button>
        </div>
      </>
    );
  }

  if (
    view ===
    "referrals"
  ) {
    return (
      <>
        <div className="dashboard-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setError("");
              setMessage("");
              setView("home");
            }}
          >
            ← Back to Administration
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={
              loadReferrals
            }
            disabled={
              referralsLoading
            }
          >
            {referralsLoading
              ? "Refreshing..."
              : "↻ Refresh Referrals"}
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {message && (
          <div className="success-message">
            {message}
          </div>
        )}

        <div className="dashboard-card">
          <span className="eyebrow">
            REFERRAL NETWORK
          </span>

          <h3>
            REFLINK Referral Network
          </h3>

          <p>
            Monitor and manage referral activity
            across the REFLINK healthcare network.
          </p>

          <div className="stats-grid">
            <div className="stat-card">
              <span>
                Total Referrals
              </span>

              <strong>
                {referrals.length}
              </strong>
            </div>

            <div className="stat-card">
              <span>
                Active Referrals
              </span>

              <strong>
                {
                  referrals.filter(
                    (referral) =>
                      ![
                        "completed",
                        "discharged",
                      ].includes(
                        referral.status
                      )
                  ).length
                }
              </strong>
            </div>

            <div className="stat-card">
              <span>
                Completed
              </span>

              <strong>
                {
                  referrals.filter(
                    (referral) =>
                      referral.status ===
                      "completed"
                  ).length
                }
              </strong>
            </div>

            <div className="stat-card">
              <span>
                Discharged
              </span>

              <strong>
                {
                  referrals.filter(
                    (referral) =>
                      referral.status ===
                      "discharged"
                  ).length
                }
              </strong>
            </div>
          </div>
        </div>

        <div className="dashboard-card">
          <h3>
            Referral Records
          </h3>

          <p>
            {referrals.length} referral
            {referrals.length === 1
              ? ""
              : "s"} registered in REFLINK.
          </p>

          {referralsLoading ? (
            <p>
              Loading referrals...
            </p>
          ) : referrals.length === 0 ? (
            <p>
              No referral records found.
            </p>
          ) : (
            <div
              style={{
                overflowX: "auto",
                marginTop: "20px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr>
                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Referral No.
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Patient
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Referring Facility
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Receiving Facility
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Urgency
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Status
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Created
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {referrals.map(
                    (referral) => (
                      <tr
                        key={
                          referral.id
                        }
                      >
                        <td style={{
                          padding: "12px",
                        }}>
                          <strong>
                            {
                              referral.referral_number ||
                              "—"
                            }
                          </strong>
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          <strong>
                            {
                              referral.patient_identifier ||
                              "Unknown patient"
                            }
                          </strong>

                          <br />

                          <small>
                            {
                              formatPatientAge(
                                referral.patient_age_months
                              )
                            }

                            {" · "}

                            {
                              referral.patient_sex ||
                              "Sex not recorded"
                            }
                          </small>
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          <strong>
                            {
                              getReferralFacilityName(
                                referral,
                                "referring"
                              )
                            }
                          </strong>

                          {referral
                            .referring_facility
                            ?.lga && (
                            <>
                              <br />

                              <small>
                                {
                                  referral
                                    .referring_facility
                                    .lga
                                }

                                {referral
                                  .referring_facility
                                  ?.state
                                  ? `, ${referral.referring_facility.state}`
                                  : ""}
                              </small>
                            </>
                          )}
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          <strong>
                            {
                              getReferralFacilityName(
                                referral,
                                "receiving"
                              )
                            }
                          </strong>

                          {referral
                            .receiving_facility
                            ?.lga && (
                            <>
                              <br />

                              <small>
                                {
                                  referral
                                    .receiving_facility
                                    .lga
                                }

                                {referral
                                  .receiving_facility
                                  ?.state
                                  ? `, ${referral.receiving_facility.state}`
                                  : ""}
                              </small>
                            </>
                          )}
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          {
                            referral.urgency ||
                            "Not specified"
                          }
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          {
                            getStatusLabel(
                              referral.status
                            )
                          }
                        </td>

                        <td style={{
                          padding: "12px",
                        }}>
                          {
                            referral.created_at
                              ? new Date(
                                  referral.created_at
                                ).toLocaleString()
                              : "—"
                          }
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  /* =======================================================
     ANALYSIS HUB VIEW
     ======================================================= */

  if (view === "analysis") {
    return (
      <>
        <div className="dashboard-actions">
          <button type="button" className="secondary-button" onClick={() => { setError(""); setMessage(""); setView("home"); }}>
            ← Back to Administration
          </button>
        </div>
        <AdminAggregateReports />
      </>
    );
  }

  /* =======================================================
     ANALYTICS VIEW
     ======================================================= */

  if (
    view ===
    "analytics"
  ) {
    return (
      <>
        <div className="dashboard-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setError("");
              setMessage("");
              setView("home");
            }}
          >
            ← Back to Administration
          </button>
        </div>

        <AdminAggregateReports />
      </>
    );
  }

  /* =======================================================
     ACTIVE REFERRALS VIEW
     ======================================================= */

  if (
    view ===
    "active-referrals"
  ) {
    const activeReferrals =
      referrals.filter(
        (referral) =>
          ![
            "completed",
            "discharged",
          ].includes(
            referral.status
          )
      );

    return (
      <>
        <div className="dashboard-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setError("");
              setMessage("");
              setView("home");
            }}
          >
            ← Back to Administration
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={
              loadReferrals
            }
            disabled={
              referralsLoading
            }
          >
            {referralsLoading
              ? "Refreshing..."
              : "↻ Refresh Active Referrals"}
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="dashboard-card">
          <span className="eyebrow">
            ACTIVE REFERRALS
          </span>

          <h3>
            Active Referral Network
          </h3>

          <p>
            Referrals that have not yet been
            completed or discharged.
          </p>

          <div className="stat-card">
            <span>
              Active Referrals
            </span>

            <strong>
              {
                activeReferrals.length
              }
            </strong>
          </div>
        </div>

        <div className="dashboard-card">
          <h3>
            Active Referral Records
          </h3>

          {referralsLoading ? (
            <p>
              Loading active referrals...
            </p>
          ) : activeReferrals.length ===
            0 ? (
            <p>
              No active referrals found.
            </p>
          ) : (
            <div
              style={{
                overflowX: "auto",
                marginTop: "20px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr>
                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Referral No.
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Patient
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      From
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      To
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Urgency
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Status
                    </th>

                    <th style={{
                      textAlign: "left",
                      padding: "12px",
                    }}>
                      Created
                    </th>
                  </tr>
                </thead>

                <tbody>
  {activeReferrals.map((referral) => (
    <tr key={referral.id}>
      <td style={{ padding: "12px" }}>
        <strong>
          {referral.referral_number || "—"}
        </strong>
      </td>

      <td style={{ padding: "12px" }}>
        <strong>
          {referral.patient_identifier || "—"}
        </strong>

        <br />

        <small>
          {formatPatientAge(referral.patient_age_months)}

          {" · "}

          {referral.patient_sex || "Sex not recorded"}
        </small>
      </td>

      <td style={{ padding: "12px" }}>
        {referral.referring_facility?.name ||
          "Facility not assigned"}
      </td>

      <td style={{ padding: "12px" }}>
        {referral.receiving_facility?.name ||
          "Facility not assigned"}
      </td>

      <td style={{ padding: "12px" }}>
        {referral.urgency || "Not specified"}
      </td>

      <td style={{ padding: "12px" }}>
        {getStatusLabel(referral.status)}
      </td>

      <td style={{ padding: "12px" }}>
        {referral.created_at
          ? new Date(
              referral.created_at
            ).toLocaleString()
          : "—"}
      </td>
    </tr>
  ))}
</tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  if (view === "home") {
    return (
      <div className="admin-modern-shell">
        <main className="admin-modern-main">
          <header className="admin-modern-heading">
            <div>
              <span className="eyebrow">REFLINK / ADMINISTRATION</span>
              <h2>Good evening, {profile?.full_name?.split(" ")[0] || "Administrator"}</h2>
              <p>Network administration and privacy-preserving service activity reporting.</p>
            </div>
            <button type="button" className="primary-button admin-primary-action" onClick={() => setView("facilities")}>+ Manage facilities</button>
          </header>
          <div className="admin-kpi-grid">
            <div className="admin-kpi-card kpi-teal"><span>Facilities</span><strong>{facilities.length.toLocaleString()}</strong><small>Configured network facilities</small></div>
            <div className="admin-kpi-card kpi-amber"><span>System users</span><strong>{users.length.toLocaleString()}</strong><small>Configured accounts and roles</small></div>
          </div>
          <AdminAggregateReports />
          <div className="dashboard-card">
            <span className="eyebrow">ACCESS MODEL</span>
            <h3>Clinical records stay with care teams</h3>
            <p>Administrator reporting is aggregate-only. Individual referral records remain available through authorised PHC and receiving-facility workflows, subject to database access policies.</p>
            <div className="dashboard-actions">
              <button type="button" className="secondary-button" onClick={() => setView("facilities")}>Manage facilities</button>
              <button type="button" className="secondary-button" onClick={() => setView("users")}>Manage users</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* Administrator home renders aggregate reports and network configuration only. */

  return (
    <div className="admin-modern-shell">
      <aside className="admin-modern-sidebar" aria-label="Administration navigation">
        <div className="admin-sidebar-brand">
          <div className="admin-sidebar-logo">R</div>
          <div>
            <strong>REFLINK</strong>
            <span>Health Network</span>
          </div>
        </div>

        <div className="admin-sidebar-section-label">WORKSPACE</div>
        <nav className="admin-sidebar-nav">
          <button type="button" className={view === "home" ? "is-active" : ""} onClick={() => setView("home")}>
            <span className="admin-nav-icon">⌂</span>
            <span>Dashboard</span>
          </button>
          <button type="button" className={view === "referrals" || view === "active-referrals" ? "is-active" : ""} onClick={() => setView("referrals")}>
            <span className="admin-nav-icon">↗</span>
            <span>Referrals</span>
            {adminActiveReferrals.length > 0 && <b>{adminActiveReferrals.length}</b>}
          </button>
          <button type="button" className={view === "analysis" ? "is-active" : ""} onClick={() => setView("analysis")}>
            <span className="admin-nav-icon">◫</span>
            <span>Analytics</span>
          </button>
          <button type="button" className={view === "analytics" ? "is-active" : ""} onClick={() => setView("analytics")}>
            <span className="admin-nav-icon">▥</span>
            <span>Referral Performance</span>
          </button>
        </nav>

        <div className="admin-sidebar-section-label">MANAGEMENT</div>
        <nav className="admin-sidebar-nav">
          <button type="button" className={view === "facilities" ? "is-active" : ""} onClick={() => setView("facilities")}>
            <span className="admin-nav-icon">⌂</span>
            <span>Facilities</span>
          </button>
          <button type="button" className={view === "users" ? "is-active" : ""} onClick={() => setView("users")}>
            <span className="admin-nav-icon">◎</span>
            <span>Users & Roles</span>
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-avatar">{(profile?.full_name || "AD").slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{profile?.full_name || "Administrator"}</strong>
            <span>System Administrator</span>
          </div>
        </div>
      </aside>

      <section className="admin-modern-content">
        <div className="admin-modern-topbar">
          <div className="admin-modern-search">
            <span>⌕</span>
            <input
              aria-label="Search administration"
              placeholder="Search referrals, facilities, users..."
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.currentTarget.value.trim()) {
                  setView("referrals");
                }
              }}
            />
          </div>
          <div className="admin-topbar-actions">
            <span className={`admin-live-status ${adminSystemStatus === "Operational" ? "is-ok" : "is-attention"}`}><i /> {adminSystemStatus}</span>
            <button type="button" className="admin-icon-button" title="Refresh dashboard" onClick={() => { loadFacilities(); loadUsers(); loadReferrals(); }}>↻</button>
            <button type="button" className="admin-topbar-user" aria-label="Administrator account">
              <span className="admin-sidebar-avatar small">{(profile?.full_name || "AD").slice(0, 2).toUpperCase()}</span>
              <span>{profile?.full_name || "Administrator"}</span>
              <span>⌄</span>
            </button>
          </div>
        </div>

        <nav className="admin-mobile-nav" aria-label="Mobile administration navigation">
          <button type="button" className={view === "home" ? "is-active" : ""} onClick={() => setView("home")}>Dashboard</button>
          <button type="button" className={view === "referrals" || view === "active-referrals" ? "is-active" : ""} onClick={() => setView("referrals")}>Referrals</button>
          <button type="button" className={view === "analysis" ? "is-active" : ""} onClick={() => setView("analysis")}>Analytics</button>
          <button type="button" className={view === "facilities" ? "is-active" : ""} onClick={() => setView("facilities")}>Facilities</button>
          <button type="button" className={view === "users" ? "is-active" : ""} onClick={() => setView("users")}>Users</button>
        </nav>

        <div className="admin-modern-main">
          <header className="admin-modern-heading">
            <div>
              <span className="eyebrow">REFLINK / ADMINISTRATION</span>
              <h2>Network overview</h2>
              <p>Manage facilities and user access, and review privacy-preserving referral activity.</p>
            </div>
            <button type="button" className="primary-button admin-primary-action" onClick={() => setView("facilities")}>
              + Add Facility
            </button>
          </header>

          <section className="admin-kpi-grid" aria-label="Network configuration summary">
            <article className="admin-kpi-card kpi-teal">
              <div className="admin-kpi-icon">⌂</div>
              <span>Registered facilities</span>
              <strong>{facilitiesLoading ? "…" : facilities.length.toLocaleString()}</strong>
              <small>{facilities.filter((facility) => facility.is_active).length} active facilities</small>
            </article>
            <article className="admin-kpi-card kpi-amber">
              <div className="admin-kpi-icon">◎</div>
              <span>Registered user profiles</span>
              <strong>{usersLoading ? "…" : users.length.toLocaleString()}</strong>
              <small>Role and facility assignments</small>
            </article>
            <article className="admin-kpi-card kpi-blue">
              <div className="admin-kpi-icon">▦</div>
              <span>Referral reporting</span>
              <strong>Aggregate only</strong>
              <small>No patient-level records in this workspace</small>
            </article>
          </section>

          {(error || message) && (
            <div className={error ? "error-message" : "success-message"} role={error ? "alert" : "status"}>
              {error || message}
            </div>
          )}

          <div className="admin-dashboard-grid">
            <div className="admin-chart-card">
              <div className="admin-card-heading">
                <div>
                  <span className="eyebrow">PUBLIC HEALTH INTELLIGENCE</span>
                  <h3>Referral service activity</h3>
                  <p>Review aggregate referral volume for a defined reporting period.</p>
                </div>
              </div>
              <AdminAggregateReports />
            </div>

            <div className="admin-quick-card">
              <div className="admin-card-heading">
                <div>
                  <span className="eyebrow">NETWORK MANAGEMENT</span>
                  <h3>Administration</h3>
                  <p>Common configuration and oversight tasks.</p>
                </div>
              </div>
              <div className="admin-quick-actions">
                <button type="button" onClick={() => setView("facilities")}>
                  <span>⌂</span><div><strong>Manage facilities</strong><small>Facility details and activation</small></div><b>→</b>
                </button>
                <button type="button" onClick={() => setView("users")}>
                  <span>◎</span><div><strong>Manage users and roles</strong><small>Account roles and facility assignment</small></div><b>→</b>
                </button>
                <button type="button" onClick={() => setView("analysis")}>
                  <span>◫</span><div><strong>Aggregate analytics</strong><small>Privacy-preserving reporting</small></div><b>→</b>
                </button>
              </div>
            </div>
          </div>

          <section className="admin-security-strip" aria-label="Administrative privacy safeguards">
            <div>
              <span className="eyebrow">SECURITY & PRIVACY</span>
              <strong>Administrative oversight is separated from clinical care</strong>
              <p>Individual referral records remain within authorised PHC and receiving-facility workflows. Network reporting uses aggregate counts and suppresses small cells where configured.</p>
            </div>
            <div className="admin-security-items">
              <span>✓ Authenticated administrator</span>
              <span>✓ Role-aware workspace</span>
              <span>✓ Aggregate reporting</span>
              <span>✓ Patient-level view restricted</span>
            </div>
          </section>

          <footer className="admin-modern-footer-note">
            <span>Facility and user configuration refreshes from REFLINK.</span>
            <span>Administrative workspace · Updated {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </footer>
        </div>
      </section>
    </div>
  );

}
function AdminAggregateReports() {
  const toLagosDateInput = (date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };
  const todayValue = toLagosDateInput(new Date());
  const getLagosMonthStart = (date) => `${toLagosDateInput(date).slice(0, 7)}-01`;
  const shiftLagosDate = (value, days) => {
    const [year, month, day] = value.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  };
  const [startDate, setStartDate] = useState(getLagosMonthStart(new Date()));
  const [endDate, setEndDate] = useState(todayValue);
  const applyReportingPreset = (preset) => {
    const today = toLagosDateInput(new Date());
    if (preset === "month") {
      setStartDate(getLagosMonthStart(new Date()));
      setEndDate(today);
      return;
    }
    if (preset === "previous-month") {
      const [year, month] = today.split("-").map(Number);
      const previousEnd = new Date(Date.UTC(year, month - 1, 0, 12));
      setStartDate(`${previousEnd.getUTCFullYear()}-${String(previousEnd.getUTCMonth() + 1).padStart(2, "0")}-01`);
      setEndDate(`${previousEnd.getUTCFullYear()}-${String(previousEnd.getUTCMonth() + 1).padStart(2, "0")}-${String(previousEnd.getUTCDate()).padStart(2, "0")}`);
      return;
    }
    setStartDate(shiftLagosDate(today, preset === "90-days" ? -89 : -29));
    setEndDate(today);
  };
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [facilityRows, setFacilityRows] = useState([]);
  const [facilityLoading, setFacilityLoading] = useState(false);
  const [facilityError, setFacilityError] = useState("");
  const facilityPeriodEligible = isCompleteCalendarMonth(startDate, endDate);
  const [lgaRows, setLgaRows] = useState([]);
  const [lgaLoading, setLgaLoading] = useState(false);
  const [lgaError, setLgaError] = useState("");
  const [coverageRows, setCoverageRows] = useState([]);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState("");

  useEffect(() => {
    let active = true;
    const loadReport = async () => {
      setLoading(true);
      setError("");
      setResult(null);
      try {
        const { data, error: reportError } = await supabase.rpc("get_admin_referral_volume", {
          p_start_date: startDate,
          p_end_date: endDate,
        });
        if (reportError) throw reportError;
        if (active) setResult(Array.isArray(data) ? data[0] || null : data || null);
      } catch {
        if (active) {
          setError("Aggregate reporting is not yet available in this environment. The reviewed database migration must be applied and tested before this report can run.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    loadReport();
    return () => { active = false; };
  }, [startDate, endDate, refreshKey]);

  useEffect(() => {
    let active = true;
    if (!facilityPeriodEligible) {
      setFacilityRows([]);
      setFacilityError("");
      setFacilityLoading(false);
      return () => { active = false; };
    }

    const loadFacilitySummary = async () => {
      setFacilityRows([]);
      setFacilityLoading(true);
      setFacilityError("");
      try {
        const { data, error: summaryError } = await supabase.rpc(
          "get_admin_facility_referral_summary",
          { p_start_date: startDate, p_end_date: endDate },
        );
        if (summaryError) throw summaryError;
        if (active) setFacilityRows(Array.isArray(data) ? data : []);
      } catch {
        if (active) {
          setFacilityRows([]);
          setFacilityError("Facility-level reporting is not yet available. The reviewed database migration must be applied and tested before this breakdown can run.");
        }
      } finally {
        if (active) setFacilityLoading(false);
      }
    };

    loadFacilitySummary();
    return () => { active = false; };
  }, [startDate, endDate, refreshKey, facilityPeriodEligible]);

  useEffect(() => {
    let active = true;
    if (!facilityPeriodEligible) {
      setLgaRows([]);
      setLgaError("");
      setLgaLoading(false);
      return () => { active = false; };
    }
    const loadLgaSummary = async () => {
      setLgaRows([]);
      setLgaLoading(true);
      setLgaError("");
      try {
        const { data, error: summaryError } = await supabase.rpc(
          "get_admin_lga_referral_summary",
          { p_start_date: startDate, p_end_date: endDate },
        );
        if (summaryError) throw summaryError;
        if (active) setLgaRows(Array.isArray(data) ? data : []);
      } catch {
        if (active) {
          setLgaRows([]);
          setLgaError("LGA reporting is not yet available. The reviewed database migration must be applied and tested before this breakdown can run.");
        }
      } finally {
        if (active) setLgaLoading(false);
      }
    };
    loadLgaSummary();
    return () => { active = false; };
  }, [startDate, endDate, refreshKey, facilityPeriodEligible]);

  useEffect(() => {
    let active = true;
    if (!facilityPeriodEligible) {
      setCoverageRows([]);
      setCoverageError("");
      setCoverageLoading(false);
      return () => { active = false; };
    }
    const loadCoverage = async () => {
      setCoverageRows([]);
      setCoverageLoading(true);
      setCoverageError("");
      try {
        const { data, error: coverageErrorResult } = await supabase.rpc(
          "get_admin_facility_reporting_coverage",
          { p_start_date: startDate, p_end_date: endDate },
        );
        if (coverageErrorResult) throw coverageErrorResult;
        if (active) setCoverageRows(Array.isArray(data) ? data : []);
      } catch {
        if (active) {
          setCoverageRows([]);
          setCoverageError("Facility reporting coverage is not yet available. The reviewed database migration must be applied and tested before this summary can run.");
        }
      } finally {
        if (active) setCoverageLoading(false);
      }
    };
    loadCoverage();
    return () => { active = false; };
  }, [startDate, endDate, refreshKey, facilityPeriodEligible]);

  const indicatorCards = result ? [
    {
      key: "referrals",
      label: "Referrals initiated",
      value: result.referral_count,
      suppressed: result.small_cell_suppressed,
      note: "Referral episodes created in the selected period.",
    },
    {
      key: "acknowledged",
      label: "Acknowledged",
      value: result.acknowledged_count,
      suppressed: result.acknowledged_count_suppressed,
      note: "Valid acknowledgement timestamps recorded.",
    },
    {
      key: "arrived",
      label: "Arrival confirmed",
      value: result.arrival_confirmed_count,
      suppressed: result.arrival_count_suppressed,
      note: "Valid patient-arrival timestamps recorded.",
    },
    {
      key: "assessed",
      label: "Assessment completed",
      value: result.assessment_completed_count,
      suppressed: result.assessment_count_suppressed,
      note: "Valid assessment-completion timestamps recorded.",
    },
    {
      key: "completed",
      label: "Referral completed",
      value: result.referral_completed_count,
      suppressed: result.completion_count_suppressed,
      note: "Valid referral-completion timestamps recorded.",
    },
    {
      key: "chronology",
      label: "Timestamp quality flags",
      value: result.chronology_anomaly_count,
      suppressed: result.chronology_anomaly_suppressed,
      note: "Referrals with at least one event timestamp before creation.",
    },
  ] : [];

  return (
    <section className="dashboard-card" aria-labelledby="admin-aggregate-heading">
      <span className="eyebrow">PRIVACY-PRESERVING REPORTING</span>
      <h3 id="admin-aggregate-heading">Referral service activity</h3>
      <p>Aggregate referral workflow indicators and a timestamp-quality signal. No patient names, identifiers, diagnoses or individual referral records are returned.</p>
      <div className="aggregate-report-presets" role="group" aria-label="Reporting period shortcuts">
        <button type="button" className={startDate === getLagosMonthStart(new Date()) && endDate === todayValue ? "is-active" : ""} onClick={() => applyReportingPreset("month")}>This month</button>
        <button type="button" onClick={() => applyReportingPreset("previous-month")}>Previous month</button>
        <button type="button" onClick={() => applyReportingPreset("30-days")}>Last 30 days</button>
        <button type="button" onClick={() => applyReportingPreset("90-days")}>Last 90 days</button>
      </div>
      <div className="dashboard-actions">
        <label>
          From
          <input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <button type="button" className="primary-button" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading || !startDate || !endDate || startDate > endDate}>
          {loading ? "Loading..." : "Refresh report"}
        </button>
      </div>
      {error && <p className="error-message" role="status">{error}</p>}
      {result && (
        <>
          <div className="stats-grid admin-rphi-indicator-grid">
            {indicatorCards.map((indicator) => (
              <article className="stat-card admin-rphi-indicator-card" key={indicator.key}>
                <span>{indicator.label}</span>
                <strong>{indicator.suppressed ? "Suppressed" : Number(indicator.value || 0).toLocaleString()}</strong>
                <small>{indicator.suppressed ? "Counts from 1–4 are hidden to reduce disclosure risk." : indicator.note}</small>
              </article>
            ))}
          </div>
          <div className="admin-rphi-period-note">
            <strong>Reporting cohort: {startDate} – {endDate}</strong>
            <span>Workflow indicators use referrals created in this period. A timestamp-quality flag identifies referrals with at least one event timestamp earlier than creation; those invalid timestamps are excluded from the corresponding event count. Missing timestamps are not automatically failures. These are operational counts, not validated performance rates.</span>
          </div>
        </>
      )}
      {!result && !error && !loading && <p>No aggregate result is available for this reporting period.</p>}
      <small className="admin-method-note">Test referrals are excluded. Counts from 1 to 4 are suppressed independently. Timestamp flags are data-quality signals, not clinical outcomes. These aggregate indicators do not establish population incidence, prevalence, clinical quality or referral failure rates. Validate definitions and observation windows with clinical and public-health leads before using them for performance decisions.</small>

      <section className="admin-facility-intelligence" aria-labelledby="admin-facility-intelligence-heading">
        <div className="admin-facility-intelligence-heading">
          <div>
            <span className="eyebrow">NETWORK DISTRIBUTION</span>
            <h4 id="admin-facility-intelligence-heading">Facility referral activity</h4>
            <p>Sending and receiving facilities are reported separately. Facility labels and locations are hidden with suppressed counts.</p>
          </div>
          <span className="admin-facility-period-tag">Complete month only</span>
        </div>
        {!facilityPeriodEligible && (
          <p className="admin-facility-hint">Select one complete calendar month to view facility distribution. Partial and overlapping date ranges are not accepted for this breakdown.</p>
        )}
        {facilityLoading && <p role="status" className="admin-facility-hint">Loading facility aggregates…</p>}
        {facilityError && <p role="status" className="error-message">{facilityError}</p>}
        {facilityPeriodEligible && !facilityLoading && !facilityError && facilityRows.length === 0 && (
          <p className="admin-facility-hint">No facility-level aggregate is available for this month.</p>
        )}
        {facilityPeriodEligible && !facilityLoading && !facilityError && facilityRows.length > 0 && (
          <div className="admin-facility-directions">
            {["Sending", "Receiving"].map((direction) => {
              const rows = facilityRows.filter((row) => row.referral_direction === direction);
              if (rows.length === 0) return null;
              return (
                <div className="admin-facility-direction" key={direction}>
                  <h5>{direction} facilities</h5>
                  <div className="admin-facility-list">
                    {rows.map((row, index) => {
                      const suppressed = row.small_cell_suppressed || row.complementary_suppressed;
                      return (
                        <article className="admin-facility-row" key={direction + "-" + index}>
                          <div>
                            <strong>{suppressed ? "Suppressed facility group" : row.facility_label}</strong>
                            <small>{suppressed ? "Facility identity and geography withheld" : [row.facility_type, row.lga, row.state].filter(Boolean).join(" · ") || "Location not recorded"}</small>
                          </div>
                          <span className={suppressed ? "is-suppressed" : ""}>
                            {suppressed ? "Suppressed" : Number(row.referral_count || 0).toLocaleString()}
                          </span>
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <small className="admin-method-note">Facility breakdowns are restricted to complete calendar months. Counts from 1–4 are suppressed. When exactly one small facility group exists in a direction, an additional visible group is suppressed to reduce subtraction-based disclosure. No facility IDs or patient-level records are returned.</small>
      </section>

      <section className="admin-facility-intelligence" aria-labelledby="admin-lga-intelligence-heading">
        <div className="admin-facility-intelligence-heading">
          <div>
            <span className="eyebrow">GEOGRAPHIC DISTRIBUTION</span>
            <h4 id="admin-lga-intelligence-heading">Referral activity by LGA</h4>
            <p>Sending and receiving activity is grouped by LGA and state. Suppressed geography is not identified.</p>
          </div>
          <span className="admin-facility-period-tag">Complete month only</span>
        </div>
        {!facilityPeriodEligible && (
          <p className="admin-facility-hint">Select one complete calendar month to view LGA distribution.</p>
        )}
        {lgaLoading && <p role="status" className="admin-facility-hint">Loading LGA aggregates…</p>}
        {lgaError && <p role="status" className="error-message">{lgaError}</p>}
        {facilityPeriodEligible && !lgaLoading && !lgaError && lgaRows.length === 0 && (
          <p className="admin-facility-hint">No LGA-level aggregate is available for this month.</p>
        )}
        {facilityPeriodEligible && !lgaLoading && !lgaError && lgaRows.length > 0 && (
          <div className="admin-facility-directions">
            {["Sending", "Receiving"].map((direction) => {
              const rows = lgaRows.filter((row) => row.referral_direction === direction);
              if (rows.length === 0) return null;
              return (
                <div className="admin-facility-direction" key={direction}>
                  <h5>{direction} activity by LGA</h5>
                  <div className="admin-facility-list">
                    {rows.map((row, index) => {
                      const suppressed = row.small_cell_suppressed || row.complementary_suppressed;
                      const unassigned = row.lga_label === "Unassigned geography";
                      return (
                        <article className="admin-facility-row" key={direction + "-lga-" + index}>
                          <div>
                            <strong>{suppressed ? "Suppressed geography" : row.lga_label}</strong>
                            <small>{suppressed ? "LGA and state withheld" : unassigned ? "Facility assignment or geography not recorded" : row.state || "State not recorded"}</small>
                          </div>
                          <span className={suppressed ? "is-suppressed" : ""}>
                            {suppressed ? "Suppressed" : Number(row.referral_count || 0).toLocaleString()}
                          </span>
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <small className="admin-method-note">LGA groups are limited to complete calendar months. Counts from 1–4 and one additional group where needed are suppressed. Unassigned geography indicates missing facility assignment or geography. Low recorded referral activity is not proof of an unmet need or service gap; interpret alongside verified population, facility readiness and reporting-completeness data.</small>
      </section>

      <section className="admin-facility-intelligence" aria-labelledby="admin-coverage-heading">
        <div className="admin-facility-intelligence-heading">
          <div>
            <span className="eyebrow">DATA QUALITY & COVERAGE</span>
            <h4 id="admin-coverage-heading">Facility registry and reporting coverage</h4>
            <p>Shows the current facility registry grouped by active status, recorded referral activity and geography completeness.</p>
          </div>
          <span className="admin-facility-period-tag">Monthly activity cohort</span>
        </div>
        {!facilityPeriodEligible && (
          <p className="admin-facility-hint">Select one complete calendar month to assess recorded facility participation.</p>
        )}
        {coverageLoading && <p role="status" className="admin-facility-hint">Loading facility coverage aggregates…</p>}
        {coverageError && <p role="status" className="error-message">{coverageError}</p>}
        {facilityPeriodEligible && !coverageLoading && !coverageError && coverageRows.length === 0 && (
          <p className="admin-facility-hint">No facility registry coverage summary is available for this month.</p>
        )}
        {facilityPeriodEligible && !coverageLoading && !coverageError && coverageRows.length > 0 && (
          <div className="admin-facility-list admin-coverage-list">
            {coverageRows.map((row, index) => {
              const suppressed = row.small_cell_suppressed || row.complementary_suppressed;
              return (
                <article className="admin-facility-row" key={"coverage-" + index}>
                  <div>
                    <strong>{suppressed ? "Suppressed facility group" : row.coverage_group}</strong>
                    <small>{suppressed ? "Category and count withheld to reduce disclosure" : "Registry facility count"}</small>
                  </div>
                  <span className={suppressed ? "is-suppressed" : ""}>
                    {suppressed ? "Suppressed" : Number(row.facility_count || 0).toLocaleString()}
                  </span>
                </article>
              );
            })}
          </div>
        )}
        <small className="admin-method-note">This combines the current facility registry snapshot with referral activity in the selected creation cohort. “No recorded referral activity” does not prove that a facility failed to report: a facility may not have been expected to refer during the period, may serve another workflow, or may have activity recorded outside REFLINK. Geography is considered complete only when both LGA and state are populated. No facility names, IDs, users or patient records are returned.</small>
      </section>
    </section>
  );
}

export default AdminDashboard;