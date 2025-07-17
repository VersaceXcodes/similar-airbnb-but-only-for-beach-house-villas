import React, { useState, useMemo } from "react";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/main";
import { Link } from "react-router-dom";

// Types from backend zod schemas
type UserShort = {
  user_id: string;
  name: string;
  email: string;
  role?: string;
  profile_photo_url?: string | null;
};
type Review = {
  review_id: string;
  booking_id: string;
  villa_id: string | null;
  reviewer_user_id: string;
  rating: number;
  review_text: string;
  review_type: string;
  is_visible: boolean;
  is_flagged: boolean;
  admin_notes?: string | null;
  created_at: number;
  reviewer: UserShort;
};

type ReviewListResponse = {
  reviews: Review[];
  total: number;
};
type TableError = {
  message: string;
};

const PAGE_SIZE = 25;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const formatDate = (ts: number) => {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const UV_Admin_Reviews: React.FC = () => {
  // Global state
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);

  // Admin context (filters, tab)
  const admin_view_context = useAppStore((s) => s.admin_view_context);
  const set_admin_view_context = useAppStore((s) => s.set_admin_view_context);

  // Local state
  const [filters, setFilters] = useState<{
    villa?: string;
    reviewer?: string;
    keyword?: string;
    is_flagged?: boolean | null;
  }>({
    villa: admin_view_context?.filters?.villa || "",
    reviewer: admin_view_context?.filters?.reviewer || "",
    keyword: admin_view_context?.filters?.keyword || "",
    is_flagged:
      typeof admin_view_context?.filters?.is_flagged === "boolean"
        ? admin_view_context.filters.is_flagged
        : null,
  });

  const [pagination, setPagination] = useState<{ page: number }>({
    page: 1,
  });

  const [editModalState, setEditModalState] = useState<{
    review: Review;
    is_open: boolean;
    admin_notes: string;
    is_visible: boolean;
    is_flagged: boolean;
    modal_error: string;
    is_loading: boolean;
  } | null>(null);

  // Refs and helpers
  const queryClient = useQueryClient();

  // API: Fetch reviews list
  const fetchReviews = async ({
    villa,
    reviewer,
    keyword,
    is_flagged,
    page,
  }: {
    villa?: string;
    reviewer?: string;
    keyword?: string;
    is_flagged?: boolean | null;
    page: number;
  }): Promise<ReviewListResponse> => {
    const params: Record<string, string> = {};
    if (villa) params.villa = villa;
    if (reviewer) params.reviewer = reviewer;
    if (keyword) params.keyword = keyword;
    if (typeof is_flagged === "boolean") params.is_flagged = String(is_flagged);
    params.page = String(page);
    // No page_size arg: backend defaults to 25 per spec
    const url = `${API_BASE_URL}/admin/reviews`;
    const resp = await axios.get(url, {
      params,
      headers: { Authorization: `Bearer ${auth_token?.token ?? ""}` },
    });
    return resp.data;
  };

  const {
    data: reviewsResp,
    isLoading: tableLoading,
    isError: tableIsError,
    error: tableError,
    refetch: refetchReviews,
  } = useQuery<ReviewListResponse, any>({
    queryKey: [
      "admin_reviews",
      { ...filters, page: pagination.page },
    ],
    queryFn: () =>
      fetchReviews({
        ...filters,
        page: pagination.page,
      }),
    keepPreviousData: true,
    staleTime: 30_000,
    retry: 1,
    enabled: !!user && user.role === "admin",
  });

  // Table rows
  const reviews: Review[] = reviewsResp?.reviews || [];
  const reviewsTotal = reviewsResp?.total || 0;
  const pageCount = Math.ceil(reviewsTotal / PAGE_SIZE);

  // Mutations for moderation actions
  const patchReviewModerate = async ({
    review_id,
    patch,
  }: {
    review_id: string;
    patch: Partial<Pick<Review, "is_visible" | "is_flagged" | "admin_notes">>;
  }): Promise<Review> => {
    const resp = await axios.patch(
      `${API_BASE_URL}/reviews/${review_id}/moderate`,
      patch,
      { headers: { Authorization: `Bearer ${auth_token?.token ?? ""}` } }
    );
    return resp.data;
  };

  // Row show/hide/flag/unflag/notes/delete
  const moderateMutation = useMutation<
    Review,
    any,
    {
      review_id: string;
      patch: Partial<Pick<Review, "is_visible" | "is_flagged" | "admin_notes">>;
    }
  >({
    mutationFn: patchReviewModerate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_reviews"] });
      setEditModalState(null); // If editing, close modal
    },
  });

  // Handlers for filter/search/reset
  const handleFilterChange = (type: "villa" | "reviewer" | "keyword" | "is_flagged", value: string | boolean) => {
    const updated = { ...filters };
    if (type === "is_flagged") {
      updated.is_flagged = typeof value === "boolean" ? value : null;
    } else if (type === "villa" || type === "reviewer" || type === "keyword") {
      updated[type] = value as string;
    }
    setFilters(updated);
    setPagination({ page: 1 }); // Reset to page 1 on filter change
    set_admin_view_context({ ...admin_view_context, tab: "reviews", filters: updated });
    refetchReviews();
  };

  const handleClearFilters = () => {
    const cleared = { villa: "", reviewer: "", keyword: "", is_flagged: null };
    setFilters(cleared);
    setPagination({ page: 1 });
    set_admin_view_context({ ...admin_view_context, tab: "reviews", filters: cleared });
    refetchReviews();
  };

  // Pagination handler
  const gotoPage = (page: number) => {
    setPagination({ page });
    set_admin_view_context({ ...admin_view_context, tab: "reviews", filters });
    refetchReviews();
  };

  // Edit modal open (modal supports all moderation fields)
  const handleOpenEditModal = (review: Review) => {
    setEditModalState({
      review,
      is_open: true,
      admin_notes: review.admin_notes || "",
      is_visible: review.is_visible,
      is_flagged: review.is_flagged,
      modal_error: "",
      is_loading: false,
    });
  };

  // Modal mutation
  const handleModalSubmit = async () => {
    if (!editModalState) return;
    // Validate admin_notes limit
    if (editModalState.admin_notes.length > 2000) {
      setEditModalState((old) =>
        old
          ? {
              ...old,
              modal_error: "Admin notes must be less than 2000 characters.",
            }
          : null
      );
      return;
    }
    const patch = {
      is_visible: editModalState.is_visible,
      is_flagged: editModalState.is_flagged,
      admin_notes: editModalState.admin_notes,
    };
    setEditModalState((old) => old && { ...old, is_loading: true, modal_error: "" });
    try {
      await moderateMutation.mutateAsync({
        review_id: editModalState.review.review_id,
        patch,
      });
      setEditModalState(null);
    } catch (err: any) {
      setEditModalState((old) =>
        old
          ? {
              ...old,
              is_loading: false,
              modal_error: err?.response?.data?.message || "Failed to update moderation.",
            }
          : null
      );
    }
  };

  // Table row actions
  const handleShowHideReview = (review: Review) => {
    moderateMutation.mutate(
      {
        review_id: review.review_id,
        patch: { is_visible: !review.is_visible },
      },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin_reviews"] }),
      }
    );
  };

  const handleFlagUnflagReview = (review: Review) => {
    moderateMutation.mutate(
      {
        review_id: review.review_id,
        patch: { is_flagged: !review.is_flagged },
      },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin_reviews"] }),
      }
    );
  };

  // "Delete" sets is_visible to false and unflags
  const handleDeleteReview = (review: Review) => {
    if (
      !window.confirm(
        "Are you sure you want to hide (soft delete) this review? This is not a hard delete and can be reverted."
      )
    )
      return;
    moderateMutation.mutate(
      {
        review_id: review.review_id,
        patch: { is_visible: false, is_flagged: false },
      },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin_reviews"] }),
      }
    );
  };

  // Modal cancel
  const handleModalCancel = () => {
    setEditModalState(null);
  };

  // Filter quick controls
  const flaggedOnlyChecked = filters.is_flagged === true;

  // Table error
  const globalTableError = tableIsError
    ? (tableError as { message?: string })?.message || "Failed to load reviews"
    : "";

  // Permissions guard
  if (!user || user.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <h2 className="text-2xl font-semibold text-neutral-700 mb-3">Admin Only</h2>
        <p className="text-neutral-500">You do not have permission to access this panel.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col px-5 py-8 max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Reviews Moderation</h1>
          <p className="text-gray-500 mt-1">
            View, search, and moderate all guest reviews. Use filters to quickly find flagged or inappropriate submissions. Row actions are logged for audit.
          </p>
        </header>
        {/* Filters */}
        <section className="bg-white border rounded-md shadow-sm mb-4 px-4 py-3 flex flex-col md:flex-row gap-3 items-center">
          <div className="flex flex-col md:flex-row gap-2 md:items-end flex-1">
            {/* Villa ID filter */}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">Villa ID</span>
              <input
                type="text"
                className="input input-bordered input-sm rounded bg-gray-50 border-gray-300 max-w-[104px]"
                placeholder="Villa ID"
                value={filters.villa}
                onChange={(e) => handleFilterChange("villa", e.target.value)}
                data-testid="filter-villa"
              />
            </label>
            {/* Reviewer User ID filter */}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">Reviewer ID</span>
              <input
                type="text"
                className="input input-bordered input-sm rounded bg-gray-50 border-gray-300 max-w-[104px]"
                placeholder="User ID"
                value={filters.reviewer}
                onChange={(e) => handleFilterChange("reviewer", e.target.value)}
                data-testid="filter-reviewer"
              />
            </label>
            {/* Keyword filter */}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">Keyword</span>
              <input
                type="text"
                className="input input-bordered input-sm rounded bg-gray-50 border-gray-300 min-w-[160px]"
                placeholder="Search text"
                value={filters.keyword}
                onChange={(e) => handleFilterChange("keyword", e.target.value)}
                data-testid="filter-keyword"
              />
            </label>
            {/* Flagged only */}
            <label className="flex items-center gap-2 select-none text-sm font-medium text-gray-700 mt-1 md:mt-0 ml-2">
              <input
                type="checkbox"
                className="checkbox"
                checked={flaggedOnlyChecked}
                onChange={(e) => handleFilterChange("is_flagged", e.target.checked)}
                data-testid="filter-flagged"
              />
              Flagged only
            </label>
          </div>
          <button
            className="btn btn-xs px-3 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-gray-700 font-semibold"
            onClick={handleClearFilters}
            data-testid="filter-clear"
          >
            Clear Filters
          </button>
        </section>
        {globalTableError && (
          <div className="mb-2 text-red-600 text-sm font-medium px-2 py-1 bg-red-50 border border-red-100 rounded">
            {globalTableError}
          </div>
        )}
        {/* Table */}
        <div className="overflow-auto rounded shadow border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 font-semibold text-left text-xs text-gray-700 border-b border-gray-100">Review</th>
                <th className="p-2 font-semibold text-left text-xs text-gray-700 border-b border-gray-100">Rating</th>
                <th className="p-2 font-semibold text-left text-xs text-gray-700 border-b border-gray-100">Date</th>
                <th className="p-2 font-semibold text-left text-xs text-gray-700 border-b border-gray-100">Villa</th>
                <th className="p-2 font-semibold text-left text-xs text-gray-700 border-b border-gray-100">Reviewer</th>
                <th className="p-2 font-semibold text-left text-xs text-gray-700 border-b border-gray-100">Visible</th>
                <th className="p-2 font-semibold text-left text-xs text-gray-700 border-b border-gray-100">Flagged</th>
                <th className="p-2 font-semibold text-left text-xs text-gray-700 border-b border-gray-100">Admin Notes</th>
                <th className="p-2 font-semibold text-left text-xs text-gray-700 border-b border-gray-100">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-gray-400">
                    Loading reviews...
                  </td>
                </tr>
              ) : reviews.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-gray-400">
                    No reviews found for these filters.
                  </td>
                </tr>
              ) : (
                reviews.map((review) => (
                  <tr key={review.review_id} className={`hover:bg-gray-50 ${!review.is_visible ? "opacity-60 bg-yellow-50" : ""}`}>
                    {/* Review Text with ellipsis and tooltip */}
                    <td className="p-2 max-w-[220px] align-top">
                      <div className="truncate" title={review.review_text}>
                        {review.review_text}
                      </div>
                      <div className="mt-1 text-xs text-gray-400 font-medium">
                        {review.review_type}
                      </div>
                    </td>
                    {/* Rating */}
                    <td className="p-2 align-middle text-center">
                      <span className={`inline-block font-bold px-2 py-1 rounded ${review.rating >= 4 ? "bg-green-100 text-green-700" : review.rating <= 2 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {review.rating}/5
                      </span>
                    </td>
                    {/* Date */}
                    <td className="p-2 align-middle text-gray-500 text-xs">{formatDate(review.created_at)}</td>
                    {/* Villa link (if available) */}
                    <td className="p-2 align-middle">
                      {review.villa_id ? (
                        <Link
                          to={`/villa/${review.villa_id}`}
                          className="text-blue-600 underline font-medium hover:text-blue-800"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {review.villa_id}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    {/* Reviewer info */}
                    <td className="p-2 align-middle">
                      <div className="flex items-center gap-2">
                        {/* If profile photo is there, show as avatar */}
                        {review.reviewer?.profile_photo_url ? (
                          <img
                            src={review.reviewer.profile_photo_url}
                            alt={review.reviewer.name}
                            className="w-6 h-6 rounded-full bg-gray-100 border"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 select-none text-xs font-bold">{review.reviewer?.name?.[0] || "-"}</div>
                        )}
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium text-xs">{review.reviewer?.name || review.reviewer_user_id}</span>
                          <span className="text-gray-400 text-[10px]">{review.reviewer?.email}</span>
                        </div>
                      </div>
                    </td>
                    {/* Visible status */}
                    <td className="p-2 align-middle text-center">
                      {review.is_visible ? (
                        <span className="text-green-600 font-medium">Yes</span>
                      ) : (
                        <span className="text-red-500 font-medium">No</span>
                      )}
                    </td>
                    {/* Flagged */}
                    <td className="p-2 align-middle text-center">
                      {review.is_flagged ? (
                        <span className="inline-flex items-center text-sm font-semibold text-orange-700 bg-orange-100 rounded px-2 py-0.5">
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 20 20"><path d="M6 6V4a2 2 0 112 0v2m0 4v4m0 4h.01M11.293 8.293a1 1 0 00-1.415 0l-2.829 2.829a1 1 0 001.415 1.415l2.829-2.829a1 1 0 000-1.415z"/></svg>
                          Yes
                        </span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    {/* Admin notes as tooltip/ellipsis */}
                    <td className="p-2 max-w-[150px]">
                      <div className="truncate text-xs" title={review.admin_notes || ""}>
                        {review.admin_notes || <span className="text-gray-300">—</span>}
                      </div>
                    </td>
                    {/* Row actions */}
                    <td className="p-2 text-right whitespace-nowrap">
                      <div className="flex gap-1 justify-end">
                        {/* Show/hide toggle */}
                        <button
                          className={`px-2 py-1 text-xs rounded border ${review.is_visible ? "bg-white hover:bg-green-100 text-green-700 border-green-300" : "bg-white hover:bg-gray-100 text-gray-400 border-gray-200"}`}
                          title={review.is_visible ? "Hide review" : "Show review"}
                          onClick={() => handleShowHideReview(review)}
                          disabled={moderateMutation.isLoading}
                          data-testid="row-showhide"
                        >
                          {review.is_visible ? "Hide" : "Show"}
                        </button>
                        {/* Flag/unflag toggle */}
                        <button
                          className={`px-2 py-1 text-xs rounded border ${review.is_flagged ? "bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200" : "bg-white hover:bg-yellow-100 text-yellow-700 border-yellow-300"}`}
                          title={review.is_flagged ? "Unflag review" : "Flag as inappropriate"}
                          onClick={() => handleFlagUnflagReview(review)}
                          disabled={moderateMutation.isLoading}
                          data-testid="row-flag"
                        >
                          {review.is_flagged ? "Unflag" : "Flag"}
                        </button>
                        {/* Edit modal (notes, all fields) */}
                        <button
                          className="px-2 py-1 text-xs rounded bg-gray-50 hover:bg-gray-200 border border-gray-300 text-gray-600"
                          title="Edit moderation (notes/details)"
                          onClick={() => handleOpenEditModal(review)}
                          disabled={moderateMutation.isLoading}
                          data-testid="row-edit"
                        >
                          Edit
                        </button>
                        {/* Delete ("Hide" aka is_visible=false) */}
                        <button
                          className="px-2 py-1 text-xs rounded bg-red-100 hover:bg-red-200 border border-red-200 text-red-700"
                          title="Soft Delete (hide review)"
                          onClick={() => handleDeleteReview(review)}
                          disabled={moderateMutation.isLoading}
                          data-testid="row-delete"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex flex-col sm:flex-row justify-between items-center py-4">
          <div className="text-sm text-gray-500 mb-2 sm:mb-0">
            Showing {reviews.length === 0 ? 0 : (pagination.page - 1) * PAGE_SIZE + 1}
            {" - "}
            {Math.min(pagination.page * PAGE_SIZE, reviewsTotal)} of {reviewsTotal} reviews
          </div>
          {pageCount > 1 && (
            <nav className="inline-flex items-center gap-2" aria-label="Pagination">
              <button
                className="btn btn-xs disabled:opacity-50 font-semibold"
                disabled={pagination.page === 1}
                onClick={() => gotoPage(1)}
              >
                &laquo; First
              </button>
              <button
                className="btn btn-xs disabled:opacity-50"
                disabled={pagination.page === 1}
                onClick={() => gotoPage(pagination.page - 1)}
              >
                &lsaquo; Prev
              </button>
              <span className="px-2 py-0.5 rounded bg-gray-50 border text-xs mx-2">
                Page {pagination.page} of {pageCount}
              </span>
              <button
                className="btn btn-xs disabled:opacity-50"
                disabled={pagination.page === pageCount}
                onClick={() => gotoPage(pagination.page + 1)}
              >
                Next &rsaquo;
              </button>
              <button
                className="btn btn-xs disabled:opacity-50"
                disabled={pagination.page === pageCount}
                onClick={() => gotoPage(pageCount)}
              >
                Last &raquo;
              </button>
            </nav>
          )}
        </div>
      </div>
      {/* Edit Modal for Review Moderation */}
      {editModalState && editModalState.is_open && (
        <div className="fixed z-50 inset-0 bg-black bg-opacity-30 flex items-center justify-center transition-opacity py-8">
          <div className="bg-white rounded-lg border shadow-lg relative w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-800">Review Moderation</h3>
              <button
                className="text-gray-400 hover:text-gray-600 text-xl font-bold px-2"
                onClick={handleModalCancel}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <div className="text-xs text-gray-700 font-medium mb-1">Review Text</div>
                <div className="bg-gray-50 p-2 rounded text-gray-900 text-sm border">{editModalState.review.review_text}</div>
              </div>
              <div className="flex flex-row items-center gap-3">
                <div>
                  <div className="text-xs text-gray-700 font-medium">Rating</div>
                  <div className="text-base font-bold">{editModalState.review.rating}/5</div>
                </div>
                <div>
                  <div className="text-xs text-gray-700 font-medium">Date</div>
                  <div className="text-sm">{formatDate(editModalState.review.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-700 font-medium">Reviewer</div>
                  <div className="text-sm">{editModalState.review.reviewer?.name}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-700 font-medium">Villa</div>
                  <div className="text-sm">
                    {editModalState.review.villa_id ? (
                      <Link
                        to={`/villa/${editModalState.review.villa_id}`}
                        className="text-blue-600 underline font-medium hover:text-blue-800"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {editModalState.review.villa_id}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-1">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={editModalState.is_visible}
                    onChange={e =>
                      setEditModalState(old =>
                        old ? { ...old, is_visible: e.target.checked } : null
                      )
                    }
                    disabled={editModalState.is_loading}
                  />
                  Visible on platform
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={editModalState.is_flagged}
                    onChange={e =>
                      setEditModalState(old =>
                        old ? { ...old, is_flagged: e.target.checked } : null
                      )
                    }
                    disabled={editModalState.is_loading}
                  />
                  Flagged as inappropriate
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Admin Notes <span className="text-gray-400">(visible to moderators only)</span>
                </label>
                <textarea
                  className="textarea textarea-bordered w-full text-xs min-h-[60px] bg-gray-50 border-gray-200"
                  maxLength={2000}
                  value={editModalState.admin_notes}
                  disabled={editModalState.is_loading}
                  onChange={e =>
                    setEditModalState(old =>
                      old ? { ...old, admin_notes: e.target.value } : null
                    )
                  }
                  placeholder="Notes/instructions for other moderators"
                />
                <div className="text-xs text-gray-300 text-right">{editModalState.admin_notes.length}/2000</div>
              </div>
              {editModalState.modal_error && (
                <div className="text-red-600 text-xs font-medium">{editModalState.modal_error}</div>
              )}
            </div>
            <div className="px-6 py-3 border-t flex gap-2 justify-end">
              <button
                className="btn btn-xs px-4 bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
                onClick={handleModalCancel}
                disabled={editModalState.is_loading}
              >
                Cancel
              </button>
              <button
                className={`btn btn-xs px-4 rounded font-semibold ${editModalState.is_loading ? "bg-blue-200 cursor-wait" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                onClick={handleModalSubmit}
                disabled={editModalState.is_loading}
              >
                {editModalState.is_loading ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UV_Admin_Reviews;