import React, { useEffect, useRef, useState, KeyboardEvent } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/main";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import dayjs from "dayjs";

// ----- Types (from zod schemas) -----
interface Message {
  message_id: string;
  thread_id: string;
  sender_user_id: string;
  receiver_user_id: string;
  content: string;
  sent_at: number;
  is_read: boolean;
}

interface MiniUser {
  user_id: string;
  name: string;
  profile_photo_url: string | null;
}

interface VillaSnippet {
  villa_id: string;
  name: string;
  cover_photo_url: string;
}

interface BookingSnippet {
  booking_id: string;
  check_in: string;  // yyyymmdd or ISO
  check_out: string; // yyyymmdd or ISO
}

interface ThreadDetail {
  thread_id: string;
  booking_id: string;
  villa_id: string;
  guest_user_id: string;
  host_user_id: string;
  created_at: number;
  messages: Message[];
  villa: VillaSnippet;
  booking: BookingSnippet;
  guest: MiniUser;
  host: MiniUser;
}

// Payload for sending a message
type MessageSendPayload = { content: string };

// API base
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// ---- API Calls with axios ------
async function fetchThreadDetail(thread_id: string, token: string): Promise<ThreadDetail> {
  const { data } = await axios.get<ThreadDetail>(`${API_BASE}/inbox/thread/${thread_id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return data;
}

// Send message in thread
async function sendMessage(thread_id: string, payload: MessageSendPayload, token: string): Promise<Message> {
  const { data } = await axios.post<Message>(
    `${API_BASE}/inbox/thread/${thread_id}/send`,
    payload,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return data;
}

// Util: Format date string nicely
function formatTimestamp(ts: number): string {
  return dayjs.unix(Math.floor(ts / 1000)).format("MMM D, HH:mm");
}

const UV_MessagesThread: React.FC = () => {
  // --- Routing, State, Auth ---
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const user = useAppStore(state => state.user);
  const auth_token = useAppStore(state => state.auth_token);
  const socket = useAppStore(state => state.socket);

  const [messageInput, set_message_input] = useState<string>("");
  const [sendError, set_send_error] = useState<string>("");
  const [isReportOpen, set_report_open] = useState<boolean>(false);
  const messageListRef = useRef<HTMLDivElement>(null);

  // For auto scroll-to-bottom
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  });

  // Auth check: Require login
  useEffect(() => {
    if (!user || !auth_token) {
      navigate("/login");
    }
  }, [user, auth_token, navigate]);

  // --- React Query setup ---
  const queryClient = useQueryClient();

  // Thread fetch
  const {
    data: thread,
    isLoading,
    isError,
    refetch,
    error
  } = useQuery<ThreadDetail, Error>(
    ["message-thread", threadId, user?.user_id],
    () => fetchThreadDetail(threadId!, auth_token!.token),
    { enabled: !!threadId && !!auth_token?.token && !!user }
  );

  // Send message mutation
  const sendMutation = useMutation<Message, Error, MessageSendPayload>({
    mutationFn: (payload) => sendMessage(threadId!, payload, auth_token!.token),
    onMutate: () => {
      set_send_error("");
    },
    onSuccess: async () => {
      set_message_input("");
      await queryClient.invalidateQueries({ queryKey: ["message-thread", threadId, user?.user_id] });
      // Scroll handled by useEffect, since data/messages will change
    },
    onError: (err: any) => {
      set_send_error(err?.response?.data?.message || err.message || "Failed to send message.");
    },
  });

  // Derived: messages, other participant, current user, access/forbidden
  let participant: MiniUser | undefined;
  let otherParticipant: MiniUser | undefined;
  let canAccess = false;
  if (user && thread) {
    if (user.user_id === thread.guest_user_id) {
      participant = thread.guest;
      otherParticipant = thread.host;
    } else if (user.user_id === thread.host_user_id) {
      participant = thread.host;
      otherParticipant = thread.guest;
    }
    canAccess = !!participant;
  }

  // Unread logic - only mark "new/unread" for incoming messages
  const lastReadIdx = thread
    ? thread.messages
        .map((m) => m.sender_user_id === user?.user_id || m.is_read)
        .lastIndexOf(true)
    : -1;

  // Jump to booking details
  function handleBookingClick(e: React.MouseEvent) {
    e.preventDefault();
    if (thread?.booking_id) {
      navigate(`/booking/${thread.booking.booking_id}/details`);
    }
  }

  // Send message logic
  function handleSend() {
    if (!messageInput.trim()) return;
    sendMutation.mutate({ content: messageInput.trim() });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey && !sendMutation.isPending) {
      e.preventDefault();
      handleSend();
    }
  }

  // Report modal stub logic
  const [reportReason, set_report_reason] = useState<string>("");
  const [reportError, set_report_error] = useState<string>("");
  function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    set_report_error("Reporting is not available in MVP. (No backend endpoint yet)");
  }

  // If unauthorized
  if (!threadId || (!isLoading && !canAccess)) {
    return (
      <div className="w-full h-full flex flex-col flex-1 items-center justify-center bg-gray-50">
        <div className="text-red-600 font-bold text-lg mt-24">
          Thread not found or you do not have access.
        </div>
        <Link to="/dashboard" className="mt-4 text-blue-700 underline">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  // Error Boundary
  if (isError) {
    return (
      <div className="w-full h-full flex flex-col flex-1 items-center justify-center bg-gray-50">
        <div className="text-red-500 font-bold text-lg mt-24">
          Unable to load this conversation.
        </div>
        <div className="mt-2 text-sm">{(error as any)?.message || "Unknown error"}</div>
        <button
          className="mt-4 px-4 py-2 rounded bg-blue-600 text-white font-semibold"
          onClick={() => refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  // Loading UI
  if (isLoading || !thread) {
    return (
      <div className="flex-1 flex justify-center items-center bg-gray-50 min-h-[400px]">
        <div className="animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 w-10 h-10"></div>
        <span className="ml-4 text-blue-700 font-semibold">Loading thread...</span>
      </div>
    );
  }

  // Render chat
  return (
    <>
      {/* REPORT MODAL */}
      {isReportOpen && (
        <div className="fixed z-30 inset-0 bg-black bg-opacity-20 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-black text-xl"
              onClick={() => {
                set_report_open(false);
                set_report_error("");
                set_report_reason("");
              }}
              aria-label="Close"
            >×</button>
            <h2 className="text-lg font-bold mb-2">Report Thread</h2>
            <p className="mb-3 text-sm text-gray-600">
              If you feel this conversation is inappropriate or abusive, please describe the issue.
            </p>
            <form onSubmit={handleReportSubmit} className="flex flex-col gap-3">
              <textarea
                className="border rounded w-full p-2 min-h-[80px] focus:ring-2 focus:ring-blue-500"
                placeholder="Describe the problem (optional)..."
                value={reportReason}
                onChange={e => set_report_reason(e.target.value.slice(0,1000))}
                maxLength={1000}
              />
              {reportError && <div className="text-red-500 text-sm">{reportError}</div>}
              <div className="flex items-center justify-between mt-2">
                <button
                  type="button"
                  className="px-3 py-1 text-gray-600 hover:underline"
                  onClick={() => {
                    set_report_open(false);
                    set_report_error("");
                    set_report_reason("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-red-600 text-white font-bold px-4 py-2 rounded shadow hover:bg-red-700 transition"
                  disabled={!!reportError}
                >
                  Report
                </button>
              </div>
            </form>
            <div className="mt-2 text-sm text-gray-500">
              (Actual reporting coming soon.)
            </div>
          </div>
        </div>
      )}

      {/* HEADER (Villa, booking, avatars, navs) */}
      <div className="w-full border-b bg-white flex flex-col md:flex-row items-stretch md:items-center px-4 py-2 gap-3 shadow-sm sticky top-0 z-10">
        <img
          src={thread.villa.cover_photo_url || `https://picsum.photos/seed/${thread.villa.villa_id}/80`}
          alt="Villa Cover"
          className="w-14 h-14 object-cover rounded-lg border"
        />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="font-bold text-lg line-clamp-1">{thread.villa.name}</span>
          <span className="text-xs text-gray-500 mt-0.5">
            Booking: 
            <button
              className="ml-1 underline text-blue-600 hover:text-blue-900 font-semibold"
              title="Go to booking details"
              onClick={handleBookingClick}
            >
              {thread.booking.check_in} → {thread.booking.check_out}
            </button>
          </span>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2">
          {/* AVATARS */}
          <div className="flex items-center gap-2">
            <img
              src={thread.guest.profile_photo_url || `https://picsum.photos/seed/${thread.guest.user_id}/48`}
              alt={thread.guest.name}
              className="w-9 h-9 rounded-full object-cover border"
              title={thread.guest.name + " (guest)"}
            />
            <img
              src={thread.host.profile_photo_url || `https://picsum.photos/seed/${thread.host.user_id}/48`}
              alt={thread.host.name}
              className="w-9 h-9 rounded-full object-cover border"
              title={thread.host.name + " (host)"}
            />
          </div>
          {/* NAVS */}
          <div className="flex gap-2 mt-2 md:mt-0">
            <Link
              to="/dashboard"
              className="px-2 py-1 rounded text-sm text-blue-600 hover:underline font-semibold border hover:border-blue-400"
            >
              Dashboard
            </Link>
            <Link
              to="/faq"
              className="px-2 py-1 rounded text-sm text-gray-700 hover:underline font-semibold border"
            >
              Support
            </Link>
            <button
              className="ml-2 px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 border border-red-400 text-sm font-semibold"
              onClick={() => set_report_open(true)}
            >
              Report
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col overflow-auto max-h-[calc(100vh-230px)] relative">
        {/* Message List */}
        <div
          ref={messageListRef}
          className="flex-1 overflow-y-auto px-2 py-4 bg-blue-50"
          style={{ minHeight: "350px", maxHeight: "60vh" }}
        >
          {thread.messages.length === 0 && (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              No messages yet. Start the conversation.
            </div>
          )}
          {/* Chat bubbles */}
          {thread.messages.map((msg, idx) => {
            const isMine = msg.sender_user_id === user?.user_id;
            const nextIsSame = thread.messages[idx + 1]?.sender_user_id === msg.sender_user_id;
            const isLastUnread =
              !msg.is_read &&
              msg.sender_user_id !== user?.user_id &&
              (
                idx === thread.messages.length - 1 ||
                thread.messages[idx + 1].is_read ||
                thread.messages[idx + 1].sender_user_id === user?.user_id
              );

            return (
              <div
                key={msg.message_id}
                className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1`}
              >
                <div className={`flex flex-col max-w-[75%] ${isMine ? "items-end" : "items-start"}`}>
                  {(!nextIsSame || idx === thread.messages.length - 1) && (
                    <div className="flex items-center gap-2 mb-0.5">
                      {!isMine && (
                        <img
                          src={
                            (msg.sender_user_id === thread.guest.user_id
                              ? thread.guest.profile_photo_url
                              : thread.host.profile_photo_url
                            ) || `https://picsum.photos/seed/${msg.sender_user_id}/28`
                          }
                          alt="Sender"
                          className="w-7 h-7 rounded-full border object-cover"
                          title={
                            msg.sender_user_id === thread.guest.user_id
                              ? thread.guest.name
                              : thread.host.name
                          }
                        />
                      )}
                      <span className="text-xs text-gray-500">
                        {msg.sender_user_id === thread.guest.user_id
                          ? thread.guest.name
                          : thread.host.name} · {formatTimestamp(msg.sent_at)}
                      </span>
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-4 py-2 shadow mb-0.5 ${
                      isMine
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-white border border-blue-100 text-gray-900 rounded-bl-none"
                    }`}
                  >
                    <span>{msg.content}</span>
                  </div>
                  {isLastUnread && (
                    <span className="text-xs bg-yellow-200 text-yellow-800 rounded py-0.5 px-2 font-semibold mt-1 mb-2">
                      New
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Composer input */}
        <div className="w-full bg-white border-t flex items-center px-3 py-2 gap-2">
          <input
            className="flex-1 border rounded px-3 py-2 text-base focus:ring-2 focus:ring-blue-400 focus:outline-none"
            type="text"
            placeholder="Type your message…"
            maxLength={2000}
            value={messageInput}
            disabled={sendMutation.isPending}
            onChange={e => set_message_input(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="New message"
            autoFocus
          />
          <button
            className="ml-2 px-4 py-2 rounded bg-blue-600 text-white font-bold shadow hover:bg-blue-700 transition"
            disabled={sendMutation.isPending || !messageInput.trim()}
            onClick={handleSend}
            aria-label="Send message"
          >
            {sendMutation.isPending ? (
              <span className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-blue-300 rounded-full"></span>
            ) : "Send"}
          </button>
        </div>
        {sendError && (
          <div className="w-full text-center bg-red-100 text-red-700 py-2 text-sm font-semibold">{sendError}</div>
        )}
      </div>
    </>
  );
};

export default UV_MessagesThread;