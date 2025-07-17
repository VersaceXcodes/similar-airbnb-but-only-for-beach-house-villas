import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/main";

// Zod schema types (from backend codegen, or in monorepo, e.g., @schema or shared)
import type { UserProfile, Notification } from "@/store/main";

// Message and MessageThread from zod (see DB:zodschemas:ts)
interface Message {
  message_id: string;
  thread_id: string;
  sender_user_id: string;
  receiver_user_id: string;
  content: string;
  sent_at: number;
  is_read: boolean;
}
interface MessageThread {
  thread_id: string;
  booking_id: string;
  villa_id: string;
  guest_user_id: string;
  host_user_id: string;
  created_at: number;
  messages: Message[];
}

interface ThreadsAPIResponse {
  threads: MessageThread[];
}

interface VillaSummary {
  villa_id: string;
  name: string;
  city: string;
  country: string;
  cover_photo_url: string;
}

// Utility: Format timestamp (unix ms/s) to e.g. "Aug 21, 2024, 3:20pm"
function formatDate(unixNumber: number) {
  const date = new Date(
    unixNumber.toString().length === 13 ? unixNumber : unixNumber * 1000
  );
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Utility: Extract the "other" participant for the thread
function getOtherParticipant(
  thread: MessageThread,
  currentUser: UserProfile | null
): { user_id: string; label: string } | null {
  if (!currentUser) return null;
  if (currentUser.user_id === thread.guest_user_id)
    return { user_id: thread.host_user_id, label: "Host" };
  else if (currentUser.user_id === thread.host_user_id)
    return { user_id: thread.guest_user_id, label: "Guest" };
  else return null;
}

// This mapping is needed because fetchMessageThreads returns only villa_id and not villa info; 
// for MVP, show villa_id as fallback.
const VILLA_CACHE: { [villa_id: string]: VillaSummary } = {};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Main component
const UV_MessagesInbox: React.FC = () => {
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token?.token ?? null);
  const notifications = useAppStore((s) => s.notifications);
  const mark_notification_read = useAppStore((s) => s.mark_notification_read);
  const set_error_banner = useAppStore((s) => s.set_error_banner);

  const [searchFilter, setSearchFilter] = useState<{
    query: string;
    sort_by: "recent" | "unread";
    show_unread: boolean;
  }>({ query: "", sort_by: "recent", show_unread: false });

  const navigate = useNavigate();

  // Fetch message threads for logged-in user
  const {
    data,
    isLoading,
    isError,
    error,
    refetch: refetchThreads,
  } = useQuery<ThreadsAPIResponse, Error>({
    queryKey: ["inbox", user?.user_id],
    queryFn: async () => {
      if (!auth_token) throw new Error("Not authenticated");
      const resp = await axios.get<ThreadsAPIResponse>(
        `${API_BASE}/inbox`,
        {
          headers: {
            Authorization: `Bearer ${auth_token}`,
          },
        }
      );
      return resp.data;
    },
    enabled: !!auth_token,
    staleTime: 1000 * 60 * 1, // 1 min
    onError: (err: any) => {
      set_error_banner &&
        set_error_banner({
          message:
            err?.response?.data?.message || err?.message || "Failed to load messages.",
          visible: true,
        });
    },
  });

  // On mount: mark all notifications for 'message' as read
  React.useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    const messageNotifs = notifications.filter(
      (n) => n.type && n.type.toLowerCase().includes("message") && !n.is_read
    );
    for (const notif of messageNotifs) {
      mark_notification_read && mark_notification_read(notif.notification_id);
    }
    // eslint-disable-next-line
  }, []);

  // Memo: enrich threads with last_message, unread_count, participant
  const threadsEnriched = useMemo(() => {
    if (!data?.threads || !user) return [];
    return data.threads.map((thread) => {
      // Sort messages descending sent_at
      const sortedMsgs = [...thread.messages].sort(
        (a, b) => b.sent_at - a.sent_at
      );
      const last_message = sortedMsgs[0];
      // Unread is those sent to me and is_read === false
      const unread_count = thread.messages.filter(
        (m) =>
          m.receiver_user_id === user.user_id &&
          !m.is_read
      ).length;
      // For participant, infer "other" user
      const is_guest = user.user_id === thread.guest_user_id;
      const participant_id = is_guest
        ? thread.host_user_id
        : thread.guest_user_id;
      const participant_label = is_guest ? "Host" : "Guest";
      // Return info
      return {
        ...thread,
        last_message,
        unread_count,
        participant_id,
        participant_label,
      };
    });
  }, [data, user]);

  // Filtering & sorting client-side
  const filteredThreads = useMemo(() => {
    if (!threadsEnriched) return [];
    let threads = threadsEnriched;
    // Filter unread if checked
    if (searchFilter.show_unread) {
      threads = threads.filter((t) => t.unread_count > 0);
    }
    // Filter by query (on message, participant_id, thread_id, booking_id)
    if (searchFilter.query.trim().length > 0) {
      const q = searchFilter.query.toLowerCase();
      threads = threads.filter(
        (t) =>
          (t.last_message?.content || "")
            .toLowerCase()
            .includes(q) ||
          (t.thread_id || "").toLowerCase().includes(q) ||
          (t.booking_id || "").toLowerCase().includes(q) ||
          (t.villa_id || "").toLowerCase().includes(q)
      );
    }
    // Sort
    if (searchFilter.sort_by === "recent") {
      threads = threads
        .slice()
        .sort(
          (a, b) =>
            (b.last_message?.sent_at || b.created_at) -
            (a.last_message?.sent_at || a.created_at)
        );
    } else if (searchFilter.sort_by === "unread") {
      threads = threads
        .slice()
        .sort((a, b) => b.unread_count - a.unread_count);
    }
    return threads;
  }, [threadsEnriched, searchFilter]);

  // Error boundary UI for rendering
  let renderError: string | null = null;
  if (!auth_token) {
    renderError = "You must be logged in to view your messages.";
  } else if (isError || error) {
    renderError =
      (error && error.message) ||
      "Unable to load your message inbox. Please try again.";
  }

  // Loading state - spinner UI (Tailwind)
  const loadingNode = (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] py-12">
      <svg
        className="animate-spin h-8 w-8 text-primary-500 mb-2"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        ></path>
      </svg>
      <div className="text-gray-600 text-center">Loading your messages...</div>
    </div>
  );

  // Empty inbox UI
  const emptyNode = (
    <div className="flex flex-1 flex-col items-center justify-center min-h-[200px] py-12 text-gray-500">
      <img
        src="https://picsum.photos/seed/inboxempty/120/120"
        alt="Empty inbox illustration"
        className="w-24 h-24 mb-5 rounded-full object-cover opacity-30"
      />
      <div className="text-lg font-medium mb-2">No messages yet</div>
      <div className="text-md mb-6 text-center max-w-md px-2">
        When you start a booking, or a host/guest reaches out, messages and booking conversations will appear here.
      </div>
      <Link
        to="/search"
        className="bg-primary-500 text-white hover:bg-primary-600 rounded px-5 py-2 font-semibold shadow transition"
      >
        Search Beach Villas
      </Link>
    </div>
  );

  // Main render
  return (
    <>
      <div className="flex flex-col max-w-3xl mx-auto px-2 py-6">
        {/* Title and search/sort controls */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-800">Inbox</h1>
          <div className="flex flex-row gap-2 items-center">
            <input
              type="text"
              placeholder="Search messages, villa, booking..."
              value={searchFilter.query}
              onChange={(e) =>
                setSearchFilter((prev) => ({
                  ...prev,
                  query: e.target.value,
                }))
              }
              className="px-3 py-1.5 border rounded focus:outline-none focus:ring focus:border-blue-300 text-sm"
            />
            <select
              value={searchFilter.sort_by}
              onChange={(e) =>
                setSearchFilter((prev) => ({
                  ...prev,
                  sort_by: e.target.value as "recent" | "unread",
                }))
              }
              className="px-2 py-1 rounded border text-sm bg-white"
            >
              <option value="recent">Most Recent</option>
              <option value="unread">Unread</option>
            </select>
            <label className="flex flex-row items-center space-x-1 cursor-pointer select-none text-xs text-gray-600 ml-2">
              <input
                type="checkbox"
                checked={searchFilter.show_unread}
                onChange={(e) =>
                  setSearchFilter((prev) => ({
                    ...prev,
                    show_unread: e.target.checked,
                  }))
                }
                className="form-checkbox accent-primary-500"
              />
              <span>Show Unread Only</span>
            </label>
            {(searchFilter.query ||
              searchFilter.sort_by !== "recent" ||
              searchFilter.show_unread) && (
              <button
                className="ml-2 px-2 py-1 text-xs text-gray-400 hover:text-primary-500 border border-gray-300 rounded"
                onClick={() =>
                  setSearchFilter({
                    query: "",
                    sort_by: "recent",
                    show_unread: false,
                  })
                }
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white shadow rounded-lg">
          {renderError ? (
            <div className="text-red-600 font-medium text-center py-10">{renderError}</div>
          ) : isLoading ? (
            loadingNode
          ) : !filteredThreads || filteredThreads.length === 0 ? (
            emptyNode
          ) : (
            <ul className="divide-y divide-gray-200">
              {/* Render each thread */}
              {filteredThreads.map((thread) => {
                // Show other participant (host/guest)
                const is_me_guest = user?.user_id === thread.guest_user_id;
                const participant_id = thread.participant_id;
                const role_badge = thread.participant_label;
                // Last message content/preview/time
                const last_message_content =
                  thread.last_message?.content?.length > 120
                    ? thread.last_message.content.slice(0, 120) + "…"
                    : thread.last_message?.content || "(No messages)";
                const last_message_time = thread.last_message
                  ? formatDate(thread.last_message.sent_at)
                  : formatDate(thread.created_at);

                // Unread badge
                const unread_count = thread.unread_count;

                // Fallback avatar
                const avatar_seed = participant_id || "user";
                const avatar_url = `https://picsum.photos/seed/user${avatar_seed}/48`;

                // For MVP: villa info as villa_id (would require extra query for name/etc)
                // Could use VILLA_CACHE if available.

                return (
                  <li
                    key={thread.thread_id}
                    className={`flex flex-row items-center px-4 py-4 hover:bg-slate-50 group transition
                      ${unread_count > 0 ? "bg-blue-50/50" : ""}
                    `}
                  >
                    {/* Avatar */}
                    <div className="mr-3 flex-shrink-0">
                      <img
                        src={avatar_url}
                        alt={`Participant avatar`}
                        className="rounded-full w-12 h-12 border object-cover"
                      />
                    </div>
                    {/* Main info */}
                    <div className="flex-1 flex flex-col min-w-0">
                      {/* Top: participant name/role + villa */}
                      <div className="flex flex-row items-center justify-between min-w-0">
                        <div className="flex flex-row gap-2 items-center min-w-0">
                          <span
                            className={`font-semibold truncate text-gray-900 group-hover:text-primary-700 transition`}
                            title={`${role_badge}`}
                          >
                            {role_badge} ({participant_id.slice(0, 8)})
                          </span>
                          <span className="text-xs text-gray-400 mr-2">|</span>
                          <span
                            className="text-xs font-bold text-gray-600 whitespace-nowrap"
                            title={`Villa ID: ${thread.villa_id}`}
                          >
                            Villa {thread.villa_id.slice(0, 8)}
                          </span>
                          <span className="text-xs text-gray-400">/</span>
                          <span className="text-xs text-gray-400" title={`Booking ID: ${thread.booking_id}`}>
                            Booking {thread.booking_id.slice(0, 8)}
                          </span>
                        </div>
                        <div className="ml-3 hidden sm:block text-xs text-gray-400">
                          {last_message_time}
                        </div>
                      </div>
                      {/* Message preview */}
                      <div
                        className={`flex flex-row items-center mt-1 ${
                          unread_count > 0 ? "font-semibold text-primary-700" : "text-gray-700"
                        }`}
                      >
                        <span className="truncate">{last_message_content}</span>
                        {(unread_count > 0) && (
                          <span className="ml-2 inline-flex items-center text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-semibold">
                            {unread_count} unread
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Go to thread button */}
                    <div className="ml-4 flex flex-col items-end">
                      <Link
                        to={`/messages/${thread.thread_id}`}
                        className="text-blue-600 hover:underline font-medium p-2"
                        title="Open Conversation"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 inline-block" fill="none"
                          viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                            d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {/* Refresh Button */}
        <div className="py-3 flex flex-row justify-end">
          <button
            onClick={() => refetchThreads()}
            className="inline-flex items-center px-3 py-1.5 mt-2 text-xs font-semibold rounded bg-primary-100 text-primary-700 hover:bg-primary-200 transition"
            disabled={isLoading}
            title="Refresh inbox"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0021 7.86M19 5a9 9 0 00-16 7.14"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </>
  );
};

export default UV_MessagesInbox;