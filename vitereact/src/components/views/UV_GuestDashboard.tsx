import React, { useEffect, useState } from "react";
import { useAppStore } from "@/store/main";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";

// Types from shared schemas (auto-imported via alias; see project tsconfig)
import type {
  UserProfile,
  Notification,
  BookingSummary,
} from "@schema";

// API base
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// --- TYPES ---
type TabType = "upcoming" | "past" | "cancelled";
type BookingMeta = {
  nights_booked: number;
  trips_count: number;
  total_upcoming_value: number;
};

interface DashboardData {
  user: UserProfile;
  bookings: {
    bookings: BookingSummary[];
    total: number;
    tab: string;
  };
}

interface NotificationsResult {
  notifications: Notification[];
  unread_count: number;
}

// ----- HELPERS -----
function formatDateISO(dateString: string): string {
  // Handles both YYYY-MM-DD and YYYYMMDD
  if (!dateString) return "?";
  if (dateString.length === 8) {
    // YYYYMMDD
    return (
      dateString.slice(0, 4) +
      "-" +
      dateString.slice(4, 6) +
      "-" +
      dateString.slice(6)
    );
  }
  return dateString;
}

function formatDateDisplay(dateString: string) {
  // Simple format for user display: 'Aug 10, 2024'
  try {
    const date = new Date(formatDateISO(dateString));
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return dateString;
  }
}

function daysBetween(start: string, end: string) {
  const d1 = new Date(formatDateISO(start));
  const d2 = new Date(formatDateISO(end));
  // Calculate diff in ms, then to days
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)));
}

function currencyFormat(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD"
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function isAfterToday(dateString: string) {
  // Return true if the date is in the future from today
  const d = new Date(formatDateISO(dateString));
  const today = new Date();
  // Remove time
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return d > today;
}

function isBeforeToday(dateString: string) {
  const d = new Date(formatDateISO(dateString));
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function capitalize(s: string) {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const BOOKING_TABS: { key: TabType; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" }
];

// ----- API QUERIES -----

// Fetch dashboard data (default: includes user + bookings + summary)
const fetchDashboardData = async (token: string): Promise<DashboardData> => {
  const { data } = await axios.get(`${API_BASE}/dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
};

// Fetch bookings for selected tab
const fetchBookingsForTab = async ({
  token,
  tab,
}: {
  token: string;
  tab: TabType;
}): Promise<BookingSummary[]> => {
  const { data } = await axios.get(`${API_BASE}/bookings?tab=${tab}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (data && Array.isArray(data.bookings)) {
    return data.bookings;
  } else if (data && data.bookings && Array.isArray(data.bookings.bookings)) {
    // Defensive: OpenAPI /dashboard returns {bookings: {bookings: [...], ...}}
    return data.bookings.bookings;
  }
  return [];
};

// Cancel booking
const cancelBookingAPI = async ({
  token,
  booking_id,
  cancellation_reason,
}: {
  token: string;
  booking_id: string;
  cancellation_reason: string;
}) => {
  const { data } = await axios.patch(
    `${API_BASE}/booking/${booking_id}`,
    { status: "cancelled", cancellation_reason },
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return data;
};

// Fetch notifications (always update Zustand)
const fetchNotifications = async (token: string): Promise<NotificationsResult> => {
  const { data } = await axios.get(`${API_BASE}/notifications`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
};

// Mark notification as read
const markNotificationReadAPI = async ({
  token,
  notification_id
}: {
  token: string;
  notification_id: string;
}) => {
  await axios.post(
    `${API_BASE}/notifications/${notification_id}/read`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
};

const UV_GuestDashboard: React.FC = () => {
  // ---- ZUSTAND STATE ----
  const user = useAppStore((state) => state.user);
  const auth_token = useAppStore((state) => state.auth_token);
  const zustand_notifications = useAppStore((state) => state.notifications);
  const set_notifications = useAppStore((state) => state.set_notifications);
  const set_unread_notifications = useAppStore((state) => state.set_unread_notifications);

  const [current_tab, set_current_tab] = useState<TabType>("upcoming");
  const [cancel_status, set_cancel_status] = useState<{id: string | null, loading: boolean, error: string | null}>({id: null, loading: false, error: null});
  const [cancel_modal, set_cancel_modal] = useState<{show: boolean, booking?: BookingSummary}>(() => ({show: false}));

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ---- DASHBOARD DATA (user, default tab bookings) ----
  const {
    data: dashboard_data,
    isLoading: dashboard_loading,
    isError: dashboard_error,
    error: dashboard_error_obj,
    refetch: refetch_dashboard,
  } = useQuery<DashboardData, Error>({
    queryKey: ["dashboard_data"],
    queryFn: () => {
      if (!auth_token?.token) throw new Error("Not authenticated");
      return fetchDashboardData(auth_token.token);
    },
    enabled: !!auth_token?.token,
    staleTime: 60 * 1000, // 1min
  });

  // ---- BOOKINGS FOR CURRENT TAB ----
  const {
    data: tab_bookings,
    isLoading: bookings_loading,
    isError: bookings_error,
    error: bookings_error_obj,
    refetch: refetch_bookings,
  } = useQuery<BookingSummary[], Error>({
    queryKey: ["guest_bookings", current_tab],
    queryFn: () => {
      if (!auth_token?.token) throw new Error("Not authenticated");
      return fetchBookingsForTab({ token: auth_token.token, tab: current_tab });
    },
    enabled: !!auth_token?.token,
    keepPreviousData: true,
    staleTime: 60 * 1000, // 1min
  });

  // ---- NOTIFICATIONS ----
  const {
    data: notifications_result,
    isLoading: notifications_loading,
    refetch: refetch_notifications,
  } = useQuery<NotificationsResult, Error>({
    queryKey: ["notifications"],
    queryFn: () => {
      if (!auth_token?.token) throw new Error("Not authenticated");
      return fetchNotifications(auth_token.token);
    },
    enabled: !!auth_token?.token,
    staleTime: 60 * 1000,
    onSuccess: (result) => {
      set_notifications(result.notifications);
      set_unread_notifications(result.unread_count || 0);
    }
  });

  // ---- CANCEL BOOKING MUTATION ----
  const cancelBookingMutation = useMutation({
    mutationFn: async ({
      booking_id,
      cancellation_reason,
    }: {
      booking_id: string;
      cancellation_reason: string;
    }) => {
      if (!auth_token?.token) throw new Error("Not authenticated");
      return cancelBookingAPI({
        token: auth_token.token,
        booking_id,
        cancellation_reason,
      });
    },
    onMutate: () => set_cancel_status((prev) => ({ ...prev, loading: true })),
    onError: (err: any) => {
      set_cancel_status((prev) => ({
        ...prev,
        loading: false,
        error: (err && err.message) || "Failed to cancel"
      }));
    },
    onSuccess: () => {
      set_cancel_status({ id: null, loading: false, error: null });
      set_cancel_modal({ show: false });
      // Refetch bookings
      queryClient.invalidateQueries({ queryKey: ["guest_bookings"] });
      refetch_bookings();
      refetch_dashboard();
    }
  });

  // On tab switch, make sure bookings for new tab are loaded
  useEffect(() => {
    if (auth_token?.token) {
      refetch_bookings();
      refetch_notifications();
    }
    // eslint-disable-next-line
  }, [current_tab, auth_token?.token]);

  // Meta calcs for bookings (nights, value)
  const booking_meta: BookingMeta = React.useMemo(() => {
    let nights_booked = 0;
    let trips_count = 0;
    let total_upcoming_value = 0;
    const source = tab_bookings || dashboard_data?.bookings?.bookings || [];
    if (source && Array.isArray(source)) {
      trips_count = source.length;
      source.forEach((b) => {
        const nights = daysBetween(b.check_in, b.check_out);
        nights_booked += nights;
        if (b.status === "upcoming" && b.total_price) {
          total_upcoming_value += b.total_price;
        }
      });
    }
    return {
      nights_booked,
      trips_count,
      total_upcoming_value,
    };
  }, [tab_bookings, dashboard_data]);

  // --- Review prompt logic ---
  const review_prompt_bookings: BookingSummary[] = React.useMemo(() => {
    // Only show for past bookings that have no review (per OpenAPI, booking.review is only in detail,
    // so here we do: only those past bookings with status "past" and check_out < today)
    const source = tab_bookings || dashboard_data?.bookings?.bookings || [];
    return source.filter(
      (b) =>
        current_tab === "past" &&
        isBeforeToday(b.check_out) &&
        (!("review" in b) || !b["review"])
    );
  }, [tab_bookings, dashboard_data, current_tab]);

  // --- Loading & Error States ---
  const is_loading =
    dashboard_loading || bookings_loading || notifications_loading || cancel_status.loading;

  // --- Auth enforcement ---
  useEffect(() => {
    if (!user || !auth_token?.token) {
      navigate("/login");
    }
    // eslint-disable-next-line
  }, [user, auth_token]);

  // --- Main Render Block (per prompt: ONE BIG RETURN) ---
  return (
    <>
      {/* Error boundary (simple) */}
      {dashboard_error && (
        <div className="max-w-4xl mx-auto mt-8 p-4 bg-red-50 border border-red-300 text-red-800 rounded">
          {dashboard_error_obj && dashboard_error_obj.message
            ? dashboard_error_obj.message
            : "Dashboard failed to load. Please try again."}
        </div>
      )}
      <div className="max-w-5xl mx-auto w-full px-2 sm:px-4 pt-6 flex flex-col min-h-[70vh]">
        {/* Top - User summary and stats */}
        <div className="flex flex-row items-center gap-4 pb-6 border-b border-gray-100">
          {user && (
            <img
              className="rounded-full w-14 h-14 object-cover border-2 border-primary"
              src={user.profile_photo_url || `https://picsum.photos/seed/guest_${user.user_id}/100`}
              alt={user.name}
              loading="lazy"
            />
          )}
          <div className="flex flex-col flex-1">
            <span className="text-lg font-bold text-gray-900">
              {user ? `Welcome, ${user.name}!` : "Welcome!"}
            </span>
            <span className="text-gray-500 text-base">
              Your trip dashboard and booking history
            </span>
          </div>
          <div className="flex flex-row gap-4">
            <div className="flex flex-col text-center">
              <span className="font-bold text-lg">{booking_meta.trips_count || 0}</span>
              <span className="text-xs text-gray-400">Trips</span>
            </div>
            <div className="flex flex-col text-center">
              <span className="font-bold text-lg">{booking_meta.nights_booked || 0}</span>
              <span className="text-xs text-gray-400">Nights</span>
            </div>
            <div className="flex flex-col text-center">
              <span className="font-bold text-lg">
                {current_tab === "upcoming"
                  ? currencyFormat(booking_meta.total_upcoming_value, "USD")
                  : "—"}
              </span>
              <span className="text-xs text-gray-400">Value</span>
            </div>
          </div>
        </div>

        {/* Review prompt(s) */}
        {current_tab === "past" && review_prompt_bookings.length > 0 && (
          <div className="my-4 bg-yellow-50 border-l-4 border-yellow-400 px-4 py-2 rounded flex flex-col gap-2">
            <span className="font-semibold text-yellow-800">
              {review_prompt_bookings.length === 1 ? "You have a review to leave:" : `You have ${review_prompt_bookings.length} reviews to leave:`}
            </span>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2">
              {review_prompt_bookings.map((b) => (
                <Link
                  to={`/reviews/booking/${b.booking_id}`}
                  className="px-3 py-1 bg-yellow-200 text-yellow-900 text-sm rounded hover:bg-yellow-300 transition"
                  key={b.booking_id}
                >
                  {b.villa.name} ({formatDateDisplay(b.check_in)} - {formatDateDisplay(b.check_out)})
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-row gap-2 pt-6 pb-2">
          {BOOKING_TABS.map((t) => (
            <button
              key={t.key}
              className={`px-5 py-2 rounded-t font-semibold border-b-2 transition ${
                current_tab === t.key
                  ? "border-primary text-primary bg-primary/10"
                  : "border-transparent text-gray-500 hover:bg-gray-100"
              }`}
              aria-selected={current_tab === t.key}
              onClick={() => set_current_tab(t.key)}
              disabled={is_loading}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Bookings Loading */}
        {(is_loading || !tab_bookings) && (
          <div className="flex items-center justify-center w-full h-40">
            <svg className="animate-spin h-6 w-6 text-primary" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="ml-2 text-primary">Loading bookings...</span>
          </div>
        )}

        {/* Bookings Error */}
        {bookings_error && (
          <div className="my-4 bg-red-50 border border-red-300 text-red-600 px-3 py-2 rounded">
            {bookings_error_obj && bookings_error_obj.message
              ? bookings_error_obj.message
              : "Failed to load your bookings. Please refresh."}
          </div>
        )}

        {/* Bookings - Render Cards */}
        {!is_loading && !bookings_error && tab_bookings && tab_bookings.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4 my-4 w-full">
            {tab_bookings.map((booking) => {
              // Actions
              const can_cancel =
                current_tab === "upcoming" && booking.status !== "cancelled" && isAfterToday(booking.check_in);
              const can_message =
                booking.status !== "cancelled";
              const can_review =
                current_tab === "past" &&
                isBeforeToday(booking.check_out) &&
                (!("review" in booking) || !booking["review"]);
              return (
                <div
                  className="bg-white border border-gray-100 rounded-lg shadow-sm p-4 flex flex-col"
                  key={booking.booking_id}
                >
                  {/* Villa visual */}
                  <Link
                    to={`/villa/${booking.villa.villa_id}`}
                    className="flex flex-row items-center gap-3 pb-2 group"
                  >
                    <img
                      src={booking.villa.cover_photo_url || `https://picsum.photos/seed/villa_${booking.villa.villa_id}/120/90`}
                      alt={booking.villa.name}
                      className="w-24 h-18 object-cover rounded border border-gray-200 group-hover:border-primary transition"
                      loading="lazy"
                    />
                    <div>
                      <div className="font-bold text-base text-gray-900">{booking.villa.name}</div>
                      <div className="text-xs text-gray-500">{booking.villa.city}, {booking.villa.country}</div>
                      <div className="text-xs text-gray-400 mt-1 truncate max-w-[180px]">{booking.villa.short_description}</div>
                    </div>
                  </Link>
                  {/* Booking info */}
                  <div className="flex flex-row justify-between items-center pt-2">
                    <div className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-gray-700">
                        {formatDateDisplay(booking.check_in)}
                        {" — "}
                        {formatDateDisplay(booking.check_out)}
                      </span>
                      <span className="text-gray-400 text-xs">
                        {daysBetween(booking.check_in, booking.check_out)} night(s), {booking.number_of_guests} guest{booking.number_of_guests > 1 ? "s" : ""}
                      </span>
                      <span className="text-gray-500">
                        Total:{" "}
                        <span className="font-semibold">
                          {currencyFormat(booking.total_price, booking.currency)}
                        </span>
                      </span>
                      <span className="text-xs text-gray-400 mt-1">Status: <span className={`font-bold ${booking.status === "cancelled" ? "text-red-500" : booking.status === "upcoming" ? "text-blue-700" : "text-gray-700"}`}>{capitalize(booking.status)}</span></span>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      {/* Host */}
                      <Link
                        to={`/messages`}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                        title="Message Host"
                      >
                        <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4-3.8 7-9 7-1.6 0-3.1-.2-4.4-.6-1.9.5-3.4 1.2-4.6 2.1C2 20 2.8 18.3 3.7 17.1A7.6 7.6 0 013 12c0-4 3.8-7 9-7s9 3 9 7z"/>
                        </svg>
                        {booking.villa.host?.name || "Host"}
                      </Link>
                      {/* Host avatar */}
                      {booking.villa.host?.profile_photo_url && (
                        <img
                          src={booking.villa.host.profile_photo_url}
                          className="w-7 h-7 rounded-full border mt-1"
                          alt={booking.villa.host.name || "Host avatar"}
                          loading="lazy"
                        />
                      )}
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="mt-3 flex flex-row gap-2 flex-wrap">
                    <Link
                      to={`/booking/${booking.booking_id}/details`}
                      className="px-3 py-1 rounded bg-gray-50 hover:bg-primary/10 border border-gray-200 text-gray-800 text-sm font-medium transition"
                    >
                      View Details
                    </Link>
                    {can_cancel && (
                      <button
                        type="button"
                        className="px-3 py-1 rounded text-sm bg-red-50 text-red-700 border border-red-200 hover:bg-red-200 font-semibold transition"
                        onClick={() => set_cancel_modal({ show: true, booking })}
                      >
                        Cancel Booking
                      </button>
                    )}
                    {can_message && (
                      <Link
                        to={`/messages?booking=${booking.booking_id}`}
                        className="px-3 py-1 rounded text-sm bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 font-semibold transition"
                      >
                        Message Host
                      </Link>
                    )}
                    {can_review && (
                      <Link
                        to={`/reviews/booking/${booking.booking_id}`}
                        className="px-3 py-1 rounded text-sm bg-yellow-100 text-yellow-900 border border-yellow-300 hover:bg-yellow-300 font-semibold transition"
                      >
                        Leave Review
                      </Link>
                    )}
                    {/* Option to rebook for cancelled */}
                    {current_tab === "cancelled" && (
                      <Link
                        to={`/villa/${booking.villa.villa_id}`}
                        className="px-3 py-1 rounded text-sm bg-blue-100 text-blue-900 border border-blue-200 hover:bg-blue-200 font-semibold transition"
                      >
                        Rebook
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!is_loading && !bookings_error && tab_bookings && tab_bookings.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-10 mb-10 gap-4">
            <span className="text-lg font-bold text-gray-700">No bookings found for {capitalize(current_tab)} trips.</span>
            <span className="text-gray-400">
              {current_tab === "upcoming"
                ? "Ready for your next vacation? Start browsing beach villas!"
                : current_tab === "past"
                  ? "Your past trips will show here after your stays."
                  : "Cancelled bookings are stored here for your records."}
            </span>
            <Link
              to="/search"
              className="px-5 py-2 bg-primary text-white rounded shadow hover:bg-primary-dark transition text-lg font-semibold mt-2"
            >
              Search Villas
            </Link>
          </div>
        )}

        {/* Cancel Booking Modal */}
        {cancel_modal.show && cancel_modal.booking && (
          <>
            <div className="fixed inset-0 bg-black/30 z-40" />
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg max-w-md shadow-2xl border border-gray-200 flex flex-col gap-3">
                <span className="text-xl font-semibold text-gray-900">
                  Cancel Booking?
                </span>
                <span className="text-gray-500">
                  Are you sure you want to cancel your booking at <b>{cancel_modal.booking.villa.name}</b> for {formatDateDisplay(cancel_modal.booking.check_in)} – {formatDateDisplay(cancel_modal.booking.check_out)}?
                </span>
                <span className="text-gray-400 text-sm">
                  This action cannot be undone. Please provide a cancellation reason.
                </span>
                <textarea
                  className="border border-gray-300 rounded p-2 mt-2 text-sm resize-none"
                  placeholder="Reason for cancellation"
                  rows={2}
                  disabled={cancel_status.loading}
                  value={cancel_status.id === cancel_modal.booking.booking_id && typeof cancel_status.error === "string" ? cancel_status.error : ""}
                  onChange={(e) =>
                    set_cancel_status((prev) => ({
                      ...prev,
                      id: cancel_modal.booking?.booking_id || null,
                      error: e.target.value
                    }))
                  }
                />
                <div className="flex flex-row justify-end gap-2 mt-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded text-sm font-semibold bg-gray-100 border border-gray-300 hover:bg-gray-200"
                    onClick={() => set_cancel_modal({ show: false })}
                    disabled={cancel_status.loading}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className={`px-4 py-2 rounded text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition`}
                    onClick={() => {
                      if (!cancel_status.error || cancel_status.error.length < 3) {
                        set_cancel_status((prev) => ({
                          ...prev,
                          error: "Please provide a reason (3 characters minimum)."
                        }));
                        return;
                      }
                      cancelBookingMutation.mutate({
                        booking_id: cancel_modal.booking!.booking_id,
                        cancellation_reason: cancel_status.error,
                      });
                    }}
                    disabled={cancel_status.loading}
                  >
                    {cancel_status.loading ? (
                      <span>
                        <svg className="w-4 h-4 animate-spin inline mr-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Cancelling...
                      </span>
                    ) : (
                      "Confirm Cancel"
                    )}
                  </button>
                </div>
                {cancelBookingMutation.isError && (
                  <span className="text-red-600 text-sm mt-1">{cancelBookingMutation.error?.message || "Failed to cancel booking. Try again."}</span>
                )}
                {cancelBookingMutation.isSuccess && (
                  <span className="text-green-700 text-sm mt-1">Booking cancelled.</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default UV_GuestDashboard;