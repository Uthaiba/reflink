import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

/* =======================================================
   ADMIN DASHBOARD
   ======================================================= */

function AdminDashboard({
  profile,
  AnalyticsDashboard,
  AnalysisHub,
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

  const loadReferrals = async () => {
    setReferralsLoading(true);
    setError("");

    try {
      const {
        data,
        error: referralsError,
      } = await supabase
        .from("referrals")
        .select(`
          id,
          referral_number,
          patient_identifier,
          is_test,
          patient_age_months,
          patient_sex,
          patient_phone,
          patient_address,
          relative_name,
          relative_relationship,
          relative_phone,
          diagnosis_status,
          diagnosis_category,
          diagnosis_records,
          investigation_categories,
          investigation_records,
          chief_complaint,
          clinical_summary,
          physical_findings,
          provisional_diagnosis,
          investigations,
          treatment_given,
          referral_reason,
          urgency,
          referring_facility_id,
          receiving_facility_id,
          referring_user_id,
          status,
          created_at,
          acknowledged_at,
          patient_arrived_at,
          completed_at,
          assessment_findings,
          final_diagnosis,
          treatment_provided,
          procedures_performed,
          clinical_feedback,
          disposition,
          assessment_completed_at,
          discharged_at,
          admission_at,
          ward_unit,
          admission_diagnosis,
          clinical_progress,
          inpatient_treatment,
          discharge_diagnosis,
          condition_at_discharge,
          discharge_medications,
          follow_up_plan,

          referring_facility:facilities!referrals_referring_facility_id_fkey (
            id,
            name,
            facility_type,
            state,
            lga,
            is_active
          ),

          receiving_facility:facilities!referrals_receiving_facility_id_fkey (
            id,
            name,
            facility_type,
            state,
            lga,
            is_active
          )
        `)
        .order("created_at", {
          ascending: false,
        });

      if (referralsError) {
        throw referralsError;
      }

      setReferrals(data || []);
    } catch (err) {
      console.error(
        "REFERRALS ERROR:",
        err
      );

      setError(
        err?.message ||
          "Unable to load referrals."
      );

      setReferrals([]);
    } finally {
      setReferralsLoading(false);
    }
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
        <AnalysisHub />
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

        <AnalyticsDashboard />
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

  /* =======================================================
     ADMINISTRATION HOME — MODERN COMMAND DASHBOARD
     ======================================================= */

  const adminActiveReferrals = referrals.filter(
    (referral) =>
      !["completed", "discharged"].includes(referral.status)
  );

  const adminClosedReferrals = referrals.filter(
    (referral) =>
      ["completed", "discharged"].includes(referral.status)
  );

  const adminAcknowledged = referrals.filter(
    (referral) => Boolean(referral.acknowledged_at)
  );

  const adminQualityIssues = referrals.reduce((total, referral) => {
    const hasTimestampIssue =
      referral.admission_at &&
      referral.assessment_completed_at &&
      new Date(referral.admission_at) < new Date(referral.assessment_completed_at);

    const hasDischargeIssue =
      referral.discharged_at &&
      referral.admission_at &&
      new Date(referral.discharged_at) < new Date(referral.admission_at);

    const hasFacilityIssue =
      !referral.referring_facility_id ||
      !referral.receiving_facility_id;

    return total + Number(hasTimestampIssue || hasDischargeIssue || hasFacilityIssue);
  }, 0);

  const adminLastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));

    const next = new Date(date);
    next.setDate(next.getDate() + 1);

    const count = referrals.filter((referral) => {
      if (!referral.created_at) return false;
      const created = new Date(referral.created_at);
      return created >= date && created < next;
    }).length;

    return {
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      fullLabel: date.toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
      count,
    };
  });

  const adminMaxDailyReferrals = Math.max(
    ...adminLastSevenDays.map((item) => item.count),
    1
  );

  const adminStatusSummary = [
    ["Active", adminActiveReferrals.length, "active"],
    ["Acknowledged", adminAcknowledged.length, "acknowledged"],
    ["Closed", adminClosedReferrals.length, "closed"],
  ];

  const adminStatusMax = Math.max(
    ...adminStatusSummary.map((item) => item[1]),
    1
  );

  const adminRecentReferrals = [...referrals]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 5);

  const adminMaskIdentifier = (value) => {
    const text = String(value || "").trim();
    if (!text) return "Patient";
    if (text.length <= 4) return "••••";
    return `${text.slice(0, 2)}•••${text.slice(-2)}`;
  };

  const adminFunnel = [
    ["Created", referrals.filter((r) => Boolean(r.created_at)).length],
    ["Acknowledged", referrals.filter((r) => Boolean(r.acknowledged_at)).length],
    ["Arrived", referrals.filter((r) => Boolean(r.patient_arrived_at)).length],
    ["Assessed", referrals.filter((r) => Boolean(r.assessment_completed_at)).length],
    ["Closed", referrals.filter((r) => ["completed", "discharged"].includes(r.status) || Boolean(r.completed_at || r.discharged_at)).length],
  ];

  const adminFunnelBase = Math.max(adminFunnel[0][1], 1);
  const adminUrgentCount = referrals.filter((r) => ["urgent", "emergency"].includes(String(r.urgency || "").toLowerCase())).length;
  const adminCompletionRate = referrals.length
    ? (adminClosedReferrals.length / referrals.length) * 100
    : null;
  const adminAcknowledgementRate = referrals.length
    ? (adminAcknowledged.length / referrals.length) * 100
    : null;
  const adminLastUpdated = new Date();
  const adminSystemStatus = error ? "Attention required" : (facilitiesLoading || usersLoading || referralsLoading ? "Updating" : "Operational");

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
          <div className="admin-modern-heading">
            <div>
              <span className="eyebrow">ADMINISTRATION / OVERVIEW</span>
              <h2>Good evening, {profile?.full_name?.split(" ")[0] || "Administrator"}</h2>
              <p>Here is the current operational picture across the REFLINK referral network.</p>
            </div>
            <button type="button" className="primary-button admin-primary-action" onClick={() => setView("facilities")}>
              + Add Facility
            </button>
          </div>

          <div className="admin-kpi-grid">
            <button type="button" className="admin-kpi-card kpi-blue" onClick={() => setView("referrals")}>
              <div className="admin-kpi-icon">↗</div>
              <span>Total Referrals</span>
              <strong>{referrals.length.toLocaleString()}</strong>
              <small>All recorded referral episodes</small>
            </button>
            <button type="button" className="admin-kpi-card kpi-purple" onClick={() => setView("active-referrals")}>
              <div className="admin-kpi-icon">◔</div>
              <span>Active Referrals</span>
              <strong>{adminActiveReferrals.length.toLocaleString()}</strong>
              <small>Currently requiring follow-up</small>
            </button>
            <button type="button" className="admin-kpi-card kpi-teal" onClick={() => setView("facilities")}>
              <div className="admin-kpi-icon">⌂</div>
              <span>Facilities</span>
              <strong>{facilities.length.toLocaleString()}</strong>
              <small>Connected referral facilities</small>
            </button>
            <button type="button" className="admin-kpi-card kpi-green" onClick={() => setView("referrals")}>
              <div className="admin-kpi-icon">✓</div>
              <span>Closed Episodes</span>
              <strong>{adminClosedReferrals.length.toLocaleString()}</strong>
              <small>Completed or discharged</small>
            </button>
            <button type="button" className="admin-kpi-card kpi-amber" onClick={() => setView("users")}>
              <div className="admin-kpi-icon">◎</div>
              <span>System Users</span>
              <strong>{users.length.toLocaleString()}</strong>
              <small>Configured users & roles</small>
            </button>
            <button type="button" className="admin-kpi-card kpi-red" onClick={() => setView("analysis")}>
              <div className="admin-kpi-icon">!</div>
              <span>Quality Flags</span>
              <strong>{adminQualityIssues.toLocaleString()}</strong>
              <small>Records requiring review</small>
            </button>
          </div>

          <div className="admin-executive-strip" role="status" aria-label="Operational summary">
            <div className="admin-executive-copy">
              <span className="eyebrow">OPERATIONAL SUMMARY</span>
              <strong>{adminActiveReferrals.length ? `${adminActiveReferrals.length} referral${adminActiveReferrals.length === 1 ? " is" : "s are"} currently active` : "No active referrals requiring follow-up"}</strong>
              <p>Live operational view from the connected referral dataset. Summary identifiers are privacy-masked.</p>
            </div>
            <div className="admin-executive-metrics">
              <div><span>Acknowledgement</span><strong>{adminAcknowledgementRate === null ? "—" : `${adminAcknowledgementRate.toFixed(1)}%`}</strong></div>
              <div><span>Completion</span><strong>{adminCompletionRate === null ? "—" : `${adminCompletionRate.toFixed(1)}%`}</strong></div>
              <div><span>Urgent / Emergency</span><strong>{adminUrgentCount}</strong></div>
              <div className={adminQualityIssues ? "attention" : "healthy"}><span>Governance</span><strong>{adminQualityIssues ? `${adminQualityIssues} review` : "Clear"}</strong></div>
            </div>
          </div>

          <div className="admin-dashboard-grid">
            <div className="admin-chart-card admin-trend-card">
              <div className="admin-card-heading">
                <div>
                  <span className="eyebrow">ACTIVITY</span>
                  <h3>Referral Trend</h3>
                  <p>Referral episodes created during the last 7 days.</p>
                </div>
                <button type="button" className={view === "analysis" ? "is-active" : ""} onClick={() => setView("analysis")}>View analytics →</button>
              </div>
              <div className="admin-bar-chart" aria-label="Seven day referral trend">
                {adminLastSevenDays.map((item) => (
                  <div className="admin-bar-column" key={item.fullLabel} title={`${item.fullLabel}: ${item.count} referrals`}>
                    <span>{item.count}</span>
                    <div className="admin-bar-track"><i style={{ height: `${Math.max((item.count / adminMaxDailyReferrals) * 100, item.count ? 12 : 4)}%` }} /></div>
                    <small>{item.label}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="admin-chart-card admin-status-card">
              <div className="admin-card-heading">
                <div>
                  <span className="eyebrow">WORKFLOW</span>
                  <h3>Referral Status</h3>
                  <p>Current distribution by operational state.</p>
                </div>
              </div>
              <div className="admin-status-list">
                {adminStatusSummary.map(([label, count, key]) => (
                  <div className="admin-status-row" key={label}>
                    <div><i className={`status-dot ${key}`} /><span>{label}</span></div>
                    <strong>{count}</strong>
                    <div className="admin-status-track"><i className={`status-fill ${key}`} style={{ width: `${(count / adminStatusMax) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className="admin-status-total"><strong>{referrals.length}</strong><span>Total referral episodes</span></div>
            </div>
          </div>

          <div className="admin-dashboard-grid admin-dashboard-grid-secondary">
            <div className="admin-chart-card admin-funnel-card">
              <div className="admin-card-heading">
                <div>
                  <span className="eyebrow">REFERRAL PIPELINE</span>
                  <h3>Closed-loop pathway</h3>
                  <p>Progression through the core referral workflow.</p>
                </div>
                <span className="admin-data-badge">N = {referrals.length}</span>
              </div>
              <div className="admin-funnel-list">
                {adminFunnel.map(([label, count], index) => (
                  <div className="admin-funnel-row" key={label}>
                    <div className="admin-funnel-label"><span>{String(index + 1).padStart(2, "0")}</span><strong>{label}</strong></div>
                    <div className="admin-funnel-track"><i style={{ width: `${(count / adminFunnelBase) * 100}%` }} /></div>
                    <strong className="admin-funnel-value">{count}</strong>
                  </div>
                ))}
              </div>
              <small className="admin-method-note">Counts are descriptive and reflect recorded timestamps/statuses; missing events are not inferred.</small>
            </div>

            <div className="admin-chart-card admin-insight-card">
              <div className="admin-card-heading">
                <div>
                  <span className="eyebrow">EXECUTIVE SIGNALS</span>
                  <h3>What needs attention</h3>
                  <p>Operational observations for administrative review.</p>
                </div>
              </div>
              <div className="admin-insight-list">
                <div className={adminActiveReferrals.length ? "signal attention" : "signal healthy"}>
                  <span>{adminActiveReferrals.length ? "!" : "✓"}</span>
                  <div><strong>{adminActiveReferrals.length ? "Active referrals require follow-up" : "No active referrals"}</strong><small>{adminActiveReferrals.length ? `${adminActiveReferrals.length} episode${adminActiveReferrals.length === 1 ? "" : "s"} remain open.` : "The current dataset contains no open episodes."}</small></div>
                </div>
                <div className={adminQualityIssues ? "signal attention" : "signal healthy"}>
                  <span>{adminQualityIssues ? "!" : "✓"}</span>
                  <div><strong>{adminQualityIssues ? "Data-quality review required" : "No dashboard quality flags"}</strong><small>{adminQualityIssues ? `${adminQualityIssues} record-level issue${adminQualityIssues === 1 ? "" : "s"} detected by the administrative checks.` : "Current administrative checks found no obvious integrity flags."}</small></div>
                </div>
                <div className="signal neutral">
                  <span>i</span>
                  <div><strong>Small-sample caution</strong><small>{referrals.length < 30 ? "The current volume is small; avoid interpreting rates as population-level performance." : "Interpret trends alongside context, case mix and data-quality findings."}</small></div>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-bottom-grid">
            <div className="admin-table-card">
              <div className="admin-card-heading">
                <div>
                  <span className="eyebrow">RECENT ACTIVITY</span>
                  <h3>Latest Referrals</h3>
                  <p>The most recently created referral episodes.</p>
                </div>
                <button type="button" className={view === "referrals" || view === "active-referrals" ? "is-active" : ""} onClick={() => setView("referrals")}>View all →</button>
              </div>
              {adminRecentReferrals.length ? (
                <div className="admin-modern-table-wrap">
                  <table className="admin-modern-table">
                    <thead><tr><th>Referral</th><th>Patient</th><th>Route</th><th>Urgency</th><th>Status</th></tr></thead>
                    <tbody>
                      {adminRecentReferrals.map((referral) => (
                        <tr key={referral.id}>
                          <td><strong>{referral.referral_number || "—"}</strong><small>{referral.created_at ? new Date(referral.created_at).toLocaleDateString() : "—"}</small></td>
                          <td><strong>{adminMaskIdentifier(referral.patient_identifier)}</strong><small>{formatPatientAge(referral.patient_age_months)} · {referral.patient_sex || "Sex not recorded"}</small></td>
                          <td><strong>{referral.referring_facility?.name || "Unassigned"}</strong><small>→ {referral.receiving_facility?.name || "Receiving facility not assigned"}</small></td>
                          <td><span className="admin-urgency-pill">{referral.urgency || "Not specified"}</span></td>
                          <td><span className={`admin-status-pill ${String(referral.status || "unknown").replace(/_/g, "-")}`}>{getStatusLabel(referral.status)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-empty-dashboard">No referral activity is available in the current scope.</div>
              )}
            </div>

            <div className="admin-quick-card">
              <div className="admin-card-heading">
                <div>
                  <span className="eyebrow">QUICK ACCESS</span>
                  <h3>Administration</h3>
                  <p>Common system management tasks.</p>
                </div>
              </div>
              <div className="admin-quick-actions">
                <button type="button" className={view === "facilities" ? "is-active" : ""} onClick={() => setView("facilities")}><span>⌂</span><div><strong>Manage Facilities</strong><small>Network configuration</small></div><b>→</b></button>
                <button type="button" className={view === "users" ? "is-active" : ""} onClick={() => setView("users")}><span>◎</span><div><strong>Manage Users</strong><small>Roles and access</small></div><b>→</b></button>
                <button type="button" className={view === "analysis" ? "is-active" : ""} onClick={() => setView("analysis")}><span>◫</span><div><strong>Healthcare Analysis</strong><small>Clinical intelligence</small></div><b>→</b></button>
                <button type="button" className={view === "analytics" ? "is-active" : ""} onClick={() => setView("analytics")}><span>▥</span><div><strong>Referral Performance</strong><small>Pathway and outcomes</small></div><b>→</b></button>
              </div>
            </div>
          </div>

          <div className="admin-security-strip">
            <div><span className="eyebrow">SECURITY & PRIVACY</span><strong>Administrative safeguards</strong><p>Authenticated access is role-gated. Patient identifiers are masked in the executive dashboard. Database row-level security should remain enforced in Supabase for production deployment.</p></div>
            <div className="admin-security-items"><span>✓ Authenticated session</span><span>✓ Role-aware access</span><span>✓ Privacy-masked summary</span><span>! Verify database RLS</span></div>
          </div>

          <div className="admin-modern-footer-note">
            <span><i /> Data refreshes from the connected REFLINK database.</span>
            <span>Privacy-aware administrative workspace · v2.0 · Updated {adminLastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
      </section>
    </div>
  );

}
export default AdminDashboard;