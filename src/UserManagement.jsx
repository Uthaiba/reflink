import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "phc_staff",

    facility_id: "",
    status: "active",
  });

  async function loadData() {
    setLoading(true);
    setMessage("");

    const [
      { data: usersData, error: usersError },
      { data: facilitiesData, error: facilitiesError },
    ] = await Promise.all([
      supabase
        .from("users")
        .select(`
          *,
          facilities (
            name,
            state,
            lga
          )
        `)
        .order("created_at", { ascending: false }),

      supabase
        .from("facilities")
        .select("id, name, state, lga")
        .order("name"),
    ]);

    if (usersError) {
      setMessage(usersError.message);
    } else {
      setUsers(usersData || []);
    }

    if (facilitiesError) {
      setMessage(facilitiesError.message);
    } else {
      setFacilities(facilitiesData || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (!form.full_name || !form.email) {
      setMessage("Full name and email are required.");
      return;
    }

    const { error } = await supabase.from("users").insert([
      {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        role: form.role,
        facility_id: form.facility_id || null,
        status: form.status,
      },
    ]);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("User added successfully.");

    setForm({
      full_name: "",
      email: "",
      phone: "",
      role: "phc_staff",
      facility_id: "",
      status: "active",
    });

    loadData();
  }

  const filteredUsers = users.filter((user) => {
    const searchText = search.toLowerCase();

    return (
      user.full_name?.toLowerCase().includes(searchText) ||
      user.email?.toLowerCase().includes(searchText) ||
      user.phone?.toLowerCase().includes(searchText) ||
      user.role?.toLowerCase().includes(searchText) ||
      user.facilities?.name?.toLowerCase().includes(searchText)
    );
  });

  return (
    <div className="page-container">

      <div className="page-actions">
        <button onClick={() => window.history.back()}>
          ← Back to Administration
        </button>

        <button onClick={loadData}>
          ↻ Refresh
        </button>
      </div>

      <section className="management-card">

        <div className="section-heading">
          <span>USER MANAGEMENT</span>

          <h1>REFLINK Users</h1>

          <p>
            Manage users who access and participate in the REFLINK referral
            network.
          </p>
        </div>

        {message && (
          <div className="message">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-grid">

          <div>
            <label>Full Name</label>

            <input
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              placeholder="e.g. Abdullahi Dahiru"
            />
          </div>

          <div>
            <label>Email</label>

            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label>Phone</label>

            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="080..."
            />
          </div>

          <div>
            <label>Role</label>

            <select
              name="role"
              value={form.role}
              onChange={handleChange}
            >
              <option value="phc_staff">
                PHC Staff
              </option>

              <option value="receiver">
                Receiving Staff
              </option>

              <option value="facility_manager">
                Facility Manager
              </option>

              <option value="administrator">
                Administrator
              </option>
            </select>
          </div>

          <div>
            <label>Facility</label>

            <select
              name="facility_id"
              value={form.facility_id}
              onChange={handleChange}
            >
              <option value="">
                Select facility
              </option>

              {facilities.map((facility) => (
                <option
                  key={facility.id}
                  value={facility.id}
                >
                  {facility.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Status</label>

            <select
              name="status"
              value={form.status}
              onChange={handleChange}
            >
              <option value="active">
                Active
              </option>

              <option value="inactive">
                Inactive
              </option>
            </select>
          </div>

          <div className="form-submit">
            <button type="submit">
              + Add User
            </button>
          </div>

        </form>
      </section>

      <section className="management-card">

        <div className="directory-header">

          <div>
            <h2>User Directory</h2>

            <p>
              {users.length} users registered in REFLINK.
            </p>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
          />

        </div>

        {loading ? (
          <p>Loading users...</p>
        ) : filteredUsers.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <div className="table-wrapper">

            <table>

              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Facility</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>

                {filteredUsers.map((user) => (
                  <tr key={user.id}>

                    <td>
                      {user.full_name}
                    </td>

                    <td>
                      {user.email}
                    </td>

                    <td>
                      {user.phone || "—"}
                    </td>

                    <td>
                      {user.role?.replace("_", " ")}
                    </td>

                    <td>
                      {user.facilities?.name || "Unassigned"}
                    </td>

                    <td>
                      <span
                        className={`status ${user.status}`}
                      >
                        {user.status}
                      </span>
                    </td>

                  </tr>
                ))}

              </tbody>

            </table>

          </div>
        )}

      </section>

    </div>
  );
}