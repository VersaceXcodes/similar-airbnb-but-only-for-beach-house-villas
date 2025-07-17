import React, { useEffect, useState } from "react";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { useAppStore } from "@/store/main";

// ---- Types ----
import { z } from "zod";

// Types from zod schemas (see provided global schemas)
interface PriceBreakdown {
  base_total: number;
  cleaning_fee: number;
  service_fee: number;
  security_deposit: number;
  total: number;
}
interface VillaSummary {
  villa_id: string;
  name: string;
  cover_photo_url: string;
  city: string;
  price_per_night: number;
  is_instant_book: boolean;
  // ... (others omitted since only these used in this view)
}
interface Rule {
  villa_rule_id: string;
  rule_type: string;
  value: string;
}

interface VillaDetailApiResponse {
  villa_id: string;
  name: string;
  cover_photo_url: string;
  city: string;
  price_per_night: number;
  is_instant_book: boolean;
  // Extra fields
  rules: Rule[];
  price_breakdown_example: PriceBreakdown;
  photos: { photo_id: string; photo_url: string; caption?: string | null }[];
}

interface BookingCreatePayload {
  villa_id: string;
  check_in: string;
  check_out: string;
  number_of_guests: number;
  guest_full_name: string;
  guest_email: string;
  guest_phone: string;
  special_requests: string;
  agreed_to_rules: boolean;
  booking_type: string;
}

interface BookingDetail {
  booking_id: string;
  status: string;
  payment_status: string;
  villa: VillaSummary;
  check_in: string;
  check_out: string;
  number_of_guests: number;
  total_price: number;
  guest_full_name: string;
  guest_email: string;
  guest_phone: string;
}

interface ApiError {
  message: string;
}

//---- Helper Functions ----
function parseDateToDisplay(dateStr: string) {
  // Accepts ISO date string (YYYY-MM-DD) or YYYYMMDD, returns readable format
  if (!dateStr) return "";
  if (dateStr.includes("-")) {
    // expected: YYYY-MM-DD
    const d = new Date(dateStr);
    return d.toLocaleDateString();
  }
  if (dateStr.length === 8) {
    // expected: YYYYMMDD
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
}
function ensureDateFormatYYYYMMDD(dateStr: string) {
  // Accepts YYYY-MM-DD, returns YYYYMMDD
  if (dateStr.length === 10 && dateStr[4] === "-") {
    return dateStr.replace(/-/g, "");
  }
  return dateStr;
}
function formatCurrency(amount: number, locale = "en-US", currency = "USD") {
  if (typeof amount !== "number" || isNaN(amount)) return "-";
  return amount.toLocaleString(locale, { style: "currency", currency });
}
function scrollToError(id?: string) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// ---- UV_BookingFlow Component ----
const STEP_LABELS = [
  "Summary",
  "Guest Info",
  "House Rules",
  "Payment",
  "Complete",
];

const defaultPriceBreakdown: PriceBreakdown = {
  base_total: 0,
  cleaning_fee: 0,
  service_fee: 0,
  security_deposit: 0,
  total: 0,
};

const UV_BookingFlow: React.FC = () => {
  // ---- ROUTES/URL ----
  const { villaId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // ---- SEARCH PARAMS (check_in, check_out, number_of_guests) ----
  const urlParams = new URLSearchParams(location.search);
  const check_in = urlParams.get("check_in") || "";
  const check_out = urlParams.get("check_out") || "";
  const numGuestsStr = urlParams.get("number_of_guests") || "";
  const number_of_guests = numGuestsStr ? parseInt(numGuestsStr, 10) : 1;

  // ---- GLOBAL STATE ----
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const booking_in_progress = useAppStore((s) => s.booking_in_progress);
  const set_booking_in_progress = useAppStore((s) => s.set_booking_in_progress);

  // ---- STATE ----
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [bookingState, setBookingState] = useState<{
    check_in: string;
    check_out: string;
    number_of_guests: number;
    guest_full_name: string;
    guest_email: string;
    guest_phone: string;
    special_requests: string;
    agreed_to_rules: boolean;
    booking_type: string; // "instant" or "request"
    step: number;
    payment_status: string | null;
    error: string | null;
  }>({
    check_in: check_in,
    check_out: check_out,
    number_of_guests: number_of_guests,
    guest_full_name: user?.name || "",
    guest_email: user?.email || "",
    guest_phone: user?.phone || "",
    special_requests: "",
    agreed_to_rules: false,
    booking_type: "",
    step: 1,
    payment_status: null,
    error: null,
  });

  const [bookingId, setBookingId] = useState<string | null>(null);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(""); // For step errors
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown>(defaultPriceBreakdown);

  //--- PREVENT UNAUTH - REDIRECT ---
  useEffect(() => {
    if (!user || !auth_token) {
      navigate("/login", { replace: true, state: { from: location.pathname + location.search } });
    }
    // eslint-disable-next-line
  }, [user, auth_token]);

  // 1.----------- Fetch Villa Data -----------
  const {
    data: villaDetail,
    isLoading: isVillaLoading,
    isError: isVillaError,
    error: villaError,
    refetch: refetchVilla,
  } = useQuery<VillaDetailApiResponse, ApiError>({
    queryKey: ["villa", villaId, check_in, check_out, number_of_guests],
    queryFn: async () => {
      // Fetch with price preview for selected params
      const res = await axios.get(
        `${API_BASE}/villa/${villaId}?check_in=${encodeURIComponent(check_in)}&check_out=${encodeURIComponent(check_out)}&number_of_guests=${number_of_guests}`
      );
      return res.data as VillaDetailApiResponse;
    },
    enabled: !!villaId && !!check_in && !!check_out && !!number_of_guests,
    // refetchOnWindowFocus: false - allow
  });

  // 2.----------- Step navigation and State management -----------
  // Persist in-progress booking in Zustand
  useEffect(() => {
    set_booking_in_progress({
      villa_id: villaId || "",
      check_in_date: bookingState.check_in,
      check_out_date: bookingState.check_out,
      number_of_guests: bookingState.number_of_guests,
      step: currentStep,
      guest_info: {
        name: bookingState.guest_full_name || "",
        email: bookingState.guest_email || "",
        phone: bookingState.guest_phone || "",
        special_requests: bookingState.special_requests || "",
      },
      booking_type: bookingState.booking_type,
      agreed_to_rules: bookingState.agreed_to_rules,
      payment_status: bookingState.payment_status || undefined,
      error: bookingState.error || undefined,
      total_price: priceBreakdown.total || undefined,
    });
    // eslint-disable-next-line
  }, [bookingState, currentStep, priceBreakdown]);

  useEffect(() => {
    if (villaDetail && villaDetail.price_breakdown_example) {
      setPriceBreakdown(villaDetail.price_breakdown_example);
    }
    // booking type set for use in createBooking
    if (villaDetail) {
      setBookingState((s) => ({
        ...s,
        booking_type: villaDetail.is_instant_book ? "instant" : "request",
      }));
    }
    // eslint-disable-next-line
  }, [villaDetail]);

  // When step changes, clear error messages
  useEffect(() => {
    setErrorMessage("");
  }, [currentStep]);

  //--- Step navigation handlers
  const goToStep = (step: number) => {
    setCurrentStep(step);
    setBookingState((s) => ({ ...s, step }));
  };
  const nextStep = () => setCurrentStep((c) => Math.min(c + 1, 4));
  const prevStep = () => setCurrentStep((c) => Math.max(c - 1, 1));
  const abortBooking = () => {
    set_booking_in_progress(null);
    navigate(`/villa/${villaId}?check_in=${encodeURIComponent(check_in)}&check_out=${encodeURIComponent(check_out)}&number_of_guests=${number_of_guests}`);
  };

  // -------- Field Validation ---------
  const validateGuestInfo = () => {
    if (!bookingState.guest_full_name.trim()) {
      setErrorMessage("Full name is required.");
      scrollToError("booking_guest_full_name");
      return false;
    }
    if (!bookingState.guest_email.trim() || !/^[\w.-]+@[\w.-]+\.\w+$/.test(bookingState.guest_email)) {
      setErrorMessage("A valid email is required.");
      scrollToError("booking_guest_email");
      return false;
    }
    if (!bookingState.guest_phone.trim() || bookingState.guest_phone.trim().length < 5) {
      setErrorMessage("Phone number is required.");
      scrollToError("booking_guest_phone");
      return false;
    }
    setErrorMessage("");
    return true;
  };
  const validateRulesConfirmed = () => {
    if (!bookingState.agreed_to_rules) {
      setErrorMessage("You must agree to all house rules to proceed.");
      scrollToError("rules_checkbox");
      return false;
    }
    setErrorMessage("");
    return true;
  };
  const validatePaymentData = () => {
    // For mock payment, just accept any 'fake' card input. In real, would check fields.
    setErrorMessage("");
    return true;
  };

  // Handle field input change
  const handleBookingFieldChange = (field: string, value: any) => {
    setBookingState((s) => ({
      ...s,
      [field]: value,
    }));
    if (field.startsWith("guest_")) setErrorMessage("");
  };

  // 3.-------- Bookings Create Mutation -------
  const bookingMutation = useMutation<
    BookingDetail,
    ApiError,
    BookingCreatePayload
  >({
    mutationFn: async (payload) => {
      // Always send Bearer (token in headers)
      const res = await axios.post(`${API_BASE}/booking`, payload, {
        headers: { Authorization: `Bearer ${auth_token?.token}` },
      });
      return res.data as BookingDetail;
    },
    onSuccess: (data) => {
      setBookingId(data.booking_id);
      setBookingState((s) => ({ ...s, payment_status: data.payment_status }));
      nextStep();
    },
    onError: (e) => {
      setErrorMessage(e?.message || "Failed to create booking. Please check your info.");
      scrollToError("booking_errors");
    },
  });

  // 4.-------- Payment Mutation --------------
  const paymentMutation = useMutation<
    any,
    ApiError,
    { booking_id: string; payment_method: string }
  >({
    mutationFn: async ({ booking_id, payment_method }) => {
      const res = await axios.post(
        `${API_BASE}/booking/${booking_id}/payment`,
        { payment_method },
        {
          headers: { Authorization: `Bearer ${auth_token?.token}` },
        }
      );
      return res.data;
    },
    onMutate: () => setIsPaymentLoading(true),
    onSettled: () => setIsPaymentLoading(false),
    onSuccess: (_data) => {
      // Go to confirmation view!
      setTimeout(() => {
        set_booking_in_progress(null);
        navigate(`/booking/confirmation/${bookingId}`);
      }, 300);
    },
    onError: (e) => {
      setErrorMessage(e?.message || "Payment failed. Please try again.");
      scrollToError("booking_errors");
    },
  });

  // 5.-------- Handle Step Submissions -------
  const handleNextStep = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (currentStep === 1) {
      // Summary shown, no data to validate
      nextStep();
    } else if (currentStep === 2) {
      if (!validateGuestInfo()) return;
      // next
      nextStep();
    } else if (currentStep === 3) {
      if (!validateRulesConfirmed()) return;
      // ----- CREATE BOOKING -----
      bookingMutation.mutate({
        villa_id: villaId || "",
        check_in: ensureDateFormatYYYYMMDD(bookingState.check_in),
        check_out: ensureDateFormatYYYYMMDD(bookingState.check_out),
        number_of_guests: bookingState.number_of_guests,
        guest_full_name: bookingState.guest_full_name.trim(),
        guest_email: bookingState.guest_email.trim(),
        guest_phone: bookingState.guest_phone.trim(),
        special_requests: bookingState.special_requests.trim(),
        agreed_to_rules: true,
        booking_type: bookingState.booking_type || (villaDetail && villaDetail.is_instant_book ? "instant" : "request"),
      });
    } else if (currentStep === 4) {
      // --------- MOCK PAYMENT SUBMIT ----------
      if (!validatePaymentData() || !bookingId) return;
      paymentMutation.mutate({ booking_id: bookingId, payment_method: "credit_card" });
    }
  };

  //--- Progress bar: e.g. 1/4, etc
  const progressPercent = Math.round(((currentStep - 1) / 4) * 100);

  // === RENDER ===
  return (
    <>
      {/* ----- LOADING/ERROR BOUNDARY ----- */}
      {isVillaLoading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin w-9 h-9 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
        </div>
      )}

      {!isVillaLoading && villaDetail && (
        <div className="max-w-4xl mx-auto mt-10 mb-16 shadow-lg bg-white rounded-lg flex relative overflow-hidden border">
          {/* Side: Villa Summary Panel */}
          <aside className="w-1/2 min-h-[600px] bg-gray-50 border-r px-6 py-8 flex flex-col gap-8">
            <div>
              <img
                src={villaDetail.cover_photo_url || villaDetail.photos?.[0]?.photo_url || `https://picsum.photos/seed/villa${villaDetail.villa_id}/520/350`}
                alt={villaDetail.name}
                className="rounded-lg object-cover w-full h-52"
              />
              <h2 className="font-bold text-2xl mt-4">{villaDetail.name}</h2>
              <p className="text-gray-600">{villaDetail.city}</p>
              <div className="flex gap-2 mt-2">
                <span className="rounded bg-blue-100 text-blue-700 px-2 py-1 text-xs">
                  ${villaDetail.price_per_night}/night
                </span>
                {villaDetail.is_instant_book && (
                  <span className="rounded bg-green-100 text-green-800 px-2 py-1 text-xs">
                    Instant Book
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="font-semibold text-gray-700">Dates:</span>
              <span className="ml-2 text-gray-600">
                {parseDateToDisplay(check_in)} &rarr; {parseDateToDisplay(check_out)}
              </span>
            </div>
            <div>
              <span className="font-semibold text-gray-700">Guests:</span>
              <span className="ml-2 text-gray-600">{number_of_guests}</span>
            </div>
            <div>
              <div className="font-semibold text-gray-700 mb-2">Price Breakdown:</div>
              <ul className="text-sm text-gray-700">
                <li>
                  <span>Base:</span>{" "}
                  <span>{formatCurrency(priceBreakdown.base_total)}</span>
                </li>
                <li>
                  <span>Cleaning Fee:</span>{" "}
                  <span>{formatCurrency(priceBreakdown.cleaning_fee)}</span>
                </li>
                <li>
                  <span>Service Fee:</span>{" "}
                  <span>{formatCurrency(priceBreakdown.service_fee)}</span>
                </li>
                <li>
                  <span>Security Deposit:</span>{" "}
                  <span>{formatCurrency(priceBreakdown.security_deposit)}</span>
                </li>
                <li className="font-bold mt-2">
                  <span>Total:</span>{" "}
                  <span>{formatCurrency(priceBreakdown.total)}</span>
                </li>
              </ul>
            </div>
            <div className="mt-auto">
              {currentStep <= 4 && (
                <button
                  type="button"
                  className="block mt-8 text-center w-full py-2 rounded text-lg border bg-gray-200 hover:bg-gray-300 transition"
                  onClick={abortBooking}
                >
                  Cancel / Return
                </button>
              )}
            </div>
          </aside>
          {/* Main: Multi-Step Form */}
          <main className="w-1/2 px-7 py-10 flex flex-col min-h-[600px] relative">
            {/* ---- Breadcrumb Wizard ---- */}
            <div className="w-full mb-8">
              <div className="flex items-center mb-3">
                {STEP_LABELS.slice(0, 4).map((label, idx) => (
                  <div key={label} className="flex items-center">
                    <div
                      className={`rounded-full w-7 h-7 flex items-center justify-center mr-2
                        ${
                          currentStep === idx + 1
                            ? "bg-blue-600 text-white"
                            : idx + 1 < currentStep
                            ? "bg-green-500 text-white"
                            : "bg-gray-200 text-gray-500"
                        }
                      `}
                    >
                      {idx + 1}
                    </div>
                    <span className={currentStep === idx + 1 ? "font-bold" : "font-normal"}>
                      {label}
                    </span>
                    {idx < 3 && (
                      <svg
                        className="w-5 h-5 mx-2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
              <div className="w-full bg-gray-200 h-2 rounded">
                <div
                  className="bg-blue-500 h-2 rounded transition-all"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
            {/* ---- Step Content ---- */}
            {errorMessage && (
              <div
                id="booking_errors"
                className="rounded bg-red-100 border border-red-400 px-4 py-2 mb-5 text-red-700 flex items-center gap-4"
              >
                <svg fill="none" className="w-6 h-6 mr-2" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01m-6.938 4h13.856c1.054 0 1.918-.816 1.994-1.851l.007-.149V6c0-1.054-.816-1.918-1.851-1.994L19.856 4H6.002C4.948 4 4.084 4.816 4.008 5.851L4.002 6v12c0 1.054.816 1.918 1.851 1.994l.149.006z" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}
            {/* -- STEP 1: VILLA & SUMMARY -- */}
            {currentStep === 1 && (
              <form
                className="flex flex-col gap-8"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleNextStep();
                }}
              >
                <div>
                  <h1 className="font-bold text-2xl mb-2">Booking Summary</h1>
                  <div className="text-gray-700 text-md">
                    <span>
                      <b>{villaDetail.name}</b> in {villaDetail.city}
                    </span>
                    <br />
                    <span>
                      {parseDateToDisplay(check_in)} &rarr; {parseDateToDisplay(check_out)} &nbsp; | &nbsp; Guests: {number_of_guests}
                    </span>
                  </div>
                  <div className="text-gray-500 text-sm mt-3">
                    Review and confirm your trip details before proceeding.
                  </div>
                </div>
                {/* Confirm/Continue */}
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 rounded py-2 text-white font-bold mt-5"
                >
                  Continue
                </button>
              </form>
            )}
            {/* -- STEP 2: GUEST INFO -- */}
            {currentStep === 2 && (
              <form
                autoComplete="off"
                className="flex flex-col gap-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleNextStep();
                }}
              >
                <h2 className="font-bold text-xl mb-2">Guest Information</h2>
                <div className="flex flex-col gap-3">
                  <label className="text-gray-700 font-semibold" htmlFor="booking_guest_full_name">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="booking_guest_full_name"
                    className="border rounded px-3 py-2"
                    type="text"
                    value={bookingState.guest_full_name}
                    onChange={(e) => handleBookingFieldChange("guest_full_name", e.target.value)}
                    required
                  />
                  <label className="text-gray-700 font-semibold" htmlFor="booking_guest_email">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="booking_guest_email"
                    className="border rounded px-3 py-2"
                    type="email"
                    value={bookingState.guest_email}
                    onChange={(e) => handleBookingFieldChange("guest_email", e.target.value)}
                    required
                  />
                  <label className="text-gray-700 font-semibold" htmlFor="booking_guest_phone">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="booking_guest_phone"
                    className="border rounded px-3 py-2"
                    type="tel"
                    value={bookingState.guest_phone}
                    onChange={(e) => handleBookingFieldChange("guest_phone", e.target.value)}
                    required
                  />
                  <label className="text-gray-700 font-semibold" htmlFor="booking_special_requests">
                    Special Requests (optional)
                  </label>
                  <textarea
                    id="booking_special_requests"
                    className="border rounded px-3 py-2"
                    rows={2}
                    value={bookingState.special_requests}
                    onChange={(e) => handleBookingFieldChange("special_requests", e.target.value)}
                  />
                </div>
                <div className="flex justify-between mt-8 gap-2">
                  <button
                    type="button"
                    className="bg-gray-200 hover:bg-gray-300 rounded px-4 py-2 text-gray-700"
                    onClick={prevStep}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded px-6 py-2 font-bold"
                  >
                    Continue
                  </button>
                </div>
              </form>
            )}
            {/* -- STEP 3: HOUSE RULES -- */}
            {currentStep === 3 && (
              <form
                autoComplete="off"
                className="flex flex-col gap-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleNextStep();
                }}
              >
                <h2 className="font-bold text-xl mb-4">House Rules & Terms</h2>
                <div className="bg-gray-100 border border-gray-200 rounded-lg px-4 py-4 mb-4">
                  {villaDetail.rules.length > 0 ? (
                    <ul className="list-disc list-inside text-gray-700 text-sm pl-2">
                      {villaDetail.rules.map((r) => (
                        <li key={r.villa_rule_id}>
                          <span className="font-semibold">{r.rule_type}:</span> <span>{r.value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-gray-500">No specific house rules listed.</div>
                  )}
                </div>
                <div className="flex items-center gap-2" id="rules_checkbox">
                  <input
                    type="checkbox"
                    id="agree_to_rules"
                    className="w-5 h-5"
                    checked={bookingState.agreed_to_rules}
                    onChange={(e) => handleBookingFieldChange("agreed_to_rules", e.target.checked)}
                  />
                  <label htmlFor="agree_to_rules" className="text-gray-700">
                    I have read and agree to all house rules and terms.
                  </label>
                </div>
                <div className="flex justify-between mt-8 gap-2">
                  <button
                    type="button"
                    className="bg-gray-200 hover:bg-gray-300 rounded px-4 py-2 text-gray-700"
                    onClick={prevStep}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className={`rounded px-6 py-2 font-bold 
                      ${bookingMutation.isLoading ? "bg-blue-200 text-white cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}
                    `}
                    disabled={bookingMutation.isLoading}
                  >
                    {bookingMutation.isLoading ? (
                      <span>
                        <span className="animate-spin mr-2 w-4 h-4 border-t-2 border-b-2 border-white rounded-full inline-block"></span>
                        Creating Booking...
                      </span>
                    ) : villaDetail.is_instant_book ? "Book Now" : "Request to Book"}
                  </button>
                </div>
              </form>
            )}
            {/* -- STEP 4: PAYMENT -- */}
            {currentStep === 4 && (
              <form
                autoComplete="off"
                className="flex flex-col gap-7"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleNextStep();
                }}
              >
                <h2 className="font-bold text-xl mb-1">Payment</h2>
                <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-3">
                  <b>Demo Payment (MVP):</b> Enter any card details below to simulate payment (nothing will be charged).
                </div>
                <div className="flex flex-col gap-4">
                  <label htmlFor="card_number" className="text-gray-700 font-semibold">
                    Card Number
                  </label>
                  <input
                    id="card_number"
                    className="border rounded px-3 py-2"
                    type="text"
                    placeholder="1234 5678 9012 3456"
                    autoComplete="cc-number"
                    required
                  />
                  <div className="flex gap-4">
                    <div className="flex flex-col flex-1">
                      <label htmlFor="card_expiry" className="text-gray-700 font-semibold">
                        Expiry
                      </label>
                      <input
                        id="card_expiry"
                        className="border rounded px-3 py-2"
                        type="text"
                        placeholder="MM/YY"
                        autoComplete="cc-exp"
                        required
                      />
                    </div>
                    <div className="flex flex-col flex-1">
                      <label htmlFor="card_cvc" className="text-gray-700 font-semibold">
                        CVC
                      </label>
                      <input
                        id="card_cvc"
                        className="border rounded px-3 py-2"
                        type="text"
                        placeholder="123"
                        autoComplete="cc-csc"
                        required
                      />
                    </div>
                  </div>
                  <label htmlFor="card_name" className="text-gray-700 font-semibold">
                    Name on Card
                  </label>
                  <input
                    id="card_name"
                    className="border rounded px-3 py-2"
                    type="text"
                    placeholder="Full Name"
                    autoComplete="cc-name"
                    required
                  />
                </div>
                <div className="flex justify-between mt-8 gap-2">
                  <button
                    type="button"
                    className="bg-gray-200 hover:bg-gray-300 rounded px-4 py-2 text-gray-700"
                    onClick={prevStep}
                    disabled={isPaymentLoading}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className={`rounded px-8 py-2 font-bold 
                      ${isPaymentLoading ? "bg-blue-200 text-white cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}
                    `}
                    disabled={isPaymentLoading}
                    id="submit_payment"
                  >
                    {isPaymentLoading ? (
                      <span>
                        <span className="animate-spin mr-2 w-4 h-4 border-t-2 border-b-2 border-white rounded-full inline-block"></span>
                        Processing...
                      </span>
                    ) : (
                      <>
                        Pay {formatCurrency(priceBreakdown.total)} &rarr;
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
            {/* -- STEP 5: REDIRECT to Confirmation -- */}
            {currentStep >= 5 && (
              <div className="flex flex-col gap-8 justify-center items-center h-full min-h-[420px] text-center">
                <svg
                  className="mx-auto w-20 h-20 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 48 48"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14 24l8 8 12-12"
                  />
                  <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="3" fill="none" />
                </svg>
                <h2 className="font-bold text-2xl mt-5 mb-4">Thank you for booking!</h2>
                <p>Your booking is being processed.<br />
                  You will be redirected to your confirmation shortly.</p>
                <div className="mt-8">
                  <Link
                    to={`/dashboard`}
                    className="inline-block bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700"
                  >
                    Go to Dashboard
                  </Link>
                  <span className="mx-2 text-gray-400">|</span>
                  <Link
                    to={`/villa/${villaId}`}
                    className="inline-block text-blue-600 underline"
                  >
                    View this Villa
                  </Link>
                </div>
              </div>
            )}

            {/* Defensive Safety: For completions, no "back" or "cancel" is offered */}
          </main>
        </div>
      )}

      {/* --------- Villa fetch error fallback -------- */}
      {isVillaError && (
        <div className="flex flex-col items-center justify-center py-28">
          <div className="bg-red-100 border border-red-400 text-red-600 px-8 py-6 rounded-md font-bold flex flex-col">
            <span>Error loading villa details:</span>
            <span>{(villaError as any)?.message || "Villa not found."}</span>
            <Link
              to="/"
              className="text-blue-700 underline hover:text-blue-900 mt-3"
            >Return to Home</Link>
          </div>
        </div>
      )}

    </>
  );
};
export default UV_BookingFlow;