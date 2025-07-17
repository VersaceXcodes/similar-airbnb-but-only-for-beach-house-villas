import React, { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/main";
import { format } from "date-fns";

// Types (With essential fields based on OpenAPI spec)
interface UserShort {
  user_id: string;
  name: string;
  profile_photo_url: string | null;
  role?: string;
}

interface VillaSummary {
  villa_id: string;
  name: string;
  city: string;
  country: string;
  cover_photo_url: string;
  price_per_night: number;
  is_instant_book: boolean;
  max_occupancy: number;
  status: string;
  host: UserShort;
}

interface MessageThread {
  thread_id: string;
  booking_id: string;
  villa_id: string;
  guest_user_id: string;
  host_user_id: string;
  created_at: number;
}

interface Review {
  review_id: string;
  reviewer_user_id: string;
  rating: number;
  review_text: string;
  created_at: number;
  reviewer: UserShort;
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
  created_at: number;
  updated_at: number;
  cleaning_fee: number;
  service_fee: number;
  security_deposit: number;
  payment_status: string;
  special_requests: string;
  cancellation_reason: string;
  cancelled_at: number | null;
  confirmed_at: number | null;
  review: Review | null;
  payment: object | null;
  messages_thread: MessageThread | null;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Util: Format dates for display (try date-fns, fallback simple)
function formatDate(dt: string | number) {
  if (!dt) return "";
  if (typeof dt === "number") return format(new Date(dt * 1000), "yyyy-MM-dd");
  // e.g., dt = "2024-09-15"
  return dt;
}
function formatMoney(amount: number, currency: string) {
  if (!currency) currency = "USD";
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`;
}

// Util: Booking status pretty
function prettyStatus(status: string) {
  switch (status) {
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "cancelled":
      return "Cancelled";
    case "rejected":
      return "Rejected";
    case "completed":
      return "Completed";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export const UV_BookingDetails: React.FC = () => {
  // STEP 1: Extract booking_id from URL (must match route /booking/:bookingId/details)
  const params = useParams<{ bookingId?: string; }>();
  // Try both (legacy/users), fallback:
  const booking_id = params.bookingId || params["booking_id"];
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Global state (CORRECT ZUSTAND USAGE)
  const currentUser = useAppStore(state => state.user);
  const authToken = useAppStore(state => state.auth_token);

  // Local state
  const [currentAction, setCurrentAction] = useState<{ type: string | null; loading: boolean; error: string | null }>({
    type: null, loading: false, error: null,
  });
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);

  // 1. Query - fetch booking details
  const {
    data: booking,
    isFetching: loadingBooking,
    isError: isBookingError,
    error: bookingErrorData,
    refetch: refetchBooking,
  } = useQuery<BookingDetail, Error>({
    queryKey: ["booking-detail", booking_id],
    enabled: !!booking_id && !!authToken,
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/booking/${booking_id}`, {
        headers: { Authorization: `Bearer ${authToken?.token}` },
      });
      return data;
    },
    retry: false,
  });

  // 2. PATCH - cancel booking
  const cancelMutation = useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      setCurrentAction({ type: "cancel", loading: true, error: null });
      const { data } = await axios.patch(
        `${API_BASE_URL}/booking/${booking_id}`,
        { status: "cancelled", cancellation_reason: reason },
        { headers: { Authorization: `Bearer ${authToken?.token}` } }
      );
      return data;
    },
    onSuccess: async () => {
      setCurrentAction({ type: null, loading: false, error: null });
      setShowCancelDialog(false);
      setCancelReason("");
      await refetchBooking();
      queryClient.invalidateQueries({ queryKey: ["booking-list"] });
    },
    onError: (err: any) => {
      setCurrentAction({ type: null, loading: false, error: err?.response?.data?.message || "Cancellation failed" });
    }
  });

  // 3. POST - leave review
  const reviewMutation = useMutation({
    mutationFn: async ({ rating, review_text }: { rating: number, review_text: string }) => {
      setCurrentAction({ type: "review", loading: true, error: null });
      const { data } = await axios.post(
        `${API_BASE_URL}/reviews/booking/${booking_id}`,
        { rating, review_text },
        { headers: { Authorization: `Bearer ${authToken?.token}` } }
      );
      return data;
    },
    onSuccess: async () => {
      setShowReviewForm(false);
      setReviewText("");
      setReviewRating(5);
      setCurrentAction({ type: null, loading: false, error: null });
      await refetchBooking();
      queryClient.invalidateQueries({ queryKey: ["booking-detail", booking_id] });
    },
    onError: (err: any) => {
      setCurrentAction({ type: null, loading: false, error: err?.response?.data?.message || "Failed to submit review" });
    }
  });

  // TIMELINE
  const timeline = useMemo(() => {
    if (!booking) return [];
    const events: { status: string; at: number; actor: string }[] = [];
    events.push({ status: "created", at: booking.created_at, actor: booking.guest?.name || "" });
    if (booking.confirmed_at)
      events.push({ status: "confirmed", at: booking.confirmed_at, actor: booking.host?.name || "" });
    if (booking.cancelled_at)
      events.push({ status: "cancelled", at: booking.cancelled_at, actor: booking.cancellation_reason || "" });
    // Optionally other status points
    return events.sort((a, b) => a.at - b.at);
  }, [booking]);

  // Determine action permissions
  const nowSecs = Math.floor(Date.now() / 1000);

  const canCancel = useMemo(() => {
    if (!booking || !currentUser) return false;
    if (booking.status === "cancelled" || booking.status === "rejected" || booking.status === "completed") return false;
    const isGuest = currentUser.user_id === booking.guest?.user_id;
    const isHost = currentUser.user_id === booking.host?.user_id;
    const checkIn = Date.parse(booking.check_in);
    if (isGuest) {
      // Guests can cancel up to check-in (future bookings)
      return nowSecs < checkIn / 1000;
    }
    if (isHost) {
      // Hosts can cancel until check-in
      return nowSecs < checkIn / 1000;
    }
    return false;
  }, [booking, currentUser, nowSecs]);

  const reviewEligible = useMemo(() => {
    if (!booking || !currentUser) return false;
    if (booking.review) return false;
    if (booking.guest?.user_id !== currentUser.user_id) return false;
    // Booking must be confirmed or completed AND check_out in past
    const checkOut = Date.parse(booking.check_out);
    if ((booking.status === "confirmed" || booking.status === "completed") && checkOut < Date.now()) {
      return true;
    }
    return false;
  }, [booking, currentUser]);

  const canMessage = useMemo(() => {
    if (!booking || !currentUser) return false;
    return (
      (booking.guest?.user_id === currentUser.user_id || booking.host?.user_id === currentUser.user_id) &&
      !!booking.messages_thread
    );
  }, [booking, currentUser]);

  // Error (aggregate)
  const bookingError = (isBookingError && bookingErrorData?.message)
    || (currentAction.error) || "";

  // -- RENDER --
  return (
    <>
      {/* Loading fallback */}
      {loadingBooking && (
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-12 h-12 border-4 border-blue-300 border-t-transparent rounded-full animate-spin my-8" />
          <p className="text-brand text-lg font-semibold mt-4">Loading booking details...</p>
        </div>
      )}
      {/* Error */}
      {bookingError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-900 p-4 mb-4" role="alert">
          <div className="flex items-center gap-2">
            <span className="font-bold">Error:</span>
            <span>{bookingError}</span>
            <button className="ml-auto px-2 py-1 border rounded text-sm" onClick={() => refetchBooking()}>Retry</button>
          </div>
        </div>
      )}
      {/* Main booking view */}
      {booking && (
        <div className="max-w-3xl mx-auto mt-8 shadow bg-white rounded-lg overflow-hidden border">
          {/* Villa summary */}
          <div className="flex flex-col md:flex-row">
            <div className="flex-shrink-0 w-full md:w-56 h-44 md:h-auto">
              <Link to={`/villa/${booking.villa.villa_id}`}>
                <img
                  src={booking.villa.cover_photo_url || `https://picsum.photos/seed/villa${booking.villa.villa_id}/400/300`}
                  alt={booking.villa.name}
                  className="object-cover w-full h-full rounded-tl-md rounded-bl-md"
                />
              </Link>
            </div>
            <div className="flex flex-col flex-1 p-4 gap-2">
              <div className="flex items-center gap-2">
                <Link to={`/villa/${booking.villa.villa_id}`} className="font-semibold text-xl text-brand hover:underline">
                  {booking.villa.name}
                </Link>
                <span className="text-sm text-gray-500">
                  {booking.villa.city}, {booking.villa.country}
                </span>
                <span className={`text-xs px-2 py-1 ml-auto rounded-full ${
                  booking.status === "cancelled"
                    ? "bg-red-50 text-red-700"
                    : booking.status === "confirmed"
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-700"
                }`}>
                  {prettyStatus(booking.status)}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <svg width="16" height="16" fill="currentColor" className="inline -mt-px text-gray-400"><path d="M8 3a5 5 0 100 10A5 5 0 008 3zm0 9a4 4 0 110-8 4 4 0 010 8z" /><circle cx="8" cy="8" r="3" fill="#ddd"/></svg>
                  for {booking.number_of_guests} guests
                </span>
                <span>
                  {formatDate(booking.check_in)} – {formatDate(booking.check_out)}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 items-center mt-2">
                <div>
                  <span className="mr-2 text-gray-500">Host:</span>
                  <Link to={`/profile/${booking.host.user_id}`} className="flex items-center gap-2 hover:underline">
                    <img src={booking.host.profile_photo_url || `https://picsum.photos/seed/host${booking.host.user_id}/30`} alt="" className="w-7 h-7 rounded-full object-cover" />
                    <span>{booking.host.name}</span>
                  </Link>
                </div>
                <div>
                  <span className="mr-2 text-gray-500">Guest:</span>
                  <Link to={`/profile/${booking.guest.user_id}`} className="flex items-center gap-2 hover:underline">
                    <img src={booking.guest.profile_photo_url || `https://picsum.photos/seed/guest${booking.guest.user_id}/30`} alt="" className="w-7 h-7 rounded-full object-cover" />
                    <span>{booking.guest.name}</span>
                  </Link>
                </div>
              </div>
              {booking.special_requests && (
                <div className="mt-2 text-sm italic text-gray-600">
                  <span className="font-medium text-gray-800">Special Requests:</span> {booking.special_requests}
                </div>
              )}
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="p-5 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-lg mb-2">Price Breakdown</h3>
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span>Price per night</span>
                  <span>{formatMoney(booking.villa.price_per_night, booking.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Nights</span>
                  <span>
                    {Math.max(1, Math.round((Date.parse(booking.check_out) - Date.parse(booking.check_in)) / (1000 * 60 * 60 * 24)))}
                  </span>
                </div>
                {booking.cleaning_fee > 0 && (
                  <div className="flex justify-between">
                    <span>Cleaning fee</span>
                    <span>{formatMoney(booking.cleaning_fee, booking.currency)}</span>
                  </div>
                )}
                {booking.service_fee > 0 && (
                  <div className="flex justify-between">
                    <span>Service fee</span>
                    <span>{formatMoney(booking.service_fee, booking.currency)}</span>
                  </div>
                )}
                {booking.security_deposit > 0 && (
                  <div className="flex justify-between">
                    <span>Security deposit</span>
                    <span>{formatMoney(booking.security_deposit, booking.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-2 border-t mt-2">
                  <span>Total</span>
                  <span>{formatMoney(booking.total_price, booking.currency)}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  booking.payment_status === "paid"
                    ? "bg-green-500"
                    : booking.payment_status === "pending"
                      ? "bg-yellow-400"
                      : "bg-gray-300"
                }`}></span>
                <span className="text-gray-600">Payment status:</span>
                <span className="font-medium">{booking.payment_status?.charAt(0).toUpperCase() + booking.payment_status?.slice(1)}</span>
              </div>
            </div>
            {/* Actions */}
            <div>
              <h3 className="font-semibold text-lg mb-2">Actions</h3>
              <div className="flex flex-col gap-2">
                {canCancel && (
                  <button
                    className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded border border-red-300 text-sm font-medium transition disabled:opacity-60"
                    onClick={() => setShowCancelDialog(true)}
                    disabled={currentAction.loading}
                  >
                    Cancel Booking
                  </button>
                )}
                {canMessage && booking.messages_thread && (
                  <Link
                    to={`/messages/${booking.messages_thread.thread_id}`}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium text-center transition"
                  >
                    Message {currentUser?.user_id === booking.guest.user_id ? "Host" : "Guest"}
                  </Link>
                )}
                {reviewEligible && (
                  <button
                    className="bg-green-100 hover:bg-green-200 text-green-700 px-4 py-2 rounded border border-green-400 text-sm font-medium"
                    onClick={() => setShowReviewForm(true)}
                    disabled={currentAction.loading}
                  >
                    Leave a Review
                  </button>
                )}
                {!canCancel && !canMessage && !reviewEligible && (
                  <span className="text-gray-500 text-xs italic">No additional actions available at this time.</span>
                )}
              </div>
            </div>
          </div>

          {/* Status Timeline */}
          <div className="px-5 pt-1 pb-5 border-t">
            <h3 className="font-semibold text-lg mb-3">Status Timeline</h3>
            <ol className="relative border-l border-gray-200 ml-2">
              {timeline.length === 0 && (
                <li className="ml-6 text-gray-500 text-sm">No booking events yet.</li>
              )}
              {timeline.map((evt, idx) => (
                <li key={idx} className="mb-8 ml-6">
                  <span className="absolute flex items-center justify-center w-6 h-6 bg-white rounded-full -left-3 ring-4 ring-blue-200">
                    <span className="block w-3 h-3 rounded-full bg-blue-500"></span>
                  </span>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                    {formatDate(evt.at)}
                  </div>
                  <div className="font-medium">{prettyStatus(evt.status)}</div>
                  {evt.actor && (
                    <div className="text-xs text-gray-600">{evt.actor}</div>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {/* Cancellation info */}
          {booking.status === "cancelled" && (
            <div className="p-5 border-t bg-red-50 text-red-900">
              <h4 className="font-bold">Booking Cancelled</h4>
              {booking.cancellation_reason && (
                <p className="text-sm mt-2"><span className="font-medium">Reason:</span> {booking.cancellation_reason}</p>
              )}
              {booking.cancelled_at && (
                <p className="text-xs mt-1">Cancelled at {formatDate(booking.cancelled_at)}</p>
              )}
            </div>
          )}

          {/* Existing Review (if any) */}
          {booking.review && (
            <div className="p-5 border-t bg-gray-50">
              <h4 className="font-semibold text-lg mb-2">Your Review</h4>
              <div className="flex items-center gap-2 text-yellow-500 mb-1">
                {[1,2,3,4,5].map(i => (
                  <svg key={i} className={`h-5 w-5 ${booking.review!.rating >= i ? "" : "opacity-40"}`} viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927C9.469 2.055 10.531 2.055 10.951 2.927l1.286 2.646a1 1 0 00.751.547l2.924.425c.969.141 1.358 1.329.655 2.013l-2.115 2.062a1 1 0 00-.287.885l.499 2.909c.165.963-.853 1.697-1.732 1.245L10 13.187l-2.616 1.376c-.879.451-1.897-.282-1.732-1.245l.498-2.909a1 1 0 00-.286-.885L3.75 8.558c-.703-.684-.314-1.872.655-2.013l2.924-.425a1 1 0 00.751-.547l1.286-2.646z"/>
                  </svg>
                ))}
              </div>
              <div className="text-sm mb-2">{booking.review.review_text}</div>
              <div className="text-xs text-gray-500">Reviewed by {booking.review.reviewer?.name} ({formatDate(booking.review.created_at)})</div>
            </div>
          )}
        </div>
      )}

      {/* Cancel Dialog Modal */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-sm w-full shadow relative">
            <h3 className="font-bold text-lg">Cancel Booking</h3>
            <p className="text-sm text-gray-700 mt-2">Please provide a reason for cancellation:</p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="mt-4 w-full border rounded p-2 focus:border-blue-400 resize-none"
              rows={3}
              disabled={cancelMutation.isLoading}
            />
            {currentAction.error && (
              <div className="text-xs text-red-600 mt-2">{currentAction.error}</div>
            )}
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowCancelDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-100"
                disabled={cancelMutation.isLoading}
              >
                Close
              </button>
              <button
                className="px-4 py-2 text-sm bg-red-700 text-white rounded hover:bg-red-600 transition disabled:opacity-60"
                disabled={!cancelReason.trim() || cancelMutation.isLoading}
                onClick={() => cancelMutation.mutate({ reason: cancelReason.trim() })}
              >
                {cancelMutation.isLoading ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Review Modal */}
      {showReviewForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-sm w-full shadow relative">
            <h3 className="font-bold text-lg mb-2">Leave a Review</h3>
            <div className="flex items-center gap-2 mb-4">
              {[1,2,3,4,5].map(i => (
                <button
                  type="button"
                  key={i}
                  className={`h-7 w-7 p-0 border-none bg-transparent ${i <= reviewRating ? "text-yellow-500" : "text-gray-300"}`}
                  onClick={() => setReviewRating(i)}
                  aria-label={`Give ${i} star${i>1?'s':''}`}
                  disabled={reviewMutation.isLoading}
                >
                  <svg className="w-full h-full" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927C9.469 2.055 10.531 2.055 10.951 2.927l1.286 2.646a1 1 0 00.751.547l2.924.425c.969.141 1.358 1.329.655 2.013l-2.115 2.062a1 1 0 00-.287.885l.499 2.909c.165.963-.853 1.697-1.732 1.245L10 13.187l-2.616 1.376c-.879.451-1.897-.282-1.732-1.245l.498-2.909a1 1 0 00-.286-.885L3.75 8.558c-.703-.684-.314-1.872.655-2.013l2.924-.425a1 1 0 00.751-.547l1.286-2.646z"/>
                  </svg>
                </button>
              ))}
            </div>
            <textarea
              value={reviewText}
              onChange={e => setReviewText(e.target.value)}
              placeholder="Write your review here..."
              className="w-full border rounded p-2 focus:border-blue-400 resize-none"
              rows={4}
              maxLength={2000}
              minLength={10}
              disabled={reviewMutation.isLoading}
            />
            {currentAction.error && (
              <div className="text-xs text-red-600 mt-2">{currentAction.error}</div>
            )}
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowReviewForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-100"
                disabled={reviewMutation.isLoading}
              >
                Close
              </button>
              <button
                className="px-4 py-2 text-sm bg-green-700 text-white rounded hover:bg-green-600 transition disabled:opacity-60"
                disabled={reviewText.trim().length < 10 || reviewMutation.isLoading}
                onClick={() => reviewMutation.mutate({ rating: reviewRating, review_text: reviewText.trim() })}
              >
                {reviewMutation.isLoading ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UV_BookingDetails;