import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
import { Link, useNavigate } from "react-router-dom";

// --- Types strictly from API/ZOD spec ---

// Host Earnings API (GET /host/earnings)
interface HostEarningsRow {
  booking_id: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
}
interface HostEarningsResponse {
  earnings: HostEarningsRow[];
  total_earnings: number;
}

// /villas/host response types
interface VillaSummary {
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
  host: any;
}

// Local filter state
interface EarningsFilter {
  date_range?: {
    start: string; // yyyy-mm-dd
    end: string; // yyyy-mm-dd
  };
  villa_id?: string; // feature explained below: not applied here as not present in /host/earnings
}

// Utility date helpers
function toISODate(dt: string | Date): string {
  const d = typeof dt === "string" ? new Date(dt) : dt;
  return d.toISOString().slice(0, 10);
}
function isWithinRange(date: string, start?: string, end?: string) {
  const d = new Date(date);
  if (start && d < new Date(start)) return false;
  if (end && d > new Date(end)) return false;
  return true;
}

// API fetches
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Fetch host earnings
const fetchHostEarnings = async (token: string): Promise<HostEarningsResponse> => {
  const res = await axios.get(`${API_BASE}/host/earnings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

// Fetch host villas, for filter dropdown (villa id -> name)
const fetchHostVillas = async (token: string): Promise<VillaSummary[]> => {
  const res = await axios.get(`${API_BASE}/villas/host`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.villas || [];
};

// The actual page/view component
const UV_Host_Earnings: React.FC = () => {
  // --- Auth and role gating ---
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const set_error_banner = useAppStore((s) => s.set_error_banner);
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect if not host
    if (
      !user ||
      !auth_token ||
      !(user.role === "host" || user.role === "guest_host")
    ) {
      navigate("/login", { replace: true });
    }
    // scroll top on mount
    window.scrollTo(0, 0);
  }, [user, auth_token, navigate]);

  // --- Filter State ---
  const [selectedFilter, setSelectedFilter] = useState<EarningsFilter>({});
  const [payoutScheduleExpanded, setPayoutScheduleExpanded] = useState(false);

  // Local error state for inline
  const [inlineError, setInlineError] = useState<string>("");

  // --- Data Fetching ---
  const {
    data: hostEarningsResp,
    isLoading: isEarningsLoading,
    isError: isEarningsError,
    error: earningsError,
    refetch: refetchEarnings,
  } = useQuery<HostEarningsResponse, Error>(
    ["hostEarnings"],
    () =>
      auth_token ? fetchHostEarnings(auth_token.token) : Promise.reject("No token"),
    {
      enabled: !!auth_token,
      staleTime: 60 * 1000, // 1 min
      onError: (err) => {
        set_error_banner({
          message: err?.message || "Failed to load earnings data.",
          visible: true,
        });
        setInlineError(
          err?.message ||
            "There was an error loading your earnings. Please retry later."
        );
      },
      retry: false,
    }
  );
  // Also fetch host villas for dropdown
  const {
    data: villaOptions,
    isLoading: isVillasLoading,
    isError: isVillasError,
  } = useQuery<VillaSummary[], Error>(
    ["hostVillas"],
    () =>
      auth_token ? fetchHostVillas(auth_token.token) : Promise.reject("No token"),
    {
      enabled: !!auth_token,
      staleTime: 5 * 60 * 1000,
      retry: false,
    }
  );

  // --- Filtering earnings: date range ---
  const filteredEarnings: HostEarningsRow[] = useMemo(() => {
    if (!hostEarningsResp?.earnings) return [];
    let arr = hostEarningsResp.earnings;
    if (selectedFilter.date_range) {
      const { start, end } = selectedFilter.date_range;
      arr = arr.filter((e) => isWithinRange(e.date, start, end));
    }
    // If villa_id filtering implemented via booking lookup, would filter here
    return arr;
  }, [hostEarningsResp, selectedFilter]);

  // Total for current filter (could differ from totalEarnings = lifetime)
  const filterTotal = useMemo(() => {
    return filteredEarnings.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredEarnings]);

  const currency =
    filteredEarnings[0]?.currency ||
    hostEarningsResp?.earnings?.[0]?.currency ||
    "USD";

  // --- Date picker/selector controls ---
  const [dateStartTmp, setDateStartTmp] = useState<string>("");
  const [dateEndTmp, setDateEndTmp] = useState<string>("");

  // For reset controls
  const handleClearFilters = () => {
    setSelectedFilter({});
    setDateStartTmp("");
    setDateEndTmp("");
    setInlineError("");
  };

  const handleApplyDateFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateStartTmp && dateEndTmp && dateEndTmp < dateStartTmp) {
      setInlineError("End date must be after start date");
      return;
    }
    setSelectedFilter((prev) => ({
      ...prev,
      date_range:
        dateStartTmp || dateEndTmp
          ? { start: dateStartTmp || "", end: dateEndTmp || "" }
          : undefined,
    }));
    setInlineError("");
  };

  // --- Payout FAQ toggle ---
  const handleTogglePayoutFAQ = () =>
    setPayoutScheduleExpanded((prev) => !prev);

  // --- Booking details navigation (from row) ---
  const handleBookingDetails = (booking_id: string) => {
    navigate(`/booking/${booking_id}/details`);
  };

  // --- Loading and Error state UI ---
  if (isEarningsLoading || isVillasLoading) {
    return (
      <>
        <div className="w-full flex items-center justify-center h-96 min-h-[24rem]">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-sky-400 border-t-transparent" />
          <div className="ml-4 text-lg font-medium text-sky-700">Loading earnings...</div>
        </div>
      </>
    );
  }
  if (isEarningsError) {
    return (
      <>
        <div className="w-full flex flex-col items-center justify-center py-16">
          <div className="text-xl font-bold text-red-600 mb-2">Unable to load earnings</div>
          <div className="mb-4 text-gray-600">{inlineError || "An error occurred."}</div>
          <button
            onClick={() => refetchEarnings()}
            className="px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700 transition"
            type="button"
          >
            Retry
          </button>
        </div>
      </>
    );
  }

  // --- Main Render ---
  return (
    <>
      <div className="max-w-6xl mx-auto w-full p-2 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">
              Earnings Overview
            </h1>
            <p className="mt-2 text-gray-500 max-w-xl">
              Track your total earnings, see payment status and payout history per booking. Filter by date to focus on a certain period. For payout policy info, see the FAQ below.
            </p>
          </div>
          <div className="mt-2 sm:mt-0 flex flex-col items-end">
            <span className="text-gray-600 text-sm font-semibold mb-1 uppercase tracking-wide">
              Lifetime Earnings
            </span>
            <span className="text-3xl font-bold text-sky-700">
              {hostEarningsResp?.total_earnings
                ? `${hostEarningsResp.total_earnings.toLocaleString(undefined, {
                    style: "currency",
                    currency,
                  })}`
                : "--"}
            </span>
          </div>
        </div>
        <div className="mt-6 flex flex-col md:flex-row md:space-x-8 lg:space-x-16 gap-y-6">
          {/* Filters Section */}
          <form
            className="rounded-md border bg-slate-50 p-4 flex flex-col gap-4 shadow-sm w-full md:max-w-xs"
            onSubmit={handleApplyDateFilter}
          >
            <div>
              <label className="font-medium block mb-1" htmlFor="dateStart">
                Start Date
              </label>
              <input
                id="dateStart"
                name="dateStart"
                type="date"
                className="border p-2 rounded w-full focus:outline-sky-400"
                value={dateStartTmp}
                max={dateEndTmp || undefined}
                onChange={(e) => setDateStartTmp(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium block mb-1" htmlFor="dateEnd">
                End Date
              </label>
              <input
                id="dateEnd"
                name="dateEnd"
                type="date"
                className="border p-2 rounded w-full focus:outline-sky-400"
                value={dateEndTmp}
                min={dateStartTmp || undefined}
                onChange={(e) => setDateEndTmp(e.target.value)}
              />
            </div>
            <button
              className="w-full bg-sky-600 text-white rounded p-2 font-semibold hover:bg-sky-700 transition"
              type="submit"
            >
              Apply Date Filter
            </button>
            <button
              className="w-full border border-sky-200 rounded p-2 text-sky-600 hover:bg-sky-50 font-medium transition"
              onClick={handleClearFilters}
              type="button"
              disabled={!selectedFilter.date_range && !dateStartTmp && !dateEndTmp}
            >
              Reset Filters
            </button>
            {inlineError && (
              <div className="text-red-600 mt-1 text-sm">{inlineError}</div>
            )}
            {/* Villa filter: DISABLED for MVP as not present in API */}
            <div className="mt-1">
              <label className="font-medium block mb-1" htmlFor="villaFilter">
                Filter by Villa
              </label>
              <select
                id="villaFilter"
                name="villaFilter"
                className="border rounded p-2 w-full bg-gray-100 text-gray-400 cursor-not-allowed"
                disabled
                value=""
                onChange={() => {}}
              >
                <option value="">(Coming soon) Not available in this view</option>
              </select>
              <span className="text-xs text-gray-400 block mt-1">
                Villa-level filtering will be available in future updates.
              </span>
            </div>
          </form>
          {/* Earnings Table */}
          <div className="flex-1">
            <div className="flex items-baseline justify-between gap-x-3 gap-y-1 mb-2 flex-wrap">
              <div className="text-gray-700 font-medium">
                Showing <span className="font-bold">{filteredEarnings.length}</span>{" "}
                payouts{" "}
                {selectedFilter.date_range && (
                  <>
                    from{" "}
                    <span className="font-semibold">
                      {selectedFilter.date_range.start || "?"}
                    </span>{" "}
                    to{" "}
                    <span className="font-semibold">
                      {selectedFilter.date_range.end || "?"}
                    </span>
                  </>
                )}
              </div>
              <div className="text-gray-500 text-sm">
                Filter total:{" "}
                <span className="font-semibold text-sky-700">
                  {filterTotal
                    ? filterTotal.toLocaleString(undefined, {
                        style: "currency",
                        currency,
                      })
                    : "--"}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto border rounded shadow bg-white">
              <table className="min-w-full table-auto">
                <thead>
                  <tr className="bg-sky-50">
                    <th className="p-3 text-gray-700 font-semibold text-left text-sm">Date</th>
                    <th className="p-3 text-gray-700 font-semibold text-left text-sm">Booking</th>
                    <th className="p-3 text-gray-700 font-semibold text-right text-sm">Amount</th>
                    <th className="p-3 text-gray-700 font-semibold text-center text-sm">Status</th>
                    <th className="p-3 text-gray-700 font-semibold text-center text-sm">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEarnings.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-gray-400 text-center p-8">
                        No earnings found for the selected period.
                      </td>
                    </tr>
                  )}
                  {filteredEarnings.map((row) => (
                    <tr key={row.booking_id} className="border-b hover:bg-sky-50 group transition">
                      <td className="p-3 text-gray-700">
                        {toISODate(row.date)}
                      </td>
                      <td className="p-3 font-mono text-blue-700 underline cursor-pointer" onClick={() => handleBookingDetails(row.booking_id)}>
                        {row.booking_id}
                      </td>
                      <td className="p-3 text-right font-semibold text-sky-800">
                        {row.amount.toLocaleString(undefined, {
                          style: "currency",
                          currency: row.currency || currency || "USD",
                        })}
                      </td>
                      <td className="p-3 text-center">
                        {row.status === "paid" ? (
                          <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full px-3 py-1">
                            Paid
                          </span>
                        ) : row.status === "pending" ? (
                          <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold rounded-full px-3 py-1">
                            Pending
                          </span>
                        ) : (
                          <span className="inline-block bg-gray-100 text-gray-500 text-xs rounded-full px-3 py-1">
                            {row.status}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          className="text-sky-600 underline hover:text-sky-800 font-medium"
                          type="button"
                          onClick={() => handleBookingDetails(row.booking_id)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mock Next Payout Info */}
            <div className="my-6 p-3 bg-emerald-50 border border-emerald-100 rounded flex items-center gap-4">
              <span className="inline-flex items-center bg-emerald-200 text-emerald-700 px-2 py-1 rounded font-bold text-xs uppercase">
                Next Payout
              </span>
              <span className="text-gray-700 font-medium">
                All completed bookings with "Paid" status processed nightly. Typical payout: <strong>Next business day</strong> after guest check-out.
              </span>
            </div>
            {/* Payout Schedule/FAQ */}
            <div className="mt-2">
              <button
                type="button"
                onClick={handleTogglePayoutFAQ}
                className="flex items-center gap-2 text-sky-600 hover:underline font-medium"
              >
                <span>
                  {payoutScheduleExpanded ? "▼" : "►"}
                </span>
                <span>
                  About Host Payouts and Fees (Click to {payoutScheduleExpanded ? "hide" : "expand"})
                </span>
              </button>
              {payoutScheduleExpanded && (
                <div className="mt-3 px-4 py-3 bg-sky-50 border-l-4 border-sky-400 rounded shadow-inner flex flex-col gap-2 text-gray-600 text-sm leading-relaxed">
                  <p>
                    <strong>How does the payout process work?</strong> <br />
                    Your earnings for each booking are released the <b>morning after guest check-out</b>. Depending on your selected payout method (bank transfer, PayPal, etc.), funds may take 1–5 business days to arrive in your account.
                  </p>
                  <p>
                    <strong>Platform Fees:</strong> <br />
                    All displayed amounts are <b>net of platform service fees</b>. For detailed breakdowns of our fee structure, please visit the <Link to="/faq" className="text-sky-700 underline">FAQ</Link>.
                  </p>
                  <p>
                    <strong>Payout Schedule</strong> <br />
                    Payouts are batched every night, including all "Paid" bookings completed that day.
                  </p>
                  <p>
                    For more details, see <Link to="/faq" className="text-sky-700 underline">FAQ/TOS</Link>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default UV_Host_Earnings;