import React, { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/main";

// --- Type definitions ---
interface CalendarLinks {
  googleUrl: string;
  iCalUrl: string;
}

// Type for BookingDetail per OpenAPI/Zod
interface UserShort {
  user_id: string;
  name: string;
  email?: string;
  role?: string;
  profile_photo_url?: string | null;
}

interface VillaSummary {
  villa_id: string;
  name: string;
  cover_photo_url: string;
  city: string;
  country: string;
}

interface BookingReview {
  review_id: string;
  rating: number;
  review_text: string;
}

interface Payment {
  payment_method: string;
  status: string;
  amount_paid: number;
  paid_at: number;
  transaction_reference?: string;
}

interface MessageThread {
  thread_id: string;
}

interface BookingDetail {
  booking_id: string;
  villa: VillaSummary;
  guest: UserShort;
  host: UserShort;
  check_in: string;
  check_out: string;
  number_of_guests: number;
  status: string;
  booking_type: string;
  total_price: number;
  currency: string;
  cleaning_fee: number | null;
  service_fee: number | null;
  security_deposit: number | null;
  payment_status: string;
  special_requests: string | null;
  cancellation_reason: string | null;
  cancelled_at: number | null;
  confirmed_at: number | null;
  review: BookingReview | null;
  payment: Payment | null;
  messages_thread: MessageThread | null;
}

// --- Helper functions ---

// Convert YYYY-MM-DD or YYYYMMDD string to Date
function parseDate(s: string): Date {
  if (!s) return new Date(0);
  if (s.length === 8 && !s.includes('-')) {
    // YYYYMMDD
    return new Date(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8))
    );
  }
  // YYYY-MM-DD (OpenAPI example)
  return new Date(s);
}

// Format date (long/short)
function formatDate(dt: Date) {
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Pad date to 2 digits
function pad(n: number) {
  return n < 10 ? "0" + n : n;
}

// Format Google Calendar and iCal links
function buildCalendarLinks(b: BookingDetail): CalendarLinks {
  const villa = b.villa;
  const dtStart = parseDate(b.check_in);
  const dtEnd = parseDate(b.check_out);

  // Google Calendar format: YYYYMMDD
  const gStart = `${dtStart.getFullYear()}${pad(dtStart.getMonth() + 1)}${pad(dtStart.getDate())}`;
  const gEnd = `${dtEnd.getFullYear()}${pad(dtEnd.getMonth() + 1)}${pad(dtEnd.getDate())}`;

  const title = encodeURIComponent(`Beach Villa Stay: ${villa.name}`);
  const details = encodeURIComponent(
    `Booking at ${villa.name}, ${villa.city}, ${villa.country}\n` +
    `Guests: ${b.number_of_guests}\n` +
    `Special requests: ${b.special_requests || "None"}\n`
  );
  const location = encodeURIComponent(`${villa.city}, ${villa.country}`);

  const googleUrl = [
    "https://calendar.google.com/calendar/render?action=TEMPLATE",
    `text=${title}`,
    `dates=${gStart}/${gEnd}`,
    `details=${details}`,
    `location=${location}`,
    "sf=true",
    "output=xml"
  ].join("&");

  // iCal event payload
  // DTSTART;VALUE=DATE:YYYYMMDD
  // DTEND;VALUE=DATE:YYYYMMDD
  const ics =
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `SUMMARY:Beach Villa Stay: ${villa.name}`,
      `DTSTART;VALUE=DATE:${gStart}`,
      `DTEND;VALUE=DATE:${gEnd}`,
      `DESCRIPTION:Booking at ${villa.name}, ${villa.city}, ${villa.country}\nGuests: ${b.number_of_guests}`,
      `LOCATION:${villa.city}, ${villa.country}`,
      `STATUS:${b.status.toUpperCase()}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

  // Blob and download mechanics will be handled inside the click
  const iCalUrl = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);

  return { googleUrl, iCalUrl };
}

// -- Main fetch for booking detail --
const fetchBookingDetail = async (
  booking_id: string,
  token: string | null
): Promise<BookingDetail> => {
  const url = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/booking/${booking_id}`;
  const { data } = await axios.get<BookingDetail>(url, {
    headers: { Authorization: `Bearer ${token}` },
    // Accept status 2xx only; will catch in catch block if 401/404/etc
  });
  return data;
};

// Status badge colors
function bookingStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case "confirmed":
      return "bg-green-100 text-green-700 border-green-200";
    case "pending":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "cancelled":
    case "rejected":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

const UV_BookingConfirmation: React.FC = () => {
  // Extract booking_id from URL slug (param)
  const params = useParams();
  const booking_id = params.bookingId || params.booking_id || ""; // Support both casing
  
  // Global state
  const user = useAppStore(s => s.user);
  const auth_token_obj = useAppStore(s => s.auth_token);
  const navigate = useNavigate();

  // Ensure auth
  const token = auth_token_obj ? auth_token_obj.token : null;

  // Query: Fetch booking details
  const {
    data: booking,
    isLoading,
    isError,
    error,
  } = useQuery<BookingDetail, Error>({
    queryKey: ["booking", booking_id, token],
    queryFn: () => fetchBookingDetail(booking_id, token),
    enabled: !!booking_id && !!token,
    retry: 1,
  });

  // Calendar links (Google, iCal): only built when fetched
  const calendarLinks = useMemo<CalendarLinks>(() => {
    if (booking) return buildCalendarLinks(booking);
    return { googleUrl: "", iCalUrl: "" };
  }, [booking]);

  // Determine if we show review prompt
  const showReviewPrompt = useMemo(() => {
    if (!booking) return false;
    if (booking.review != null) return false;
    if (!booking.check_out) return false;
    if (["cancelled", "rejected"].includes(booking.status.toLowerCase())) return false;

    // Simple "now" comparison: after check_out
    const today = new Date();
    const checkOutDate = parseDate(booking.check_out);
    return today.getTime() >= checkOutDate.getTime();
  }, [booking]);

  // Handle: Go to dashboard
  const goToDashboard = () => {
    navigate("/dashboard");
  };

  // Handle: Go to message host
  const handleMessageHost = () => {
    if (booking && booking.messages_thread && booking.messages_thread.thread_id) {
      navigate(`/messages/${booking.messages_thread.thread_id}`);
    }
  };

  // Download iCal handler (must simulate real file download, as iCalUrl is 'data:')
  const downloadIcal = () => {
    if (!(booking && calendarLinks.iCalUrl)) return;
    const filename = `beachvilla_booking_${booking.booking_id}.ics`;
    const a = document.createElement("a");
    a.href = calendarLinks.iCalUrl;
    a.download = filename;
    a.click();
  };

  // Render: Loading, Error, Success
  return (
    <>
      {/* Loader */}
      {isLoading && (
        <div className="flex-1 flex flex-col justify-center items-center min-h-[50vh]">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 animate-spin rounded-full mb-4" />
          <div className="text-lg text-blue-700">Loading your booking details...</div>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex-1 flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-2xl text-red-700 font-bold mb-4">Unable to load booking.</div>
          <div className="text-gray-600 mb-4">{(error as Error)?.message || "Unknown error."}</div>
          <Link to="/dashboard" className="btn btn-primary bg-blue-600 text-white px-4 py-2 rounded">Go to Dashboard</Link>
        </div>
      )}

      {/* Main Success View */}
      {!isLoading && !isError && booking && (
        <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-6">
          {/* Status badge */}
          <div className="flex items-center justify-between mb-4">
            <div className={`inline-flex items-center px-3 py-1 rounded border text-sm font-medium ${bookingStatusColor(booking.status)}`}>
              {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
            </div>
            {/* Payment badge (if not paid/confirmed) */}
            {booking.payment_status && (
              <div className="ml-2 inline-flex items-center px-2 py-1 rounded bg-gray-100 border border-gray-300 text-xs text-gray-700">
                Payment: {booking.payment_status.charAt(0).toUpperCase() + booking.payment_status.slice(1)}
              </div>
            )}
          </div>

          {/* Villa Summary */}
          <div className="bg-white rounded-xl shadow flex flex-col md:flex-row gap-6 overflow-hidden">
            <div className="w-full md:w-[160px] flex-shrink-0">
              <img
                src={
                  booking.villa.cover_photo_url ||
                  `https://picsum.photos/seed/${booking.villa.villa_id}/320/220`
                }
                alt={booking.villa.name}
                className="w-full h-[160px] object-cover"
              />
            </div>
            <div className="flex-1 flex flex-col justify-between py-2">
              <div>
                <div className="text-lg font-semibold text-gray-800">{booking.villa.name}</div>
                <div className="text-gray-500 text-sm">{booking.villa.city}, {booking.villa.country}</div>
              </div>
              <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Check-in:</span>
                  <span>{formatDate(parseDate(booking.check_in))}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Check-out:</span>
                  <span>{formatDate(parseDate(booking.check_out))}</span>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="font-medium">Guests:</span>
                  <span>{booking.number_of_guests}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-row items-center gap-3 text-xs text-gray-400">
                <span>Booking ID: {booking.booking_id}</span>
              </div>
            </div>
          </div>

          {/* Pricing Breakdown */}
          <div className="bg-gray-50 rounded-xl p-4 shadow-sm text-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium">Total Price</span>
              <span className="text-lg font-bold text-gray-900">{booking.total_price.toLocaleString(undefined, {style:"currency", currency: booking.currency || "USD"})}</span>
            </div>
            <div className="flex justify-between items-center mb-1">
              <span>Cleaning fee</span>
              <span>{(booking.cleaning_fee || 0).toLocaleString(undefined, {style:"currency", currency: booking.currency || "USD"})}</span>
            </div>
            <div className="flex justify-between items-center mb-1">
              <span>Service fee</span>
              <span>{(booking.service_fee || 0).toLocaleString(undefined, {style:"currency", currency: booking.currency || "USD"})}</span>
            </div>
            {booking.security_deposit != null && (
              <div className="flex justify-between items-center mb-1">
                <span>Security deposit</span>
                <span>{booking.security_deposit.toLocaleString(undefined, {style:"currency", currency: booking.currency || "USD"})}</span>
              </div>
            )}
            {booking.special_requests && (
              <div className="flex justify-between items-center mt-1">
                <span>Special requests:</span>
                <span className="text-gray-700">{booking.special_requests}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 justify-start items-center">
            <button
              className="inline-flex items-center bg-blue-600 text-white px-5 py-2 rounded-md font-semibold shadow hover:bg-blue-700 transition"
              onClick={goToDashboard}
            >
              Go to Dashboard
            </button>
            {booking.messages_thread && booking.messages_thread.thread_id ? (
              <button
                className="inline-flex items-center bg-green-600 text-white px-5 py-2 rounded-md font-semibold shadow hover:bg-green-700 transition"
                onClick={handleMessageHost}
              >
                Message Host
              </button>
            ) : (
              <button
                className="inline-flex items-center bg-gray-400 text-white px-5 py-2 rounded-md font-semibold shadow cursor-not-allowed"
                disabled
                title="Messaging unavailable for this booking"
              >
                Message Host
              </button>
            )}
            {/* Calendar links */}
            <a
              href={calendarLinks.googleUrl}
              rel="noopener noreferrer"
              target="_blank"
              className="inline-flex items-center bg-red-100 text-red-700 px-4 py-2 rounded-md font-semibold border border-red-300 hover:bg-red-200 transition"
            >
              Add to Google Calendar
            </a>
            <button
              className="inline-flex items-center bg-gray-100 text-gray-900 px-4 py-2 rounded-md font-semibold border border-gray-300 hover:bg-gray-200 transition"
              onClick={downloadIcal}
              aria-label="Download iCal"
            >
              Download iCal
            </button>
          </div>

          {/* Review Prompt */}
          {showReviewPrompt && (
            <div className="mt-6 border border-yellow-300 bg-yellow-50 rounded-lg px-4 py-4 flex flex-col gap-2 items-start">
              <div className="flex items-center gap-2">
                <span role="img" aria-label="review" className="text-xl">⭐</span>
                <span className="font-semibold text-yellow-900">We'd love your feedback!</span>
              </div>
              <div className="text-sm text-yellow-800">
                Your stay is complete. Please share your experience by leaving a review.
              </div>
              <Link
                className="inline-block mt-2 bg-yellow-400 text-yellow-900 px-4 py-2 rounded font-semibold hover:bg-yellow-500 transition"
                to={`/reviews/booking/${booking.booking_id}`}
              >
                Leave a Review
              </Link>
            </div>
          )}

          {/* Post-booking tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg mt-8 px-4 py-3 text-sm text-blue-900">
            <div><span className="font-semibold">Tip:</span> Add this booking to your calendar for reminders, or head to your dashboard to manage your trips. Reach out to your host via messages if you have any questions about your stay.</div>
            {["cancelled", "rejected"].includes(booking.status.toLowerCase()) && (
              <div className="mt-2 text-red-700 font-medium">
                This booking is currently <b>{booking.status.toUpperCase()}</b>.
                {booking.cancellation_reason && <span> Reason: "{booking.cancellation_reason}"</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default UV_BookingConfirmation;