import React, { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
import { z } from "zod";

// --- Types from DB:zodschemas:ts and OpenAPI (declared inline for local use) ---

interface UserShort {
  user_id: string;
  name: string;
  email: string;
  role: string;
  profile_photo_url: string | null;
  is_active: boolean;
  is_verified_host: boolean | null;
  notification_settings: Record<string, any>;
  payout_method_details: string | null;
}

interface Amenity {
  amenity_id: string;
  name: string;
  icon_url: string;
  key: string;
}

interface Rule {
  villa_rule_id: string;
  rule_type: string;
  value: string;
}

interface Photo {
  photo_id: string;
  photo_url: string;
  sort_order: number;
  caption?: string | null;
  uploaded_at: number;
}

interface Review {
  review_id: string;
  booking_id: string;
  villa_id: string;
  reviewer_user_id: string;
  rating: number;
  review_text: string;
  review_type: string;
  created_at: number;
  is_visible: boolean;
  is_flagged: boolean;
  reviewer: {
    user_id: string;
    name: string;
    email: string;
    role: string;
    profile_photo_url: string | null;
    is_active: boolean;
  };
}

interface AvailableDay {
  date: string;
  is_available: boolean;
  price_override: number | null;
}

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
  amenities: Amenity[];
  status: string;
  host: UserShort;
}

interface PriceBreakdown {
  check_in: string;
  check_out: string;
  guests: number;
  base_total: number;
  cleaning_fee: number;
  service_fee: number;
  security_deposit: number;
  total: number;
}

interface VillaDetail extends VillaSummary {
  long_description: string;
  photos: Photo[];
  all_amenities: Amenity[];
  rules: Rule[];
  calendar: AvailableDay[];
  reviews: Review[];
  price_breakdown_example: PriceBreakdown;
  host_profile: UserShort;
  host_villas: VillaSummary[];
}

// --- Booking Widget State
interface BookingWidgetState {
  check_in: string;
  check_out: string;
  guests: number;
  rules_confirmed: boolean;
  price_total: number | null;
  error: string | null;
}



const UV_VillaDetail: React.FC = () => {
  // ---- 1. Extract slug and query params ---
  const { villaId } = useParams<{ villaId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ---- 2. Global state: user/auth, search context ----
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const search_query = useAppStore((s) => s.search_query);

  // ---- 3. Local state for BookingWidget, review pagination, modals ---
  const default_check_in = searchParams.get("check_in") || search_query.check_in_date || "";
  const default_check_out = searchParams.get("check_out") || search_query.check_out_date || "";
  const default_guests = Number(searchParams.get("number_of_guests") || search_query.number_of_guests || 1);

  const [bookingWidget, setBookingWidget] = useState<BookingWidgetState>({
    check_in: default_check_in,
    check_out: default_check_out,
    guests: default_guests,
    rules_confirmed: false,
    price_total: null,
    error: null,
  });
  const [visibleReviewPage, setVisibleReviewPage] = useState<boolean>(false); // expanded or not
  const [photoModalIdx, setPhotoModalIdx] = useState<number | null>(null); // null=closed, otherwise idx
  const [outOfDateError, setOutOfDateError] = useState<string>("");

  // ---- 4. Fetch villa detail by villa_id using React Query ----
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
  const fetchVillaDetail = async (): Promise<VillaDetail> => {
    if (!villaId) throw new Error("Villa ID not found in route");
    // Only include params if provided (avoid empty params)
    const params: Record<string, string | number> = {};
    if (bookingWidget.check_in) params["check_in"] = bookingWidget.check_in;
    if (bookingWidget.check_out) params["check_out"] = bookingWidget.check_out;
    if (bookingWidget.guests > 0) params["number_of_guests"] = bookingWidget.guests;
    // Backend uses villa_id as route param
    const url = `${apiBase}/villa/${villaId}`;
    const { data } = await axios.get<VillaDetail>(url, { params });
    return data;
  };

  const {
    data: villa,
    isLoading,
    isError,
    error,
    refetch,
    isFetching
  } = useQuery<VillaDetail, Error>({
    queryKey: [
      "villa-detail",
      villaId,
      bookingWidget.check_in,
      bookingWidget.check_out,
      bookingWidget.guests,
    ],
    queryFn: fetchVillaDetail,
    enabled: !!villaId,
    retry: 1,
    staleTime: 30 * 1000,
  });

  // ---- 5. Side effect for price breakdown on widget state change
  useEffect(() => {
    if (villa && villa.price_breakdown_example) {
      // Only update price_total if widget matches price_breakdown_example selection
      if (
        bookingWidget.check_in === villa.price_breakdown_example.check_in &&
        bookingWidget.check_out === villa.price_breakdown_example.check_out &&
        bookingWidget.guests === villa.price_breakdown_example.guests
      ) {
        setBookingWidget((s) => ({
          ...s,
          price_total: villa.price_breakdown_example.total,
          error: null,
        }));
      } else {
        // We don't have price breakdown for this selection (just null for now; could trigger price fetch if backend supports)
        setBookingWidget((s) => ({
          ...s,
          price_total: null,
          error: null,
        }));
      }
    }
  }, [
    villa,
    bookingWidget.check_in,
    bookingWidget.check_out,
    bookingWidget.guests,
  ]);

  // ---- 6. Handlers ----
  // Handle widget field change
  const handleBookingWidgetChange = (
    field: keyof BookingWidgetState,
    value: string | number | boolean
  ) => {
    setBookingWidget((prev) => ({
      ...prev,
      [field]: value,
      // If any field changes, clear any stale errors
      error: null,
    }));
  };

  // Redirect to booking flow with params (if authed), otherwise prompt login.
  const redirectToBookingFlow = () => {
    // Validate input
    if (!bookingWidget.check_in || !bookingWidget.check_out || !bookingWidget.guests || bookingWidget.guests < 1) {
      setBookingWidget((prev) => ({
        ...prev,
        error: "All fields are required. Please select check-in, check-out, and number of guests.",
      }));
      return;
    }
    if (!bookingWidget.rules_confirmed) {
      setBookingWidget((prev) => ({
        ...prev,
        error: "You must agree to the house rules before booking.",
      }));
      return;
    }
    // Auth check
    if (!auth_token) {
      // Redirect to login, send return param (not required by PRD/UX so simple redirect)
      navigate("/login");
      return;
    }
    // All good, go to booking flow for this villa with params
    const query = new URLSearchParams({
      check_in: bookingWidget.check_in,
      check_out: bookingWidget.check_out,
      number_of_guests: bookingWidget.guests?.toString(),
    }).toString();
    navigate(`/booking/${villaId}?${query}`);
  };

  // Message Host: prompt login or go to /messages (thread not started here!)
  const handleMessageHost = () => {
    if (!auth_token) {
      navigate("/login");
      return;
    }
    // Go to messages inbox, not creating a thread here, since API does not provide thread-creation endpoint outside Booking flow.
    navigate("/messages");
  };

  // Calendar: which days are available?
  const getCalendarByMonth = useMemo(() => {
    if (!villa || !villa.calendar) return {};
    // Return map: 'YYYY-MM' => [AvailableDay]
    const grouped: Record<string, AvailableDay[]> = {};
    villa.calendar.forEach((d) => {
      const month = d.date.slice(0, 7); // 'YYYY-MM'
      if (!grouped[month]) grouped[month] = [];
      grouped[month].push(d);
    });
    return grouped;
  }, [villa]);

  // Calendar UI: get days in current month (booking widget can show just one month ahead by default).
  const [calendarMonth, setCalendarMonth] = useState<string>(() => {
    // If bookingWidget.check_in, use its month, else use first available day in villa.calendar or today
    if (bookingWidget.check_in) return bookingWidget.check_in.slice(0, 7);
    if (villa && villa.calendar && villa.calendar.length > 0)
      return villa.calendar[0].date.slice(0, 7);
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });

  // On month navigation (next/prev)
  const handleCalendarMonthChange = (delta: number) => {
    // Format: YYYY-MM
    const [yearStr, monthStr] = calendarMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const date = new Date(year, month - 1 + delta, 1);
    setCalendarMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    );
  };

  // Review Pagination
  const NUM_REVIEWS_COLLAPSED = 5;
  const reviewsToShow = useMemo(() => {
    if (!villa || !villa.reviews) return [];
    if (visibleReviewPage) {
      return villa.reviews;
    }
    return villa.reviews.slice(0, NUM_REVIEWS_COLLAPSED);
  }, [villa, visibleReviewPage]);

  // Defensive - loading skeleton
  if (isLoading || isFetching) {
    return (
      <>
        <div className="max-w-6xl mx-auto py-8 px-2">
          <div className="animate-pulse h-80 bg-gray-200 rounded-lg mb-6"/>
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-1">
              <div className="h-8 bg-gray-100 mb-4 rounded w-3/4"/>
              <div className="h-5 bg-gray-100 mb-2 rounded w-1/2"/>
              <div className="h-4 bg-gray-100 mb-1 rounded w-5/6"/>
              <div className="h-5 bg-gray-100 mb-2 rounded w-1/2"/>
            </div>
            <div className="w-full md:w-80">
              <div className="rounded-lg h-64 bg-gray-100"/>
            </div>
          </div>
        </div>
      </>
    );
  }

  // -- ERROR state (villa not found or API crashed) --
  if (isError) {
    return (
      <>
        <div className="max-w-2xl mx-auto py-12 px-2 text-center">
          <div className="text-2xl font-semibold text-red-600 mb-3">
            Oops! We couldn't load this villa.
          </div>
          <div className="text-gray-600 mb-4">
            {(error as Error).message || "An unexpected error occurred. Please try again later."}
          </div>
          <button
            onClick={() => refetch()}
            className="mt-2 px-5 py-2 rounded bg-blue-500 text-white font-semibold hover:bg-blue-600"
          >
            Retry
          </button>
          <div className="mt-6">
            <Link className="text-blue-500 underline" to="/">← Back to Home</Link>
          </div>
        </div>
      </>
    );
  }

  // -- NO DATA (shouldn't happen) --
  if (!villa) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-2 text-center">
        <div className="text-2xl font-semibold text-red-600 mb-6">Villa Not Found</div>
        <Link className="text-blue-500 underline" to="/">← Back to Home</Link>
      </div>
    );
  }

  // --- Host other villas block (excluding current villa) ---
  const hostOtherVillas: VillaSummary[] =
    villa.host_villas && villa.host_villas.length > 1
      ? villa.host_villas.filter((v) => v.villa_id !== villa.villa_id)
      : [];

  // --- For map, use static OpenStreetMap iframe (since we don't have a widget) ---
  // Coordinates are strings, should parse
  let mapLat: number = 0, mapLon: number = 0;
  try {
    mapLat = parseFloat(villa.latitude);
    mapLon = parseFloat(villa.longitude);
  } catch (e) {
    mapLat = 0;
    mapLon = 0;
  }
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${mapLon-0.02}%2C${mapLat-0.01}%2C${mapLon+0.02}%2C${mapLat+0.01}&layer=mapnik&marker=${mapLat}%2C${mapLon}`;


  return (
    <>
      {/* -- Photo Gallery -- */}
      <div className="max-w-6xl mx-auto mt-6">
        <div className="relative w-full h-80 md:h-[440px] bg-gray-800 rounded-xl overflow-hidden">
          {villa.photos && villa.photos.length > 0 ? (
            <div className="h-full w-full flex">
              <div className="flex-1 min-w-0 relative">
                <img
                  src={villa.photos[0]?.photo_url}
                  alt={villa.photos[0]?.caption || villa.name}
                  className="object-cover object-center h-full w-full cursor-pointer"
                  onClick={() => setPhotoModalIdx(0)}
                  loading="lazy"
                />
                <button
                  className="absolute top-4 right-8 bg-gray-900 bg-opacity-50 px-3 py-1 text-white rounded hover:bg-opacity-80 transition"
                  onClick={() => setPhotoModalIdx(0)}
                  aria-label="Open Gallery"
                >
                  Gallery
                </button>
              </div>
              {villa.photos.length > 1 && (
                <div className="hidden md:grid grid-cols-2 gap-2 w-[40%] ml-2">
                  {villa.photos.slice(1, 5).map((p, idx) => (
                    <img
                      key={p.photo_id}
                      src={p.photo_url}
                      alt={p.caption || villa.name}
                      className="object-cover h-32 sm:h-40 w-full rounded cursor-pointer"
                      onClick={() => setPhotoModalIdx(idx + 1)}
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <img
              src={villa.cover_photo_url || `https://picsum.photos/seed/villa-${villa.villa_id}/800/350`}
              alt={villa.name}
              className="object-cover object-center h-full w-full"
            />
          )}
        </div>
        {/* Photo Modal (Simple fullscreen) */}
        {photoModalIdx !== null && villa.photos && (
          <div
            className="fixed z-50 inset-0 flex items-center justify-center bg-black bg-opacity-90"
            tabIndex={-1}
            onClick={() => setPhotoModalIdx(null)}
          >
            <div className="relative w-[90vw] max-w-2xl mx-auto">
              <img
                src={villa.photos[photoModalIdx]?.photo_url}
                alt={villa.photos[photoModalIdx]?.caption || villa.name}
                className="w-full h-auto max-h-[80vh] object-contain rounded-lg shadow-xl border-4 border-white"
              />
              <button
                className="absolute top-2 right-2 bg-white bg-opacity-80 px-3 py-1 text-black text-lg rounded"
                onClick={() => setPhotoModalIdx(null)}
              >
                ✕
              </button>
              {/* Prev/Next */}
              {photoModalIdx > 0 && (
                <button
                  className="absolute top-1/2 left-2 transform -translate-y-1/2 bg-white bg-opacity-70 px-2 text-xl rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoModalIdx(photoModalIdx - 1);
                  }}
                  aria-label="Previous photo"
                >
                  ‹
                </button>
              )}
              {photoModalIdx < villa.photos.length - 1 && (
                <button
                  className="absolute top-1/2 right-8 transform -translate-y-1/2 bg-white bg-opacity-70 px-2 text-xl rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoModalIdx(photoModalIdx + 1);
                  }}
                  aria-label="Next photo"
                >
                  ›
                </button>
              )}
              {villa.photos[photoModalIdx]?.caption && (
                <div className="mt-3 text-center text-gray-200">{villa.photos[photoModalIdx]?.caption}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* -- Main info and booking panel -- */}
      <div className="max-w-6xl mx-auto flex flex-col-reverse md:flex-row justify-between gap-8 px-2 md:px-0 my-12">
        {/* --- Main column --- */}
        <main className="flex-1 min-w-0">
          {/* Villa title, location, host */}
          <div className="flex items-center gap-4 mb-2">
            <div>
              <h1 className="text-2xl font-bold mb-1 text-gray-800">{villa.name}</h1>
              <div className="flex items-center text-sm gap-2">
                <span>{villa.city}, {villa.country}</span>
                <span className="text-gray-400">·</span>
                <span>
                  <span className="inline-flex items-center gap-1">
                    <svg width="18" height="18" fill="currentColor" className="inline-block text-yellow-400">
                      <circle cx="9" cy="9" r="8" />
                    </svg>
                    <span className="font-semibold">{villa.rating?.toFixed(2)}</span>
                  </span>
                  <span className="text-gray-500 ml-1">({villa.review_count} reviews)</span>
                </span>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Link to={`/search?host=${villa.host.user_id}`}>
                <img
                  src={villa.host.profile_photo_url || `https://picsum.photos/seed/host-${villa.host.user_id}/40/40`}
                  alt={villa.host.name}
                  className="h-10 w-10 rounded-full border border-gray-300 object-cover"
                />
              </Link>
              <Link
                to={`/search?host=${villa.host.user_id}`}
                className="ml-2 text-blue-600 hover:underline text-sm"
                title="See all listings by this host"
              >
                {villa.host.name}
                {villa.host.is_verified_host ? (
                  <span
                    className="ml-1 text-green-500"
                    title="Verified Host"
                  >✔</span>
                ) : null}
              </Link>
            </div>
          </div>
          {/* Short description */}
          <div className="mb-4 text-gray-700">{villa.short_description}</div>

          {/* Map section (OpenStreetMap embed as per spec) */}
          <div className="my-3">
            <iframe
              className="rounded w-full h-56 md:h-72"
              src={mapUrl}
              title="Villa location map"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              aria-label="Map showing villa location"
            />
            <div className="text-xs text-gray-600 mt-1">
              <a
                href={`https://www.openstreetmap.org/?mlat=${mapLat}&mlon=${mapLon}#map=15/${mapLat}/${mapLon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-500"
              >
                View larger map
              </a>
            </div>
          </div>

          {/* Long description */}
          <div className="my-5 text-gray-800 max-w-2xl whitespace-pre-line">
            {villa.long_description}
          </div>

          {/* Amenities grid */}
          <section className="mt-5">
            <h2 className="font-semibold text-lg mb-2">Amenities</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {villa.all_amenities.map((a) => (
                <div className="flex items-center gap-2 text-gray-700" key={a.amenity_id}>
                  {a.icon_url ? (
                    <img
                      src={a.icon_url}
                      alt={a.name}
                      className="w-6 h-6"
                    />
                  ) : (
                    <span className="inline-block w-6 h-6 bg-gray-200 rounded-full"></span>
                  )}
                  <span className="text-sm">{a.name}</span>
                </div>
              ))}
            </div>
          </section>

          {/* House Rules */}
          <section className="mt-7">
            <h2 className="font-semibold text-lg mb-2">House Rules</h2>
            <ul className="list-disc pl-5 text-gray-700 space-y-1">
              {villa.rules.length ? villa.rules.map((r) => (
                <li key={r.villa_rule_id}>{r.value}</li>
              )) : (
                <li className="italic text-gray-400">No special rules provided</li>
              )}
            </ul>
          </section>

          {/* Pricing Breakdown */}
          <section className="mt-8">
            <h2 className="font-semibold text-lg mb-2">Pricing</h2>
            <div className="bg-gray-50 rounded-lg p-5 w-full max-w-md">
              <div className="flex flex-col gap-2 text-base">
                <div className="flex justify-between">
                  <span>Per Night</span>
                  <span className="font-semibold">
                    ${villa.price_per_night?.toLocaleString() || "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Cleaning Fee</span>
                  <span>
                    ${villa.price_breakdown_example.cleaning_fee?.toLocaleString() || "0"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Service Fee</span>
                  <span>
                    ${villa.price_breakdown_example.service_fee?.toLocaleString() || "0"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Security Deposit</span>
                  <span>
                    ${villa.price_breakdown_example.security_deposit?.toLocaleString() || "0"}
                  </span>
                </div>
                <div className="w-full border-b border-gray-200 my-2"/>
                <div className="flex justify-between font-bold text-lg">
                  <span>Total for Example Dates</span>
                  <span>
                    ${villa.price_breakdown_example.total?.toLocaleString() || "-"}
                  </span>
                </div>
                <div className="text-xs text-gray-500 font-light mt-1">
                  *Actual total (incl. taxes/overrides) may vary by date and guest count.
                </div>
              </div>
            </div>
          </section>

          {/* Availability Calendar (by month, basic - only renders available days) */}
          <section className="mt-10">
            <h2 className="font-semibold text-lg mb-2">Availability</h2>
            <div className="flex items-center gap-3 mb-2">
              <button
                className="p-1 rounded bg-gray-100 hover:bg-gray-200"
                onClick={() => handleCalendarMonthChange(-1)}
                aria-label="Previous month"
              >‹</button>
              <span className="font-semibold">
                {calendarMonth ? (
                  (() => {
                    const [y, m] = calendarMonth.split("-");
                    const date = new Date(parseInt(y), parseInt(m)-1);
                    return date.toLocaleString(undefined, { month: "long", year: "numeric" });
                  })()
                ) : ""}
              </span>
              <button
                className="p-1 rounded bg-gray-100 hover:bg-gray-200"
                onClick={() => handleCalendarMonthChange(1)}
                aria-label="Next month"
              >›</button>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-2 py-3 inline-block overflow-x-auto">
              {/* Very basic calendar table: just list days and show available/unavailable/color */}
              <div className="flex flex-wrap gap-1 w-full max-w-lg">
                {(getCalendarByMonth[calendarMonth] || []).map((day) => {
                  const d = new Date(day.date);
                  return (
                    <div
                      key={day.date}
                      className={`flex flex-col items-center justify-center w-12 h-12 rounded border ${
                        day.is_available
                          ? "bg-green-50 border-green-400 text-green-700"
                          : "bg-gray-100 border-gray-300 text-gray-400 line-through"
                      }`}
                    >
                      <span className="text-base font-medium">{d.getDate()}</span>
                      {day.price_override && (
                        <span className="text-xs">${day.price_override}</span>
                      )}
                    </div>
                  );
                })}
                {(getCalendarByMonth[calendarMonth] || []).length === 0 && (
                  <div className="text-gray-400 italic text-sm px-2">No data available for this month</div>
                )}
              </div>
            </div>
          </section>

          {/* Reviews */}
          <section className="mt-14 max-w-2xl">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg mb-2">Guest Reviews</h2>
              <span className="text-yellow-500">
                {villa.rating ? (
                  <span>
                    <svg width="20" height="20" fill="currentColor" className="inline-block align-text-bottom">
                      <circle cx="10" cy="10" r="9" />
                    </svg>
                    <span className="ml-1 text-base">{villa.rating.toFixed(2)}</span>
                  </span>
                ) : "-"}
              </span>
              <span className="text-gray-600">({villa.review_count} reviews)</span>
              <Link
                to={`/reviews/${villa.villa_id}`}
                className="ml-4 text-blue-500 text-xs underline"
              >
                View all
              </Link>
            </div>
            <div className="flex flex-col gap-5 mt-1">
              {reviewsToShow.length ? (
                reviewsToShow.map((r) => (
                  <div
                    key={r.review_id}
                    className="border-b border-gray-100 pb-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <img
                        src={r.reviewer.profile_photo_url || `https://picsum.photos/seed/reviewer-${r.reviewer.user_id}/36/36`}
                        alt={r.reviewer.name}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                      <span className="font-medium text-gray-800 mr-2">{r.reviewer.name}</span>
                      <span className="text-yellow-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i}>
                            {i < r.rating ? "★" : "☆"}
                          </span>
                        ))}
                      </span>
                      <span className="ml-3 text-gray-500 text-xs">
                        {new Date(r.created_at * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-gray-700 text-sm leading-relaxed mt-1">
                      {r.review_text}
                    </div>
                  </div>
                ))
              ) : (
                <div className="italic text-gray-400">This villa has not yet been reviewed.</div>
              )}
            </div>
            {villa.reviews.length > NUM_REVIEWS_COLLAPSED && (
              <button
                className="mt-2 text-blue-600 underline text-sm"
                onClick={() => setVisibleReviewPage((s) => !s)}
              >
                {visibleReviewPage ? "Show less" : `Show more (${villa.reviews.length - NUM_REVIEWS_COLLAPSED} more)`}
              </button>
            )}
          </section>

          {/* Other Villas By Host */}
          {hostOtherVillas.length > 0 && (
            <section className="mt-12">
              <h2 className="font-semibold text-lg mb-3">
                Other villas by {villa.host.name}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {hostOtherVillas.map((v) => (
                  <Link
                    to={`/villa/${v.villa_id}`}
                    className="border rounded-lg hover:shadow-md overflow-hidden bg-white flex flex-col"
                    key={v.villa_id}
                  >
                    <img
                      src={v.cover_photo_url || `https://picsum.photos/seed/villa-${v.villa_id}/400/200`}
                      alt={v.name}
                      className="object-cover h-40 w-full"
                    />
                    <div className="px-3 py-2">
                      <div className="font-semibold text-gray-800">{v.name}</div>
                      <div className="text-xs text-gray-500 mb-2">{v.city}, {v.country}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-yellow-500 text-sm">
                          ★ {v.rating?.toFixed(2)}
                        </span>
                        <span className="text-gray-500 text-xs">({v.review_count} reviews)</span>
                      </div>
                      <div className="font-bold text-blue-700 mt-1">${v.price_per_night}/night</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>
        {/* --- Sidebar: Booking Widget --- */}
        <aside className="w-full md:w-[370px] mb-8 md:mb-0 sticky top-28 self-start">
          <div className="rounded-xl shadow-md bg-white border border-gray-100 px-6 py-6">
            <div className="flex justify-between items-baseline">
              <span className="text-xl font-semibold text-blue-700">${villa.price_per_night}</span>
              <span className="text-sm text-gray-400">per night</span>
            </div>
            <div className="my-3 flex flex-col gap-2">
              {/* Booking form controls */}
              <label className="text-xs text-gray-600 font-medium">
                Check-In
                <input
                  type="date"
                  value={bookingWidget.check_in}
                  className="mt-1 block w-full rounded px-2 py-1 border border-gray-200 focus:outline-none focus:ring focus:ring-blue-300"
                  onChange={(e) => handleBookingWidgetChange("check_in", e.target.value)}
                />
              </label>
              <label className="text-xs text-gray-600 font-medium">
                Check-Out
                <input
                  type="date"
                  value={bookingWidget.check_out}
                  className="mt-1 block w-full rounded px-2 py-1 border border-gray-200 focus:outline-none focus:ring focus:ring-blue-300"
                  onChange={(e) => handleBookingWidgetChange("check_out", e.target.value)}
                />
              </label>
              <label className="text-xs text-gray-600 font-medium">
                Guests
                <input
                  type="number"
                  min={1}
                  max={villa.max_occupancy}
                  value={bookingWidget.guests}
                  className="mt-1 block w-full rounded px-2 py-1 border border-gray-200 focus:outline-none focus:ring focus:ring-blue-300"
                  onChange={(e) => {
                    let guests = parseInt(e.target.value, 10);
                    if (isNaN(guests) || guests < 1) guests = 1;
                    else if (guests > villa.max_occupancy) guests = villa.max_occupancy;
                    handleBookingWidgetChange("guests", guests);
                  }}
                />
                <span className="ml-2 text-xs text-gray-500">
                  (max {villa.max_occupancy})
                </span>
              </label>
              {/* Confirm rules */}
              <label className="flex items-center mt-2">
                <input
                  type="checkbox"
                  className="form-checkbox mr-2"
                  checked={bookingWidget.rules_confirmed}
                  onChange={(e) =>
                    handleBookingWidgetChange("rules_confirmed", e.target.checked)
                  }
                />
                <span className="text-xs text-gray-600">
                  I have read and agree to all house rules.
                </span>
              </label>
              {/* Price Total */}
              <div className="mt-3">
                {bookingWidget.price_total !== null ? (
                  <div className="text-lg font-bold text-blue-800">
                    Estimated Total: ${bookingWidget.price_total.toLocaleString()}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    Enter dates and guests to see total price.
                  </div>
                )}
              </div>
              {/* Error state */}
              {bookingWidget.error && (
                <div className="text-sm text-red-600 mt-1">{bookingWidget.error}</div>
              )}
              {outOfDateError && (
                <div className="text-sm text-red-700 mt-1">{outOfDateError}</div>
              )}
              {/* CTAs */}
              <button
                className="mt-5 w-full py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-60 shadow"
                onClick={redirectToBookingFlow}
                disabled={!!bookingWidget.error || !bookingWidget.check_in || !bookingWidget.check_out}
              >
                {villa.is_instant_book ? "Book Instantly" : "Request to Book"}
              </button>
              <button
                className="mt-3 w-full py-2 rounded bg-green-100 text-green-900 font-medium border border-green-200 hover:bg-green-200 transition"
                onClick={handleMessageHost}
              >
                Message Host
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};

export default UV_VillaDetail;