import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { useAppStore } from "@/store/main";
import type { UserProfile } from "@/store/main";
import { z } from "zod";
import { Link } from "react-router-dom";

// Zod updateUserInputSchema (for type safety in patch payload)
const updateUserInputSchema = z.object({
  user_id: z.string(),
  email: z.string().email().optional(),
  password_hash: z.string().min(8).optional(),
  name: z.string().min(1).max(255).optional(),
  profile_photo_url: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(['admin', 'host', 'guest', 'guest_host']).optional(),
  is_active: z.boolean().optional(),
  notification_settings: z.string().optional(),
  payout_method_details: z.string().nullable().optional(),
  is_verified_host: z.boolean().optional(),
});

type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

const ROLES = [
  { value: "", label: "All Roles" },
  { value: "guest", label: "Guest" },
  { value: "host", label: "Host" },
  { value: "admin", label: "Admin" },
  { value: "guest_host", label: "Guest+Host" },
];
const STATUSES = [
  { value: "", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "banned", label: "Banned" },
];

const PAGE_SIZE = 25;

const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Helpers for error extraction
function getErrorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    if (e.response && typeof e.response.data?.message === "string") {
      return e.response.data.message;
    }
    if (e.message) return e.message;
  }
  return "Unknown error, please retry.";
}

export const UV_Admin_Users: React.FC = () => {
  // Auth & global state
  const auth_token = useAppStore((s) => s.auth_token);
  const adminUser = useAppStore((s) => s.user);

  // Table/filtering/paging state
  const [filters, setFilters] = useState<{ role: string; status: string; search: string }>({
    role: "",
    status: "",
    search: "",
  });
  const [pagination, setPagination] = useState<{ page: number; pageSize: number }>({ page: 1, pageSize: PAGE_SIZE });

  // Modal states
  const [editUserModal, setEditUserModal] = useState<UserProfile | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editUserSubmitting, setEditUserSubmitting] = useState(false);
  const [editUserError, setEditUserError] = useState<{ message: string }>({ message: "" });

  // Ban/Delete confirms
  const [dangerActionState, setDangerActionState] = useState<{
    user: UserProfile | null;
    intent: "ban" | "unban" | "delete" | null;
    visible: boolean;
    submitting: boolean;
    error: string;
  }>({
    user: null,
    intent: null,
    visible: false,
    submitting: false,
    error: "",
  });

  // QueryClient (for refetching list)
  const queryClient = useQueryClient();

  // ---- 1. USERS TABLE FETCH

  const usersQueryKey = [
    "admin-users",
    {
      page: pagination.page,
      page_size: pagination.pageSize,
      role: filters.role,
      status: filters.status,
      search: filters.search,
    },
  ];

  const fetchUsers = async ({
    queryKey,
  }: {
    queryKey: any[];
  }): Promise<{ users: UserProfile[]; total: number }> => {
    const [, paramsObj] = queryKey;
    const params: Record<string, string | number> = {};
    if (paramsObj.role) params.role = paramsObj.role;
    if (paramsObj.status) params.status = paramsObj.status;
    if (paramsObj.search && paramsObj.search.trim()) params.search = paramsObj.search.trim();
    if (paramsObj.page) params.page = paramsObj.page;
    // No page_size param (if not implemented by backend, omit) - backend default is likely PAGE_SIZE
    const url = `${apiBase}/admin/users`;
    const { data } = await axios.get(url, {
      params,
      headers: auth_token ? { Authorization: `Bearer ${auth_token.token}` } : undefined,
    });
    // Response: { users: UserProfile[], total: number }
    return data;
  };

  const {
    data: usersData,
    isLoading: tableLoading,
    isError: tableHasError,
    error: tableErrorRaw,
    refetch: refetchUsers,
  } = useQuery<{ users: UserProfile[]; total: number }, AxiosError>(
    {
      queryKey: usersQueryKey,
      queryFn: fetchUsers,
      keepPreviousData: true,
      staleTime: 30000,
      enabled: !!auth_token, // don't run until auth
    }
  );

  // ---- 2. EDIT USER MUTATION

  const editUserMutation = useMutation<
    UserProfile,
    AxiosError,
    { user_id: string; updates: UpdateUserInput }
  >({
    mutationFn: async ({ user_id, updates }) => {
      // PATCH /admin/users/{user_id}
      const url = `${apiBase}/admin/users/${user_id}`;
      // Only send changed fields
      const body: Record<string, any> = { ...updates };
      delete body.user_id;
      const { data } = await axios.patch(url, body, {
        headers: auth_token ? { Authorization: `Bearer ${auth_token.token}` } : undefined,
      });
      return data; // Updated user
    },
    onSuccess: () => {
      setEditModalVisible(false);
      setEditUserModal(null);
      setEditUserError({ message: "" });
      refetchUsers();
    },
    onError: (err) => {
      setEditUserSubmitting(false);
      setEditUserError({ message: getErrorMessage(err) });
    },
  });

  // ---- 3. BAN/UNBAN MUTATION

  const banUserMutation = useMutation<
    UserProfile,
    AxiosError,
    { user_id: string; is_active: boolean }
  >({
    mutationFn: async ({ user_id, is_active }) => {
      const url = `${apiBase}/admin/users/${user_id}`;
      const { data } = await axios.patch(url, { is_active }, {
        headers: auth_token ? { Authorization: `Bearer ${auth_token.token}` } : undefined,
      });
      return data;
    },
    onSuccess: () => {
      setDangerActionState({ user: null, intent: null, visible: false, submitting: false, error: "" });
      refetchUsers();
    },
    onError: (err) => {
      setDangerActionState(state => ({ ...state, submitting: false, error: getErrorMessage(err) }));
    },
  });

  // ---- 4. DELETE MUTATION

  const deleteUserMutation = useMutation<void, AxiosError, { user_id: string }>({
    mutationFn: async ({ user_id }) => {
      const url = `${apiBase}/admin/users/${user_id}`;
      await axios.delete(url, {
        headers: auth_token ? { Authorization: `Bearer ${auth_token.token}` } : undefined,
      });
    },
    onSuccess: () => {
      setDangerActionState({ user: null, intent: null, visible: false, submitting: false, error: "" });
      refetchUsers();
    },
    onError: (err) => {
      setDangerActionState(state => ({ ...state, submitting: false, error: getErrorMessage(err) }));
    },
  });

  // ---- 5. LAST ACTIVE (from updated_at or created_at if missing)
  function fmtDate(unix: number | undefined | null) {
    if (!unix) return "";
    const d = new Date(unix * 1000);
    return d.toLocaleString();
  }

  // ---- 6. Modal input state (edit)
  const [editFields, setEditFields] = useState<Partial<UpdateUserInput>>({});
  useEffect(() => {
    if (editUserModal) {
      setEditFields({
        user_id: editUserModal.user_id,
        name: editUserModal.name,
        role: editUserModal.role as UpdateUserInput["role"],
        profile_photo_url: editUserModal.profile_photo_url || "",
        phone: editUserModal.phone || "",
        is_verified_host:
          typeof editUserModal.is_verified_host === "boolean"
            ? editUserModal.is_verified_host
            : undefined,
      });
      setEditUserError({ message: "" });
    } else {
      setEditFields({});
      setEditUserError({ message: "" });
    }
  }, [editUserModal]);

  // ---- 7. Handler: open edit modal
  function handleOpenEditUserModal(u: UserProfile) {
    setEditUserModal(u);
    setEditModalVisible(true);
  }
  function handleCloseEditUserModal() {
    setEditModalVisible(false);
    setEditUserModal(null);
    setEditUserError({ message: "" });
    setEditUserSubmitting(false);
  }
  function handleEditFieldChange(field: keyof UpdateUserInput, value: any) {
    setEditFields((prev) => ({ ...prev, [field]: value }));
    setEditUserError({ message: "" });
  }
  function handleEditUserSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUserModal) return;
    setEditUserSubmitting(true);
    // Only dirty fields, but must include at least one
    let toSend: UpdateUserInput = { user_id: editUserModal.user_id };
    Object.entries(editFields).forEach(([k, v]) => {
      if (v !== undefined && v !== null) (toSend as any)[k] = v;
    });
    // Validate with Zod before submit
    const parsed = updateUserInputSchema.safeParse(toSend);
    if (!parsed.success) {
      setEditUserSubmitting(false);
      setEditUserError({
        message: parsed.error.errors.map((err) => err.message).join("; "),
      });
      return;
    }
    editUserMutation.mutate(
      { user_id: editUserModal.user_id, updates: toSend },
      { onSettled: () => setEditUserSubmitting(false) }
    );
  }

  // ---- 8. Handler: ban/unban/delete
  function openDangerAction(user: UserProfile, intent: "ban" | "unban" | "delete") {
    setDangerActionState({ user, intent, visible: true, submitting: false, error: "" });
  }
  function closeDangerAction() {
    setDangerActionState({ user: null, intent: null, visible: false, submitting: false, error: "" });
  }

  // double-confirm: click yes/confirm: triggers mutation
  function handleDangerAction() {
    if (!dangerActionState.user || !dangerActionState.intent) return;
    setDangerActionState((s) => ({ ...s, submitting: true, error: "" }));
    if (dangerActionState.intent === "ban" || dangerActionState.intent === "unban") {
      banUserMutation.mutate({
        user_id: dangerActionState.user.user_id,
        is_active: dangerActionState.intent === "unban",
      });
    } else if (dangerActionState.intent === "delete") {
      deleteUserMutation.mutate({ user_id: dangerActionState.user.user_id });
    }
  }

  // ---- 9. Table: Pagination
  const total = usersData?.total || 0;
  const pageCount = Math.max(Math.ceil(total / pagination.pageSize), 1);
  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > pageCount) return;
    setPagination((old) => ({ ...old, page: newPage }));
  }

  // ---- 10. Table Empty/Error
  const users = usersData?.users || [];
  const tableError =
    (tableHasError && getErrorMessage(tableErrorRaw)) ||
    (users.length === 0 && !tableLoading
      ? "No users found for the given criteria."
      : "");

  // ---- 11. Error Boundary
  let errorBoundary: string | null = null;
  try {
    // render section
  } catch (e: any) {
    errorBoundary = e?.message ?? "Uncaught error.";
  }

  return (
    <>
      <div className="px-8 py-8 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Admin – Users Management</h1>
        {/* Filters */}
        <form
          className="flex flex-col md:flex-row items-start md:items-end gap-4 mb-6"
          onSubmit={e => {
            e.preventDefault();
            setPagination(p => ({ ...p, page: 1 }));
            refetchUsers();
          }}
        >
          <label className="flex flex-col text-sm font-medium">
            Role
            <select
              className="rounded border px-2 py-1 mt-1"
              value={filters.role}
              onChange={e => setFilters(f => ({ ...f, role: e.target.value }))}
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium">
            Status
            <select
              className="rounded border px-2 py-1 mt-1"
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            >
              {STATUSES.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium flex-1 min-w-[180px]">
            Search (name/email)
            <input
              className="rounded border px-2 py-1 mt-1"
              type="search"
              value={filters.search}
              placeholder="Type to search"
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </label>
          <button
            type="submit"
            className="rounded bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 font-semibold mt-2 md:mt-0"
            disabled={tableLoading}
          >
            Filter
          </button>
          <button
            type="button"
            className="ml-2 rounded bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm"
            onClick={() => {
              setFilters({ role: "", status: "", search: "" });
              setPagination(p => ({ ...p, page: 1 }));
              refetchUsers();
            }}
            disabled={tableLoading}
          >
            Reset
          </button>
        </form>

        {/* Table/errors */}
        {tableError && (
          <div className="bg-red-100 text-red-800 px-4 py-3 mb-4 rounded border border-red-300">
            {tableError}
          </div>
        )}
        <div className="overflow-x-auto bg-white shadow rounded-md border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-sm">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Photo</th>
                <th className="px-4 py-3 text-left font-bold">Name</th>
                <th className="px-4 py-3 text-left font-bold">Email</th>
                <th className="px-4 py-3 text-left font-bold">Role</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3 text-left font-bold">Last Active</th>
                <th className="px-4 py-3 text-left font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {users.length === 0 && !tableLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    No users found.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.user_id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-2">
                    <img
                      src={
                        u.profile_photo_url ||
                        `https://picsum.photos/seed/user_${u.user_id}/48`
                      }
                      alt={u.name}
                      className="w-10 h-10 rounded-full object-cover border"
                    />
                  </td>
                  <td className="px-4 py-2 font-semibold">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2 capitalize">
                    {u.role === "guest_host" ? "Guest+Host" : u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        "inline-block px-2 py-1 rounded text-xs font-semibold " +
                        (u.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700")
                      }
                    >
                      {u.is_active ? "Active" : "Banned"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {fmtDate((u.updated_at || u.created_at))}
                  </td>
                  <td className="px-4 py-2 flex flex-row gap-1">
                    <button
                      className="px-3 py-1 bg-blue-600 rounded text-white mr-1 hover:bg-blue-700 transition text-xs"
                      onClick={() => handleOpenEditUserModal(u)}
                    >
                      Edit
                    </button>
                    {u.is_active ? (
                      <button
                        className="px-3 py-1 bg-yellow-100 rounded text-yellow-700 border border-yellow-300 hover:bg-yellow-200 transition text-xs"
                        onClick={() => openDangerAction(u, "ban")}
                      >
                        Ban
                      </button>
                    ) : (
                      <button
                        className="px-3 py-1 bg-green-100 rounded text-green-700 border border-green-300 hover:bg-green-200 transition text-xs"
                        onClick={() => openDangerAction(u, "unban")}
                      >
                        Unban
                      </button>
                    )}
                    <button
                      className="px-3 py-1 bg-red-600 rounded text-white hover:bg-red-700 transition text-xs"
                      onClick={() => openDangerAction(u, "delete")}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {tableLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-blue-600 font-medium">
                    Loading users...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {pageCount > 1 && (
          <div className="flex flex-row flex-wrap justify-between items-center mt-6 mb-2 gap-2">
            <div className="text-sm text-gray-500">
              Page {pagination.page} of {pageCount}, Total {total} users
            </div>
            <div className="flex flex-row gap-2">
              <button
                onClick={() => handlePageChange(1)}
                disabled={pagination.page === 1}
                className="px-2 py-1 rounded border text-xs bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
              >
                {"<<"} First
              </button>
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="px-2 py-1 rounded border text-xs bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
              >
                {"<"}
              </button>
              <span className="px-2 py-1">{pagination.page}</span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pageCount}
                className="px-2 py-1 rounded border text-xs bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
              >
                {">"}
              </button>
              <button
                onClick={() => handlePageChange(pageCount)}
                disabled={pagination.page === pageCount}
                className="px-2 py-1 rounded border text-xs bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
              >
                {"Last >>"}
              </button>
            </div>
          </div>
        )}

        {/* EDIT USER MODAL */}
        {editModalVisible && editUserModal && (
          <div className="fixed z-50 inset-0 flex items-center justify-center bg-black bg-opacity-30">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-md px-6 py-8 relative">
              <h3 className="text-lg font-bold mb-4">Edit User: {editUserModal.name}</h3>
              {editUserError.message && (
                <div className="bg-red-100 text-red-700 px-2 py-2 rounded text-sm mb-2">
                  {editUserError.message}
                </div>
              )}
              <form onSubmit={handleEditUserSubmit} className="space-y-3">
                <label className="block">
                  <span className="block text-sm font-medium">Name</span>
                  <input
                    className="mt-1 rounded border px-2 py-1 w-full"
                    type="text"
                    value={editFields.name ?? ""}
                    onChange={e => handleEditFieldChange("name", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium">Role</span>
                  <select
                    className="mt-1 rounded border px-2 py-1 w-full"
                    value={editFields.role ?? ""}
                    onChange={e => handleEditFieldChange("role", e.target.value)}
                  >
                    {ROLES.filter(r => r.value).map(r => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-sm font-medium">Phone</span>
                  <input
                    className="mt-1 rounded border px-2 py-1 w-full"
                    type="text"
                    value={editFields.phone ?? ""}
                    onChange={e => handleEditFieldChange("phone", e.target.value)}
                  />
                </label>
                <label className="block flex items-center mt-2 gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(editFields.is_verified_host)}
                    onChange={e =>
                      handleEditFieldChange("is_verified_host", e.target.checked)
                    }
                  />
                  <span className="text-sm font-medium">Verified Host</span>
                </label>
                <div className="flex flex-row gap-2 mt-4">
                  <button
                    type="submit"
                    disabled={editUserSubmitting}
                    className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-blue-200"
                  >
                    {editUserSubmitting ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={editUserSubmitting}
                    className="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                    onClick={handleCloseEditUserModal}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DANGEROUS ACTION MODAL */}
        {dangerActionState.visible && dangerActionState.user && (
          <div className="fixed z-50 inset-0 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-sm px-6 py-8 relative">
              <h3 className="text-lg font-bold mb-4">
                {dangerActionState.intent === "ban" &&
                  "Confirm Ban User"}
                {dangerActionState.intent === "unban" &&
                  "Confirm Unban User"}
                {dangerActionState.intent === "delete" &&
                  "Delete User – Are you sure?"}
              </h3>
              <div className="flex items-center gap-3 mb-4">
                <img
                  src={
                    dangerActionState.user.profile_photo_url ||
                    `https://picsum.photos/seed/user_${dangerActionState.user.user_id}/48`
                  }
                  alt={dangerActionState.user.name}
                  className="w-12 h-12 rounded-full border"
                />
                <div>
                  <div className="font-semibold">{dangerActionState.user.name}</div>
                  <div className="text-gray-500 text-xs">{dangerActionState.user.email}</div>
                </div>
              </div>
              <div className="mb-6 text-sm text-gray-600">
                {dangerActionState.intent === "ban" && (
                  <>Banning will immediately disable this user's ability to log in and use the platform.</>
                )}
                {dangerActionState.intent === "unban" && (
                  <>This user will be restored and regain platform access.</>
                )}
                {dangerActionState.intent === "delete" && (
                  <span>
                    This <span className="font-bold text-red-600">cannot</span> be undone. All bookings, content, and profile will be deleted/disabled.
                  </span>
                )}
              </div>
              {dangerActionState.error && (
                <div className="bg-red-100 text-red-700 px-2 py-2 rounded text-sm mb-2">
                  {dangerActionState.error}
                </div>
              )}
              <div className="flex flex-row gap-3">
                <button
                  className={`px-4 py-2 rounded font-bold ${
                    dangerActionState.intent === "delete"
                      ? "bg-red-700 text-white hover:bg-red-800"
                      : "bg-yellow-600 text-white hover:bg-yellow-700"
                  } disabled:opacity-70`}
                  onClick={handleDangerAction}
                  disabled={dangerActionState.submitting}
                >
                  {dangerActionState.submitting
                    ? (dangerActionState.intent === "delete" ? "Deleting..." : "Saving...")
                    : (dangerActionState.intent === "delete"
                      ? "Delete"
                      : (dangerActionState.intent === "ban" ? "Ban User" : "Unban User"))}
                </button>
                <button
                  className="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                  disabled={dangerActionState.submitting}
                  onClick={closeDangerAction}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Error boundary fallback if any */}
      {errorBoundary && (
        <div className="absolute inset-0 flex items-center justify-center z-[999] bg-white bg-opacity-90">
          <div className="p-8 bg-white rounded shadow border text-center">
            <div className="text-2xl mb-3 text-red-800">Unexpected Error</div>
            <p className="text-gray-700">{errorBoundary}</p>
            <Link
              className="block mt-4 text-blue-600 underline"
              to="/admin"
            >
              Return to Admin Dashboard
            </Link>
          </div>
        </div>
      )}
    </>
  );
};

export default UV_Admin_Users;