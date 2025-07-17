import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
import { Link } from "react-router-dom";

// Types from backend/zod
import { AdminAction, MessageThread, Message } from "@schema";

/** --------- Types ---------- **/

// type for a reported (flagged) thread row (no BE endpoint, so mock)
interface ReportedThread {
  thread_id: string;
  villa_id: string;
  booking_id: string;
  reported_by_user_id: string;
  reported_at: number;
  report_reason: string;
  participants: { user_id: string; name: string; profile_photo_url: string }[];
  villa_summary: { villa_id: string; name: string; cover_photo_url: string };
  last_message_snippet: string;
  message_count: number;
}

// type for modal dialog state (delete/confirm)
interface MessageDeleteDialogState {
  visible: boolean;
  message_id?: string;
}
interface WarningModalState {
  visible: boolean;
  user_id?: string;
  warning_text?: string;
  submitting?: boolean;
  error?: string;
}
interface FilterState {
  filterText: string;
  villaId?: string | null;
  reportReason?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

/** --------- Mock Data for Reported Threads ----------- **/
// TODO: Replace with API call if/when available.
const MOCK_REPORTED_THREADS: ReportedThread[] = [
  {
    thread_id: "th123",
    villa_id: "v1001",
    booking_id: "b5001",
    reported_by_user_id: "u900",
    reported_at: Date.now() - 60 * 60 * 24 * 1000, // 1 day ago
    report_reason: "Harassment",
    participants: [
      {
        user_id: "u100",
        name: "Alice Guest",
        profile_photo_url: "https://picsum.photos/seed/alice/48",
      },
      {
        user_id: "u900",
        name: "Bob Host",
        profile_photo_url: "https://picsum.photos/seed/bob/48",
      },
    ],
    villa_summary: {
      villa_id: "v1001",
      name: "Santorini Bliss",
      cover_photo_url: "https://picsum.photos/seed/villa1/100/64",
    },
    last_message_snippet:
      "Your booking is not refundable. Please review the policy.",
    message_count: 12,
  },
  {
    thread_id: "th124",
    villa_id: "v1002",
    booking_id: "b5002",
    reported_by_user_id: "u800",
    reported_at: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    report_reason: "Spam",
    participants: [
      {
        user_id: "u800",
        name: "Charlie Guest",
        profile_photo_url: "https://picsum.photos/seed/charlie/48",
      },
      {
        user_id: "u950",
        name: "Dana Host",
        profile_photo_url: "https://picsum.photos/seed/dana/48",
      },
    ],
    villa_summary: {
      villa_id: "v1002",
      name: "Malibu Dream",
      cover_photo_url: "https://picsum.photos/seed/villa2/100/64",
    },
    last_message_snippet:
      "Book now for a special offer! Visit our website for more villas.",
    message_count: 8,
  },
];

/** ----------- API Calls ----------- **/

// API: GET /admin/actions (audit log)
const fetchAdminActions = async (
  token: string
): Promise<AdminAction[]> => {
  const url = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/admin/actions`;
  const { data } = await axios.get<{ actions: AdminAction[] }>(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.actions;
};

// API: GET /inbox/thread/{thread_id}
const fetchMessageThread = async ({
  token,
  thread_id,
}: {
  token: string;
  thread_id: string;
}): Promise<MessageThread> => {
  const url = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/inbox/thread/${thread_id}`;
  const { data } = await axios.get<MessageThread>(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
};

/** ----------- Component ----------- **/

const UV_Admin_Messages: React.FC = () => {
  // Access admin user & token
  const user = useAppStore((s) => s.user);
  const token = useAppStore((s) => s.auth_token?.token);

  // Reported threads (mocked); we'll still filter in UI
  const [reportedThreads] = useState<ReportedThread[]>(MOCK_REPORTED_THREADS);

  // Thread view state
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Thread dialog/modal states
  const [messageDeleteDialog, setMessageDeleteDialog] = useState<MessageDeleteDialogState>({ visible: false });
  const [warningModal, setWarningModal] = useState<WarningModalState>({ visible: false });
  const [filterState, setFilterState] = useState<FilterState>({
    filterText: "",
    villaId: null,
    reportReason: null,
    dateFrom: null,
    dateTo: null,
  });

  // --- FETCH ADMIN AUDIT LOG ---
  const {
    data: adminActionLog,
    isLoading: isAuditLogLoading,
    isError: isAuditLogError,
    error: auditLogError,
    refetch: refetchAdminActionLog,
  } = useQuery<AdminAction[], Error>({
    queryKey: ["adminActionLog"],
    queryFn: () => {
      if (!token) throw new Error("Missing admin token");
      return fetchAdminActions(token);
    },
    enabled: !!token,
    refetchOnWindowFocus: true,
  });

  // --- FETCH SELECTED THREAD DETAILS (ON DEMAND) ---
  const {
    data: selectedThread,
    isLoading: isThreadLoading,
    isError: isThreadError,
    error: threadError,
    refetch: refetchThread,
  } = useQuery<MessageThread, Error>({
    queryKey: ["selectedThread", selectedThreadId, token],
    queryFn: () => {
      if (!token || !selectedThreadId) throw new Error("Missing token or thread id");
      return fetchMessageThread({ token, thread_id: selectedThreadId });
    },
    enabled: !!token && !!selectedThreadId,
    refetchOnWindowFocus: false,
  });

  // ---- FILTERED THREADS ----
  const filteredThreads = useMemo(() => {
    let rows = reportedThreads;
    if (filterState.filterText) {
      const txt = filterState.filterText.toLowerCase();
      rows = rows.filter((t) =>
        t.villa_summary.name.toLowerCase().includes(txt) ||
        t.report_reason.toLowerCase().includes(txt) ||
        t.participants.some((u) => u.name.toLowerCase().includes(txt))
      );
    }
    if (filterState.villaId) {
      rows = rows.filter((t) => t.villa_id === filterState.villaId);
    }
    if (filterState.reportReason) {
      rows = rows.filter((t) => t.report_reason === filterState.reportReason);
    }
    if (filterState.dateFrom) {
      const fromTs = new Date(filterState.dateFrom).getTime();
      rows = rows.filter((t) => t.reported_at >= fromTs);
    }
    if (filterState.dateTo) {
      const toTs = new Date(filterState.dateTo).getTime();
      rows = rows.filter((t) => t.reported_at <= toTs);
    }
    return rows;
  }, [reportedThreads, filterState]);

  // -- Util: Format Date/Time --
  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  // --- Handle Delete Message ---
  function handleDeleteMessage(message_id: string) {
    setMessageDeleteDialog({ visible: true, message_id });
  }
  function confirmDeleteMessage() {
    // TODO: No endpoint; just close dialog and show a notification. Optionally, log action locally.
    setMessageDeleteDialog({ visible: false });
    // Optionally, refetch thread or log action (not possible here).
    // Optionally, show UI banner/toast: message deleted (fake).
  }

  // --- Handle Warning Modal ---
  function handleWarnUser(user_id: string) {
    setWarningModal({ visible: true, user_id, warning_text: "", submitting: false, error: undefined });
  }
  function sendWarning() {
    if (!warningModal.user_id) return;
    setWarningModal((prev) => ({ ...prev, submitting: true }));
    // TODO: No endpoint; simulate delay, then success toast and close.
    setTimeout(() => {
      setWarningModal({ visible: false, user_id: undefined, warning_text: "", submitting: false });
    }, 800);
  }

  // --- Audit Log Filtering (latest only) ---
  const sortedAdminActionLog = useMemo(() => {
    if (!adminActionLog) return [];
    return [...adminActionLog].sort((a, b) => b.created_at - a.created_at);
  }, [adminActionLog]);

  // --- Unique list of reportReasons and villas for filter controls
  const villaOptions = Array.from(
    new Set(reportedThreads.map((t) => t.villa_summary.villa_id))
  ).map((villa_id) => {
    const v = reportedThreads.find((t) => t.villa_summary.villa_id === villa_id);
    return { villa_id, name: v ? v.villa_summary.name : villa_id };
  });
  const reportReasonOptions = Array.from(new Set(reportedThreads.map((t) => t.report_reason)));

  // --- Main Render ---
  return (
    <>
      {/* Top Bar */}
      <div className="w-full bg-gray-100 py-4 px-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Messaging Moderation</h1>
          <p className="text-sm text-gray-600">
            Review and take actions on reported/flagged conversations across the platform.
            <span className="ml-2 font-semibold text-red-500">{"// TODO: 'Reported threads' list is mock – replace with API when available"}</span>
          </p>
        </div>
        <div className="flex flex-row items-center gap-2 mt-2 sm:mt-0">
          <button
            className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-semibold shadow-sm"
            onClick={() => refetchAdminActionLog()}
            title="Refresh Moderation Audit Log"
          >
            <svg width={16} height={16} className="mr-1" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M2 8a6 6 0 1 1 10 4.472" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 8V4m0 0h4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Refresh Audit Log
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 px-6 py-3 bg-white border-b border-gray-200">
        <input
          type="text"
          className="border border-gray-300 rounded px-3 py-2 text-sm max-w-xs"
          placeholder="Search by name or text"
          value={filterState.filterText}
          onChange={(e) => setFilterState((f) => ({ ...f, filterText: e.target.value }))}
        />
        <select
          className="border border-gray-300 rounded px-2 py-2 text-sm"
          value={filterState.villaId || ""}
          onChange={(e) =>
            setFilterState((f) => ({
              ...f,
              villaId: e.target.value || null,
            }))
          }
        >
          <option value="">All Villas</option>
          {villaOptions.map((v) => (
            <option key={v.villa_id} value={v.villa_id}>{v.name}</option>
          ))}
        </select>
        <select
          className="border border-gray-300 rounded px-2 py-2 text-sm"
          value={filterState.reportReason || ""}
          onChange={(e) =>
            setFilterState((f) => ({
              ...f,
              reportReason: e.target.value || null,
            }))
          }
        >
          <option value="">All Reasons</option>
          {reportReasonOptions.map((reason) => (
            <option key={reason} value={reason}>{reason}</option>
          ))}
        </select>
        <input
          type="date"
          className="border border-gray-300 rounded px-3 py-2 text-sm"
          value={filterState.dateFrom || ""}
          onChange={(e) =>
            setFilterState((f) => ({ ...f, dateFrom: e.target.value || null }))
          }
        />
        <span className="text-gray-500 text-xs">to</span>
        <input
          type="date"
          className="border border-gray-300 rounded px-3 py-2 text-sm"
          value={filterState.dateTo || ""}
          onChange={(e) =>
            setFilterState((f) => ({ ...f, dateTo: e.target.value || null }))
          }
        />
        <button
          className="border border-gray-400 hover:bg-gray-100 rounded px-3 py-2 text-sm"
          onClick={() =>
            setFilterState({ filterText: "", villaId: null, reportReason: null, dateFrom: null, dateTo: null })
          }
        >
          Clear Filters
        </button>
      </div>

      {/* Reported Threads List */}
      <div className="p-6">
        <div className="overflow-x-auto border rounded-lg shadow bg-white">
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-20 px-4 py-2 text-left text-xs font-semibold text-gray-600">Date</th>
                <th className="w-32 px-4 py-2 text-left text-xs font-semibold text-gray-600">Villa</th>
                <th className="w-20 px-4 py-2 text-left text-xs font-semibold text-gray-600">Users</th>
                <th className="w-20 px-4 py-2 text-left text-xs font-semibold text-gray-600">Reason</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Last Message</th>
                <th className="w-20 px-2 py-2 text-xs font-semibold text-gray-600 text-center">Messages</th>
                <th className="w-16 px-2 py-2 text-xs font-semibold text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredThreads.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="text-center py-6 text-gray-500 italic">No reported threads found matching your filters.</div>
                  </td>
                </tr>
              )}
              {filteredThreads.map((thread) => (
                <tr key={thread.thread_id} className="hover:bg-blue-50 transition">
                  <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">{formatDate(thread.reported_at)}</td>
                  <td className="px-4 py-2 text-xs text-blue-700 whitespace-nowrap font-semibold flex items-center gap-1">
                    <img
                      src={thread.villa_summary.cover_photo_url}
                      alt="villa cover"
                      className="inline-block w-8 h-6 object-cover rounded shadow-sm mr-2"
                    />
                    <span>
                      <Link to={`/villa/${thread.villa_summary.villa_id}`} className="hover:underline">
                        {thread.villa_summary.name}
                      </Link>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs whitespace-nowrap">
                    <div className="flex -space-x-2">
                      {thread.participants.map((u) => (
                        <img
                          key={u.user_id}
                          src={u.profile_photo_url || "https://picsum.photos/seed/anon/32"}
                          alt={u.name}
                          className="inline-block w-7 h-7 rounded-full border border-gray-200 shadow"
                          title={u.name}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-red-600 font-semibold whitespace-nowrap">{thread.report_reason}</td>
                  <td className="px-4 py-2 text-xs text-gray-800 truncate max-w-[320px]">{thread.last_message_snippet}</td>
                  <td className="px-2 py-2 text-center text-xs font-mono text-gray-600">{thread.message_count}</td>
                  <td className="px-2 py-2 text-center">
                    <button
                      title="Review Thread"
                      className="inline-flex items-center px-2.5 py-1.5 bg-blue-500 hover:bg-blue-700 text-white rounded text-xs"
                      onClick={() => setSelectedThreadId(thread.thread_id)}
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} className="mr-1">
                        <path d="M4 12V7c0-2 2-4 4-4s4 2 4 4v5" />
                        <path d="M8 16a4 4 0 0 1-4-4h8a4 4 0 0 1-4 4z" />
                      </svg>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Thread Detail */}
      {selectedThreadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 relative p-6">
            <button
              className="absolute top-4 right-4 text-gray-600 hover:text-blue-700 p-1 focus:outline-none"
              onClick={() => setSelectedThreadId(null)}
              aria-label="Close"
            >
              <svg width={22} height={22} viewBox="0 0 22 22" stroke="currentColor" strokeWidth={2} fill="none">
                <path d="M6 6 l10 10 M16 6 l-10 10" />
              </svg>
            </button>
            {isThreadLoading && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
                <div>Loading thread messages…</div>
              </div>
            )}
            {isThreadError && (
              <div className="text-red-600 text-center py-6">
                <div className="font-bold">Error loading messages: {threadError?.message || "Unknown error"}</div>
              </div>
            )}
            {selectedThread && !isThreadLoading && (
              <>
                <div className="flex flex-row items-start mb-4 gap-6">
                  <div className="flex flex-row items-center gap-2">
                    <img
                      src={
                        reportedThreads.find((t) => t.thread_id === selectedThreadId)
                          ?.villa_summary.cover_photo_url || "https://picsum.photos/seed/villadetail/64"
                      }
                      alt="villa"
                      className="w-14 h-10 object-cover rounded shadow"
                    />
                    <div>
                      <Link to={`/villa/${selectedThread.villa_id}`} className="text-blue-700 font-semibold hover:underline">
                        {reportedThreads.find((t) => t.thread_id === selectedThreadId)?.villa_summary.name ||
                          "Villa"}
                      </Link>
                      <div className="text-gray-500 text-xs">Villa</div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {reportedThreads
                        .find((t) => t.thread_id === selectedThreadId)
                        ?.participants.map((p) => (
                          <span key={p.user_id} className="flex flex-col items-center mr-2">
                            <img
                              src={p.profile_photo_url}
                              alt={p.name}
                              className="w-8 h-8 rounded-full border border-gray-200"
                            />
                            <span className="text-xs text-gray-700 font-medium">{p.name}</span>
                          </span>
                        ))}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">Participants</div>
                  </div>
                </div>

                {/* Message List */}
                <div className="border rounded bg-gray-50 p-2 overflow-y-auto mb-3 max-h-64">
                  <ol>
                    {selectedThread.messages.length === 0 && (
                      <li className="text-gray-500 italic p-3 text-center text-xs">
                        No messages found in this thread.
                      </li>
                    )}
                    {selectedThread.messages.map((msg) => (
                      <li
                        key={msg.message_id}
                        className={`flex items-start py-2 px-1 border-b border-gray-100 last:border-b-0 group`}
                      >
                        <div className="flex-shrink-0">
                          <img
                            src={
                              reportedThreads
                                .find((t) => t.thread_id === selectedThread.thread_id)
                                ?.participants.find((u) => u.user_id === msg.sender_user_id)
                                ?.profile_photo_url ||
                              "https://picsum.photos/seed/anon/32"
                            }
                            alt="Sender"
                            className="w-8 h-8 rounded-full mr-2 border border-gray-200"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800 text-sm">
                              {
                                reportedThreads
                                  .find((t) => t.thread_id === selectedThread.thread_id)
                                  ?.participants.find((u) => u.user_id === msg.sender_user_id)?.name || "User"
                              }
                            </span>
                            <span className="text-xs text-gray-500">{formatDate(msg.sent_at)}</span>
                          </div>
                          <div className="text-sm text-gray-900 mt-1 whitespace-pre-line">{msg.content}</div>
                        </div>
                        <div className="ml-2 flex items-center space-x-2">
                          {/* Delete Message Button - stub */}
                          <button
                            className="text-red-500 hover:bg-red-100 rounded px-2 py-1 text-xs border border-red-200 ml-1"
                            onClick={() => handleDeleteMessage(msg.message_id)}
                            title="Delete Message"
                          >
                            <svg width={14} height={14} stroke="currentColor" strokeWidth={2} fill="none" className="inline-block align-middle mr-1">
                              <path d="M2 2 l10 10 M12 2 l-10 10" />
                            </svg>
                            Delete
                          </button>
                          {/* Warn User Button - stub */}
                          <button
                            className="text-yellow-600 hover:bg-yellow-50 rounded px-2 py-1 text-xs border border-yellow-200 ml-1"
                            onClick={() => handleWarnUser(msg.sender_user_id)}
                            title="Warn User"
                          >
                            <svg width={14} height={14} stroke="currentColor" strokeWidth={2} fill="none" className="inline-block align-middle mr-1">
                              <circle cx="7" cy="7" r="6"/>
                              <path d="M7 4 v3 M7 9 v1" />
                            </svg>
                            Warn
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-gray-400 mt-3">
                    <span className="text-red-500">Delete</span> and <span className="text-yellow-600">Warn</span> actions are for demonstration.{" "}
                    <span className="font-bold">// TODO: Backend support needed for moderation actions!</span>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: Delete Message Confirm */}
      {messageDeleteDialog.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white p-6 rounded-lg shadow-xl w-96 relative">
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-blue-700 p-1"
              onClick={() => setMessageDeleteDialog({ visible: false })}
              aria-label="Close"
            >
              <svg width={18} height={18} stroke="currentColor" strokeWidth={2} fill="none">
                <path d="M3 3 l12 12 M15 3 l-12 12" />
              </svg>
            </button>
            <div className="text-lg font-bold mb-3 text-red-600 flex items-center">
              <svg width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} className="mr-2 text-red-500">
                <path d="M5 5l12 12M17 5L5 17" />
              </svg>
              Confirm Delete Message
            </div>
            <div className="text-gray-700 my-4">
              Are you sure you want to permanently delete this message? This cannot be undone.
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                className="px-4 py-2 rounded bg-gray-300 text-gray-800 hover:bg-gray-400"
                onClick={() => setMessageDeleteDialog({ visible: false })}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-800 font-bold"
                onClick={() => confirmDeleteMessage()}
              >
                Delete
              </button>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              <span className="font-bold">// TODO: No backend endpoint – this is a UI-only demonstration.</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Warn User Dialog */}
      {warningModal.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg relative">
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-blue-700 p-1"
              onClick={() => setWarningModal({ visible: false })}
              aria-label="Close"
            >
              <svg width={18} height={18} stroke="currentColor" strokeWidth={2} fill="none">
                <path d="M3 3 l12 12 M15 3 l-12 12" />
              </svg>
            </button>
            <div className="text-lg font-bold mb-3 text-yellow-600 flex items-center">
              <svg width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} className="mr-2 text-yellow-500">
                <circle cx={11} cy={11} r={10} />
                <path d="M11 6v5M11 14v.01" />
              </svg>
              Send Warning to User
            </div>
            <div className="my-3 text-gray-700">
              <div className="mb-1">Compose warning to user:</div>
              <textarea
                className="w-full border rounded p-2 text-sm min-h-[72px]"
                placeholder="Please adhere to the community rules. Further violations may lead to account suspension."
                value={warningModal.warning_text}
                onChange={(e) =>
                  setWarningModal((prev) => ({
                    ...prev,
                    warning_text: e.target.value,
                  }))
                }
                disabled={warningModal.submitting}
              />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                className="px-4 py-2 rounded bg-gray-300 text-gray-800 hover:bg-gray-400"
                onClick={() => setWarningModal({ visible: false })}
                disabled={warningModal.submitting}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-yellow-600 text-white hover:bg-yellow-800 font-bold"
                onClick={sendWarning}
                disabled={warningModal.submitting || !warningModal.warning_text}
              >
                {warningModal.submitting ? "Sending…" : "Send Warning"}
              </button>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              <span className="font-bold">// TODO: No backend endpoint – this is a UI-only demonstration.</span>
            </div>
          </div>
        </div>
      )}

      {/* Audit/Admin Action Log Table */}
      <div className="p-6 pt-1">
        <h2 className="text-lg font-bold mb-2 text-gray-700">Moderation Audit Log</h2>
        <div className="overflow-x-auto border rounded-lg shadow bg-white">
          {isAuditLogLoading && (
            <div className="p-4 text-center text-gray-600">Loading moderation actions…</div>
          )}
          {isAuditLogError && (
            <div className="p-4 text-center text-red-600 font-bold">
              Failed to load audit history: {(auditLogError as any)?.message || "Unknown error"}
            </div>
          )}
          {(!isAuditLogLoading && !isAuditLogError) && (
            <table className="min-w-full divide-y divide-gray-200 table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 w-20 text-xs font-semibold text-gray-600">Date/Time</th>
                  <th className="px-4 py-2 w-28 text-xs font-semibold text-gray-600">Type</th>
                  <th className="px-4 py-2 w-20 text-xs font-semibold text-gray-600">Target</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-600">Notes</th>
                  <th className="px-4 py-2 w-20 text-xs font-semibold text-gray-600">Moderator</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedAdminActionLog.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="text-center py-6 text-gray-500 italic">
                        No moderation actions recorded yet.
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedAdminActionLog.map((action) => (
                    <tr key={action.admin_action_id}>
                      <td className="px-4 py-2 text-xs text-gray-700">{formatDate(action.created_at)}</td>
                      <td className="px-4 py-2 text-xs text-blue-700 font-semibold">{action.action_type}</td>
                      <td className="px-4 py-2 text-xs text-gray-800 font-mono">{`${action.target_type}:${action.target_id}`}</td>
                      <td className="px-4 py-2 text-xs text-gray-900">{action.notes || <span className="text-gray-400 italic">–</span>}</td>
                      <td className="px-4 py-2 text-xs text-gray-700">{action.admin_user_id}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-2">
          All moderation actions are logged for platform audit and compliance. | Last refreshed:{" "}
          <span className="text-gray-700 font-mono">{formatDate(Date.now())}</span>
        </div>
      </div>
    </>
  );
};

export default UV_Admin_Messages;