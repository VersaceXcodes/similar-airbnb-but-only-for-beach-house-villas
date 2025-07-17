import React, { useState, useMemo } from "react";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/main";
import { z } from "zod";
import { Link } from "react-router-dom";

// Zod types
// ---- ZOD TypeScript Types Construction ---- //
type UserShort = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  profile_photo_url: string | null;
  is_active: boolean;
  is_verified_host?: boolean | null;
  notification_settings: any;
  payout_method_details?: string | null;
};
type VillaSummary = {
  villa_id: string;
  name: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  cover_photo_url: string;
  short_description: string;
  rating: number;
  review_count: number;
  price_per_night: number;
  is_instant_book: boolean;
  max_occupancy: number;
  amenities: any[];
  status: string;
  host: UserShort;
};
type VillaListResponse = {
  villas: VillaSummary[];
  total: number;
  page: number;
  page_size: number;
};
// AdminAction type (for logs)
type AdminAction = {
  admin_action_id: string;
  admin_user_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  notes: string | null;
  created_at: number;
};

// Controls
const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Active", value: "active" },
  { label: "Pending", value: "pending" },
  { label: "Inactive", value: "inactive" },
  { label: "Rejected", value: "rejected" },
  { label: "Removed", value: "removed" },
];

// Error boundary
class TableErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    // Could hook into global error reporting here
    // eslint-disable-next-line no-console
    console.error("Admin Listing Table Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-700 bg-red-100 rounded">
          <div className="font-bold">Something went wrong rendering the table.</div>
          <div className="text-xs">{String(this.state.error?.message || this.state.error || "")}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Util
function formatDate(ts: number) {
  if (!ts) return "-";
  try {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString();
  } catch {
    return "-";
  }
}

// Main component
const UV_Admin_Listings: React.FC = () => {
  // Global/state
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);

  // Admin view-filters for search, etc.
  const [filters, setFilters] = useState<{ status: string; host: string; search: string }>({
    status: "",
    host: "",
    search: "",
  });
  const [pagination, setPagination] = useState<{ page: number; pageSize: number }>({
    page: 1,
    pageSize: 25,
  });
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());
  const [tableError, setTableError] = useState<{ message: string }>({ message: "" });

  // Editing/approve/reject dialogs
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editListing, setEditListing] = useState<VillaSummary | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<{ message: string }>({ message: "" });

  const [approveLoadingId, setApproveLoadingId] = useState<string | null>(null);
  const [rejectLoadingId, setRejectLoadingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");

  const [deactivateLoadingId, setDeactivateLoadingId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  // Batch action in progress overlays
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [batchActionError, setBatchActionError] = useState<{ message: string }>({ message: "" });

  // History modal
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyModalEvents, setHistoryModalEvents] = useState<AdminAction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<{ message: string }>({ message: "" });
  const [historyForVillaName, setHistoryForVillaName] = useState<string>("");

  // Query client
  const queryClient = useQueryClient();

  // QUERY: Fetch admin villa listings
  const {
    data: villaData,
    isLoading: tableLoading,
    error: queryError,
    refetch: refetchListings,
  } = useQuery<VillaListResponse, Error>(
    [
      "admin_listings",
      filters.status,
      filters.host,
      filters.search,
      pagination.page,
      pagination.pageSize,
    ],
    async () => {
      setTableError({ message: "" });
      const url =
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/admin/listings` +
        `?status=${encodeURIComponent(filters.status || "")}` +
        `&host=${encodeURIComponent(filters.host || "")}` +
        `&search=${encodeURIComponent(filters.search)}` +
        `&page=${pagination.page}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${auth_token?.token}` },
      });
      return res.data;
    },
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      onError: (err: any) => {
        setTableError({ message: err?.response?.data?.message || err.message || "Unknown error." });
      },
    }
  );

  const listings = villaData?.villas || [];
  const listingsTotal = villaData?.total || 0;
  const totalPages = Math.ceil(listingsTotal / pagination.pageSize);

  // --- Mutations ---
  // Approve
  const approveMutation = useMutation<
    any,
    Error,
    { villa_id: string }
  >(
    async ({ villa_id }) => {
      setApproveLoadingId(villa_id);
      return (
        await axios.patch(
          `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/admin/listings/${villa_id}`,
          { status: "active" },
          { headers: { Authorization: `Bearer ${auth_token?.token}` } }
        )
      ).data;
    },
    {
      onSuccess: () => {
        setApproveLoadingId(null);
        refetchListings();
      },
      onError: err => {
        setTableError({ message: err?.response?.data?.message || err.message });
        setApproveLoadingId(null);
      },
    }
  );

  // Reject
  const rejectMutation = useMutation<
    any,
    Error,
    { villa_id: string; admin_notes: string }
  >(
    async ({ villa_id, admin_notes }) => {
      setRejectLoadingId(villa_id);
      return (
        await axios.patch(
          `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/admin/listings/${villa_id}`,
          { status: "rejected", admin_notes },
          { headers: { Authorization: `Bearer ${auth_token?.token}` } }
        )
      ).data;
    },
    {
      onSuccess: () => {
        setRejectLoadingId(null);
        setRejectReason("");
        refetchListings();
      },
      onError: err => {
        setTableError({ message: err?.response?.data?.message || err.message });
        setRejectLoadingId(null);
      },
    }
  );

  // Deactivate
  const deactivateMutation = useMutation<
    any,
    Error,
    { villa_id: string }
  >(
    async ({ villa_id }) => {
      setDeactivateLoadingId(villa_id);
      return (
        await axios.patch(
          `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/admin/listings/${villa_id}`,
          { status: "inactive" },
          { headers: { Authorization: `Bearer ${auth_token?.token}` } }
        )
      ).data;
    },
    {
      onSuccess: () => {
        setDeactivateLoadingId(null);
        refetchListings();
      },
      onError: err => {
        setTableError({ message: err?.response?.data?.message || err.message });
        setDeactivateLoadingId(null);
      },
    }
  );

  // Delete
  const deleteMutation = useMutation<
    any,
    Error,
    { villa_id: string }
  >(
    async ({ villa_id }) => {
      setDeleteLoadingId(villa_id);
      await axios.delete(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/admin/listings/${villa_id}`,
        { headers: { Authorization: `Bearer ${auth_token?.token}` } }
      );
    },
    {
      onSuccess: () => {
        setDeleteLoadingId(null);
        refetchListings();
      },
      onError: err => {
        setTableError({ message: err?.response?.data?.message || err.message });
        setDeleteLoadingId(null);
      },
    }
  );

  // Edit
  const editMutation = useMutation<
    any,
    Error,
    { villa_id: string; data: Partial<VillaSummary & { admin_notes?: string }> }
  >(
    async ({ villa_id, data }) => {
      setEditLoading(true);
      return (
        await axios.patch(
          `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/admin/listings/${villa_id}`,
          { ...data },
          { headers: { Authorization: `Bearer ${auth_token?.token}` } }
        )
      ).data;
    },
    {
      onSuccess: () => {
        setEditLoading(false);
        setEditModalVisible(false);
        refetchListings();
      },
      onError: err => {
        setEditError({ message: err?.response?.data?.message || err.message });
        setEditLoading(false);
      },
    }
  );

  // Batch Action
  async function runBatchAction(action: "approve" | "deactivate" | "delete") {
    if (batchSelection.size === 0) return;
    setBatchActionLoading(true);
    setBatchActionError({ message: "" });
    try {
      if (action === "delete") {
        await Promise.all(
          Array.from(batchSelection).map((villa_id) =>
            axios.delete(
              `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/admin/listings/${villa_id}`,
              { headers: { Authorization: `Bearer ${auth_token?.token}` } }
            )
          )
        );
      } else if (action === "approve" || action === "deactivate") {
        const status = action === "approve" ? "active" : "inactive";
        await Promise.all(
          Array.from(batchSelection).map((villa_id) =>
            axios.patch(
              `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/admin/listings/${villa_id}`,
              { status },
              { headers: { Authorization: `Bearer ${auth_token?.token}` } }
            )
          )
        );
      }
      setBatchActionLoading(false);
      setBatchSelection(new Set());
      refetchListings();
    } catch (err:any) {
      setBatchActionLoading(false);
      setBatchActionError({ message: err?.response?.data?.message || err.message });
    }
  }

  // Listing history modal
  function openHistoryModal(villa: VillaSummary) {
    setHistoryForVillaName(villa.name);
    setHistoryModalVisible(true);
    setHistoryLoading(true);
    setHistoryError({ message: "" });
    axios
      .get(
        `${
          import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
        }/admin/actions?target_type=villa&target_id=${villa.villa_id}`,
        { headers: { Authorization: `Bearer ${auth_token?.token}` } }
      )
      .then((res) => {
        setHistoryModalEvents(res.data.actions || []);
        setHistoryLoading(false);
      })
      .catch((err) => {
        setHistoryError({ message: err?.response?.data?.message || err.message });
        setHistoryLoading(false);
      });
  }

  // Filter/search/host controls
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFilters({ ...filters, [e.target.name]: e.target.value });
    setPagination((p) => ({ ...p, page: 1 }));
  }
  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setFilters({ ...filters, [e.target.name]: e.target.value });
    setPagination((p) => ({ ...p, page: 1 }));
  }
  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    refetchListings();
  }

  // Pagination controls
  function handlePageChange(page: number) {
    setPagination((p) => ({ ...p, page }));
  }

  // Table row selection for batch
  function handleRowCheckbox(villa_id: string, checked: boolean) {
    setBatchSelection((sel) => {
      const n = new Set(sel);
      if (checked) n.add(villa_id);
      else n.delete(villa_id);
      return n;
    });
  }
  function handleAllCheckbox(checked: boolean) {
    if (checked) {
      setBatchSelection(new Set(listings.map((l) => l.villa_id)));
    } else {
      setBatchSelection(new Set());
    }
  }
  const allChecked = useMemo(
    () => listings.length > 0 && listings.every((l) => batchSelection.has(l.villa_id)),
    [listings, batchSelection]
  );

  // Render
  return (
    <>
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-2">Villa Listings (Admin)</h1>
            <div className="text-gray-600">Total: <b>{listingsTotal}</b></div>
          </div>
          <form
            className="flex flex-col md:flex-row gap-2 items-end"
            onSubmit={handleSearchSubmit}
          >
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select
                className="border px-2 py-1 rounded w-32"
                name="status"
                value={filters.status}
                onChange={handleSelectChange}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Host (email, name, or ID)</label>
              <input
                className="border px-2 py-1 rounded w-40"
                name="host"
                type="text"
                value={filters.host}
                onChange={handleInputChange}
                placeholder="Search for host"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Villa Name</label>
              <input
                className="border px-2 py-1 rounded w-40"
                name="search"
                type="text"
                value={filters.search}
                onChange={handleInputChange}
                placeholder="Search by name"
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700"
            >
              Filter
            </button>
          </form>
        </div>

        {tableError.message && (
          <div className="my-2 rounded bg-red-100 text-red-700 px-4 py-2">
            {tableError.message}
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-2 items-center">
          <button
            className={
              "bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50" +
              (batchSelection.size === 0 || batchActionLoading ? " opacity-50 cursor-not-allowed" : "")
            }
            title="Approve selected"
            disabled={batchSelection.size === 0 || batchActionLoading}
            onClick={() => {
              if (
                window.confirm(
                  `Approve ${batchSelection.size} listing(s)? Status will be set to 'active'.`
                )
              ) {
                runBatchAction("approve");
              }
            }}
          >
            Approve
          </button>
          <button
            className={
              "bg-yellow-600 text-white px-3 py-1 rounded disabled:opacity-50" +
              (batchSelection.size === 0 || batchActionLoading ? " opacity-50 cursor-not-allowed" : "")
            }
            title="Deactivate selected"
            disabled={batchSelection.size === 0 || batchActionLoading}
            onClick={() => {
              if (
                window.confirm(
                  `Deactivate ${batchSelection.size} listing(s)? Status will be set to 'inactive'.`
                )
              ) {
                runBatchAction("deactivate");
              }
            }}
          >
            Deactivate
          </button>
          <button
            className={
              "bg-red-700 text-white px-3 py-1 rounded disabled:opacity-50" +
              (batchSelection.size === 0 || batchActionLoading ? " opacity-50 cursor-not-allowed" : "")
            }
            title="Delete selected"
            disabled={batchSelection.size === 0 || batchActionLoading}
            onClick={() => {
              if (
                window.confirm(
                  `Are you sure you want to DELETE ${batchSelection.size} listing(s)? This operation cannot be undone.`
                )
              ) {
                runBatchAction("delete");
              }
            }}
          >
            Delete
          </button>
          {batchActionError.message && (
            <span className="ml-3 text-red-600 text-sm">{batchActionError.message}</span>
          )}
        </div>

        <TableErrorBoundary>
          <div className="overflow-x-auto border rounded bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b text-left">
                <tr>
                  <th className="p-2 w-6">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={allChecked}
                      onChange={(e) => handleAllCheckbox(e.target.checked)}
                    />
                  </th>
                  <th className="p-2 font-semibold">Name</th>
                  <th className="p-2 font-semibold">Host</th>
                  <th className="p-2 font-semibold">Status</th>
                  <th className="p-2 font-semibold">Created</th>
                  <th className="p-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-gray-400">
                      Loading listings...
                    </td>
                  </tr>
                ) : listings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-400">
                      No listings found.
                    </td>
                  </tr>
                ) : (
                  listings.map((villa) => (
                    <tr key={villa.villa_id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          className="form-checkbox"
                          checked={batchSelection.has(villa.villa_id)}
                          onChange={(e) =>
                            handleRowCheckbox(villa.villa_id, e.target.checked)
                          }
                          disabled={batchActionLoading}
                        />
                      </td>
                      <td className="p-2 flex items-center gap-2">
                        <img
                          src={villa.cover_photo_url || `https://picsum.photos/seed/villa${villa.villa_id}/48`}
                          alt={villa.name}
                          className="w-10 h-10 object-cover rounded shadow"
                        />
                        <span className="font-bold">{villa.name}</span>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={
                              villa.host.profile_photo_url ||
                              `https://picsum.photos/seed/host${villa.host.user_id}/32`
                            }
                            alt={villa.host.name}
                            className="w-7 h-7 rounded-full bg-gray-100 inline-block"
                          />
                          <div>
                            <span className="block font-medium">{villa.host.name}</span>
                            <a
                              href={`mailto:${villa.host.email}`}
                              className="text-xs text-blue-600"
                              tabIndex={-1}
                            >
                              {villa.host.email}
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="p-2">
                        <span
                          className={
                            villa.status === "active"
                              ? "px-2 py-1 text-green-800 bg-green-100 rounded text-xs font-bold"
                              : villa.status === "pending"
                              ? "px-2 py-1 text-yellow-900 bg-yellow-100 rounded text-xs font-bold"
                              : villa.status === "rejected"
                              ? "px-2 py-1 text-red-900 bg-red-100 rounded text-xs font-bold"
                              : villa.status === "inactive"
                              ? "px-2 py-1 text-gray-800 bg-gray-200 rounded text-xs font-bold"
                              : villa.status === "removed"
                              ? "px-2 py-1 text-gray-500 bg-gray-100 rounded text-xs font-bold"
                              : ""
                          }
                        >
                          {villa.status.charAt(0).toUpperCase() + villa.status.slice(1)}
                        </span>
                      </td>
                      <td className="p-2">{formatDate(villa["created_at"])}</td>
                      <td className="p-2 space-x-1 whitespace-nowrap w-[184px]">
                        {/* Approve/Reject (pending) */}
                        {villa.status === "pending" ? (
                          <>
                            <button
                              className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                              disabled={approveLoadingId === villa.villa_id}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Approve listing "${villa.name}"? It will go live.`
                                  )
                                )
                                  approveMutation.mutate({ villa_id: villa.villa_id });
                              }}
                            >
                              {approveLoadingId === villa.villa_id ? "Approving..." : "Approve"}
                            </button>
                            <button
                              className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                              disabled={rejectLoadingId === villa.villa_id}
                              onClick={() => {
                                // Open reject modal as simple prompt for note
                                const reason = prompt(
                                  "Reject listing.\nOptionally enter a rejection note (shown to host):",
                                  ""
                                );
                                if (reason !== null) {
                                  rejectMutation.mutate({
                                    villa_id: villa.villa_id,
                                    admin_notes: reason,
                                  });
                                }
                              }}
                            >
                              {rejectLoadingId === villa.villa_id ? "Rejecting..." : "Reject"}
                            </button>
                          </>
                        ) : null}

                        {/* Deactivate (active only) */}
                        {villa.status === "active" ? (
                          <button
                            className="bg-yellow-700 text-white px-2 py-1 rounded text-xs"
                            disabled={deactivateLoadingId === villa.villa_id}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Deactivate listing "${villa.name}"? It will be temporarily removed from search.`
                                )
                              )
                                deactivateMutation.mutate({ villa_id: villa.villa_id });
                            }}
                          >
                            {deactivateLoadingId === villa.villa_id
                              ? "Deactivating..."
                              : "Deactivate"}
                          </button>
                        ) : null}

                        {/* Edit (for any status) */}
                        <button
                          className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
                          onClick={() => {
                            setEditListing(villa);
                            setEditError({ message: "" });
                            setEditModalVisible(true);
                          }}
                        >
                          Edit
                        </button>

                        {/* Delete (any except already removed) */}
                        {villa.status !== "removed" && (
                          <button
                            className="bg-red-700 text-white px-2 py-1 rounded text-xs"
                            disabled={deleteLoadingId === villa.villa_id}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Are you sure you want to permanently DELETE "${villa.name}"? This cannot be undone.`
                                )
                              )
                                deleteMutation.mutate({ villa_id: villa.villa_id });
                            }}
                          >
                            {deleteLoadingId === villa.villa_id ? "Deleting..." : "Delete"}
                          </button>
                        )}

                        {/* Log/history */}
                        <button
                          className="bg-gray-500 text-white px-2 py-1 rounded text-xs"
                          onClick={() => openHistoryModal(villa)}
                          title="History/Logs"
                        >
                          History
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TableErrorBoundary>

        {/* Pagination */}
        <div className="flex items-center justify-between py-4">
          <div>
            Page <b>{pagination.page}</b> of <b>{totalPages || 1}</b>
            <span className="ml-2 text-xs text-gray-500">
              ({listingsTotal} listings)
            </span>
          </div>
          <div className="space-x-1">
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => handlePageChange(1)}
              disabled={pagination.page === 1}
            >
              {"<<"}
            </button>
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => handlePageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page === 1}
            >
              {"<"}
            </button>
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() =>
                handlePageChange(Math.min(totalPages, pagination.page + 1))
              }
              disabled={pagination.page === totalPages || listingsTotal === 0}
            >
              {">"}
            </button>
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => handlePageChange(totalPages)}
              disabled={pagination.page === totalPages || listingsTotal === 0}
            >
              {">>"}
            </button>
          </div>
        </div>
      </div>

      {/* Edit Listing Modal */}
      {editModalVisible && editListing && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex z-50 items-center justify-center">
          <div className="bg-white max-w-lg w-full rounded-lg p-6 shadow-lg">
            <h2 className="font-bold text-lg mb-2">Edit Listing: {editListing.name}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Only allow edit of name, status, and admin_notes for admin
                const form = e.target as HTMLFormElement;
                const elements = form.elements as typeof form.elements & {
                  name: HTMLInputElement;
                  status: HTMLSelectElement;
                  admin_notes: HTMLInputElement;
                };
                const data: any = {
                  name: elements.name.value,
                  status: elements.status.value,
                  admin_notes: elements.admin_notes.value,
                };
                editMutation.mutate({
                  villa_id: editListing.villa_id,
                  data,
                });
              }}
            >
              <div>
                <label className="text-xs block font-semibold mb-1">Name</label>
                <input
                  type="text"
                  name="name"
                  className="border px-2 py-1 rounded w-full"
                  defaultValue={editListing.name}
                  required
                />
              </div>
              <div className="mt-2">
                <label className="text-xs block font-semibold mb-1">Status</label>
                <select
                  name="status"
                  className="border px-2 py-1 rounded w-full"
                  defaultValue={editListing.status}
                  required
                >
                  {STATUS_OPTIONS.filter(opt => opt.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2">
                <label className="text-xs block font-semibold mb-1">Admin Notes (Internal)</label>
                <input
                  name="admin_notes"
                  className="border px-2 py-1 rounded w-full"
                  defaultValue={""}
                  placeholder="Notes (not sent to host)"
                />
              </div>
              {editError.message && (
                <div className="my-2 text-red-600">{editError.message}</div>
              )}
              <div className="flex justify-between mt-4 gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalVisible(false)}
                  className="px-4 py-1 bg-gray-300 rounded hover:bg-gray-400"
                  disabled={editLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1 bg-blue-700 text-white rounded hover:bg-blue-900"
                  disabled={editLoading}
                >
                  {editLoading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Listing History Modal */}
      {historyModalVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex z-50 items-center justify-center">
          <div className="bg-white max-w-lg w-full rounded-lg p-6 shadow-lg overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-bold text-lg">History: {historyForVillaName}</h2>
              <button
                className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                onClick={() => setHistoryModalVisible(false)}
              >
                Close
              </button>
            </div>
            {historyLoading ? (
              <div className="py-8 text-gray-400 text-center">Loading audit log...</div>
            ) : historyError.message ? (
              <div className="text-red-600">{historyError.message}</div>
            ) : historyModalEvents.length === 0 ? (
              <div className="py-8 text-gray-400 text-center">No actions found.</div>
            ) : (
              <ul className="divide-y">
                {historyModalEvents.map((evt) => (
                  <li key={evt.admin_action_id} className="py-2 px-1">
                    <span className="text-xs text-gray-400 mr-2">
                      {formatDate(evt.created_at)}
                    </span>
                    <span className="font-semibold text-blue-900">
                      {evt.action_type.replace(/_/g, " ")}
                    </span>
                    {evt.notes && (
                      <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{evt.notes}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default UV_Admin_Listings;