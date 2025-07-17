import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { useAppStore } from "@/store/main";
import { Link } from "react-router-dom";

// --- Type interfaces aligned w/ OpenAPI & Zod ---

interface SummaryStats {
  total_users: number;
  total_villas: number;
  occupancy_rate: number;
  active_bookings: number;
}

interface BookingSummary {
  booking_id: string;
  villa: {
    name: string;
  };
  guest: {
    user_id: string;
    name: string;
  };
  created_at: number;
}
interface Review {
  review_id: string;
  villa_id: string | null;
  booking_id: string;
  reviewer_user_id: string;
  review_text: string;
  is_flagged: boolean;
  is_visible: boolean;
  created_at: number;
  reviewer?: {
    user_id: string;
    name: string;
  };
}

interface PendingDispute {
  type: "booking" | "review";
  id: string;
  summary: string;
  related_user?: {
    user_id: string;
    name: string;
  };
  date: number;
}

// --- API base URL ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// --- React Query Fetchers ---

async function fetchSummaryStats(token: string): Promise<SummaryStats> {
  const { data } = await axios.get(`${API_BASE_URL}/admin/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // TypeGuard: check fields; trust as per OpenAPI contract
  return data as SummaryStats;
}

// Get flagged reviews (pending moderation)
async function fetchFlaggedReviews(token: string): Promise<Review[]> {
  const { data } = await axios.get(`${API_BASE_URL}/admin/reviews?is_flagged=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  // Format: { reviews: Review[], total: number }
  return data.reviews as Review[];
}

// Get pending bookings (pending admin/host/mod review)
async function fetchPendingBookings(token: string): Promise<BookingSummary[]> {
  const { data } = await axios.get(`${API_BASE_URL}/admin/bookings?status=pending`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  // Format: { bookings: BookingSummary[], total: number }
  return data.bookings as BookingSummary[];
}

// Helper: Map reviews & bookings to PendingDispute[]
function buildPendingDisputes(
  flaggedReviews: Review[],
  pendingBookings: BookingSummary[]
): PendingDispute[] {
  const toDisputes: PendingDispute[] = [];

  for (const review of flaggedReviews) {
    toDisputes.push({
      type: "review",
      id: review.review_id,
      summary: `Flagged review: "${review.review_text.slice(0, 50)}${review.review_text.length > 50 ? '…' : ''}"`,
      related_user: review.reviewer
        ? {
            user_id: review.reviewer.user_id,
            name: review.reviewer.name,
          }
        : undefined,
      date: review.created_at,
    });
  }
  for (const booking of pendingBookings) {
    toDisputes.push({
      type: "booking",
      id: booking.booking_id,
      summary: `Pending booking for villa "${booking.villa?.name ?? "?"}"`,
      related_user: booking.guest
        ? {
            user_id: booking.guest.user_id,
            name: booking.guest.name,
          }
        : undefined,
      date: booking.created_at,
    });
  }

  // Sort: most recent first
  return toDisputes.sort((a, b) => b.date - a.date);
}

// Format util for date
function formatDateTime(ts: number): string {
  // seconds or ms since epoch
  let d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

const ADMIN_SECTIONS = [
  { key: "dashboard", label: "Dashboard", path: "/admin" },
  { key: "users", label: "Users", path: "/admin/users" },
  { key: "listings", label: "Listings", path: "/admin/listings" },
  { key: "reviews", label: "Reviews", path: "/admin/reviews" },
  { key: "bookings", label: "Bookings", path: "/admin/bookings" },
  { key: "messages", label: "Messages", path: "/admin/messages" },
];

const KPI_TILES = [
  {
    key: "total_users",
    label: "Total Users",
    color: "bg-blue-50 text-blue-700",
    icon: (
      <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-8 0v2M12 11a4 4 0 100-8 4 4 0 000 8z" /></svg>
    ),
    link: "/admin/users",
  },
  {
    key: "total_villas",
    label: "Listed Villas",
    color: "bg-green-50 text-green-700",
    icon: (
      <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 10l9-7 9 7v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
    ),
    link: "/admin/listings",
  },
  {
    key: "active_bookings",
    label: "Active Bookings",
    color: "bg-orange-50 text-orange-700",
    icon: (
      <svg className="w-7 h-7 text-orange-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 17l4-4 4 4m0 0V7m0 10l4-4-4-4" /></svg>
    ),
    link: "/admin/bookings",
  },
  {
    key: "occupancy_rate",
    label: "Occupancy Rate",
    color: "bg-violet-50 text-violet-700",
    icon: (
      <svg className="w-7 h-7 text-violet-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 3" /></svg>
    ),
    link: "/admin/listings",
    valueRender: (pct: number) => pct != null ? `${pct.toFixed(1)}%` : "--",
  },
];

// --- Main Component ---

const UV_Admin_Dashboard: React.FC = () => {
  // Zustand selectors: use INDIVIDUAL selectors per best practice
  const user = useAppStore((state) => state.user);
  const auth_token = useAppStore((state) => state.auth_token);
  const set_error_banner = useAppStore((state) => state.set_error_banner);

  // Dashboard local state for error fallback
  const [dashboardError, setDashboardError] = React.useState<{message: string}>({ message: "" });

  // Queries
  const enabled = !!auth_token?.token;

  // 1. Summary Stats Query
  const summaryStatsQuery = useQuery<SummaryStats, AxiosError>(
    ["admin_dashboard_stats"],
    () => fetchSummaryStats(auth_token!.token),
    {
      enabled,
      onError: (err: AxiosError) => {
        setDashboardError({ message: err?.response?.data?.message || err.message });
        set_error_banner({ message: err?.response?.data?.message || err.message, visible: true });
      }
    }
  );

  // 2. Flagged Reviews Query
  const flaggedReviewsQuery = useQuery<Review[], AxiosError>(
    ["admin_flagged_reviews"],
    () => fetchFlaggedReviews(auth_token!.token),
    {
      enabled,
      onError: (err: AxiosError) => {
        setDashboardError({ message: err?.response?.data?.message || err.message });
        set_error_banner({ message: err?.response?.data?.message || err.message, visible: true });
      }
    }
  );

  // 3. Pending Bookings Query
  const pendingBookingsQuery = useQuery<BookingSummary[], AxiosError>(
    ["admin_pending_bookings"],
    () => fetchPendingBookings(auth_token!.token),
    {
      enabled,
      onError: (err: AxiosError) => {
        setDashboardError({ message: err?.response?.data?.message || err.message });
        set_error_banner({ message: err?.response?.data?.message || err.message, visible: true });
      }
    }
  );

  // 4. Compose pendingDisputes
  const pendingDisputes: PendingDispute[] = React.useMemo(() => {
    if (flaggedReviewsQuery.data && pendingBookingsQuery.data) {
      return buildPendingDisputes(flaggedReviewsQuery.data, pendingBookingsQuery.data);
    }
    return [];
  }, [flaggedReviewsQuery.data, pendingBookingsQuery.data]);

  // Dashboard loading state (if any queries loading)
  const dashboardLoading =
    summaryStatsQuery.isLoading || flaggedReviewsQuery.isLoading || pendingBookingsQuery.isLoading;

  // Top-level refresh
  const queryClient = useQueryClient();
  const handleRefresh = () => {
    queryClient.invalidateQueries(["admin_dashboard_stats"]);
    queryClient.invalidateQueries(["admin_flagged_reviews"]);
    queryClient.invalidateQueries(["admin_pending_bookings"]);
    setDashboardError({ message: "" });
  };

  // Get admin avatar
  const adminAvatar = user?.profile_photo_url
    ? user.profile_photo_url
    : `https://picsum.photos/seed/${user?.user_id || "admin"}/48`;

  // Show loading spinner/overlay, error fallback, or dashboard
  return (
    <>
      {/* Admin Panel Layout: Sidebar + Topbar */}
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar nav */}
        <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col py-6">
          <div className="px-6 text-2xl font-bold text-indigo-600 tracking-widest mb-8">BeachVillas</div>
          <nav className="flex-1 flex flex-col gap-1 items-stretch">
            {ADMIN_SECTIONS.map(section => (
              <Link
                key={section.key}
                to={section.path}
                className={`px-6 py-3 flex items-center text-base rounded-lg font-medium hover:bg-indigo-50 transition
                  ${
                    window.location.pathname === section.path
                      ? "bg-indigo-100 text-indigo-900"
                      : "text-gray-800"
                  }
                `}
                tabIndex={0}
              >
                {section.label}
              </Link>
            ))}
          </nav>
          {/* Admin user info at bottom */}
          <div className="flex items-center mt-auto px-6 pt-8 pb-4 border-t border-gray-100">
            <img
              src={adminAvatar}
              alt="Admin avatar"
              className="w-10 h-10 rounded-full object-cover mr-3"
            />
            <div>
              <div className="font-semibold text-gray-900 leading-none">{user?.name || "Admin"}</div>
              <div className="text-xs text-gray-500">{user?.email}</div>
            </div>
          </div>
        </aside>

        {/* Main Content: Dashboard */}
        <main className="flex-1 p-8 flex flex-col overflow-auto">
          <div className="flex items-start sm:items-center justify-between mb-10">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500 max-w-lg">
                Monitor key platform metrics, access moderation, and respond to pending items. Click KPIs to drill down.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md shadow hover:bg-indigo-700 text-sm font-medium"
              disabled={dashboardLoading}
              aria-label="Refresh dashboard"
              tabIndex={0}
            >
              <svg className={`mr-2 w-4 h-4 ${dashboardLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.042 17.657A9 9 0 113 12.858" />
              </svg>
              Refresh
            </button>
          </div>
          {/* Loading/Spinner State */}
          {dashboardLoading && (
            <div className="flex flex-col items-center mt-16 space-y-3" role="status" aria-label="Loading dashboard...">
              <div className="w-12 h-12 border-4 border-indigo-500 border-dashed rounded-full animate-spin" />
              <div className="text-indigo-600 font-medium">Loading dashboard data…</div>
            </div>
          )}

          {/* Error State */}
          {!dashboardLoading && dashboardError.message && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded mb-6 flex items-center" role="alert">
              <svg className="w-5 h-5 mr-2 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                <circle cx="12" cy="12" r="10" />
              </svg>
              <span>{dashboardError.message}</span>
              <button
                className="ml-6 px-3 py-1 rounded bg-red-600 text-white font-medium hover:bg-red-700 transition text-xs"
                onClick={handleRefresh}
              >
                Retry
              </button>
            </div>
          )}

          {/* Main Dashboard if loaded */}
          {!dashboardLoading && !dashboardError.message && (
            <>
              {/* KPI Cards */}
              <section className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-14">
                {KPI_TILES.map(tile => {
                  const value =
                    tile.key === "occupancy_rate"
                      ? summaryStatsQuery.data?.occupancy_rate
                      : summaryStatsQuery.data?.[tile.key as keyof SummaryStats];

                  return (
                    <Link
                      key={tile.key}
                      to={tile.link}
                      className={`block rounded-xl ${tile.color} shadow hover:shadow-md hover:scale-105 transition transform ease-in-out`}
                      tabIndex={0}
                      aria-label={`View ${tile.label} details`}
                    >
                      <div className="p-6 flex items-center gap-4">
                        <div className="w-12 h-12 flex flex-col items-center justify-center rounded-full bg-white bg-opacity-80 shadow">{tile.icon}</div>
                        <div className="flex flex-col">
                          <span className="text-lg font-semibold">{tile.label}</span>
                          <span className="text-2xl font-extrabold mt-2">
                            {
                              tile.key === "occupancy_rate" && typeof value === "number"
                                ? `${value.toFixed(1)}%`
                                : typeof value === "number"
                                ? value
                                : "--"
                            }
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </section>

              {/* Pending Disputes / Moderation Needed */}
              <section className="mb-8">
                <h2 className="text-xl font-bold mb-2 text-gray-800 tracking-tight">Pending Items &amp; Disputes</h2>
                {pendingDisputes.length === 0 ? (
                  <div className="text-gray-500 border border-gray-100 rounded-lg px-6 py-4 bg-white">No pending flagged reviews or disputes.</div>
                ) : (
                  <ul className="divide-y divide-gray-100 bg-white rounded-lg border border-gray-100">
                    {pendingDisputes.slice(0, 6).map((d, idx) => (
                      <li key={d.type + d.id} className="px-6 py-4 flex items-center justify-between">
                        <div>
                          <span className={`inline-block align-middle mr-3 text-xs font-bold uppercase tracking-widest rounded px-2 py-0.5
                            ${d.type === "review" ? "bg-yellow-100 text-yellow-700" : "bg-orange-100 text-orange-700"}
                          `}>
                            {d.type === "review" ? "Review" : "Booking"}
                          </span>
                          <span className="font-medium text-gray-900">
                            {d.summary}
                          </span>
                          {d.related_user ? (
                            <span className="ml-2 text-sm text-gray-500">
                              (by {d.related_user.name})
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="hidden sm:inline-block text-xs text-gray-400">{formatDateTime(d.date)}</span>
                          <Link
                            to={
                              d.type === "review"
                                ? "/admin/reviews"
                                : "/admin/bookings"
                            }
                            className="ml-2 px-3 py-1 bg-indigo-50 font-semibold text-indigo-700 rounded hover:bg-indigo-600 hover:text-white text-xs transition"
                            tabIndex={0}
                          >
                            Moderate
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          {/* Accessibility: real-time region for live updates */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {dashboardLoading
              ? "Loading dashboard"
              : dashboardError.message
              ? "Dashboard error: " + dashboardError.message
              : "Dashboard loaded"}
          </div>
        </main>
      </div>
    </>
  );
};

export default UV_Admin_Dashboard;