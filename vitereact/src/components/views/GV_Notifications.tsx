import React, { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
import { Link, useNavigate } from "react-router-dom";

// -- Types (from store/zod OpenAPI) --
type Notification = {
  notification_id: string;
  user_id?: string;
  type: string;
  content: string;
  is_read: boolean;
  related_booking_id?: string | null;
  related_villa_id?: string | null;
  created_at: number;
};

// Notification API response
interface NotificationListResponse {
  notifications: Notification[];
  unread_count: number;
}

// Main API URLs
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Helper: format time ago (simple, can upgrade with date-fns if allowed)
function formatTimeAgo(ts: number): string {
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - ts * 1000) / 1000)); // server returns unix seconds
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts * 1000).toLocaleString();
}

// Helper: icon SVGs
const Icons: Record<string, JSX.Element> = {
  booking: (
    <svg className="w-5 h-5 text-sky-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="7" width="18" height="13" rx="2" strokeWidth={1.5} /><path d="M8 7V5a4 4 0 018 0v2" strokeWidth={1.5} /></svg>
  ),
  message: (
    <svg className="w-5 h-5 text-emerald-500 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeWidth={1.5} /></svg>
  ),
  review: (
    <svg className="w-5 h-5 text-amber-500 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="12,17 18,21 16.5,14 22,10 14.5,10 12,3 9.5,10 2,10 7.5,14 6,21" strokeWidth={1.5} /></svg>
  ),
  generic: (
    <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={1.5} /></svg>
  )
};

// - Notification type → icon mapping helper
function getNotificationIcon(type: string): JSX.Element {
  if (type.startsWith("booking")) return Icons.booking;
  if (type.startsWith("message")) return Icons.message;
  if (type.startsWith("review")) return Icons.review;
  return Icons.generic;
}

// - Notification type → navigation mapping
function getNotificationLink(n: Notification): string | null {
  // Map to app routes; must match crosslinks/routes from app arch doc
  if (n.type.startsWith("booking") && n.related_booking_id)
    return `/booking/${n.related_booking_id}/details`;
  // Notification for new message, route to message thread (by booking, fallback to messages)
  if (n.type.startsWith("message") && n.related_booking_id)
    return `/messages`; // or `/messages/thread/${thread_id}` if available; fallback to inbox
  if (n.type.startsWith("review") && n.related_villa_id)
    return `/reviews/${n.related_villa_id}`;
  // Default for booking review prompt (as sometimes comes from booking notification)
  if (n.type === "review_prompt" && n.related_booking_id)
    return `/reviews/${n.related_booking_id}`;
  return null;
}

// Escape for modal: trap focus etc.
function useEscape(closeFn: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") closeFn();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closeFn]);
}

const GV_Notifications: React.FC = () => {
  // Controls modal/dropdown open state (only required locally—GV_TopNav triggers via bell click in real)
  const [open, setOpen] = useState(false);

  const queryClient = useQueryClient();
  const notifications = useAppStore((s) => s.notifications);
  const set_notifications = useAppStore((s) => s.set_notifications);
  const update_notification = useAppStore((s) => s.update_notification);
  const mark_notification_read = useAppStore((s) => s.mark_notification_read);
  const unread_notifications = useAppStore((s) => s.unread_notifications);
  const user = useAppStore((s) => s.user);

  const [loadingMarkAll, setLoadingMarkAll] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Modal open/close
  const handleOpen = useCallback(() => {
    setOpen(true);
    refetch();
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setLocalError(null);
  }, []);

  // Click outside to close for modal/dropdown
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick, true);
    return () => document.removeEventListener("mousedown", handleClick, true);
  }, [open]);

  // Escape key support
  useEscape(handleClose, open);

  ////////////////////////////////////////////
  // --- REACT QUERY: Fetch notifications ---
  ////////////////////////////////////////////

  // Fetch notifications when opened, or listen for store changes from socket
  const {
    isFetching: loading,
    isError,
    error,
    data,
    refetch,
  } = useQuery<NotificationListResponse, Error>(
    ["notifications"],
    async () => {
      const resp = await axios.get<NotificationListResponse>(
        `${API_BASE_URL}/notifications`,
        {
          headers: {
            Authorization: `Bearer ${useAppStore
              .getState()
              .auth_token?.token ?? ""}`,
          },
        }
      );
      // Update zustand global
      set_notifications(resp.data.notifications);
      return resp.data;
    },
    {
      enabled: open && !!user,
      refetchOnWindowFocus: false,
      retry: 1,
    }
  );

  ////////////////////////////////////////////
  // --- REACT QUERY: Mark as read mutation
  ////////////////////////////////////////////

  const markNotificationMutation = useMutation({
    mutationFn: async (notification_id: string) => {
      await axios.post(
        `${API_BASE_URL}/notifications/${notification_id}/read`,
        {},
        {
          headers: {
            Authorization: `Bearer ${
              useAppStore.getState().auth_token?.token ?? ""
            }`,
          },
        }
      );
      return notification_id;
    },
    onSuccess: (notification_id: string) => {
      mark_notification_read(notification_id);
      queryClient.invalidateQueries(["notifications"]);
    },
    onError: (e: any) => {
      setLocalError("Could not mark notification as read.");
    },
  });

  // "Mark all as read"
  const handleMarkAllAsRead = async () => {
    setLoadingMarkAll(true);
    setLocalError(null);
    try {
      const unread = notifications.filter((n) => !n.is_read);
      await Promise.all(
        unread.map((notif) =>
          axios.post(
            `${API_BASE_URL}/notifications/${notif.notification_id}/read`,
            {},
            {
              headers: {
                Authorization: `Bearer ${
                  useAppStore.getState().auth_token?.token ?? ""
                }`,
              },
            }
          )
        )
      );
      // Optionally update zustand
      unread.forEach((n) => mark_notification_read(n.notification_id));
      queryClient.invalidateQueries(["notifications"]);
    } catch (e: any) {
      setLocalError("Failed to mark all notifications as read.");
    }
    setLoadingMarkAll(false);
  };

  // On notification row click: mark as read, navigate if contextual
  const handleNotificationClick = async (
    notification: Notification,
    event: React.MouseEvent
  ) => {
    event.preventDefault();
    if (!notification.is_read) {
      await markNotificationMutation.mutateAsync(notification.notification_id);
    }
    const href = getNotificationLink(notification);
    if (href) {
      // Close dropdown immediately for navigation
      setOpen(false);
      navigate(href);
    }
  };

  // Show bell button (this is the trigger—the component is global, but must expose its own trigger)
  // Hide if not authed/non-admin
  if (!user || user.role === "admin") {
    return null;
  }

  ////////////////////////////////////////////
  // -------------- UI ---------------------
  ////////////////////////////////////////////

  return (
    <>
      {/* Notification bell trigger & badge (absolutely position, this is a global fixed overlay) */}
      <div className="fixed top-4 right-7 z-40 flex items-center">
        <button
          aria-label="Show notifications"
          className="relative rounded-full hover:bg-sky-50/70 p-2 transition ring-0"
          onClick={handleOpen}
        >
          {/* Bell SVG */}
          <svg
            className="w-7 h-7 text-sky-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              d="M12 22c1.5 0 3-1.2 3-2.8H9c0 1.6 1.5 2.8 3 2.8Zm7.4-5.4c-.8-1-1.2-2.3-1.2-3.6V10c0-3.1-2.3-5.7-5.2-6.4V3c0-.7-.5-1.3-1.2-1.3s-1.2.6-1.2 1.3v.6C6.1 4.3 3.8 6.9 3.8 10v3c0 1.3-.4 2.5-1.2 3.6-.3.3-.5.8-.1 1.1.2.2.5.2.7.2h16.1c.3 0 .5 0 .7-.2.4-.3.2-.7-.1-1.1Z"
            />
          </svg>
          {unread_notifications > 0 && (
            <span className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-500 text-xs text-white font-bold px-1.5 py-0.5 shadow">
              {unread_notifications > 99 ? "99+" : unread_notifications}
            </span>
          )}
        </button>
      </div>

      {/* Modal/dropdown overlay */}
      {open && (
        <div
          className="fixed z-50 inset-0 flex items-start justify-end bg-black/10"
          aria-modal="true"
          role="dialog"
        >
          <div
            ref={dropdownRef}
            className="mt-16 mr-7 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col max-h-[78vh] overflow-hidden animate-fade-in"
            tabIndex={0}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-lg text-slate-700">Notifications</span>
                {loading && (
                  <svg className="w-5 h-5 animate-spin text-sky-400" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
                    <path d="M2 12a10 10 0 0110-10" fill="none" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                )}
              </div>
              <button
                type="button"
                className="hover:bg-slate-100 rounded p-1 ml-4"
                aria-label="Close notifications"
                onClick={handleClose}
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mark all as read */}
            <div className="flex justify-between items-center px-5 py-2 border-b border-gray-50 bg-slate-50">
              <span className="text-xs text-slate-500">
                {unread_notifications > 0
                  ? `${unread_notifications} unread`
                  : "No unread"}
              </span>
              <button
                disabled={unread_notifications === 0 || loading || loadingMarkAll}
                className="text-sky-700 hover:text-sky-600 text-sm font-semibold px-2 py-1 rounded disabled:text-gray-400 disabled:cursor-not-allowed"
                onClick={handleMarkAllAsRead}
              >
                {loadingMarkAll ? (
                  <span>
                    <svg className="animate-spin w-4 h-4 mr-1 inline" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
                      <path d="M2 12a10 10 0 0110-10" fill="none" stroke="currentColor" strokeWidth="2"/>
                    </svg>{" "}
                    Marking...
                  </span>
                ) : (
                  "Mark all as read"
                )}
              </button>
            </div>

            {/* Notifications list */}
            <div className="overflow-y-auto flex-1 px-0 py-2 bg-white">
              {/* Loading state */}
              {loading && (
                <div className="w-full flex flex-col items-center py-10">
                  <svg className="w-8 h-8 animate-spin text-sky-400" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
                    <path d="M2 12a10 10 0 0110-10" fill="none" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  <span className="text-sm font-medium text-slate-400 pt-3">Loading notifications…</span>
                </div>
              )}
              {/* Error state */}
              {(isError || localError) && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 m-3 mx-4 rounded p-3 text-sm flex items-center">
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="2" /><path d="M12 8v4m0 4h.01" strokeWidth="2"/></svg>
                  {localError || (error as any)?.message || "Error loading notifications"}
                </div>
              )}
              {/* Empty state */}
              {!loading && notifications.length === 0 && !isError && (
                <div className="w-full flex flex-col items-center py-14">
                  <svg className="w-12 h-12 text-slate-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 22c1.5 0 3-1.2 3-2.8H9c0 1.6 1.5 2.8 3 2.8Zm7.4-5.4c-.8-1-1.2-2.3-1.2-3.6V10c0-3.1-2.3-5.7-5.2-6.4V3c0-.7-.5-1.3-1.2-1.3s-1.2.6-1.2 1.3v.6C6.1 4.3 3.8 6.9 3.8 10v3c0 1.3-.4 2.5-1.2 3.6-.3.3-.5.8-.1 1.1.2.2.5.2.7.2h16.1c.3 0 .5 0 .7-.2.4-.3.2-.7-.1-1.1Z" />
                  </svg>
                  <span className="text-slate-400 font-medium text-base">No notifications yet</span>
                </div>
              )}
              {/* Notification list */}
              {notifications.length > 0 &&
                <ul className="divide-y divide-gray-100 transition-all duration-200">
                  {notifications.map((notification: Notification) => {
                    const rowClasses = notification.is_read
                      ? "bg-white hover:bg-slate-50"
                      : "bg-sky-50/70 hover:bg-sky-100";
                    const icon = getNotificationIcon(notification.type);
                    const href = getNotificationLink(notification);

                    const notificationRow = (
                      <li
                        key={notification.notification_id}
                        className={
                          "group px-5 py-4 flex items-start cursor-pointer transition " +
                          rowClasses
                        }
                        aria-label={notification.content}
                        tabIndex={0}
                        onClick={(e) => handleNotificationClick(notification, e)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleNotificationClick(notification, e as any);
                          }
                        }}
                        style={{ outline: "none" }}
                      >
                        {icon}
                        <div className="flex-1">
                          <div
                            className={
                              "font-medium text-[15px] " +
                              (notification.is_read
                                ? "text-slate-600"
                                : "text-sky-900")
                            }
                          >
                            {notification.content}
                          </div>
                          <div className="text-xs mt-1 text-slate-400">
                            {formatTimeAgo(notification.created_at)}
                          </div>
                        </div>
                        {!notification.is_read && (
                          <span className="ml-2 px-2 py-0.5 rounded text-xs bg-sky-100 text-sky-700 font-semibold">
                            New
                          </span>
                        )}
                        {href && (
                          <svg className="ml-2 mt-0.5 w-4 h-4 text-slate-300 group-hover:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M9 18l6-6-6-6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </li>
                    );

                    // If target is linkable, wrap in <Link>, else just row
                    return href ? (
                      <Link
                        to={href}
                        tabIndex={-1}
                        style={{ display: "block" }}
                        key={`${notification.notification_id}-link`}
                        onClick={(e) => { e.preventDefault(); handleNotificationClick(notification, e); }}
                        className="no-underline"
                      >
                        {notificationRow}
                      </Link>
                    ) : notificationRow;
                  })}
                </ul>
              }
            </div>
            {/* Modal fade bottom shadow */}
            <div className="h-5 bg-gradient-to-b from-transparent to-white opacity-80 pointer-events-none" />
          </div>
        </div>
      )}
    </>
  );
};

export default GV_Notifications;