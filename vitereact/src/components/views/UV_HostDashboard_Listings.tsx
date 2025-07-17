import React, { useState, useMemo } from "react";
import axios from "axios";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/main";

// --- Types, schemas from shared (inline locally if import is blocked) ---
type UserShort = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  profile_photo_url: string | null;
  is_active: boolean;
  is_verified_host?: boolean | null;
  notification_settings: Record<string, any>;
  payout_method_details?: string | null;
};

type Amenity = {
  amenity_id: string;
  name: string;
  icon_url: string | null;
  key: string;
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
  amenities: Amenity[];
  status: string;
  host: UserShort;
};

// Responses
interface VillaListResponse {
  villas: VillaSummary[];
  total: number;
  page: number;
  page_size: number;
}

type VillaUpdatePayload = Partial<{
  name: string;
  short_description: string;
  long_description: string;
  address: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  max_occupancy: number;
  is_instant_book: boolean;
  base_price_per_night: number;
  minimum_stay_nights: number;
  security_deposit: number | null;
  cleaning_fee: number | null;
  service_fee: number | null;
  status: string;
  photos: any[];
  amenities: string[];
  rules: any[];
  admin_notes: string | null;
}>;

// For modals (confirmation)
interface ConfirmDialogState {
  visible: boolean;
  villa_id: string | null;
  villa_name: string | null;
  action: "delete" | "status" | null;
  statusToSet?: string;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Main View Component
const UV_HostDashboard_Listings: React.FC = () => {
  // Store (user + token selectors)
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const set_error_banner = useAppStore((s) => s.set_error_banner);

  // Local State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    visible: false,
    villa_id: null,
    villa_name: null,
    action: null,
  });
  const [listingsError, setListingsError] = useState<string>("");

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Auth Guard
  React.useEffect(() => {
    if (!user || (user.role !== "host" && user.role !== "guest_host")) {
      // Don't have access - route to error
      navigate("/error", { replace: true });
    }
  }, [user, navigate]);

  // Query: Fetch all host villas
  const villasQuery = useQuery<VillaListResponse, Error>({
    queryKey: ["host-villas"],
    queryFn: async () => {
      if (!auth_token?.token) throw new Error("Not authenticated");
      const { data } = await axios.get(`${API_BASE_URL}/villas/host`, {
        headers: {
          Authorization: `Bearer ${auth_token.token}`,
        },
      });
      return data;
    },
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 2, // 2min
    onError: (err: any) => {
      setListingsError(
        err?.response?.data?.message || "Could not load your villa listings."
      );
      // Optionally global banner
      set_error_banner({
        message: err?.response?.data?.message || "Villa fetch failed.",
        visible: true,
      });
    },
  });

  // Data: Raw villas list
  const villas: VillaSummary[] = React.useMemo(
    () => villasQuery.data?.villas || [],
    [villasQuery.data]
  );

  // In-memory filter
  const filteredVillas = useMemo(() => {
    let list = villas;
    if (statusFilter !== "all") {
      list = list.filter((v) => v.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.city.toLowerCase().includes(q) ||
          v.country.toLowerCase().includes(q)
      );
    }
    return list;
  }, [villas, statusFilter, searchQuery]);

  // PATCH status (activate/inactivate)
  const statusMutation = useMutation<
    any,
    Error,
    { villa_id: string; status: string }
  >(
    async ({ villa_id, status }) => {
      if (!auth_token?.token) throw new Error("Not authenticated");
      const resp = await axios.patch(
        `${API_BASE_URL}/villa/${villa_id}`,
        { status },
        {
          headers: {
            Authorization: `Bearer ${auth_token.token}`,
          },
        }
      );
      return resp.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["host-villas"] });
      },
      onError: (err: any) => {
        setListingsError(
          err?.response?.data?.message ||
            "Failed to update villa status. Try again."
        );
        set_error_banner({
          message: err?.response?.data?.message || "Villa status update failed.",
          visible: true,
        });
      },
    }
  );

  // DELETE villa (delete button)
  const deleteMutation = useMutation<any, Error, { villa_id: string }>(
    async ({ villa_id }) => {
      if (!auth_token?.token) throw new Error("Not authenticated");
      await axios.delete(`${API_BASE_URL}/villa/${villa_id}`, {
        headers: {
          Authorization: `Bearer ${auth_token.token}`,
        },
      });
      return {};
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["host-villas"] });
      },
      onError: (err: any) => {
        setListingsError(
          err?.response?.data?.message || "Failed to delete villa. Try again."
        );
        set_error_banner({
          message: err?.response?.data?.message || "Villa delete failed.",
          visible: true,
        });
      },
    }
  );

  // Loading state combines all loading states
  const loading =
    villasQuery.isLoading ||
    statusMutation.isLoading ||
    deleteMutation.isLoading;

  // Confirm dialog (for delete/status toggle)
  const openConfirm = (
    villa_id: string,
    villa_name: string,
    action: "delete" | "status",
    statusToSet?: string
  ) => {
    setConfirmDialog({
      visible: true,
      villa_id,
      villa_name,
      action,
      statusToSet,
    });
  };
  const closeConfirm = () => setConfirmDialog({
    visible: false,
    villa_id: null,
    villa_name: null,
    action: null,
    statusToSet: undefined,
  });

  // Confirm dialog action
  const handleConfirm = async () => {
    if (!confirmDialog.villa_id || !confirmDialog.action) return;
    try {
      if (confirmDialog.action === "delete") {
        await deleteMutation.mutateAsync({ villa_id: confirmDialog.villa_id });
      } else if (
        confirmDialog.action === "status" &&
        confirmDialog.statusToSet
      ) {
        await statusMutation.mutateAsync({
          villa_id: confirmDialog.villa_id,
          status: confirmDialog.statusToSet,
        });
      }
    } catch {}
    closeConfirm();
  };

  // -- MAIN RENDER --
  return (
    <>
      {/* Error boundary */}
      <React.Suspense fallback={<div className="p-12 flex items-center justify-center">Loading…</div>}>
        <div className="w-full max-w-7xl mx-auto py-8 px-2 md:px-8">
          {/* Header and actions */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                My Villas
              </h1>
              <div className="text-gray-600 text-sm mt-1">
                Manage your beach villa listings. Add, edit, or remove them here.
              </div>
            </div>
            <div>
              <Link
                to="/host/listings/new"
                className="inline-flex items-center px-5 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold shadow transition"
                data-testid="add-villa-button"
              >
                <span className="text-lg mr-2">+</span>
                New Villa
              </Link>
            </div>
          </div>

          {/* Search/Filter Bar */}
          <div className="flex items-center flex-col md:flex-row gap-3 md:gap-6 mb-6">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, city, or country"
              className="w-full md:w-64 px-3 py-2 rounded border border-gray-300 focus:ring-primary-600 focus:border-primary-500"
              data-testid="search-bar"
            />
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700 text-sm">Status:</span>
              <select
                className="border rounded px-2 py-1 text-gray-700 focus:ring-primary-600 focus:border-primary-500"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as "all" | "active" | "inactive"
                  )
                }
                data-testid="status-filter"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          
          {/* Error Message */}
          {!!listingsError && (
            <div className="mb-4 text-red-600 bg-red-50 border border-red-200 rounded p-3">
              {listingsError}
            </div>
          )}

          {/* Loading Spinner */}
          {loading && (
            <div className="flex justify-center items-center py-16">
              <svg className="animate-spin mr-2 h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                ></path>
              </svg>
              <span className="text-gray-500">Loading villas…</span>
            </div>
          )}

          {/* Onboarding/No Listings CTA */}
          {!loading && filteredVillas.length === 0 && (!searchQuery && statusFilter === "all") && (
            <div className="flex flex-col py-24 items-center justify-center text-center bg-blue-50 rounded">
              <div className="mb-4">
                <img
                  alt="No villas yet"
                  src={`https://picsum.photos/seed/novillacta/120/80`}
                  className="w-30 h-20 object-cover mx-auto rounded"
                  style={{ minHeight: 80 }}
                />
              </div>
              <div className="text-lg font-semibold mb-2 text-gray-700">
                You have not listed any villas yet.
              </div>
              <div className="text-gray-500 mb-4">
                Start renting your first beach villa by adding a new listing!
              </div>
              <Link
                to="/host/listings/new"
                className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded bg-primary-600 hover:bg-primary-700 text-white transition"
              >
                <span className="text-base mr-2">+</span>
                Add First Villa
              </Link>
            </div>
          )}

          {/* Listings grid/table */}
          {!loading && filteredVillas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border text-left text-sm rounded-md overflow-hidden shadow bg-white">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-3 font-semibold text-gray-900">Villa</th>
                    <th className="px-3 py-3 font-semibold text-gray-900">Location</th>
                    <th className="px-3 py-3 font-semibold text-gray-900">Status</th>
                    <th className="px-3 py-3 font-semibold text-gray-900">Price/night</th>
                    <th className="px-3 py-3 font-semibold text-gray-900">Rating</th>
                    <th className="px-3 py-3 font-semibold text-gray-900">Bookings</th>
                    <th className="px-3 py-3 font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVillas.map((villa) => (
                    <tr key={villa.villa_id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-3 py-3 flex items-center gap-3 min-w-[220px]">
                        <img
                          src={villa.cover_photo_url || `https://picsum.photos/seed/villa-${villa.villa_id}/64/48`}
                          alt={villa.name}
                          className="w-16 h-12 object-cover rounded-lg border"
                          style={{ minWidth: 64, minHeight: 48 }}
                        />
                        <div>
                          <div className="font-semibold text-gray-900">{villa.name}</div>
                          <div className="text-xs text-gray-500">
                            max {villa.max_occupancy} guests
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div>
                          {villa.city}, {villa.country}
                        </div>
                        {villa.is_instant_book && (
                          <span
                            className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-primary-100 text-primary-600 font-medium"
                            title="Instant Book"
                          >
                            ⚡ Instant book
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={
                            villa.status === "active"
                              ? "inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded"
                              : "inline-flex items-center px-2 py-0.5 bg-gray-200 text-gray-800 text-xs font-medium rounded"
                          }
                        >
                          {villa.status.charAt(0).toUpperCase() +
                            villa.status.substring(1)}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-gray-900 font-medium">
                          ${villa.price_per_night.toLocaleString()}
                        </span>
                        <span className="text-gray-500 text-xs ml-1">/night</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <span className="text-yellow-500 text-base">★</span>
                          <span className="font-medium text-gray-700">{villa.rating?.toFixed(2) ?? "0.0"}</span>
                          <span className="text-xs text-gray-400">
                            ({villa.review_count})
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {/* Bookings quick-link (to host bookings page) */}
                        <Link
                          to="/host/bookings"
                          className="rounded px-2 py-1 text-primary-700 bg-primary-50 hover:bg-primary-100 text-xs font-semibold"
                          title="View bookings for this villa"
                        >
                          Bookings
                        </Link>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex gap-2">
                          <Link
                            to={`/host/listings/${villa.villa_id}/edit`}
                            title="Edit villa"
                            className="rounded text-blue-700 hover:underline hover:text-blue-800 px-2 py-1 text-sm font-semibold"
                            data-testid={`edit-${villa.villa_id}`}
                          >
                            Edit
                          </Link>
                          <button
                            className={
                              villa.status === "active"
                                ? "rounded px-2 py-1 text-xs font-semibold bg-yellow-200 text-yellow-900 hover:bg-yellow-300"
                                : "rounded px-2 py-1 text-xs font-semibold bg-green-200 text-green-900 hover:bg-green-300"
                            }
                            title={
                              villa.status === "active"
                                ? "Deactivate listing"
                                : "Activate listing"
                            }
                            disabled={statusMutation.isLoading}
                            onClick={() =>
                              openConfirm(
                                villa.villa_id,
                                villa.name,
                                "status",
                                villa.status === "active" ? "inactive" : "active"
                              )
                            }
                            data-testid={`toggle-status-${villa.villa_id}`}
                          >
                            {villa.status === "active" ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            className="rounded px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200"
                            title="Delete villa"
                            disabled={deleteMutation.isLoading}
                            onClick={() =>
                              openConfirm(
                                villa.villa_id,
                                villa.name,
                                "delete"
                              )
                            }
                            data-testid={`delete-${villa.villa_id}`}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Confirm Dialog */}
          {confirmDialog.visible && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-30">
              <div className="bg-white w-full max-w-sm mx-auto rounded shadow-lg border p-6 flex flex-col gap-4 animate-fade-in">
                {confirmDialog.action === "delete" ? (
                  <>
                    <div className="text-lg font-bold text-gray-900 mb-2">Delete Villa</div>
                    <div>
                      Are you sure you want to <span className="font-semibold text-red-700">delete</span> villa <span className="font-semibold">{confirmDialog.villa_name}</span>? This action cannot be undone.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold text-gray-900 mb-2">{confirmDialog.statusToSet === "active" ? "Activate Villa" : "Deactivate Villa"}</div>
                    <div>
                      Are you sure you want to {confirmDialog.statusToSet === "active" ? <span className="font-semibold text-green-700">activate</span> : <span className="font-semibold text-yellow-700">deactivate</span>} villa <span className="font-semibold">{confirmDialog.villa_name}</span>?
                    </div>
                  </>
                )}
                <div className="flex gap-3 justify-end mt-2">
                  <button
                    className="px-4 py-2 rounded bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200"
                    onClick={closeConfirm}
                  >
                    Cancel
                  </button>
                  <button
                    className={
                      confirmDialog.action === "delete"
                        ? "px-4 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700"
                        : confirmDialog.statusToSet === "active"
                        ? "px-4 py-2 rounded bg-green-600 text-white font-semibold hover:bg-green-700"
                        : "px-4 py-2 rounded bg-yellow-600 text-white font-semibold hover:bg-yellow-700"
                    }
                    onClick={handleConfirm}
                    autoFocus
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </React.Suspense>
    </>
  );
};

export default UV_HostDashboard_Listings;