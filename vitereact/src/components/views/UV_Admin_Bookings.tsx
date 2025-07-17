import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
// Zod-type imports
import type { Booking, BookingDetail, BookingList, AdminAction } from "@schema";

// Type for filters and pagination state
interface Filters {
  villa?: string | null;
  guest?: string | null;
  host?: string | null;
  status?: string | null;
  dateRange?: { start: string; end: string } | null;
  search?: string;
}
interface Pagination {
  page: number;
  pageSize: number;
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Helper for date formatting
function formatDate(date: string | number | null | undefined, opts: {date?:boolean, time?:boolean} = {date:true, time:false}): string {
  if (!date) return "-";
  let d: Date;
  if (typeof date === "string" && date.length >= 8 && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    // yyyy-mm-dd
    d = new Date(date);
  } else if (typeof date === "number") {
    d = new Date(date * 1000); // Assume unix seconds
    if (d.getTime() < 8640000000000000 && d.getTime() > 946684800000) {
      // reasonable date
    } else {
      // fallback: already ms
      d = new Date(date);
    }
  } else if (typeof date === "string" && !isNaN(Number(date))) {
    d = new Date(Number(date));
  } else {
    return "-";
  }
  if (opts.time) return d.toLocaleString();
  return d.toLocaleDateString();
}

// Helper: pulls JWT from Zustand store
function useAuthHeaders() {
  const token = useAppStore((s) => s.auth_token?.token);
  return useMemo(
    () => ({
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {},
    }),
    [token]
  );
}

// Helper: safe get
function safe(obj: any, path: string, fallback: any = null) {
  const parts = path.split(".");
  let v = obj;
  for (let p of parts) {
    if (!v) return fallback;
    v = v[p];
  }
  return v ?? fallback;
}

// Main component
const UV_Admin_Bookings: React.FC = () => {
  // 1. ZUSTAND GLOBAL STATE
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const set_admin_view_context = useAppStore((s) => s.set_admin_view_context);

  // 2. FILTERS & PAGINATION STATE: controlled via local state (urlParams possible but not required here)
  const [filters, setFilters] = useState<Filters>({
    villa: null,
    guest: null,
    host: null,
    status: "",
    dateRange: null,
    search: "",
  });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25 });

  // 3. TABLE/GENERAL STATE
  const [tableLoading, setTableLoading] = useState<boolean>(false);
  const [tableError, setTableError] = useState<{ message: string }>({ message: "" });

  // 4. Modal state
  // - detail view: { booking_id, visible }
  // - booking log: { booking_id, events: AdminAction[], visible }
  const [detailViewModal, setDetailViewModal] = useState<{
    booking_id: string;
    visible: boolean;
    detail?: BookingDetail;
    loading?: boolean;
    error?: string;
  } | null>(null);

  const [bookingLogModal, setBookingLogModal] = useState<{
    booking_id: string;
    events: AdminAction[] | null;
    visible: boolean;
    loading?: boolean;
    error?: string;
  } | null>(null);

  // 5. Table data: use react-query
  // Build query params from filters/pagination
  function filtersToUrlParams(fs: Filters, pg: Pagination) {
    const params: Record<string, any> = {};
    if (fs.villa) params.villa = fs.villa;
    if (fs.guest) params.guest = fs.guest;
    if (fs.host) params.host = fs.host;
    if (fs.status) params.status = fs.status;
    if (fs.dateRange?.start) params.date_start = fs.dateRange.start;
    if (fs.dateRange?.end) params.date_end = fs.dateRange.end;
    if (fs.search) params.search = fs.search;
    params.page = pg.page;
    params.page_size = pg.pageSize;
    return params;
  }

  const queryClient = useQueryClient();
  const authHeaders = useAuthHeaders();

  // Query for bookings table
  const {
    data: bookingsList,
    isLoading: isTableLoading,
    isError: isTableError,
    refetch: refetchBookings,
    error: tableErrorData,
  } = useQuery<BookingList, any>({
    queryKey: ["adminBookings", filters, pagination],
    queryFn: async () => {
      setTableError({ message: "" });
      setTableLoading(true);
      try {
        const params = filtersToUrlParams(filters, pagination);
        const res = await axios.get(
          `${API_BASE}/admin/bookings`,
          {
            params,
            ...authHeaders,
          }
        );
        setTableLoading(false);
        return res.data;
      } catch (err: any) {
        setTableLoading(false);
        if (err?.response?.data?.message) {
          setTableError({ message: err.response.data.message });
        } else {
          setTableError({ message: "Error loading bookings." });
        }
        throw err;
      }
    },
    keepPreviousData: true,
    refetchOnWindowFocus: false,
  });

  // Table data normalization
  const bookings: Booking[] = bookingsList?.bookings ?? [];
  const bookingsTotal: number = bookingsList?.total ?? 0;

  // 6. Mutations: force cancel
  const forceCancelBookingMutation = useMutation<
    BookingDetail,
    any,
    { booking_id: string; reason: string }
  >({
    mutationFn: async ({ booking_id, reason }) => {
      const res = await axios.patch(
        `${API_BASE}/booking/${booking_id}`,
        { status: "cancelled", cancellation_reason: reason },
        authHeaders
      );
      return res.data;
    },
    onSuccess: (data, vars) => {
      // close modal, refetch data
      setDetailViewModal(null);
      refetchBookings();
    },
    onError: (err: any, vars) => {
      setDetailViewModal((prev) =>
        prev
          ? {
              ...prev,
              error: err?.response?.data?.message || "Failed to cancel booking.",
              loading: false,
            }
          : prev
      );
    },
  });

  // 7. Booking logs fetch
  async function fetchBookingLogs(booking_id: string): Promise<AdminAction[]> {
    const res = await axios.get(
      `${API_BASE}/admin/actions`,
      {
        params: {
          target_type: "booking",
          target_id: booking_id,
        },
        ...authHeaders,
      }
    );
    return Array.isArray(res.data.actions) ? res.data.actions : [];
  }

  // 8. Booking detail fetch (modal)
  async function fetchBookingDetail(booking_id: string): Promise<BookingDetail> {
    const res = await axios.get(
      `${API_BASE}/booking/${booking_id}`,
      authHeaders
    );
    return res.data;
  }

  // 9. Handle filters - per-field
  function updateFilter<K extends keyof Filters>(key: K, value: any) {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
    setPagination((p) => ({ ...p, page: 1 })); // reset to first page
  }

  // 10. Pagination
  function handlePageChange(newPage: number) {
    setPagination((prev) => ({ ...prev, page: newPage }));
  }

  function handlePageSizeChange(size: number) {
    setPagination((prev) => ({ ...prev, pageSize: size, page: 1 }));
  }

  // 11. Table: action handlers
  const handleViewDetail = async (booking_id: string) => {
    setDetailViewModal({
      booking_id,
      visible: true,
      loading: true,
    });
    try {
      const detail = await fetchBookingDetail(booking_id);
      setDetailViewModal({
        booking_id,
        visible: true,
        detail,
        loading: false,
        error: "",
      });
    } catch (err: any) {
      setDetailViewModal({
        booking_id,
        visible: true,
        loading: false,
        error: err?.response?.data?.message || "Error loading detail.",
      });
    }
  };

  const handleViewLog = async (booking_id: string) => {
    setBookingLogModal({
      booking_id,
      events: null,
      visible: true,
      loading: true,
    });
    try {
      const events: AdminAction[] = await fetchBookingLogs(booking_id);
      setBookingLogModal({
        booking_id,
        events,
        visible: true,
        loading: false,
      });
    } catch (err: any) {
      setBookingLogModal({
        booking_id,
        events: null,
        visible: true,
        loading: false,
        error: err?.response?.data?.message || "Failed to load event log.",
      });
    }
  };

  const handleForceCancel = () => {
    // Open in detail modal prompt to confirm and write reason before firing mutation
    // This UI is inside the detail modal - see render
    return;
  };

  // 12. Side effect: Persist admin view context to zustand
  useEffect(() => {
    set_admin_view_context({ tab: "bookings", filters });
  }, [filters, set_admin_view_context]);

  // 13. Error boundary
  // fallback: print error + reload button
  if (isTableError) {
    return (
      <>
        <div className="w-full min-h-[40vh] flex flex-col items-center justify-center">
          <div className="text-red-600 font-semibold mb-2">
            {safe(tableErrorData, "response.data.message", "Failed to load bookings.")}
          </div>
          <button
            className="bg-blue-500 px-4 py-2 rounded text-white"
            onClick={() => refetchBookings()}
          >
            Retry
          </button>
        </div>
      </>
    );
  }

  // 14. Table columns to show
  // Villa: cover, name, id; Guest: name, email; Host: name; Dates; Status; Total Price; Payment Status
  // Actions: View, Log, Force Cancel

  return (
    <>
      <div className="p-6 max-w-full flex flex-col min-h-screen bg-gray-50">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">Bookings Oversight</h1>
          <div className="text-gray-600 mt-1 mb-2">System-of-record for all bookings: audit, force cancel, review logs and status for all villas, guests and hosts.</div>
        </div>
        {/* FILTER BAR */}
        <div className="bg-white p-4 rounded-md shadow-sm flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Villa filter (by id or name string) */}
            <input
              className="input input-bordered p-2 rounded border-gray-200 shadow-sm w-36"
              placeholder="Villa ID"
              value={filters.villa || ""}
              type="text"
              onChange={e => updateFilter("villa", e.target.value || null)}
            />
            {/* Guest filter (by id, name, email string) */}
            <input
              className="input input-bordered p-2 rounded border-gray-200 shadow-sm w-36"
              placeholder="Guest ID / Email"
              value={filters.guest || ""}
              type="text"
              onChange={e => updateFilter("guest", e.target.value || null)}
            />
            {/* Host filter (by id or name string) */}
            <input
              className="input input-bordered p-2 rounded border-gray-200 shadow-sm w-36"
              placeholder="Host ID"
              value={filters.host || ""}
              type="text"
              onChange={e => updateFilter("host", e.target.value || null)}
            />
            {/* Status select */}
            <select
              className="rounded border-gray-200 px-2 py-1"
              value={filters.status || ""}
              onChange={e => updateFilter("status", e.target.value)}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {/* Date range: simple from/to - ISO format yyyy-mm-dd */}
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={filters.dateRange?.start || ""}
                className="p-2 rounded border-gray-200"
                onChange={e =>
                  updateFilter("dateRange", {
                    ...(filters.dateRange || {}),
                    start: e.target.value,
                    end: filters.dateRange?.end || "",
                  })
                }
              />
              <span className="mx-1">–</span>
              <input
                type="date"
                value={filters.dateRange?.end || ""}
                className="p-2 rounded border-gray-200"
                onChange={e =>
                  updateFilter("dateRange", {
                    ...(filters.dateRange || {}),
                    start: filters.dateRange?.start || "",
                    end: e.target.value,
                  })
                }
              />
            </div>
            {/* Free text (villa, user) */}
            <input
              className="input input-bordered p-2 rounded border-gray-200 shadow-sm w-48"
              placeholder="Search (villa/user)"
              value={filters.search || ""}
              type="text"
              onChange={e => updateFilter("search", e.target.value)}
            />
            <button
              className="border px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
              onClick={() => refetchBookings()}
              disabled={tableLoading}
            >
              Search
            </button>
            <button
              className="border px-2 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 ml-1"
              onClick={() => {
                setFilters({
                  villa: null,
                  guest: null,
                  host: null,
                  status: "",
                  dateRange: null,
                  search: "",
                });
                setPagination({ page: 1, pageSize: 25 });
              }}
              disabled={tableLoading}
            >
              Reset
            </button>
          </div>
          {/* Page size select */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Rows:</span>
            <select
              value={pagination.pageSize}
              className="rounded border-gray-200 px-2 py-1"
              onChange={e => handlePageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map(sz => (
                <option key={sz} value={sz}>{sz}</option>
              ))}
            </select>
          </div>
        </div>
        {/* TABLE SECTION */}
        <div className="relative overflow-x-auto bg-white rounded-md shadow">
          {/* Loading overlay */}
          {isTableLoading && (
            <div className="absolute inset-0 bg-white bg-opacity-60 z-10 flex items-center justify-center">
              <span className="loader border-blue-400"></span>
              <span className="ml-3 text-blue-500 font-semibold">Loading...</span>
            </div>
          )}
          {tableError.message && (
            <div className="text-red-600 text-sm py-4 text-center">{tableError.message}</div>
          )}
          <table className="min-w-full text-sm text-left">
            <thead className="text-gray-700 bg-gray-100">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Villa</th>
                <th className="p-2">Guest</th>
                <th className="p-2">Host</th>
                <th className="p-2">Check In</th>
                <th className="p-2">Check Out</th>
                <th className="p-2">Guests</th>
                <th className="p-2">Status</th>
                <th className="p-2">Total</th>
                <th className="p-2">Payment</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {!isTableLoading && bookings.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center p-6 text-gray-500">No bookings found.</td>
                </tr>
              )}
              {bookings.map(booking => (
                <tr key={booking.booking_id} className="border-t last:border-b-0 hover:bg-blue-50">
                  <td className="p-2 font-mono text-xs">{booking.booking_id.slice(0, 8)}</td>
                  <td className="p-2 flex items-center gap-2">
                    {booking.villa?.cover_photo_url ? (
                      <img
                        src={booking.villa.cover_photo_url}
                        className="w-9 h-9 object-cover rounded border"
                        alt={booking.villa.name}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded bg-gray-200" />
                    )}
                    <div>
                      <div className="font-semibold">{booking.villa?.name || "-"}</div>
                      <div className="text-gray-400 text-xs">{booking.villa?.villa_id || "-"}</div>
                    </div>
                  </td>
                  <td className="p-2">
                    <span className="font-medium">{booking.guest?.name || "-"}</span><br />
                    <span className="text-xs">{booking.guest?.email || ""}</span>
                  </td>
                  <td className="p-2 font-medium">{booking.host?.name || "-"}</td>
                  <td className="p-2">{formatDate(booking.check_in)}</td>
                  <td className="p-2">{formatDate(booking.check_out)}</td>
                  <td className="p-2 text-center">{booking.number_of_guests}</td>
                  <td className="p-2">
                    <span
                      className={
                        `px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide ` +
                        (booking.status === "cancelled"
                          ? "bg-red-100 text-red-600"
                          : booking.status === "confirmed"
                          ? "bg-green-100 text-green-600"
                          : booking.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-600")
                      }
                    >
                      {booking.status}
                    </span>
                  </td>
                  <td className="p-2">
                    {booking.total_price?.toLocaleString("en-US", {
                      style: "currency",
                      currency: booking.currency || "USD",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="p-2 text-xs">
                    {booking.payment_status ? (
                      <span
                        className={
                          booking.payment_status === "paid"
                            ? "text-green-600 bg-green-50 px-1 rounded"
                            : booking.payment_status === "pending"
                            ? "text-yellow-700 bg-yellow-50 px-1 rounded"
                            : "text-gray-500 bg-gray-100 px-1 rounded"
                        }
                      >
                        {booking.payment_status}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleViewDetail(booking.booking_id)}
                        className="text-blue-600 hover:underline text-xs font-semibold"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleViewLog(booking.booking_id)}
                        className="text-gray-600 hover:underline text-xs"
                      >
                        View Log
                      </button>
                      {booking.status !== "cancelled" && booking.status !== "rejected" && (
                        <button
                          onClick={() => handleViewDetail(booking.booking_id)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Force Cancel
                        </button>
                      )}
                      {/* TODO: Mark Resolved - no endpoint */}
                      {/* <button className="text-green-800 hover:underline text-xs">
                        Mark Resolved
                      </button> */}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* PAGINATION */}
        {bookingsTotal > 0 && (
          <div className="flex justify-between items-center mt-4 text-sm text-gray-700">
            <div>
              Showing {(pagination.page - 1) * pagination.pageSize + 1} –{" "}
              {Math.min(pagination.page * pagination.pageSize, bookingsTotal)} of {bookingsTotal}{" "}
              bookings
            </div>
            <div className="flex gap-1 items-center">
              <button
                disabled={pagination.page <= 1}
                className={`px-2 py-1 border rounded ${pagination.page <= 1 ? "opacity-50" : "hover:bg-gray-200"}`}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                Prev
              </button>
              <span className="mx-2">Page {pagination.page}</span>
              <button
                disabled={pagination.page * pagination.pageSize >= bookingsTotal}
                className={`px-2 py-1 border rounded ${pagination.page * pagination.pageSize >= bookingsTotal ? "opacity-50" : "hover:bg-gray-200"}`}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* BOOKING DETAIL MODAL */}
        {detailViewModal && detailViewModal.visible && (
          <div className="fixed z-50 inset-0 bg-black bg-opacity-40 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl p-6 relative flex flex-col">
              <button
                className="absolute top-3 right-3 text-gray-500 hover:text-red-400"
                onClick={() => setDetailViewModal(null)}
                aria-label="Close"
              >
                ×
              </button>
              {detailViewModal.loading ? (
                <div className="flex items-center justify-center w-full h-32">
                  <span className="loader border-blue-400"></span>
                  <span className="ml-2 text-blue-600 font-medium">Loading...</span>
                </div>
              ) : detailViewModal.error ? (
                <div className="text-red-600 font-medium min-h-[40px] flex flex-col items-center justify-center">
                  {detailViewModal.error}
                  <button
                    className="border mt-2 px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600"
                    onClick={() => handleViewDetail(detailViewModal.booking_id)}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                detailViewModal.detail && (
                  <>
                    <div className="mb-2 flex gap-3 items-center">
                      <div className="text-xl font-semibold">Booking Detail</div>
                      <span
                        className={
                          `px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide ` +
                          (detailViewModal.detail.status === "cancelled"
                            ? "bg-red-100 text-red-600"
                            : detailViewModal.detail.status === "confirmed"
                            ? "bg-green-100 text-green-600"
                            : detailViewModal.detail.status === "pending"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-600")
                        }
                      >
                        {detailViewModal.detail.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3 text-sm">
                      <div>
                        <span className="font-semibold">ID: </span>
                        <span className="font-mono">{detailViewModal.detail.booking_id}</span>
                      </div>
                      <div>
                        <span className="font-semibold">Villa: </span>
                        {detailViewModal.detail.villa?.name}
                      </div>
                      <div>
                        <span className="font-semibold">Guest: </span>
                        {detailViewModal.detail.guest?.name}
                      </div>
                      <div>
                        <span className="font-semibold">Host: </span>
                        {detailViewModal.detail.host?.name}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-3 mb-3">
                      <div>
                        <div>
                          <span className="font-semibold">Check In: </span>
                          {formatDate(detailViewModal.detail.check_in)}
                        </div>
                        <div>
                          <span className="font-semibold">Check Out: </span>
                          {formatDate(detailViewModal.detail.check_out)}
                        </div>
                        <div>
                          <span className="font-semibold">Guests: </span>
                          {detailViewModal.detail.number_of_guests}
                        </div>
                        <div>
                          <span className="font-semibold">Booking Type: </span>
                          {detailViewModal.detail.booking_type}
                        </div>
                        <div>
                          <span className="font-semibold">Special Requests: </span>
                          {detailViewModal.detail.special_requests || "-"}
                        </div>
                        <div>
                          <span className="font-semibold">Payment Status: </span>
                          {detailViewModal.detail.payment_status}
                        </div>
                      </div>
                      <div>
                        <div>
                          <span className="font-semibold">Total: </span>
                          {detailViewModal.detail.total_price?.toLocaleString("en-US", {
                            style: "currency",
                            currency: detailViewModal.detail.currency || "USD",
                          })}
                        </div>
                        <div>
                          <span className="font-semibold">Fees: </span>
                          Cleaning: {detailViewModal.detail.cleaning_fee || 0}, Service: {detailViewModal.detail.service_fee || 0}, Security: {detailViewModal.detail.security_deposit || 0}
                        </div>
                        <div>
                          <span className="font-semibold">Created At: </span>
                          {formatDate(detailViewModal.detail.created_at, { date: true, time: true })}
                        </div>
                        <div>
                          <span className="font-semibold">Updated At: </span>
                          {formatDate(detailViewModal.detail.updated_at, { date: true, time: true })}
                        </div>
                        <div>
                          <span className="font-semibold">Cancellation Reason: </span>
                          {detailViewModal.detail.cancellation_reason || "-"}
                        </div>
                      </div>
                    </div>
                    {/* Force Cancel */}
                    {detailViewModal.detail.status !== "cancelled" && detailViewModal.detail.status !== "rejected" && (
                      <ForceCancelSection
                        booking_id={detailViewModal.booking_id}
                        onCancel={(reason) => {
                          // fire mutation
                          forceCancelBookingMutation.mutate({ booking_id: detailViewModal.booking_id, reason });
                        }}
                        isMutating={forceCancelBookingMutation.isPending}
                        mutationError={forceCancelBookingMutation.error}
                      />
                    )}
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={() => handleViewLog(detailViewModal.booking_id)}
                        className="border px-3 py-1 rounded bg-gray-100 hover:bg-blue-100"
                      >
                        View Log
                      </button>
                      <button
                        onClick={() => setDetailViewModal(null)}
                        className="border px-3 py-1 rounded bg-gray-200"
                      >
                        Close
                      </button>
                    </div>
                  </>
                )
              )}
            </div>
          </div>
        )}
        {/* BOOKING LOG MODAL */}
        {bookingLogModal && bookingLogModal.visible && (
          <div className="fixed z-50 inset-0 bg-black bg-opacity-40 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl p-6 relative flex flex-col">
              <button
                className="absolute top-3 right-3 text-gray-500 hover:text-red-400"
                onClick={() => setBookingLogModal(null)}
                aria-label="Close"
              >
                ×
              </button>
              <div className="mb-2 flex gap-3 items-center">
                <div className="text-xl font-semibold">Booking Event Log</div>
              </div>
              {bookingLogModal.loading ? (
                <div className="flex items-center justify-center w-full h-32">
                  <span className="loader border-blue-400"></span>
                  <span className="ml-2 text-blue-600 font-medium">Loading...</span>
                </div>
              ) : bookingLogModal.error ? (
                <div className="text-red-600 font-medium min-h-[40px] flex flex-col items-center justify-center">
                  {bookingLogModal.error}
                  <button
                    className="border mt-2 px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600"
                    onClick={() => handleViewLog(bookingLogModal.booking_id)}
                  >
                    Retry
                  </button>
                </div>
              ) : (Array.isArray(bookingLogModal.events) && bookingLogModal.events.length > 0) ? (
                <div className="max-h-96 overflow-y-auto mt-2">
                  <ul className="divide-y">
                    {bookingLogModal.events.map(ev => (
                      <li key={ev.admin_action_id} className="py-3 px-1 flex flex-col">
                        <span className="font-semibold">{ev.action_type}</span>
                        <span className="text-xs text-gray-500">
                          By {ev.admin_user_id} on {formatDate(ev.created_at, {date:true, time:true})}
                        </span>
                        {ev.notes && <span className="text-sm mt-1">{ev.notes}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-gray-500 py-8 text-center">No events found.</div>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setBookingLogModal(null)}
                  className="border px-3 py-1 rounded bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Loader style */}
      <style>{`
        .loader {
          border: 2px solid #e5e7eb;
          border-radius: 50%;
          border-top: 2px solid #3b82f6;
          width: 1.5rem;
          height: 1.5rem;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg);}
          100% { transform: rotate(360deg);}
        }
      `}</style>
    </>
  );
};

// Inline component (in main file!) for Force Cancel
const ForceCancelSection: React.FC<{
  booking_id: string;
  onCancel: (reason: string) => void;
  isMutating: boolean;
  mutationError: any;
}> = ({ booking_id, onCancel, isMutating, mutationError }) => {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="my-3">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="bg-red-100 px-3 py-1 rounded text-red-700 hover:bg-red-200 font-semibold text-sm"
        >
          Force Cancel Booking
        </button>
      ) : (
        <form
          className="flex flex-col gap-2 mt-2"
          onSubmit={e => {
            e.preventDefault();
            setError(null);
            if (!reason.trim()) {
              setError("Please provide a reason for cancellation.");
              return;
            }
            onCancel(reason);
          }}
        >
          <div>
            <label htmlFor="cancel-reason" className="font-medium text-sm text-red-700">
              Reason for cancellation (required)
            </label>
            <textarea
              id="cancel-reason"
              className="w-full border rounded p-2 mt-1"
              rows={2}
              value={reason}
              disabled={isMutating}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          {error && <div className="text-red-600 text-xs">{error}</div>}
          {mutationError && (
            <div className="text-red-600 text-xs">
              {mutationError?.response?.data?.message || "Failed to cancel booking."}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              type="submit"
              disabled={isMutating}
              className="bg-red-600 text-white px-4 py-1 rounded font-semibold"
            >
              {isMutating ? "Cancelling..." : "Confirm Cancel"}
            </button>
            <button
              type="button"
              disabled={isMutating}
              className="bg-gray-100 px-3 py-1 rounded text-gray-700"
              onClick={() => setShowForm(false)}
            >
              Dismiss
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default UV_Admin_Bookings;