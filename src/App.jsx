
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./App.css";

function formatPatientAge(ageInMonths) {
  const months = Number(ageInMonths);

  if (!Number.isFinite(months) || months < 0) {
    return "Age not recorded";
  }

  if (months < 12) {
    return `${months} ${months === 1 ? "month" : "months"}`;
  }

  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"}`;
}

/* =========================================================
   MAIN APP
   ========================================================= */

function App() {
  const [screen, setScreen] = useState("home");
  const [role, setRole] = useState(null);
  const [profile, setProfile] = useState(null);

  const [dashboardView, setDashboardView] =
    useState("overview");

  const [dashboardFilter, setDashboardFilter] =
    useState("all");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  /* =========================================================
   LOGIN / AUTHENTICATION
   ========================================================= */

const handleSignIn = async () => {
  setLoginError("");
  setLoading(true);

  try {
    // 1. Authenticate with Supabase
    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (error) {
      setLoginError(error.message);
      return;
    }

    const user = data?.user;

    if (!user) {
      setLoginError(
        "Authentication succeeded, but no user account was returned."
      );
      return;
    }

    // 2. Load REFLINK profile
    const {
      data: userProfile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        "id, full_name, role, facility_id"
      )
      .eq("id", user.id)
      .single();

    if (profileError || !userProfile) {
      console.error(
        "Profile loading error:",
        profileError
      );

      setLoginError(
        "Login successful, but your REFLINK profile could not be loaded."
      );

      await supabase.auth.signOut();
      return;
    }

    // 3. Normalize role
    const normalizedRole =
      String(userProfile.role || "")
        .trim()
        .toLowerCase();

    let applicationRole = null;

    if (normalizedRole === "phc_staff") {
      applicationRole = "PHC Staff";
    } else if (
      normalizedRole === "receiving_staff"
    ) {
      applicationRole = "Receiving Facility";
    } else if (
      normalizedRole === "administrator"
    ) {
      applicationRole = "Administrator";
    }

    // 4. Reject unsupported roles
    if (!applicationRole) {
      console.error(
        "Unsupported REFLINK role:",
        userProfile.role
      );

      setLoginError(
        `Your REFLINK account has an unsupported role: "${userProfile.role}". Please contact the system administrator.`
      );

      await supabase.auth.signOut();
      return;
    }

    // 5. Store authenticated profile
    setProfile({
      ...userProfile,
      auth_user_id: user.id,
    });

    setRole(applicationRole);

    // 6. Reset dashboard state
    setDashboardView("overview");
    setDashboardFilter("all");

    // 7. Open dashboard
    setScreen("dashboard");

  } catch (error) {
    console.error(
      "Unexpected authentication error:",
      error
    );

    setLoginError(
      error?.message ||
      "An unexpected error occurred while signing in."
    );
  } finally {
    setLoading(false);
  }
};

  /* =========================================================
     TEST SUPABASE CONNECTION
     ========================================================= */

  useEffect(() => {
    const testSupabase = async () => {
      const { data, error } = await supabase
        .from("facilities")
        .select("*")
        .limit(1);

      console.log("Supabase data:", data);
      console.log("Supabase error:", error);
    };

    testSupabase();
  }, []);

  const openLogin = () => {
    setScreen("login");
  };

  /*
 * Role selection is intentionally removed.
 *
 * REFLINK determines the user's workspace from
 * the authenticated Supabase profile.
 *
 * Users cannot manually switch their role.
 */

  const logout = async () => {
  setLoading(true);

  try {
    await supabase.auth.signOut();
  } finally {
    setRole(null);
    setProfile(null);
    setDashboardView("overview");
    setDashboardFilter("all");
    setEmail("");
    setPassword("");
    setLoginError("");
    setScreen("home");
    setLoading(false);
  }
};

  return (
    <div className="app">

      {/* =====================================================
          HOME PAGE
          ===================================================== */}

      {screen === "home" && (
  <>
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">R</div>

        <div>
          <h1>REFLINK</h1>
          <p>Connected Referral Care</p>
        </div>
      </div>

      <nav className="home-nav">
        <button
          type="button"
          onClick={() =>
            document
              .getElementById("how-it-works")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          How It Works
        </button>

        <button
          type="button"
          onClick={() =>
            document
              .getElementById("platform")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Platform
        </button>

        <button
          type="button"
          onClick={openLogin}
          className="login-button"
        >
          Sign In
        </button>
      </nav>
    </header>

    <main className="home-page">

      {/* ================= HERO ================= */}

      <section className="hero redesigned-hero">
        <div className="hero-content">

          <span className="eyebrow">
            DIGITAL HEALTH • CLOSED-LOOP REFERRAL
          </span>

          <h2>
            Every Referral Connected.
            <br />
            <span>Every Patient Followed.</span>
          </h2>

          <p className="hero-text">
            REFLINK is a digital referral coordination platform that
            helps healthcare facilities securely transfer patient
            information, track referrals, confirm arrival, and close
            the referral loop with clinical feedback.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary-button hero-primary"
              onClick={openLogin}
            >
              Access REFLINK
              <span>→</span>
            </button>

            <button
              type="button"
              className="secondary-button hero-secondary"
              onClick={() =>
                document
                  .getElementById("how-it-works")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              See How It Works
            </button>
          </div>

          <div className="trust-row">
            <div>
              <strong>01</strong>
              <span>Secure Referral</span>
            </div>

            <div>
              <strong>02</strong>
              <span>Real-Time Tracking</span>
            </div>

            <div>
              <strong>03</strong>
              <span>Arrival Confirmation</span>
            </div>

            <div>
              <strong>04</strong>
              <span>Clinical Feedback</span>
            </div>
          </div>

        </div>

        {/* ================= REFERRAL VISUAL ================= */}

        <div className="hero-visual">

          <div className="network-card">

            <div className="network-header">
              <div>
                <span className="live-dot"></span>
                LIVE REFERRAL NETWORK
              </div>

              <span className="network-status">
                ACTIVE
              </span>
            </div>

            <div className="network-body">

              <div className="network-node">
                <div className="node-icon phc">
                  PHC
                </div>

                <div>
                  <strong>Primary Health Centre</strong>
                  <small>Referral initiated</small>
                </div>

                <span className="node-check">✓</span>
              </div>

              <div className="network-line">
                <span></span>
                <span></span>
                <span></span>
              </div>

              <div className="network-node">
                <div className="node-icon hospital">
                  H
                </div>

                <div>
                  <strong>Receiving Hospital</strong>
                  <small>Referral acknowledged</small>
                </div>

                <span className="node-check">✓</span>
              </div>

              <div className="network-line">
                <span></span>
                <span></span>
                <span></span>
              </div>

              <div className="network-node">
                <div className="node-icon feedback">
                  ✓
                </div>

                <div>
                  <strong>Clinical Feedback</strong>
                  <small>Referral loop completed</small>
                </div>

                <span className="node-check">✓</span>
              </div>

            </div>

            <div className="network-footer">
              <div>
                <small>REFERRAL STATUS</small>
                <strong>Connected & Tracked</strong>
              </div>

              <span>ACTIVE</span>
            </div>

          </div>

          <div className="floating-card floating-card-one">
            <span>●</span>
            <div>
              <strong>Patient Arrival</strong>
              <small>Confirmed</small>
            </div>
          </div>

          <div className="floating-card floating-card-two">
            <span>✓</span>
            <div>
              <strong>Referral Closed</strong>
              <small>Feedback received</small>
            </div>
          </div>

        </div>
      </section>


      {/* ================= TRUST STRIP ================= */}

      <section className="trust-strip">
        <div>
          <strong>ONE CONNECTED WORKFLOW</strong>
          <span>
            From referral initiation to clinical feedback.
          </span>
        </div>

        <div className="trust-points">
          <span>✓ Secure</span>
          <span>✓ Trackable</span>
          <span>✓ Accountable</span>
          <span>✓ Patient-centred</span>
        </div>
      </section>


      {/* ================= HOW IT WORKS ================= */}

      <section
        id="how-it-works"
        className="content-section"
      >
        <div className="section-heading">
          <span className="eyebrow">
            HOW REFLINK WORKS
          </span>

          <h2>
            A referral should never disappear
            <br />
            after it leaves your facility.
          </h2>

          <p>
            REFLINK creates a connected workflow between the
            referring facility, receiving facility, and clinical
            team.
          </p>
        </div>

        <div className="steps-grid">

          <div className="step-card">
            <span className="step-number">01</span>
            <div className="step-icon">↗</div>
            <h3>Create Referral</h3>
            <p>
              Capture essential patient and clinical information
              and securely send the referral to an appropriate
              receiving facility.
            </p>
          </div>

          <div className="step-card">
            <span className="step-number">02</span>
            <div className="step-icon">◎</div>
            <h3>Track Referral</h3>
            <p>
              Follow the referral status from the moment it is
              sent until the receiving facility acknowledges it.
            </p>
          </div>

          <div className="step-card">
            <span className="step-number">03</span>
            <div className="step-icon">✓</div>
            <h3>Confirm Arrival</h3>
            <p>
              Receiving facilities can acknowledge arrival and
              update the patient's referral status.
            </p>
          </div>

          <div className="step-card">
            <span className="step-number">04</span>
            <div className="step-icon">↺</div>
            <h3>Close the Loop</h3>
            <p>
              Clinical feedback and outcome information return
              to the referring facility.
            </p>
          </div>

        </div>
      </section>


      {/* ================= PLATFORM ================= */}

      <section
        id="platform"
        className="platform-section"
      >
        <div className="platform-copy">

          <span className="eyebrow">
            BUILT FOR HEALTHCARE FACILITIES
          </span>

          <h2>
            One platform.
            <br />
            One referral journey.
          </h2>

          <p>
            REFLINK connects the different stages of referral
            coordination into a single digital workflow.
          </p>

          <div className="platform-list">

            <div>
              <span>01</span>
              <div>
                <strong>PHC Referral Management</strong>
                <p>
                  Create and monitor outgoing referrals from
                  primary healthcare facilities.
                </p>
              </div>
            </div>

            <div>
              <span>02</span>
              <div>
                <strong>Receiving Facility Coordination</strong>
                <p>
                  Receive, acknowledge and manage incoming
                  referrals.
                </p>
              </div>
            </div>

            <div>
              <span>03</span>
              <div>
                <strong>Clinical Continuity</strong>
                <p>
                  Maintain communication and feedback after
                  referral.
                </p>
              </div>
            </div>

          </div>

        </div>

        <div className="platform-panel">

          <div className="panel-top">
            <span>REFLINK WORKSPACE</span>
            <span className="panel-live">● LIVE</span>
          </div>

          <div className="mini-dashboard">

            <div className="mini-stat">
              <small>ACTIVE REFERRALS</small>
              <strong>24</strong>
            </div>

            <div className="mini-stat">
              <small>ACKNOWLEDGED</small>
              <strong>18</strong>
            </div>

            <div className="mini-stat">
              <small>COMPLETED</small>
              <strong>12</strong>
            </div>

          </div>

          <div className="mini-referral">

            <div className="mini-referral-top">
              <span>REF-2026-001245</span>
              <span>ACTIVE</span>
            </div>

            <strong>Primary Health Centre → Receiving Hospital</strong>

            <div className="progress-track">
              <span></span>
            </div>

            <div className="progress-labels">
              <span>Sent</span>
              <span>Acknowledged</span>
              <span>Arrival</span>
              <span>Feedback</span>
            </div>

          </div>

        </div>
      </section>


      {/* ================= CTA ================= */}

      <section className="final-cta">

        <div>
          <span className="eyebrow">
            CONNECTED REFERRAL CARE
          </span>

          <h2>
            Make every referral
            <br />
            count.
          </h2>

          <p>
            Give healthcare teams the visibility they need
            to coordinate referrals and follow patients
            across facilities.
          </p>
        </div>

        <button
          type="button"
          className="cta-button"
          onClick={openLogin}
        >
          Access REFLINK
          <span>→</span>
        </button>

      </section>

    </main>


    {/* ================= FOOTER ================= */}

    <footer className="modern-footer">

      <div className="footer-brand">

        <div className="brand">
          <div className="brand-mark">R</div>

          <div>
            <h1>REFLINK</h1>
            <p>Connected Referral Care</p>
          </div>
        </div>

        <p>
          Digital closed-loop referral coordination
          for connected healthcare delivery.
        </p>

      </div>

      <div className="footer-links">

        <div>
          <strong>Platform</strong>
          <span>Digital Referrals</span>
          <span>Referral Tracking</span>
          <span>Clinical Feedback</span>
        </div>

        <div>
          <strong>Access</strong>
          <button type="button" onClick={openLogin}>
            Sign In
          </button>
        </div>

      </div>

      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} REFLINK
        </span>

        <span>
          Digital Closed-Loop Referral System
        </span>
      </div>

    </footer>
  </>
)}

      {/* =====================================================
          LOGIN
          ===================================================== */}

      {screen === "login" && (
        <div className="login-page">

          <div className="login-card">

            <div className="login-logo">
              R
            </div>

            <h2>
              Sign in to REFLINK
            </h2>

            <p>
              Access your healthcare referral workspace.
            </p>

            <label>
              Email Address
            </label>

            <input
              type="email"
              placeholder="name@facility.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label>
              Password
            </label>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              type="button"
              className="primary-button full-width"
              onClick={handleSignIn}
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            {loginError && (
              <p className="login-error">
                {loginError}
              </p>
            )}

            <button
              type="button"
              className="back-button"
              onClick={() => setScreen("home")}
            >
              ← Back to home
            </button>

            <p className="demo-note">
              Secure authentication powered by REFLINK.
            </p>

          </div>

        </div>
      )}


      {/* =====================================================
          DASHBOARD
          ===================================================== */}

      {screen === "dashboard" && (
        <div className="dashboard-page">

          <header className="dashboard-header">

            <div className="brand">

              <div className="brand-mark">
                R
              </div>

              <div>
                <h1>REFLINK</h1>

                <p>
  {profile?.full_name
    ? `${profile.full_name} • ${role}`
    : role}
</p>
              </div>

            </div>

            <button
              type="button"
              className="logout-button"
              onClick={logout}
            >
              Sign Out
            </button>

          </header>

          <main className="dashboard">

            <div className="dashboard-title">

              <div>

                <span className="eyebrow">
                  REFLINK WORKSPACE
                </span>

                <h2>
                  {role} Dashboard
                </h2>

                <p>
                  Welcome to your referral management workspace.
                </p>

              </div>

            </div>

            {role === "PHC Staff" && (
              <PHCStaffDashboard
                onNewReferral={() => setScreen("new-referral")}
              />
            )}

            {role === "Receiving Facility" && (
              <ReceivingDashboard />
            )}

            {role === "Administrator" && (
              <AdministratorRoute>
                <AdminDashboard />
              </AdministratorRoute>
            )}

          </main>

        </div>
      )}

      {/* =====================================================
          NEW REFERRAL
          ===================================================== */}

      {screen === "new-referral" && (
        <div className="dashboard-page">

          <header className="dashboard-header">

            <div className="brand">

              <div className="brand-mark">
                R
              </div>

              <div>
                <h1>REFLINK</h1>
                <p>PHC Staff</p>
              </div>

            </div>

            <button
              type="button"
              className="logout-button"
              onClick={logout}
            >
              Sign Out
            </button>

          </header>

          <main className="dashboard">

            <NewReferralForm
              onBack={() => setScreen("dashboard")}
            />

          </main>

        </div>
      )}

    </div>
  );
}

/* =========================================================
   NEW REFERRAL FORM
   ========================================================= */

function NewReferralForm({ onBack }) {

  const [form, setForm] = useState({
    patient_identifier: "",
    patient_age_months: "",
    patient_sex: "",
    chief_complaint: "",
    clinical_summary: "",
    physical_findings: "",
    provisional_diagnosis: "",
    investigations: "",
    treatment_given: "",
    referral_reason: "",
    urgency: "routine",
    receiving_facility_id: "",
  });

  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadFacilities();
  }, []);

  const loadFacilities = async () => {

    const { data, error } = await supabase
      .from("facilities")
      .select(
        "id, name, facility_type, state, lga, is_active"
      )
      .eq("is_active", true)
      .order("name");

    console.log(
      "FACILITIES FROM SUPABASE:",
      data
    );

    console.log(
      "FACILITIES ERROR:",
      error
    );

    if (error) {
      setError(
        "Unable to load receiving facilities."
      );

      console.error(error);
      return;
    }

    setFacilities(data || []);
  };

  const handleChange = (e) => {

    const {
      name,
      value,
    } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const generateReferralNumber = () => {

    const year =
      new Date().getFullYear();

    const randomPart =
      Math.floor(
        100000 +
        Math.random() * 900000
      );

    return `RF-${year}-${randomPart}`;
  };

  const handleSubmit = async (e) => {

    e.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {

      const {
        data: {
          user,
        },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "id, facility_id, role"
        )
        .eq("id", user.id)
        .single();

      if (
        profileError ||
        !profile
      ) {
        throw new Error(
          "Your REFLINK profile could not be found."
        );
      }

      if (!profile.facility_id) {
        throw new Error(
          "Your account has not been assigned to a healthcare facility yet."
        );
      }

      const referralNumber =
        generateReferralNumber();

      const referralPayload = {

        referral_number:
          referralNumber,

        patient_identifier:
          form.patient_identifier,

        patient_age_months:
          form.patient_age_months
            ? Number(form.patient_age_months) * 12
            : null,

        patient_sex:
          form.patient_sex ||
          null,

        chief_complaint:
          form.chief_complaint ||
          null,

        clinical_summary:
          form.clinical_summary ||
          null,

        physical_findings:
          form.physical_findings ||
          null,

        provisional_diagnosis:
          form.provisional_diagnosis ||
          null,

        investigations:
          form.investigations ||
          null,

        treatment_given:
          form.treatment_given ||
          null,

        referral_reason:
          form.referral_reason ||
          null,

        urgency:
          form.urgency ||
          "routine",

        referring_facility_id:
          profile.facility_id,

        receiving_facility_id:
          form.receiving_facility_id,

        referring_user_id:
          user.id,

        status:
          "sent",
      };

      console.log(
        "AUTH USER:",
        user.id
      );

      console.log(
        "PROFILE:",
        profile
      );

      console.log(
        "REFERRAL PAYLOAD:",
        referralPayload
      );

      const {
        error: referralError,
      } = await supabase
        .from("referrals")
        .insert(
          referralPayload
        );

      if (referralError) {
        console.error(
          "REFERRAL INSERT ERROR:",
          referralError
        );

        throw referralError;
      }

      setMessage(
        `Referral ${referralNumber} created successfully.`
      );

      setForm({
        patient_identifier: "",
        patient_age_months: "",
        patient_sex: "",
        chief_complaint: "",
        clinical_summary: "",
        physical_findings: "",
        provisional_diagnosis: "",
        investigations: "",
        treatment_given: "",
        referral_reason: "",
        urgency: "routine",
        receiving_facility_id: "",
      });

    } catch (err) {

      console.error(
        "Referral creation error:",
        err
      );

      setError(
        err.message ||
        "Unable to create referral."
      );

    } finally {

      setLoading(false);

    }
  };

  return (
    <div className="dashboard-card referral-form-card">

      <div className="form-header">

        <div>

          <span className="eyebrow">
            DIGITAL REFERRAL
          </span>

          <h2>
            New Referral
          </h2>

          <p>
            Create a secure referral to a receiving facility.
          </p>

        </div>

        <button
          type="button"
          className="back-button"
          onClick={onBack}
        >
          ← Back
        </button>

      </div>

      {message && (
        <div className="success-message">
          {message}
        </div>
      )}

      {error && (
        <div className="login-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>

        <h3>
          Patient Information
        </h3>

        <label>
          Patient Identifier *
        </label>

        <input
          name="patient_identifier"
          value={form.patient_identifier}
          onChange={handleChange}
          placeholder="e.g. PT-001"
          required
        />

        <div className="form-grid">

          <div>

            <label>
              Age (years)
            </label>

            <input
              type="number"
              name="patient_age_months"
              value={form.patient_age_months}
              onChange={handleChange}
              min="0"
              step="1"
              placeholder="e.g. 22"
            />

          </div>

          <div>

            <label>
              Sex
            </label>

            <select
              name="patient_sex"
              value={form.patient_sex}
              onChange={handleChange}
            >

              <option value="">
                Select sex
              </option>

              <option value="male">
                Male
              </option>

              <option value="female">
                Female
              </option>

              <option value="other">
                Other
              </option>

              <option value="unknown">
                Unknown
              </option>

            </select>

          </div>

        </div>

        <h3>
          Clinical Information
        </h3>

        <label>
          Chief Complaint
        </label>

        <textarea
          name="chief_complaint"
          value={form.chief_complaint}
          onChange={handleChange}
          placeholder="Main presenting complaint"
        />

        <label>
          Clinical Summary
        </label>

        <textarea
          name="clinical_summary"
          value={form.clinical_summary}
          onChange={handleChange}
          placeholder="Brief clinical history and relevant information"
        />

        <label>
          Physical Findings
        </label>

        <textarea
          name="physical_findings"
          value={form.physical_findings}
          onChange={handleChange}
          placeholder="Relevant examination findings"
        />

        <label>
          Provisional Diagnosis
        </label>

        <input
          name="provisional_diagnosis"
          value={form.provisional_diagnosis}
          onChange={handleChange}
          placeholder="Provisional diagnosis"
        />

        <label>
          Investigations
        </label>

        <textarea
          name="investigations"
          value={form.investigations}
          onChange={handleChange}
          placeholder="Laboratory/imaging results"
        />

        <label>
          Treatment Given
        </label>

        <textarea
          name="treatment_given"
          value={form.treatment_given}
          onChange={handleChange}
          placeholder="Treatment already provided"
        />

        <h3>
          Referral Information
        </h3>

        <label>
          Reason for Referral
        </label>

        <textarea
          name="referral_reason"
          value={form.referral_reason}
          onChange={handleChange}
          placeholder="Why is the patient being referred?"
        />

        <label>
          Urgency *
        </label>

        <select
          name="urgency"
          value={form.urgency}
          onChange={handleChange}
          required
        >

          <option value="routine">
            Routine
          </option>

          <option value="urgent">
            Urgent
          </option>

          <option value="emergency">
            Emergency
          </option>

        </select>

        <label>
          Receiving Facility *
        </label>

        <select
          name="receiving_facility_id"
          value={form.receiving_facility_id}
          onChange={handleChange}
          required
        >

          <option value="">
            Select receiving facility
          </option>

          {facilities.map(
            (facility) => (
              <option
                key={facility.id}
                value={facility.id}
              >
                {facility.name}
              </option>
            )
          )}

        </select>

        <button
          type="submit"
          className="primary-button full-width"
          disabled={loading}
        >
          {loading
            ? "Creating Referral..."
            : "Create Referral"}
        </button>

      </form>

    </div>
  );
}
/* =========================================================
   PHC STAFF DASHBOARD
   LIVE REFERRALS + REALTIME UPDATES
   ========================================================= */

function PHCStaffDashboard({ onNewReferral }) {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [selectedReferral, setSelectedReferral] =
    useState(null);

  const [activeFilter, setActiveFilter] =
    useState("all");

  /* =========================================================
     LOAD MY REFERRALS
     ========================================================= */

  const loadMyReferrals = async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "id, full_name, role, facility_id"
        )
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        throw new Error(
          "Your REFLINK profile could not be found."
        );
      }

      if (!profile.facility_id) {
        throw new Error(
          "Your account is not assigned to a healthcare facility."
        );
      }

      const {
        data,
        error: referralError,
      } = await supabase
        .from("referrals")
        .select(`
          id,
          referral_number,
          patient_identifier,
          patient_age_months,
          patient_sex,
          chief_complaint,
          clinical_summary,
          physical_findings,
          provisional_diagnosis,
          investigations,
          treatment_given,
          referral_reason,
          urgency,
          status,
          created_at,

          acknowledged_at,
          patient_arrived_at,

          assessment_findings,
          final_diagnosis,
          treatment_provided,
          procedures_performed,
          clinical_feedback,
          disposition,
          assessment_completed_at,

          admission_at,
          ward_unit,
          admission_diagnosis,
          clinical_progress,
          inpatient_treatment,

          discharge_diagnosis,
          condition_at_discharge,
          discharge_medications,
          follow_up_plan,
          discharged_at,

          referring_facility_id,
          receiving_facility_id
        `)
        .eq(
          "referring_facility_id",
          profile.facility_id
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (referralError) {
        throw referralError;
      }

      console.log(
        "PHC REFERRALS:",
        data
      );

      setReferrals(data || []);
    } catch (err) {
      console.error(
        "PHC DASHBOARD ERROR:",
        err
      );

      setError(
        err?.message ||
          "Unable to load your referrals."
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     INITIAL LOAD
     ========================================================= */

  useEffect(() => {
    loadMyReferrals();
  }, []);

  /* =========================================================
     REALTIME REFERRAL UPDATES
     ========================================================= */

  useEffect(() => {
    let channel = null;

    const setupRealtime = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return;
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select("facility_id")
          .eq("id", user.id)
          .single();

        if (
          profileError ||
          !profile?.facility_id
        ) {
          console.error(
            "PHC REALTIME PROFILE ERROR:",
            profileError
          );

          return;
        }

        channel = supabase
          .channel(
            `phc-referrals-${profile.facility_id}`
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "referrals",
              filter:
                `referring_facility_id=eq.${profile.facility_id}`,
            },
            (payload) => {
              console.log(
                "PHC REALTIME REFERRAL UPDATE:",
                payload
              );

              loadMyReferrals();
            }
          )
          .subscribe((status) => {
            console.log(
              "PHC REALTIME STATUS:",
              status
            );
          });
      } catch (err) {
        console.error(
          "PHC REALTIME ERROR:",
          err
        );
      }
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  /* =========================================================
     STATISTICS
     ========================================================= */

  const newReferrals =
    referrals.filter(
      (referral) =>
        referral.status === "sent"
    ).length;

  const acknowledgedReferrals =
    referrals.filter(
      (referral) =>
        referral.status === "acknowledged"
    ).length;

  const patientsReceived =
    referrals.filter(
      (referral) =>
        referral.status === "patient_arrived"
    ).length;

  const underAssessment =
    referrals.filter(
      (referral) =>
        referral.status === "under_assessment"
    ).length;

  const admitted =
    referrals.filter(
      (referral) =>
        referral.status === "admitted"
    ).length;

  const discharged =
    referrals.filter(
      (referral) =>
        referral.status === "discharged"
    ).length;

  /* =========================================================
     FILTERED REFERRALS
     ========================================================= */

  const filteredReferrals =
    activeFilter === "all"
      ? referrals
      : referrals.filter(
          (referral) =>
            referral.status ===
            activeFilter
        );

  /* =========================================================
     FILTER LABEL
     ========================================================= */

  const filterLabels = {
    all: "All Referrals",
    sent: "New Referrals",
    acknowledged:
      "Awaiting Patient Arrival",
    patient_arrived:
      "Patients Received",
    under_assessment:
      "Under Assessment",
    admitted:
      "Admitted Patients",
    discharged:
      "Discharged Patients",
  };

  const activeFilterLabel =
    filterLabels[activeFilter] ||
    "Referrals";

  /* =========================================================
     STATUS LABEL
     ========================================================= */

  const getStatusLabel = (status) => {
    const labels = {
      sent: "New Referral",
      acknowledged:
        "Acknowledged",
      patient_arrived:
        "Patient Arrived",
      under_assessment:
        "Under Assessment",
      admitted: "Admitted",
      discharged:
        "Discharged",
      referred_again:
        "Re-referred",
      completed: "Completed",
    };

    return (
      labels[status] ||
      status ||
      "Unknown"
    );
  };

  /* =========================================================
     OPEN REFERRAL
     ========================================================= */

  const openReferral = (referral) => {
    setSelectedReferral(referral);
  };

  /* =========================================================
     FILTER
     ========================================================= */

  const handleFilterClick = (
    filter
  ) => {
    setActiveFilter(filter);
  };

  /* =========================================================
     RETURN
     ========================================================= */

  return (
    <>
      {/* =====================================================
          ACTIONS
          ===================================================== */}

      <div className="dashboard-actions">

        <button
          type="button"
          className="primary-button"
          onClick={onNewReferral}
        >
          + New Referral
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={
            loadMyReferrals
          }
          disabled={loading}
        >
          {loading
            ? "Refreshing..."
            : "Refresh Referrals"}
        </button>

      </div>

      {/* =====================================================
          MESSAGES
          ===================================================== */}

      {message && (
        <div className="success-message">
          {message}
        </div>
      )}

      {error && (
        <div className="login-error">
          {error}
        </div>
      )}

      {/* =====================================================
          STATISTICS
          ===================================================== */}

      <div className="stats-grid">

        {/* ALL */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "all"
            )
          }
        >
          <span>
            All Referrals
          </span>

          <strong>
            {referrals.length}
          </strong>
        </button>

        {/* NEW */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "sent"
            )
          }
        >
          <span>
            New Referrals
          </span>

          <strong>
            {newReferrals}
          </strong>
        </button>

        {/* ACKNOWLEDGED */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "acknowledged"
            )
          }
        >
          <span>
            Awaiting Patient Arrival
          </span>

          <strong>
            {acknowledgedReferrals}
          </strong>
        </button>

        {/* PATIENT ARRIVED */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "patient_arrived"
            )
          }
        >
          <span>
            Patients Received
          </span>

          <strong>
            {patientsReceived}
          </strong>
        </button>

        {/* UNDER ASSESSMENT */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "under_assessment"
            )
          }
        >
          <span>
            Under Assessment
          </span>

          <strong>
            {underAssessment}
          </strong>
        </button>

        {/* ADMITTED */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "admitted"
            )
          }
        >
          <span>
            Admitted
          </span>

          <strong>
            {admitted}
          </strong>
        </button>

        {/* DISCHARGED */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "discharged"
            )
          }
        >
          <span>
            Discharged
          </span>

          <strong>
            {discharged}
          </strong>
        </button>

      </div>

      {/* =====================================================
          REFERRAL LIST
          ===================================================== */}

      <div className="dashboard-card">

        <div className="form-header">

          <div>

            <span className="eyebrow">
              LIVE REFERRAL NETWORK
            </span>

            <h3>
              {activeFilterLabel}
            </h3>

            <p>
              Referrals created by your
              healthcare facility.
            </p>

          </div>

          <div className="dashboard-card-header-actions">

            <strong>
              {
                filteredReferrals.length
              }{" "}
              record(s)
            </strong>

            {activeFilter !==
              "all" && (
              <button
                type="button"
                className="back-button"
                onClick={() =>
                  setActiveFilter(
                    "all"
                  )
                }
              >
                Clear Filter
              </button>
            )}

          </div>

        </div>

        {/* LOADING */}

        {loading && (
          <p>
            Loading referrals...
          </p>
        )}

        {/* NO RESULTS */}

        {!loading &&
          filteredReferrals.length ===
            0 && (
            <p>
              {activeFilter ===
              "all"
                ? "No referrals found."
                : "No referrals found for this filter."}
            </p>
          )}

        {/* REFERRALS */}

        {!loading &&
          filteredReferrals.length >
            0 && (

            <div className="referral-list">

              {filteredReferrals.map(
                (referral) => (

                  <button
                    key={
                      referral.id
                    }
                    type="button"
                    className="referral-item"
                    onClick={() =>
                      openReferral(
                        referral
                      )
                    }
                    style={{
                      width:
                        "100%",
                      textAlign:
                        "left",
                      cursor:
                        "pointer",
                      border:
                        "none",
                    }}
                  >

                    {/* BASIC INFORMATION */}

                    <div>

                      <strong>
                        {
                          referral.referral_number
                        }
                      </strong>

                      <p>
                        Patient:{" "}
                        {
                          referral.patient_identifier ||
                          "Not recorded"
                        }
                      </p>

                      <p>
                        Urgency:{" "}
                        {
                          referral.urgency ||
                          "Not specified"
                        }
                      </p>

                      <small>
                        Created:{" "}
                        {referral.created_at
                          ? new Date(
                              referral.created_at
                            ).toLocaleString()
                          : "Not recorded"}
                      </small>

                    </div>

                    {/* CLINICAL INFORMATION */}

                    <div>

                      <strong>
                        {
                          referral.provisional_diagnosis ||
                          "No diagnosis provided"
                        }
                      </strong>

                      <p>
                        {
                          referral.chief_complaint ||
                          "No chief complaint provided"
                        }
                      </p>

                    </div>

                    {/* STATUS */}

                    <div>

                      <span
                        className={`status-badge status-${referral.status}`}
                      >
                        {
                          getStatusLabel(
                            referral.status
                          )
                        }
                      </span>

                      <p>
                        Click to view
                        details →
                      </p>

                    </div>

                  </button>

                )
              )}

            </div>

          )}

      </div>

      {/* =====================================================
          REFERRAL DETAILS
          ===================================================== */}

      {selectedReferral && (

        <div className="login-page">

          <div
            className="login-card"
            style={{
              maxWidth:
                "800px",
            }}
          >

            <span className="eyebrow">
              REFERRAL DETAILS
            </span>

            <h2>
              {
                selectedReferral.referral_number
              }
            </h2>

            <p>
              <strong>
                Patient:
              </strong>{" "}
              {
                selectedReferral.patient_identifier ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Status:
              </strong>{" "}
              {
                getStatusLabel(
                  selectedReferral.status
                )
              }
            </p>

            <p>
              <strong>
                Urgency:
              </strong>{" "}
              {
                selectedReferral.urgency ||
                "Not specified"
              }
            </p>

            <hr />

            {/* CLINICAL INFORMATION */}

            <h3>
              Clinical Information
            </h3>

            <p>
              <strong>
                Chief Complaint:
              </strong>{" "}
              {
                selectedReferral.chief_complaint ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Clinical Summary:
              </strong>{" "}
              {
                selectedReferral.clinical_summary ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Physical Findings:
              </strong>{" "}
              {
                selectedReferral.physical_findings ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Provisional Diagnosis:
              </strong>{" "}
              {
                selectedReferral.provisional_diagnosis ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Investigations:
              </strong>{" "}
              {
                selectedReferral.investigations ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Treatment Given:
              </strong>{" "}
              {
                selectedReferral.treatment_given ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Referral Reason:
              </strong>{" "}
              {
                selectedReferral.referral_reason ||
                "Not recorded"
              }
            </p>

            <hr />

            {/* RECEIVING FACILITY */}

            <h3>
              Receiving Facility Updates
            </h3>

            <p>
              <strong>
                Final Diagnosis:
              </strong>{" "}
              {
                selectedReferral.final_diagnosis ||
                "Not yet recorded"
              }
            </p>

            <p>
              <strong>
                Assessment Findings:
              </strong>{" "}
              {
                selectedReferral.assessment_findings ||
                "Not yet recorded"
              }
            </p>

            <p>
              <strong>
                Treatment Provided:
              </strong>{" "}
              {
                selectedReferral.treatment_provided ||
                "Not yet recorded"
              }
            </p>

            <p>
              <strong>
                Procedures Performed:
              </strong>{" "}
              {
                selectedReferral.procedures_performed ||
                "Not yet recorded"
              }
            </p>

            <p>
              <strong>
                Clinical Feedback:
              </strong>{" "}
              {
                selectedReferral.clinical_feedback ||
                "No feedback yet"
              }
            </p>

            <p>
              <strong>
                Disposition:
              </strong>{" "}
              {
                selectedReferral.disposition ||
                "Not yet recorded"
              }
            </p>

            <hr />

            {/* INPATIENT */}

            <h3>
              Inpatient Information
            </h3>

            <p>
              <strong>
                Ward / Unit:
              </strong>{" "}
              {
                selectedReferral.ward_unit ||
                "Not admitted"
              }
            </p>

            <p>
              <strong>
                Admission Diagnosis:
              </strong>{" "}
              {
                selectedReferral.admission_diagnosis ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Admission Date:
              </strong>{" "}
              {
                selectedReferral.admission_at
                  ? new Date(
                      selectedReferral.admission_at
                    ).toLocaleString()
                  : "Not recorded"
              }
            </p>

            <p>
              <strong>
                Clinical Progress:
              </strong>{" "}
              {
                selectedReferral.clinical_progress ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Inpatient Treatment:
              </strong>{" "}
              {
                selectedReferral.inpatient_treatment ||
                "Not recorded"
              }
            </p>

            <hr />

            {/* DISCHARGE */}

            <h3>
              Discharge Information
            </h3>

            <p>
              <strong>
                Discharge Diagnosis:
              </strong>{" "}
              {
                selectedReferral.discharge_diagnosis ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Condition at Discharge:
              </strong>{" "}
              {
                selectedReferral.condition_at_discharge ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Discharge Medications:
              </strong>{" "}
              {
                selectedReferral.discharge_medications ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Follow-up Plan:
              </strong>{" "}
              {
                selectedReferral.follow_up_plan ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Discharged At:
              </strong>{" "}
              {
                selectedReferral.discharged_at
                  ? new Date(
                      selectedReferral.discharged_at
                    ).toLocaleString()
                  : "Not discharged"
              }
            </p>

            <hr />

            {/* BACK */}

            <button
              type="button"
              className="back-button"
              onClick={() =>
                setSelectedReferral(
                  null
                )
              }
            >
              ← Back to Referrals
            </button>

          </div>

        </div>

      )}

    </>
  );
}
/* =========================================================
   RECEIVING FACILITY DASHBOARD
   ========================================================= */

function ReceivingDashboard() {

  const [referrals, setReferrals] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [selectedReferral, setSelectedReferral] =
    useState(null);

  const [
    selectedInpatientReferral,
    setSelectedInpatientReferral,
  ] = useState(null);

  const [actionLoading, setActionLoading] =
    useState(null);

  /* =======================================================
     ASSESSMENT FORM
     ======================================================= */

  const [assessmentForm, setAssessmentForm] =
    useState({
      assessment_findings: "",
      final_diagnosis: "",
      treatment_provided: "",
      procedures_performed: "",
      clinical_feedback: "",
      disposition: "",
    });

  /* =======================================================
     ADMISSION FORM
     ======================================================= */

  const [admissionForm, setAdmissionForm] =
    useState({
      admission_at: "",
      ward_unit: "",
      admission_diagnosis: "",
      clinical_progress: "",
      inpatient_treatment: "",
      discharge_diagnosis: "",
      condition_at_discharge: "",
      discharge_medications: "",
      follow_up_plan: "",
    });

  /* =======================================================
     LOAD INCOMING REFERRALS
     ======================================================= */

  const loadIncomingReferrals =
    async () => {

      setLoading(true);
      setError("");

      try {

        const {
          data: {
            user,
          },
          error: userError,
        } = await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          throw new Error(
            "Your session has expired. Please sign in again."
          );
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select(
            "id, full_name, role, facility_id"
          )
          .eq(
            "id",
            user.id
          )
          .single();

        if (
          profileError ||
          !profile
        ) {
          throw new Error(
            "Your REFLINK profile could not be found."
          );
        }

        if (
          !profile.facility_id
        ) {
          throw new Error(
            "Your account is not assigned to a receiving facility."
          );
        }

        const {
          data,
          error: referralError,
        } = await supabase
          .from("referrals")
          .select(`
            id,
            referral_number,
            patient_identifier,
            patient_age_months,
            patient_sex,
            chief_complaint,
            clinical_summary,
            physical_findings,
            provisional_diagnosis,
            investigations,
            treatment_given,
            referral_reason,
            urgency,
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

            admission_at,
            ward_unit,
            admission_diagnosis,
            clinical_progress,
            inpatient_treatment,

            discharge_diagnosis,
            condition_at_discharge,
            discharge_medications,
            follow_up_plan,
            discharged_at,

            referring_facility_id,
            receiving_facility_id
          `)
          .eq(
            "receiving_facility_id",
            profile.facility_id
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

        if (referralError) {
          throw referralError;
        }

        console.log(
          "INCOMING REFERRALS:",
          data
        );

        setReferrals(
          data || []
        );

      } catch (err) {

        console.error(
          "Receiving dashboard error:",
          err
        );

        setError(
          err.message ||
          "Unable to load incoming referrals."
        );

      } finally {

        setLoading(false);

      }
    };

  /* =======================================================
     ADMISSION FORM CHANGE
     ======================================================= */

  const handleAdmissionChange =
    (e) => {

      const {
        name,
        value,
      } = e.target;

      setAdmissionForm(
        (previous) => ({
          ...previous,
          [name]: value,
        })
      );
    };

  /* =======================================================
     ASSESSMENT FORM CHANGE
     ======================================================= */

  const handleAssessmentChange =
    (e) => {

      const {
        name,
        value,
      } = e.target;

      setAssessmentForm(
        (previous) => ({
          ...previous,
          [name]: value,
        })
      );
    };

  /* =======================================================
     OPEN INPATIENT MANAGEMENT
     ======================================================= */

  const openInpatientManagement =
    (referral) => {

      setSelectedInpatientReferral(
        referral
      );

      setAdmissionForm({

        admission_at:
          referral.admission_at
            ? referral.admission_at.slice(
                0,
                16
              )
            : "",

        ward_unit:
          referral.ward_unit ||
          "",

        admission_diagnosis:
          referral.admission_diagnosis ||
          referral.final_diagnosis ||
          "",

        clinical_progress:
          referral.clinical_progress ||
          "",

        inpatient_treatment:
          referral.inpatient_treatment ||
          "",

        discharge_diagnosis:
          referral.discharge_diagnosis ||
          "",

        condition_at_discharge:
          referral.condition_at_discharge ||
          "",

        discharge_medications:
          referral.discharge_medications ||
          "",

        follow_up_plan:
          referral.follow_up_plan ||
          "",
      });
    };

  /* =======================================================
     SAVE ADMISSION
     ======================================================= */

  const handleSaveAdmission =
    async (e) => {

      e.preventDefault();

      if (
        !selectedInpatientReferral
      ) {
        return;
      }

      setError("");
      setMessage("");

      setActionLoading(
        selectedInpatientReferral.id
      );

      try {

        if (
          !admissionForm.ward_unit.trim()
        ) {
          throw new Error(
            "Ward or clinical unit is required."
          );
        }

        if (
          !admissionForm.admission_diagnosis.trim()
        ) {
          throw new Error(
            "Admission diagnosis is required."
          );
        }

        const admissionAt =
          admissionForm.admission_at
            ? new Date(
                admissionForm.admission_at
              ).toISOString()
            : new Date().toISOString();

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update({

            admission_at:
              admissionAt,

            ward_unit:
              admissionForm.ward_unit,

            admission_diagnosis:
              admissionForm.admission_diagnosis,

            clinical_progress:
              admissionForm.clinical_progress ||
              null,

            inpatient_treatment:
              admissionForm.inpatient_treatment ||
              null,

            status:
              "admitted",
          })
          .eq(
            "id",
            selectedInpatientReferral.id
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Admission information for ${data.referral_number} saved successfully.`
        );

        setSelectedInpatientReferral(
          null
        );

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          "SAVE ADMISSION ERROR:",
          err
        );

        setError(
          err.message ||
          "Unable to save admission information."
        );

      } finally {

        setActionLoading(null);

      }
    };

  /* =======================================================
     DISCHARGE PATIENT
     ======================================================= */

  const handleDischargePatient =
    async (e) => {

      e.preventDefault();

      if (
        !selectedInpatientReferral
      ) {
        return;
      }

      setError("");
      setMessage("");

      setActionLoading(
        selectedInpatientReferral.id
      );

      try {

        if (
          !admissionForm.discharge_diagnosis.trim()
        ) {
          throw new Error(
            "Discharge diagnosis is required."
          );
        }

        if (
          !admissionForm.condition_at_discharge.trim()
        ) {
          throw new Error(
            "Condition at discharge is required."
          );
        }

        if (
          !admissionForm.follow_up_plan.trim()
        ) {
          throw new Error(
            "Follow-up plan is required."
          );
        }

        const dischargedAt =
          new Date().toISOString();

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update({

            discharge_diagnosis:
              admissionForm.discharge_diagnosis,

            condition_at_discharge:
              admissionForm.condition_at_discharge,

            discharge_medications:
              admissionForm.discharge_medications ||
              null,

            follow_up_plan:
              admissionForm.follow_up_plan,

            discharged_at:
              dischargedAt,

            status:
              "discharged",
          })
          .eq(
            "id",
            selectedInpatientReferral.id
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Referral ${data.referral_number} discharged successfully.`
        );

        setSelectedInpatientReferral(
          null
        );

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          "DISCHARGE ERROR:",
          err
        );

        setError(
          err.message ||
          "Unable to discharge patient."
        );

      } finally {

        setActionLoading(null);

      }
    };

  /* =======================================================
     ACKNOWLEDGE REFERRAL
     ======================================================= */

  const handleAcknowledgeReferral =
    async (referralId) => {

      setError("");
      setMessage("");
      setActionLoading(
        referralId
      );

      try {

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update({

            status:
              "acknowledged",

            acknowledged_at:
              new Date().toISOString(),

          })
          .eq(
            "id",
            referralId
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Referral ${data.referral_number} acknowledged successfully.`
        );

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          err
        );

        setError(
          err.message ||
          "Unable to acknowledge referral."
        );

      } finally {

        setActionLoading(
          null
        );

      }
    };

  /* =======================================================
     PATIENT ARRIVAL
     ======================================================= */

  const handlePatientArrived =
    async (referralId) => {

      setError("");
      setMessage("");
      setActionLoading(
        referralId
      );

      try {

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update({

            status:
              "patient_arrived",

            patient_arrived_at:
              new Date().toISOString(),

          })
          .eq(
            "id",
            referralId
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Patient for ${data.referral_number} marked as arrived.`
        );

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          err
        );

        setError(
          err.message ||
          "Unable to record patient arrival."
        );

      } finally {

        setActionLoading(
          null
        );

      }
    };

  /* =======================================================
     START ASSESSMENT
     ======================================================= */

  const handleStartAssessment =
    async (referralId) => {

      setError("");
      setMessage("");
      setActionLoading(
        referralId
      );

      try {

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update({

            status:
              "under_assessment",

          })
          .eq(
            "id",
            referralId
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Clinical assessment started for ${data.referral_number}.`
        );

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          err
        );

        setError(
          err.message ||
          "Unable to start clinical assessment."
        );

      } finally {

        setActionLoading(
          null
        );

      }
    };

  /* =======================================================
     SAVE CLINICAL ASSESSMENT
     ======================================================= */

  const handleSaveAssessment =
    async (e) => {

      e.preventDefault();

      if (!selectedReferral) {
        return;
      }

      setError("");
      setMessage("");

      setActionLoading(
        selectedReferral.id
      );

      try {

        if (
          !assessmentForm.assessment_findings.trim()
        ) {
          throw new Error(
            "Assessment findings are required."
          );
        }

        if (
          !assessmentForm.final_diagnosis.trim()
        ) {
          throw new Error(
            "Clinical diagnosis is required."
          );
        }

        if (
          !assessmentForm.disposition
        ) {
          throw new Error(
            "Please select a clinical disposition."
          );
        }

        let newStatus =
          assessmentForm.disposition;

        if (
          assessmentForm.disposition ===
          "observation"
        ) {
          newStatus =
            "under_assessment";
        }

        const updateData = {

          assessment_findings:
            assessmentForm.assessment_findings,

          final_diagnosis:
            assessmentForm.final_diagnosis,

          treatment_provided:
            assessmentForm.treatment_provided ||
            null,

          procedures_performed:
            assessmentForm.procedures_performed ||
            null,

          clinical_feedback:
            assessmentForm.clinical_feedback ||
            null,

          disposition:
            assessmentForm.disposition,

          assessment_completed_at:
            new Date().toISOString(),

          status:
            newStatus,
        };

        if (
          assessmentForm.disposition ===
          "discharged"
        ) {

          updateData.discharged_at =
            new Date().toISOString();

        }

        if (
          assessmentForm.disposition ===
          "admitted"
        ) {

          updateData.admission_at =
            new Date().toISOString();

        }

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update(updateData)
          .eq(
            "id",
            selectedReferral.id
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Clinical assessment for ${data.referral_number} saved successfully.`
        );

        /*
         * If admitted, immediately open
         * inpatient management.
         */
        if (
          assessmentForm.disposition ===
          "admitted"
        ) {

          const updatedReferral = {
            ...selectedReferral,
            ...data,
          };

          setSelectedReferral(
            null
          );

          setAssessmentForm({
            assessment_findings: "",
            final_diagnosis: "",
            treatment_provided: "",
            procedures_performed: "",
            clinical_feedback: "",
            disposition: "",
          });

          setSelectedInpatientReferral(
            updatedReferral
          );

          setAdmissionForm({

            admission_at:
              updatedReferral.admission_at
                ? updatedReferral.admission_at.slice(
                    0,
                    16
                  )
                : "",

            ward_unit:
              updatedReferral.ward_unit ||
              "",

            admission_diagnosis:
              updatedReferral.admission_diagnosis ||
              updatedReferral.final_diagnosis ||
              "",

            clinical_progress:
              updatedReferral.clinical_progress ||
              "",

            inpatient_treatment:
              updatedReferral.inpatient_treatment ||
              "",

            discharge_diagnosis:
              updatedReferral.discharge_diagnosis ||
              "",

            condition_at_discharge:
              updatedReferral.condition_at_discharge ||
              "",

            discharge_medications:
              updatedReferral.discharge_medications ||
              "",

            follow_up_plan:
              updatedReferral.follow_up_plan ||
              "",
          });

        } else {

          setSelectedReferral(
            null
          );

          setAssessmentForm({
            assessment_findings: "",
            final_diagnosis: "",
            treatment_provided: "",
            procedures_performed: "",
            clinical_feedback: "",
            disposition: "",
          });
        }

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          "ASSESSMENT ERROR:",
          err
        );

        setError(
          err.message ||
          "Unable to save clinical assessment."
        );

      } finally {

        setActionLoading(
          null
        );

      }
    };

  /* =======================================================
     INITIAL LOAD
     ======================================================= */

  useEffect(() => {
    loadIncomingReferrals();
  }, []);

  /* =======================================================
     DASHBOARD STATISTICS
     ======================================================= */

  const newReferrals =
    referrals.filter(
      (referral) =>
        referral.status ===
        "sent"
    ).length;

  const awaitingAssessment =
    referrals.filter(
      (referral) =>
        referral.status ===
        "acknowledged"
    ).length;

  const patientsReceived =
    referrals.filter(
      (referral) =>
        referral.status ===
        "patient_arrived"
    ).length;

  const completed =
    referrals.filter(
      (referral) =>
        referral.status ===
          "completed" ||
        referral.status ===
          "discharged"
    ).length;
      /* =======================================================
     FILTERED REFERRALS
     ======================================================= */

  const filteredReferrals =
    referrals.filter(
      (referral) =>
        referral.status !== "completed" &&
        referral.status !== "discharged"
    );

  /* =======================================================
     USER INTERFACE
     ======================================================= */

  return (
    <>

      <div className="dashboard-actions">

        <button
          type="button"
          className="secondary-button"
          onClick={
            loadIncomingReferrals
          }
          disabled={loading}
        >
          {loading
            ? "Refreshing..."
            : "Refresh Referrals"}
        </button>

      </div>

      {message && (
        <div className="success-message">
          {message}
        </div>
      )}

      {error && (
        <div className="login-error">
          {error}
        </div>
      )}

      {/* ===================================================
          STATISTICS
          =================================================== */}

      <div className="stats-grid">

        <div className="stat-card">
          <span>
            New Referrals
          </span>

          <strong>
            {newReferrals}
          </strong>
        </div>

        <div className="stat-card">
          <span>
            Awaiting Assessment
          </span>

          <strong>
            {awaitingAssessment}
          </strong>
        </div>

        <div className="stat-card">
          <span>
            Patients Received
          </span>

          <strong>
            {patientsReceived}
          </strong>
        </div>

        <div className="stat-card">
          <span>
            Completed
          </span>

          <strong>
            {completed}
          </strong>
        </div>

      </div>

      {/* ===================================================
          INCOMING REFERRALS
          =================================================== */}

      <div className="dashboard-card">

        <div className="form-header">

          <div>

            <span className="eyebrow">
              REFERRAL MANAGEMENT
            </span>

            <h3>
              Incoming Referrals
            </h3>

            <p>
              Referrals assigned to your receiving facility.
            </p>

          </div>

        </div>

        {loading && (
          <p>
            Loading incoming referrals...
          </p>
        )}

        {!loading &&
          referrals.length === 0 &&
          !error && (
            <p>
              No incoming referrals found.
            </p>
          )}

        {!loading &&
          referrals.length > 0 && (

            <div className="referral-list">

              {filteredReferrals.map(
                (referral) => (

                  <div
                    key={referral.id}
                    className="referral-item"
                  >

                    <div>

                      <strong>
                        {
                          referral.referral_number
                        }
                      </strong>

                      <p>
                        Patient:{" "}
                        {
                          referral.patient_identifier
                        }
                      </p>

                      <p>
                        Status:{" "}
                        {
                          referral.status
                        }
                      </p>

                      <p>
                        Urgency:{" "}
                        {
                          referral.urgency
                        }
                      </p>

                      <small>
                        Received:{" "}
                        {new Date(
                          referral.created_at
                        ).toLocaleString()}
                      </small>

                    </div>

                    <div>

                      <strong>
                        {
                          referral.provisional_diagnosis ||
                          "No diagnosis provided"
                        }
                      </strong>

                      <p>
                        {
                          referral.chief_complaint ||
                          "No chief complaint provided"
                        }
                      </p>

                    </div>

                    {/* =================================================
                        ACTIONS
                        ================================================= */}

                    <div className="referral-actions">

                      {/* SENT */}

                      {referral.status ===
                        "sent" && (

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            handleAcknowledgeReferral(
                              referral.id
                            )
                          }
                          disabled={
                            actionLoading ===
                            referral.id
                          }
                        >
                          {actionLoading ===
                          referral.id
                            ? "Acknowledging..."
                            : "Acknowledge Referral"}
                        </button>

                      )}

                      {/* ACKNOWLEDGED */}

                      {referral.status ===
                        "acknowledged" && (

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            handlePatientArrived(
                              referral.id
                            )
                          }
                          disabled={
                            actionLoading ===
                            referral.id
                          }
                        >
                          {actionLoading ===
                          referral.id
                            ? "Updating..."
                            : "Mark Patient Arrived"}
                        </button>

                      )}

                      {/* PATIENT ARRIVED */}

                      {referral.status ===
                        "patient_arrived" && (

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            handleStartAssessment(
                              referral.id
                            )
                          }
                          disabled={
                            actionLoading ===
                            referral.id
                          }
                        >
                          {actionLoading ===
                          referral.id
                            ? "Starting..."
                            : "Start Assessment"}
                        </button>

                      )}

                      {/* UNDER ASSESSMENT */}

                      {referral.status ===
                        "under_assessment" && (

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => {

                            setSelectedReferral(
                              referral
                            );

                            setAssessmentForm({

                              assessment_findings:
                                referral.assessment_findings ||
                                "",

                              final_diagnosis:
                                referral.final_diagnosis ||
                                "",

                              treatment_provided:
                                referral.treatment_provided ||
                                "",

                              procedures_performed:
                                referral.procedures_performed ||
                                "",

                              clinical_feedback:
                                referral.clinical_feedback ||
                                "",

                              disposition:
                                referral.disposition ||
                                "",

                            });

                          }}
                        >
                          Open Clinical Assessment
                        </button>

                      )}

                      {/* =================================================
                          ADMITTED
                          IMPORTANT: only ONE button here.
                          No nested button.
                          ================================================= */}

                      {referral.status ===
                        "admitted" && (

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            openInpatientManagement(
                              referral
                            )
                          }
                        >
                          Open Inpatient Management
                        </button>

                      )}

                    </div>

                  </div>

                )
              )}

            </div>

          )}

      </div>

      {/* =====================================================
          INPATIENT MANAGEMENT
          ===================================================== */}

      {selectedInpatientReferral && (

        <div className="login-page">

          <div
            className="login-card"
            style={{
              maxWidth: "760px",
            }}
          >

            <span className="eyebrow">
              INPATIENT CARE
            </span>

            <h2>
              Inpatient Management
            </h2>

            <p>
              Referral{" "}
              <strong>
                {
                  selectedInpatientReferral.referral_number
                }
              </strong>
            </p>

            <p>
              Patient:{" "}
              <strong>
                {
                  selectedInpatientReferral.patient_identifier
                }
              </strong>
            </p>

            {/* =================================================
                ADMISSION
                ================================================= */}

            <form
              onSubmit={
                handleSaveAdmission
              }
            >

              <h3>
                Admission Documentation
              </h3>

              <label>
                Admission Date & Time
              </label>

              <input
                type="datetime-local"
                name="admission_at"
                value={
                  admissionForm.admission_at
                }
                onChange={
                  handleAdmissionChange
                }
              />

              <label>
                Ward / Clinical Unit *
              </label>

              <input
                type="text"
                name="ward_unit"
                value={
                  admissionForm.ward_unit
                }
                onChange={
                  handleAdmissionChange
                }
                placeholder="e.g. Paediatric Ward"
                required
              />

              <label>
                Admission Diagnosis *
              </label>

              <textarea
                name="admission_diagnosis"
                value={
                  admissionForm.admission_diagnosis
                }
                onChange={
                  handleAdmissionChange
                }
                rows="4"
                placeholder="Enter the admission diagnosis..."
                required
              />

              <label>
                Clinical Progress
              </label>

              <textarea
                name="clinical_progress"
                value={
                  admissionForm.clinical_progress
                }
                onChange={
                  handleAdmissionChange
                }
                rows="5"
                placeholder="Document clinical progress, response to treatment, vital clinical changes and relevant observations..."
              />

              <label>
                Inpatient Treatment
              </label>

              <textarea
                name="inpatient_treatment"
                value={
                  admissionForm.inpatient_treatment
                }
                onChange={
                  handleAdmissionChange
                }
                rows="5"
                placeholder="Document medications, IV fluids, procedures, monitoring and other inpatient interventions..."
              />

              <button
                type="submit"
                className="primary-button full-width"
                disabled={
                  actionLoading ===
                  selectedInpatientReferral.id
                }
              >
                {actionLoading ===
                selectedInpatientReferral.id
                  ? "Saving..."
                  : "Save Admission Information"}
              </button>

            </form>

            <hr />

            {/* =================================================
                DISCHARGE
                ================================================= */}

            <form
              onSubmit={
                handleDischargePatient
              }
            >

              <h3>
                Discharge Summary
              </h3>

              <label>
                Discharge Diagnosis *
              </label>

              <textarea
                name="discharge_diagnosis"
                value={
                  admissionForm.discharge_diagnosis
                }
                onChange={
                  handleAdmissionChange
                }
                rows="4"
                placeholder="Enter the final diagnosis at discharge..."
                required
              />

              <label>
                Condition at Discharge *
              </label>

              <textarea
                name="condition_at_discharge"
                value={
                  admissionForm.condition_at_discharge
                }
                onChange={
                  handleAdmissionChange
                }
                rows="4"
                placeholder="e.g. Clinically stable, afebrile, tolerating oral feeds..."
                required
              />

              <label>
                Discharge Medications
              </label>

              <textarea
                name="discharge_medications"
                value={
                  admissionForm.discharge_medications
                }
                onChange={
                  handleAdmissionChange
                }
                rows="5"
                placeholder="Medication name, dose, route, frequency and duration..."
              />

              <label>
                Follow-up Plan *
              </label>

              <textarea
                name="follow_up_plan"
                value={
                  admissionForm.follow_up_plan
                }
                onChange={
                  handleAdmissionChange
                }
                rows="5"
                placeholder="Follow-up appointment, laboratory monitoring, repeat investigations and referral instructions..."
                required
              />

              <button
                type="submit"
                className="primary-button full-width"
                disabled={
                  actionLoading ===
                  selectedInpatientReferral.id
                }
              >
                {actionLoading ===
                selectedInpatientReferral.id
                  ? "Processing..."
                  : "Discharge Patient"}
              </button>

              <button
                type="button"
                className="back-button"
                onClick={() =>
                  setSelectedInpatientReferral(
                    null
                  )
                }
              >
                ← Back to Referrals
              </button>

            </form>

          </div>

        </div>

      )}

      {/* =====================================================
          CLINICAL ASSESSMENT
          ===================================================== */}

      {selectedReferral && (

        <div className="login-page">

          <div
            className="login-card"
            style={{
              maxWidth: "720px",
            }}
          >

            <span className="eyebrow">
              CLINICAL DOCUMENTATION
            </span>

            <h2>
              Clinical Assessment
            </h2>

            <p>
              Referral{" "}
              <strong>
                {
                  selectedReferral.referral_number
                }
              </strong>
            </p>

            <form
              onSubmit={
                handleSaveAssessment
              }
            >

              <label>
                Assessment Findings *
              </label>

              <textarea
                name="assessment_findings"
                value={
                  assessmentForm.assessment_findings
                }
                onChange={
                  handleAssessmentChange
                }
                rows="4"
                placeholder="Document relevant clinical assessment findings..."
                required
              />

              <label>
                Final Diagnosis / Clinical Impression *
              </label>

              <textarea
                name="final_diagnosis"
                value={
                  assessmentForm.final_diagnosis
                }
                onChange={
                  handleAssessmentChange
                }
                rows="3"
                placeholder="Enter final diagnosis or clinical impression..."
                required
              />

              <label>
                Treatment / Interventions Administered
              </label>

              <textarea
                name="treatment_provided"
                value={
                  assessmentForm.treatment_provided
                }
                onChange={
                  handleAssessmentChange
                }
                rows="4"
                placeholder="Document medications, fluid therapy, procedures, or other interventions..."
              />

              <label>
                Procedures Performed
              </label>

              <textarea
                name="procedures_performed"
                value={
                  assessmentForm.procedures_performed
                }
                onChange={
                  handleAssessmentChange
                }
                rows="3"
                placeholder="Document procedures performed, if any..."
              />

              <label>
                Clinical Feedback to Referring Facility
              </label>

              <textarea
                name="clinical_feedback"
                value={
                  assessmentForm.clinical_feedback
                }
                onChange={
                  handleAssessmentChange
                }
                rows="4"
                placeholder="Provide relevant clinical feedback and follow-up recommendations..."
              />

              <label>
                Clinical Disposition *
              </label>

              <select
                name="disposition"
                value={
                  assessmentForm.disposition
                }
                onChange={
                  handleAssessmentChange
                }
                required
              >

                <option value="">
                  Select disposition
                </option>

                <option value="admitted">
                  Admitted
                </option>

                <option value="discharged">
                  Discharged
                </option>

                <option value="referred_again">
                  Re-referred
                </option>

                <option value="observation">
                  Observation
                </option>

              </select>

              <button
                type="submit"
                className="primary-button full-width"
                disabled={
                  actionLoading ===
                  selectedReferral.id
                }
              >
                {actionLoading ===
                selectedReferral.id
                  ? "Saving Assessment..."
                  : "Save Clinical Assessment"}
              </button>

              <button
                type="button"
                className="back-button"
                onClick={() =>
                  setSelectedReferral(
                    null
                  )
                }
              >
                ← Back to Referrals
              </button>

            </form>

          </div>

        </div>

      )}

    </>
  );
}

/* =======================================================
   ADMINISTRATOR-ONLY ROUTE PROTECTION
   ======================================================= */

function AdministratorRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const verifyAdministrator = async () => {
      setChecking(true);
      setAuthorized(false);

      try {
        // Always verify the currently authenticated Supabase user.
        // Do not trust only the React role state for administrator access.
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error(
            "Your session has expired. Please sign in again."
          );
        }

        // Read the role from the user's REFLINK profile.
        const { data: userProfile, error: profileError } =
          await supabase
            .from("profiles")
            .select("id, role")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        const normalizedRole = String(
          userProfile?.role || ""
        )
          .trim()
          .toLowerCase();

        if (!cancelled) {
          setAuthorized(
            normalizedRole === "administrator"
          );
          setChecking(false);
        }
      } catch (error) {
        console.error(
          "ADMINISTRATOR ROUTE CHECK ERROR:",
          error
        );

        if (!cancelled) {
          setAuthorized(false);
          setChecking(false);
        }
      }
    };

    verifyAdministrator();

    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <div className="dashboard-card">
        <span className="eyebrow">
          ACCESS CONTROL
        </span>

        <h3>
          Verifying administrator access...
        </h3>

        <p>
          Please wait while REFLINK verifies your administrator permissions.
        </p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="dashboard-card">
        <span className="eyebrow">
          ACCESS DENIED
        </span>

        <h3>
          Administrator Access Required
        </h3>

        <p>
          You do not have permission to access the REFLINK Administration area.
        </p>

        <p>
          Your administrator permissions are verified directly against your REFLINK profile.
        </p>
      </div>
    );
  }

  return children;
}

/* =======================================================
   ADMIN DASHBOARD
   ======================================================= */

function AdminDashboard() {
  const [view, setView] = useState("home");

  /* =======================================================
     FACILITIES
     ======================================================= */

  const [facilities, setFacilities] = useState([]);
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
          patient_age_months,
          patient_sex,
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
    if (view === "facilities") {
      loadFacilities();
    }

    if (view === "users") {
      loadFacilities();
      loadUsers();
    }

    if (
      view === "referrals" ||
      view === "active-referrals"
    ) {
      loadReferrals();
    }
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
                            getReferralStatusLabel(
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
        {getReferralStatusLabel(referral.status)}
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
     ADMINISTRATION HOME
     ======================================================= */

  return (
    <>
      <div className="dashboard-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            loadFacilities();
            loadUsers();
            loadReferrals();
          }}
        >
          ↻ Refresh Dashboard
        </button>
      </div>

      <div className="stats-grid">
        <button
          type="button"
          className="stat-card"
          onClick={() =>
            setView(
              "facilities"
            )
          }
          style={{
            cursor: "pointer",
          }}
        >
          <span>
            Facilities
          </span>

          <strong>
            {facilities.length}
          </strong>

          <small>
            Click to manage facilities →
          </small>
        </button>

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            setView(
              "users"
            )
          }
          style={{
            cursor: "pointer",
          }}
        >
          <span>
            Users
          </span>

          <strong>
            {users.length}
          </strong>

          <small>
            Click to manage users →
          </small>
        </button>

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            setView(
              "referrals"
            )
          }
          style={{
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span>
            Total Referrals
          </span>

          <strong>
            {referrals.length}
          </strong>

          <small>
            View referral network →
          </small>
        </button>

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            setView(
              "active-referrals"
            )
          }
          style={{
            cursor: "pointer",
            textAlign: "left",
          }}
        >
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

          <small>
            View active referrals →
          </small>
        </button>
      </div>

      <div className="dashboard-card">
        <span className="eyebrow">
          SYSTEM ADMINISTRATION
        </span>

        <h3>
          REFLINK Administration
        </h3>

        <p>
          Manage healthcare facilities,
          system users and referral
          activity across the REFLINK
          network.
        </p>

        <div className="dashboard-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              setView(
                "facilities"
              )
            }
          >
            Manage Facilities →
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setView(
                "users"
              )
            }
          >
            Manage Users →
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setView(
                "referrals"
              )
            }
          >
            Referral Network →
          </button>
        </div>
      </div>
    </>
  );
}
export default App;
