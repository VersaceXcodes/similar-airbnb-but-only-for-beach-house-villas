import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";

///////////////////////////
// Zod-backed Review Types
///////////////////////////

// Review shape from OpenAPI/zod (and returned by the GET/POST endpoints)
type UserShort = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  profile_photo_url?: string | null;
  is_active: boolean;
  is_verified_host?: boolean | null;
  notification_settings?: Record<string, any>;
  payout_method_details?: string | null;
};

type Review = {
  review_id: string;
  booking_id: string;
  villa_id: string | null;
  reviewer_user_id: string;
  rating: number;
  review_text: string;
  review_type: string;
  created_at: number;
  is_visible: boolean;
  is_flagged: boolean;
  reviewer: UserShort;
};

interface ReviewListResponse {
  reviews: Review[];
  total: number;
}

// For posting a review (per OpenAPI)
interface ReviewCreatePayload {
  rating: number;
  review_text: string;
}

// For admin moderating review
interface ReviewModeratePayload {
  is_visible?: boolean;
  is_flagged?: boolean;
  admin_notes?: string;
}

////////////////////////
// Review API handlers
////////////////////////

const API_URL = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}`;

function getReviews(
  target_type: string,
  target_id: string
): Promise<ReviewListResponse> {
  return axios
    .get(`${API_URL}/reviews/${encodeURIComponent(target_type)}/${encodeURIComponent(target_id)}`)
    .then((res) => res.data as ReviewListResponse);
}

function postReview(
  target_type: string,
  target_id: string,
  payload: ReviewCreatePayload,
  token: string
): Promise<Review> {
  return axios
    .post(
      `${API_URL}/reviews/${encodeURIComponent(target_type)}/${encodeURIComponent(target_id)}`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
    .then((res) => res.data as Review);
}

function moderateReview(
  review_id: string,
  payload: ReviewModeratePayload,
  token: string
): Promise<Review> {
  return axios
    .patch(
      `${API_URL}/reviews/${encodeURIComponent(review_id)}/moderate`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
    .then((res) => res.data as Review);
}

//////////////////////////
// Date Formatting Helper
//////////////////////////

function formatDate(ts: number | string) {
  // Epoch seconds or ms: autodetect
  let d;
  if (!ts) return "";
  if (typeof ts === "string") d = new Date(Number(ts));
  else if (ts > 1e12) d = new Date(ts); // ms
  else d = new Date(ts * 1000); // s -> ms
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

//////////////////////////////
// Star UI rendering helpers
//////////////////////////////

function Stars({
  value,
  onChange,
  readOnly = false,
  size = 5,
  className = "",
}: {
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-row items-center gap-1 ${className}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          tabIndex={readOnly ? -1 : 0}
          disabled={readOnly}
          className={`${
            i <= value ? "text-yellow-400" : "text-gray-300"
          } p-0 m-0 bg-transparent border-none text-xl focus:outline-none transition-colors`}
          aria-label={`${i} star`}
          onClick={onChange && !readOnly ? () => onChange(i) : undefined}
        >
          <span aria-hidden="true">★</span>
        </button>
      ))}
    </div>
  );
}

//////////////////////////////
// UV_Reviews Main Component
//////////////////////////////

const MAX_REVIEW_LENGTH = 2000;
const MIN_REVIEW_LENGTH = 10;

const SORT_OPTIONS = [
  { value: "recent", label: "Most Recent" },
  { value: "relevant", label: "Most Relevant" },
];

const UV_Reviews: React.FC = () => {
  // Route params
  const params = useParams<{ target_type?: string; target_id?: string }>();
  // Fallback to legacy route config from App if villaId used (for /reviews/:villaId only)
  const fallback_villa_id = useParams<{ villaId?: string }>().villaId;
  const target_type = params.target_type || "villa";
  const target_id = params.target_id || fallback_villa_id || "";

  // Store: user, auth token, error banner setter
  const user = useAppStore((state) => state.user);
  const auth_token = useAppStore((state) => state.auth_token);
  const set_error_banner = useAppStore((state) => state.set_error_banner);

  // Local state
  const [sortBy, setSortBy] = useState<"recent" | "relevant">("recent");
  const [canSubmitReview, setCanSubmitReview] = useState<boolean>(false);
  const [reviewForm, setReviewForm] = useState<{ rating: number; review_text: string }>({
    rating: 0,
    review_text: "",
  });
  const [formError, setFormError] = useState<string>("");
  const [formSuccess, setFormSuccess] = useState<boolean>(false);
  const [flaggingReviewId, setFlaggingReviewId] = useState<string | null>(null);
  const [flagError, setFlagError] = useState<string>("");

  const queryClient = useQueryClient();

  /////////////////////////////////////////
  // Fetch reviews (react-query)
  /////////////////////////////////////////
  const {
    data: reviewData,
    isLoading,
    error: reviewsError,
    refetch: refetchReviews,
  } = useQuery<ReviewListResponse, Error>({
    queryKey: ["reviews", target_type, target_id],
    queryFn: () => getReviews(target_type, target_id),
    enabled: !!target_type && !!target_id,
    staleTime: 60 * 1000,
  });

  ////////////////////////////////////////////////////
  // Compute eligibility to submit review (client-side)
  ////////////////////////////////////////////////////
  useEffect(() => {
    if (user && reviewData) {
      // "Already reviewed": if a review exists with reviewer_user_id == user.user_id
      const alreadyReviewed = reviewData.reviews.some(
        (r) => r.reviewer_user_id === user.user_id
      );
      if (alreadyReviewed) {
        setCanSubmitReview(false);
        setFormSuccess(true);
      } else {
        setCanSubmitReview(true);
        setFormSuccess(false);
      }
    } else if (!user) {
      setCanSubmitReview(false);
      setFormSuccess(false);
    }
  }, [user, reviewData]);

  ////////////////////////////////////////////
  // Submit review (mutation)
  ////////////////////////////////////////////
  const submitMutation = useMutation<Review, Error, ReviewCreatePayload>({
    mutationFn: async (form) => {
      if (!auth_token?.token) throw new Error("You must be logged in.");
      return await postReview(target_type, target_id, form, auth_token.token);
    },
    onSuccess: () => {
      setFormSuccess(true);
      setReviewForm({ rating: 0, review_text: "" });
      setFormError("");
      queryClient.invalidateQueries({ queryKey: ["reviews", target_type, target_id] });
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message || err.message || "Failed to submit review.");
      setFormSuccess(false);
    },
  });

  //////////////////////////////////////////////////////
  // Flag/Moderate review (admin only, per-review basis)
  //////////////////////////////////////////////////////
  const moderateMutation = useMutation<Review, Error, { review_id: string; payload: ReviewModeratePayload }>({
    mutationFn: async ({ review_id, payload }) => {
      if (!auth_token?.token) throw new Error("Not authenticated.");
      return await moderateReview(review_id, payload, auth_token.token);
    },
    onSuccess: () => {
      setFlaggingReviewId(null);
      setFlagError("");
      queryClient.invalidateQueries({ queryKey: ["reviews", target_type, target_id] });
    },
    onError: (err: any) => {
      setFlagError(
        err?.response?.data?.message || err.message || "Failed to flag review."
      );
    },
  });

  /////////////////////////////////////////////////////////////
  // Derived, sorted reviews
  /////////////////////////////////////////////////////////////
  const reviews = useMemo(() => {
    if (!reviewData?.reviews) return [];
    const arr = reviewData.reviews.filter((r) => r.is_visible || user?.role === "admin");
    if (sortBy === "recent") {
      return [...arr].sort((a, b) => b.created_at - a.created_at);
    }
    // "Relevant": highest ratings first, then recency
    if (sortBy === "relevant") {
      return [...arr].sort((a, b) =>
        b.rating !== a.rating ? b.rating - a.rating : b.created_at - a.created_at
      );
    }
    return arr;
  }, [reviewData, sortBy, user]);

  // =============== Render ===============
  return (
    <>
      <div className="max-w-3xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold mb-2">Reviews</h1>

        {/* Error Banner */}
        {(reviewsError || formError) && (
          <div className="bg-red-100 text-red-800 border border-red-300 rounded px-4 py-3 mb-4">
            {reviewsError ? (
              <>
                <span>Error: {reviewsError.message}</span>
                {set_error_banner &&
                  set_error_banner({ message: reviewsError.message, visible: true })}
              </>
            ) : (
              <span>{formError}</span>
            )}
          </div>
        )}

        {/* Review submission form or thank you */}
        {user ? (
          canSubmitReview ? (
            <form
              className="mb-8 bg-gray-50 p-5 rounded shadow"
              onSubmit={(e) => {
                e.preventDefault();
                setFormError("");
                if (reviewForm.rating < 1 || reviewForm.rating > 5) {
                  setFormError("Please select a star rating (1-5).");
                  return;
                }
                if (
                  reviewForm.review_text.trim().length < MIN_REVIEW_LENGTH ||
                  reviewForm.review_text.length > MAX_REVIEW_LENGTH
                ) {
                  setFormError(
                    `Review text must be between ${MIN_REVIEW_LENGTH} and ${MAX_REVIEW_LENGTH} characters.`
                  );
                  return;
                }
                submitMutation.mutate({
                  rating: reviewForm.rating,
                  review_text: reviewForm.review_text.trim(),
                });
              }}
            >
              <div className="mb-2 font-medium text-lg">Leave a review</div>
              <div className="mb-2">
                <Stars
                  value={reviewForm.rating}
                  onChange={(v) => setReviewForm((r) => ({ ...r, rating: v }))}
                  readOnly={false}
                  size={5}
                />
              </div>
              <textarea
                className="w-full border rounded p-2 resize-none focus:ring-2 focus:ring-blue-300"
                value={reviewForm.review_text}
                placeholder={`Share your experience... (${MIN_REVIEW_LENGTH}-${MAX_REVIEW_LENGTH} characters)`}
                minLength={MIN_REVIEW_LENGTH}
                maxLength={MAX_REVIEW_LENGTH}
                onChange={(e) => {
                  setReviewForm((r) => ({
                    ...r,
                    review_text: e.target.value.slice(0, MAX_REVIEW_LENGTH),
                  }));
                }}
                rows={4}
                required
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-gray-500">
                  {reviewForm.review_text.length}/{MAX_REVIEW_LENGTH}
                </span>
                <button
                  type="submit"
                  disabled={isLoading || submitMutation.isLoading}
                  className="bg-blue-600 text-white px-6 py-2 rounded disabled:bg-gray-300 font-semibold transition-colors"
                >
                  {submitMutation.isLoading ? "Submitting..." : "Submit Review"}
                </button>
              </div>
              {formError && <div className="text-red-500 mt-1">{formError}</div>}
            </form>
          ) : (
            formSuccess && (
              <div className="mb-8 text-green-700 bg-green-50 p-4 text-center rounded border border-green-200 font-medium">
                Thank you — your review was submitted!
              </div>
            )
          )
        ) : (
          <div className="mb-8 text-blue-600 py-3">
            <Link
              className="underline"
              to={`/login`}
              state={{
                redirect: `/reviews/${target_type}/${target_id}`,
              }}
            >
              Sign in
            </Link>{" "}
            to leave a review.
          </div>
        )}

        {/* Sort dropdown */}
        <div className="flex flex-row items-center justify-end mb-3">
          <label className="mr-1 text-sm font-medium text-gray-600">Sort by:</label>
          <select
            className="border border-gray-300 rounded px-2 py-1 bg-white text-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "recent" | "relevant")}
            aria-label="Sort reviews"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Reviews list */}
        <div>
          {isLoading ? (
            <div className="text-center text-gray-400 my-6">Loading reviews...</div>
          ) : reviews && reviews.length > 0 ? (
            <ul className="space-y-6">
              {reviews.map((review) => (
                <li
                  key={review.review_id}
                  className={`p-4 bg-white rounded shadow border border-gray-100 transition ${!review.is_visible ? "opacity-70 bg-gray-50" : ""
                    }`}
                  id={`review_${review.review_id}`}
                >
                  <div className="flex flex-row items-start gap-4">
                    <div className="flex-shrink-0">
                      {review.reviewer?.profile_photo_url ? (
                        <img
                          src={review.reviewer?.profile_photo_url}
                          alt={review.reviewer?.name || "?"}
                          className="w-12 h-12 rounded-full object-cover border"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-200 text-gray-600 font-bold text-lg border">
                          {review.reviewer?.name?.slice(0, 1) || "?"}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-row items-center gap-2">
                        <span className="font-semibold text-gray-900">{review.reviewer?.name || "Anonymous"}</span>
                        <Stars value={review.rating} readOnly size={5} />
                        <span className="ml-2 text-xs text-gray-500">
                          {formatDate(review.created_at)}
                        </span>
                        {/* ADMIN: Flag/Moderate */}
                        {user && user.role === "admin" && (
                          <button
                            className="ml-3 px-2 py-0.5 rounded text-xs border border-yellow-400 text-yellow-700 hover:bg-yellow-100 focus:ring-2 ring-yellow-300"
                            disabled={flaggingReviewId === review.review_id}
                            onClick={() => {
                              if (!window.confirm("Flag this review for moderation?")) return;
                              setFlaggingReviewId(review.review_id);
                              setFlagError("");
                              moderateMutation.mutate({
                                review_id: review.review_id,
                                payload: { is_flagged: !review.is_flagged },
                              });
                            }}
                            aria-label={review.is_flagged ? "Unflag review" : "Flag review"}
                          >
                            {flaggingReviewId === review.review_id
                              ? "Flagging..."
                              : review.is_flagged
                                ? "Flagged"
                                : "Flag"}
                          </button>
                        )}
                        {/* Link: Admin review moderation panel if flagged */}
                        {user && user.role === "admin" && review.is_flagged && (
                          <Link
                            className="ml-2 text-blue-700 underline text-xs"
                            to="/admin/reviews"
                          >
                            Go to Review Moderation
                          </Link>
                        )}
                      </div>
                      <div className="whitespace-pre-line mt-2 text-gray-800 text-base">
                        {review.review_text}
                      </div>
                    </div>
                  </div>
                  {/* Per-review flag error */}
                  {flaggingReviewId === review.review_id && flagError && (
                    <div className="text-xs text-red-600 mt-1">{flagError}</div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-gray-400 text-center my-8">
              No reviews yet for this {target_type}.
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default UV_Reviews;