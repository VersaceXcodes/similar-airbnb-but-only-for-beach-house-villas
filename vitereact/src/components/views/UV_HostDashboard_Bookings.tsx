import React, { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/main";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";

// ------------ Types (from zod/DB schemas and OpenAPI for BookingSummary etc.) -------------
interface VillaShortInfo {
  villa_id: string;
  name: string;
  cover_photo_url: string;
}

interface UserShortInfo {
  user_id: string;
  name: string;
  email: string;
  profile_photo_url?: string | null;
}

interface BookingSummary {
  booking_id: string;
  villa: VillaShortInfo;
  guest: UserShortInfo;
  check_in: string;
  check_out: string;
  number_of_guests: number;
  status: string;
  booking_type: string;
  total_price: number;
  currency: string;
  created_at?: number;
}

interface BookingListResponse {
  bookings: BookingSummary[];
  total: number;
  tab: string;
}

interface QuickStats {
  occupancy_rate: number;
  bookings_this_month: number;
}

// ---- Constants ----
const TABS = [
  { label: "Pending", key: "pending" },
  { label: "Upcoming", key: "upcoming" },
  { label: "Past", key: "past" },
  { label: "Cancelled", key: "cancelled" },
];

// ----------- Data fetching functions (React Query + Axios) ------------

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Fetch bookings by tab
const fetchBookings = async ({
  jwt,
  tab,
}: { jwt: string; tab: string }): Promise<BookingListResponse> => {
  const response = await axios.get(
    `${API_URL}/host/bookings?tab=${encodeURIComponent(tab)}`,
    {
      headers: { Authorization: `Bearer ${jwt}` },
    }
  );
  return response.data;
};

// Quick stats: fetch dashboard and aggregate
const fetchQuickStats = async (jwt: string): Promise<QuickStats> => {
  const response = await axios.get(`${API_URL}/dashboard`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  // 'occupancy_rate' and 'bookings' as per OpenAPI/DB, host dashboard is role aware
  const dashboard = response.data;
  let occupancy_rate = 0;
  let bookings_this_month = 0;
  // Find bookings this month for host
  if (dashboard && dashboard.bookings && dashboard.bookings.bookings) {
    const bookings: BookingSummary[] = dashboard.bookings.bookings;
    // Check month for ISO 8601 (YYYY-MM-DD) (or fallback to epoch)
    const now = new Date();
    bookings_this_month = bookings.filter((b) => {
      if (b.created_at) {
        // created_at is epoch seconds
        const d = new Date(b.created_at * 1000);
        return (
          d.getUTCFullYear() === now.getUTCFullYear() &&
          d.getUTCMonth() === now.getUTCMonth()
        );
      }
      return false;
    }).length;
  }
  if (dashboard.occupancy_rate !== undefined) {
    occupancy_rate = dashboard.occupancy_rate;
  } else if (dashboard.user && typeof dashboard.user.occupancy_rate === "number") {
    occupancy_rate = dashboard.user.occupancy_rate;
  }
  return {
    occupancy_rate,
    bookings_this_month,
  };
};

// Accept a booking
const acceptBooking = async ({
  booking_id,
  jwt,
}: { booking_id: string; jwt: string }) => {
  const response = await axios.post(
    `${API_URL}/booking/${booking_id}/accept`,
    {},
    {
      headers: { Authorization: `Bearer ${jwt}` },
    }
  );
  return response.data;
};

// Reject a booking
const rejectBooking = async ({
  booking_id,
  jwt,
  reason,
}: { booking_id: string; jwt: string; reason?: string }) => {
  // API allows (and does not require) reason.
  const response = await axios.post(
    `${API_URL}/booking/${booking_id}/reject`,
    reason ? { reason } : {},
    {
      headers: { Authorization: `Bearer ${jwt}` },
    }
  );
  return response.data;
};

// Cancel a booking
const cancelBooking = async ({
  booking_id,
  jwt,
  reason,
}: { booking_id: string; jwt: string; reason?: string }) => {
  const response = await axios.patch(
    `${API_URL}/booking/${booking_id}`,
    { status: "cancelled", ...(reason ? { cancellation_reason: reason } : {}) },
    {
      headers: { Authorization: `Bearer ${jwt}` },
    }
  );
  return response.data;
};

// ----------- Component -----------

const UV_HostDashboard_Bookings: React.FC = () => {
  // --- Zustand global state ---
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const set_error_banner = useAppStore((s) => s.set_error_banner);

  // --- Local state for search/filter ---
  const [selected_tab, set_selected_tab] = useState<string>("pending");
  const [search_guest, set_search_guest] = useState<string>("");
  const [search_villa, set_search_villa] = useState<string>("");

  // Selected booking for reject/cancel modal (for reason, if entered)
  const [rejectModal, setRejectModal] = useState<{ booking_id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");

  const [cancelModal, setCancelModal] = useState<{ booking_id: string } | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // -- Access Control check
  if (!user || (user.role !== "host" && user.role !== "guest_host")) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="bg-red-100 border border-red-300 rounded p-10 shadow-sm text-center">
          <h2 className="text-2xl font-medium text-red-700 mb-3">Access Denied</h2>
          <p className="text-red-700">
            You must be logged in as a host to view bookings. <Link className="text-blue-600 underline" to="/login">Log in</Link>
          </p>
        </div>
      </div>
    );
  }

  // JWT token
  const jwt = auth_token?.token || "";

  // --- Queries ---

  // Bookings list
  const {
    data: bookingsResp,
    isLoading: bookingsLoading,
    isError: bookingsIsError,
    refetch: refetchBookings,
    error: bookingsError,
  } = useQuery<BookingListResponse, any>({
    queryKey: ["hostBookings", selected_tab, jwt],
    queryFn: () => fetchBookings({ jwt, tab: selected_tab }),
    enabled: !!jwt,
    staleTime: 60 * 1000,
    retry: 1,
    onError: (error: any) => {
      set_error_banner({
        message:
          error?.response?.data?.message ??
          "Failed to fetch bookings. Please try again.",
        visible: true,
      });
    },
  });

  // Quick stats
  const {
    data: quickStats,
    isLoading: quickStatsLoading,
    isError: quickStatsIsError,
  } = useQuery<QuickStats, any>({
    queryKey: ["hostQuickStats", jwt],
    queryFn: () => fetchQuickStats(jwt),
    enabled: !!jwt,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // --- Mutations ---

  // Accept booking
  const acceptBookingMutation = useMutation({
    mutationFn: ({ booking_id }: { booking_id: string }) =>
      acceptBooking({ booking_id, jwt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hostBookings"] });
    },
    onError: (error: any) => {
      set_error_banner({
        message:
          error?.response?.data?.message ??
          "Could not accept booking. Please try again.",
        visible: true,
      });
    },
  });

  // Reject booking
  const rejectBookingMutation = useMutation({
    mutationFn: ({ booking_id, reason }: { booking_id: string; reason?: string }) =>
      rejectBooking({ booking_id, jwt, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hostBookings"] });
      setRejectModal(null);
      setRejectReason("");
    },
    onError: (error: any) => {
      set_error_banner({
        message:
          error?.response?.data?.message ??
          "Could not reject booking. Please try again.",
        visible: true,
      });
    },
  });

  // Cancel booking
  const cancelBookingMutation = useMutation({
    mutationFn: ({ booking_id, reason }: { booking_id: string; reason?: string }) =>
      cancelBooking({ booking_id, jwt, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hostBookings"] });
      setCancelModal(null);
      setCancelReason("");
    },
    onError: (error: any) => {
      set_error_banner({
        message:
          error?.response?.data?.message ??
          "Could not cancel booking. Please try again.",
        visible: true,
      });
    },
  });

  // --- Filtering bookings by guest/villa name (client-side) ---
  const filteredBookings: BookingSummary[] = useMemo(() => {
    if (!bookingsResp) return [];
    return bookingsResp.bookings.filter((b) => {
      const guestMatch =
        !search_guest ||
        b.guest.name.toLowerCase().includes(search_guest.trim().toLowerCase());
      const villaMatch =
        !search_villa ||
        b.villa.name.toLowerCase().includes(search_villa.trim().toLowerCase());
      return guestMatch && villaMatch;
    });
  }, [bookingsResp, search_guest, search_villa]);

  // --- Handlers ---
  const handleTabChange = (key: string) => {
    set_selected_tab(key);
    set_error_banner({ message: "", visible: false });
  };

  const handleAccept = (booking_id: string) => {
    acceptBookingMutation.mutate({ booking_id });
  };

  const handleReject = (booking_id: string) => {
    setRejectModal({ booking_id });
    setRejectReason("");
  };

  const handleRejectSubmit = () => {
    if (rejectModal) {
      rejectBookingMutation.mutate({
        booking_id: rejectModal.booking_id,
        reason: rejectReason.trim() ? rejectReason.trim() : undefined,
      });
    }
  };

  const handleCancel = (booking_id: string) => {
    setCancelModal({ booking_id });
    setCancelReason("");
  };

  const handleCancelSubmit = () => {
    if (cancelModal) {
      cancelBookingMutation.mutate({
        booking_id: cancelModal.booking_id,
        reason: cancelReason.trim() ? cancelReason.trim() : undefined,
      });
    }
  };

  const handleMessageGuest = (booking: BookingSummary) => {
    // Ideally: fetch or already have thread id (not in summary); so go to /messages and highlight by booking_id as fallback
    navigate(`/messages?booking_id=${booking.booking_id}`);
  };

  const handleViewDetails = (booking_id: string) => {
    navigate(`/booking/${booking_id}/details`);
  };

  // Format date helper
  const fmt = (iso: string) => {
    // If it's already ISO: YYYY-MM-DD, else epoch string
    if (!iso) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
      return iso;
    } else if (/^\d{8}$/.test(iso)) {
      // yyyymmdd
      return `${iso.slice(0, 4)}-${iso.slice(4, 6)}-${iso.slice(6, 8)}`;
    }
    return iso;
  };

  // Format currency helper
  const formatCurrency = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency || "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return amount + " " + (currency ?? "");
    }
  };

  return (
    <>
      {/* Title/Stats */}
      <div className="px-2 sm:px-8 md:px-16 py-7 flex flex-col gap-6">
        {/* Heading */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>Bookings</span>
            <Link to="/host/earnings" className="ml-4 text-blue-500 text-base underline font-normal hover:text-blue-700">
              Earnings Overview →
            </Link>
          </h1>
          <div className="flex gap-4 items-center">
            {/* Quick stats */}
            <div className="bg-blue-50 rounded-lg px-4 py-3 mr-2 shadow-inner flex flex-col text-blue-800 min-w-[120px]">
              <span className="font-medium text-lg">{quickStatsLoading ? "..." : quickStats?.occupancy_rate !== undefined ? (quickStats.occupancy_rate * 100).toFixed(1) + "%" : "--"}</span>
              <span className="text-xs text-blue-700">Occupancy Rate</span>
            </div>
            <div className="bg-green-50 rounded-lg px-4 py-3 shadow-inner flex flex-col text-green-900 min-w-[120px]">
              <span className="font-medium text-lg">{quickStatsLoading ? "..." : quickStats?.bookings_this_month !== undefined ? quickStats.bookings_this_month : "--"}</span>
              <span className="text-xs text-green-800">Bookings this month</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`px-3 py-2 -mb-px rounded-t border-b-2 ${
                selected_tab === tab.key
                  ? "border-blue-600 text-blue-700 font-semibold bg-white"
                  : "border-b-transparent text-gray-600 hover:bg-gray-50"
              } transition-all`}
              aria-selected={selected_tab === tab.key}
              onClick={() => handleTabChange(tab.key)}
              disabled={bookingsLoading}
            >
              {tab.label}
              {bookingsResp?.tab === tab.key && bookingsResp?.total !== undefined && (
                <span className="ml-1 text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                  {bookingsResp.total}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search/filter bar */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Filter:</span>
            <input
              className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-blue-400 w-36"
              type="text"
              placeholder="Guest name"
              value={search_guest}
              onChange={(e) => set_search_guest(e.target.value)}
            />
            <input
              className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-blue-400 w-36"
              type="text"
              placeholder="Villa name"
              value={search_villa}
              onChange={(e) => set_search_villa(e.target.value)}
            />
          </div>
          {(search_guest || search_villa) && (
            <button
              className="text-xs text-gray-500 ml-2 underline"
              onClick={() => {
                set_search_guest("");
                set_search_villa("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Bookings list */}
        <div className="rounded-xl border border-gray-100 bg-white mt-3 shadow-sm overflow-x-auto">
          {bookingsLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <svg className="animate-spin mr-2 h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-70" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading bookings...
            </div>
          ) : bookingsIsError ? (
            <div className="flex items-center justify-center flex-col py-16 text-red-700">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path d="M12 7v5m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              <div className="mt-2">Failed to load bookings.</div>
              {bookingsError?.response?.data?.message && (
                <div className="text-xs mt-1">{bookingsError.response.data.message}</div>
              )}
              <button
                className="mt-2 font-medium text-blue-600 underline"
                onClick={() => refetchBookings()}
              >
                Retry
              </button>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-gray-500">
              <svg viewBox="0 0 64 64" className="w-10 h-10 mb-2"><circle cx="32" cy="32" r="30" fill="#f3f4f6" /><path d="M44 26L34 36l5 5 10-10" stroke="#d1d5db" strokeWidth="3" strokeLinecap="round" fill="none" /><circle cx="24" cy="28" r="4" fill="#d1d5db" /></svg>
              <span className="font-medium">No bookings found for this filter/tab.</span>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600 uppercase">
                  <th className="px-4 py-3 w-[72px]">Guest</th>
                  <th className="px-4 py-3 w-[160px] text-left">Name & Contact</th>
                  <th className="px-4 py-3 w-[72px]">Villa</th>
                  <th className="px-4 py-3 w-[180px] text-left">Property</th>
                  <th className="px-4 py-3 w-[92px]">Dates</th>
                  <th className="px-4 py-3 w-[64px]">Guests</th>
                  <th className="px-4 py-3 w-[96px]">Amount</th>
                  <th className="px-4 py-3 w-[90px]">Status</th>
                  <th className="px-4 py-3 w-[175px]">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100 text-gray-700">
                {filteredBookings.map((b) => (
                  <tr key={b.booking_id} className="hover:bg-gray-50">
                    {/* Guest Avatar */}
                    <td className="pl-4 pr-2 py-3">
                      <img
                        src={
                          b.guest.profile_photo_url ||
                          `https://picsum.photos/seed/guest-${b.guest.user_id}/48`
                        }
                        alt={b.guest.name}
                        className="h-10 w-10 rounded-full border border-gray-200 object-cover"
                        loading="lazy"
                      />
                    </td>
                    {/* Guest Name/Contact */}
                    <td className="pr-4 py-3">
                      <div className="font-medium">{b.guest.name}</div>
                      <div className="text-xs text-gray-500">{b.guest.email}</div>
                    </td>
                    {/* Villa Cover */}
                    <td className="px-2 py-3">
                      <img
                        src={
                          b.villa.cover_photo_url ||
                          `https://picsum.photos/seed/villa-${b.villa.villa_id}/48`
                        }
                        alt={b.villa.name}
                        className="h-10 w-14 rounded-lg border border-gray-200 object-cover"
                        loading="lazy"
                      />
                    </td>
                    {/* Villa Name */}
                    <td className="pr-4 py-3">
                      <div className="font-medium">
                        <Link
                          to={`/villa/${b.villa.villa_id}`}
                          className="text-blue-700 underline"
                        >
                          {b.villa.name}
                        </Link>
                      </div>
                    </td>
                    {/* Dates */}
                    <td className="px-2 py-3 text-gray-600 font-mono">
                      {fmt(b.check_in)}<br />
                      <span className="px-1 text-gray-400">→</span>
                      {fmt(b.check_out)}
                    </td>
                    {/* # Guests */}
                    <td className="px-2 py-3 text-center">
                      {b.number_of_guests}
                    </td>
                    {/* Amount */}
                    <td className="px-2 py-3 font-semibold">
                      {formatCurrency(b.total_price, b.currency)}
                    </td>
                    {/* Status */}
                    <td className="px-2 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full font-medium text-xs ${
                          b.status === "pending"
                            ? "bg-yellow-50 text-yellow-700 border border-yellow-300"
                            : b.status === "upcoming"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : b.status === "past"
                            ? "bg-gray-100 text-gray-500 border border-gray-300"
                            : b.status === "cancelled"
                            ? "bg-red-50 text-red-600 border border-red-200"
                            : "bg-gray-50 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-2 py-3 flex gap-1 flex-wrap min-w-[155px]">
                      {/* Accept/Reject: only on Pending */}
                      {b.status === "pending" && (
                        <>
                          <button
                            title="Accept"
                            className="bg-green-500 hover:bg-green-700 text-white px-2 py-1 rounded text-xs font-medium mr-1 transition disabled:opacity-60"
                            onClick={() => handleAccept(b.booking_id)}
                            disabled={acceptBookingMutation.isLoading}
                          >
                            {acceptBookingMutation.isLoading ? "..." : "Accept"}
                          </button>
                          <button
                            title="Reject"
                            className="bg-red-400 hover:bg-red-700 text-white px-2 py-1 rounded text-xs font-medium transition disabled:opacity-60"
                            onClick={() => handleReject(b.booking_id)}
                            disabled={rejectBookingMutation.isLoading}
                          >
                            {rejectBookingMutation.isLoading ? "..." : "Reject"}
                          </button>
                        </>
                      )}
                      {/* Cancel: only on Upcoming (simplified rule, could have more logic) */}
                      {b.status === "upcoming" && (
                        <button
                          title="Cancel Booking"
                          className="bg-yellow-400 hover:bg-yellow-500 text-white px-2 py-1 rounded text-xs font-medium transition disabled:opacity-60"
                          onClick={() => handleCancel(b.booking_id)}
                          disabled={cancelBookingMutation.isLoading}
                        >
                          {cancelBookingMutation.isLoading ? "..." : "Cancel"}
                        </button>
                      )}
                      {/* Message Guest */}
                      <button
                        title="Message Guest"
                        className="bg-blue-600 hover:bg-blue-800 text-white px-2 py-1 rounded text-xs font-medium transition"
                        onClick={() => handleMessageGuest(b)}
                      >
                        Message Guest
                      </button>
                      {/* View Details */}
                      <button
                        title="View Booking"
                        className="bg-gray-100 hover:bg-gray-200 text-gray-900 px-2 py-1 rounded text-xs font-medium border border-gray-200"
                        onClick={() => handleViewDetails(b.booking_id)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Reject Booking Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-30 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md border border-gray-200">
            <h2 className="font-semibold text-lg mb-2 text-red-800">Reject Booking?</h2>
            <p className="mb-3 text-sm text-gray-600">
              Optionally provide a reason for rejecting this booking. This will be visible to the guest.
            </p>
            <textarea
              className="border w-full min-h-[60px] rounded px-2 py-1 text-sm mb-4 focus:ring focus:ring-red-100"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (optional)"
              disabled={rejectBookingMutation.isLoading}
            />
            <div className="flex gap-3 mt-2 justify-end">
              <button
                className="bg-white border border-gray-200 px-3 py-1 rounded text-sm"
                onClick={() => setRejectModal(null)}
              >
                Cancel
              </button>
              <button
                className="bg-red-600 text-white px-4 py-1 rounded text-sm font-medium disabled:opacity-50"
                onClick={handleRejectSubmit}
                disabled={rejectBookingMutation.isLoading}
              >
                {rejectBookingMutation.isLoading ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Booking Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-30 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md border border-gray-200">
            <h2 className="font-semibold text-lg mb-2 text-yellow-800">Cancel Booking?</h2>
            <p className="mb-3 text-sm text-gray-600">
              Optionally provide a reason for cancelling this booking. This will be visible to the guest.
            </p>
            <textarea
              className="border w-full min-h-[60px] rounded px-2 py-1 text-sm mb-4 focus:ring focus:ring-yellow-100"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (optional)"
              disabled={cancelBookingMutation.isLoading}
            />
            <div className="flex gap-3 mt-2 justify-end">
              <button
                className="bg-white border border-gray-200 px-3 py-1 rounded text-sm"
                onClick={() => setCancelModal(null)}
              >
                Back
              </button>
              <button
                className="bg-yellow-600 text-white px-4 py-1 rounded text-sm font-medium disabled:opacity-50"
                onClick={handleCancelSubmit}
                disabled={cancelBookingMutation.isLoading}
              >
                {cancelBookingMutation.isLoading ? "Cancelling..." : "Cancel Booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UV_HostDashboard_Bookings;