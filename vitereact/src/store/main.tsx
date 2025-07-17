import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';

////////////////////////////////////////////////////
// Types (exported for use by view/component code)
////////////////////////////////////////////////////

export interface UserProfile {
  user_id: string;
  name: string;
  email: string;
  role: string;
  profile_photo_url?: string | null;
  is_active: boolean;
  notification_settings: Record<string, any>;
  payout_method_details?: string | null;
  is_verified_host?: boolean | null;
  phone?: string | null;
  about?: string | null;
  locale?: string | null;
  created_at: number;
  updated_at: number;
}

export interface AuthToken {
  token: string;
  expires_at: number;
}

export interface Notification {
  notification_id: string;
  user_id?: string;
  type: string;
  content: string;
  is_read: boolean;
  related_booking_id?: string | null;
  related_villa_id?: string | null;
  created_at: number;
}

export interface SearchQuery {
  location: string;
  check_in_date: string;
  check_out_date: string;
  number_of_guests: number;
  amenities: string[];
  price_min?: number | null;
  price_max?: number | null;
  instant_book?: boolean | null;
  rating?: number | null;
  sort_by?: string | null;
}

export interface GuestInfo {
  name: string;
  email: string;
  phone: string;
  special_requests?: string;
}

export interface BookingInProgress {
  villa_id: string;
  check_in_date: string;
  check_out_date: string;
  number_of_guests: number;
  step: number;
  guest_info?: GuestInfo;
  total_price?: number;
  booking_type?: string;
  agreed_to_rules?: boolean;
  payment_status?: string;
  error?: string;
}

export interface ErrorBanner {
  message: string;
  visible: boolean;
}

export interface CookieConsent {
  consent_given: boolean;
  dismissed: boolean;
  timestamp: number | null;
}

export interface AdminViewContext {
  tab: string;
  filters?: Record<string, any>;
}

////////////////////////////////////////////////////
// Store interface
////////////////////////////////////////////////////

interface AppStoreState {
  // Auth & User
  user: UserProfile | null;
  set_user: (user: UserProfile | null) => void;

  auth_token: AuthToken | null;
  set_auth_token: (auth: AuthToken | null) => void;

  // Notifications (list + count)
  notifications: Notification[];
  set_notifications: (list: Notification[]) => void;
  add_notification: (notif: Notification) => void;
  update_notification: (notif: Notification) => void;
  mark_notification_read: (notification_id: string) => void;
  unread_notifications: number;
  set_unread_notifications: (n: number) => void;
  clear_notifications: () => void;

  // Search Query Context
  search_query: SearchQuery;
  set_search_query: (query: SearchQuery) => void;
  reset_search_query: () => void;

  // Booking In-Progress (wizard context)
  booking_in_progress: BookingInProgress | null;
  set_booking_in_progress: (b: BookingInProgress | null) => void;

  // Error Banner
  error_banner: ErrorBanner;
  set_error_banner: (eb: ErrorBanner) => void;
  clear_error_banner: () => void;

  // Cookie Consent
  cookie_consent: CookieConsent;
  set_cookie_consent: (c: CookieConsent) => void;

  // Admin view context (tab, filters)
  admin_view_context: AdminViewContext;
  set_admin_view_context: (ctx: AdminViewContext) => void;
  reset_admin_view_context: () => void;

  // Auth/session: logout & hard reset (clear everything)
  clear_all: () => void;

  // Real-time Sockets (for in-app notifications/messages)
  socket: Socket | null;
  connect_socket: () => void;
  disconnect_socket: () => void;
}

////////////////////////////////////////////////////
// Defaults
////////////////////////////////////////////////////

const DEFAULT_SEARCH_QUERY: SearchQuery = {
  location: '',
  check_in_date: '',
  check_out_date: '',
  number_of_guests: 1,
  amenities: [],
  price_min: null,
  price_max: null,
  instant_book: null,
  rating: null,
  sort_by: 'popularity',
};

const DEFAULT_ERROR_BANNER: ErrorBanner = {
  message: '',
  visible: false,
};

const DEFAULT_COOKIE_CONSENT: CookieConsent = {
  consent_given: false,
  dismissed: false,
  timestamp: null,
};

const DEFAULT_ADMIN_VIEW_CONTEXT: AdminViewContext = {
  tab: '',
  filters: {},
};

////////////////////////////////////////////////////
// ZUSTAND STORE
////////////////////////////////////////////////////

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      // User/Auth
      user: null,
      set_user: (user) => set({ user }),

      auth_token: null,
      set_auth_token: (auth) => set({ auth_token: auth }),

      // Notifications
      notifications: [],
      set_notifications: (list: Notification[]) => {
        set({
          notifications: list,
          unread_notifications: list.filter(n => !n.is_read).length,
        });
      },
      add_notification: (notif: Notification) => {
        const current = get().notifications || [];
        // Avoid duplicate (by notification_id)
        if (!current.find((n) => n.notification_id === notif.notification_id)) {
          set({
            notifications: [notif, ...current],
            unread_notifications: notif.is_read
              ? get().unread_notifications
              : get().unread_notifications + 1,
          });
        }
      },
      update_notification: (notif: Notification) => {
        set((state) => {
          const idx = state.notifications.findIndex(n => n.notification_id === notif.notification_id);
          if (idx >= 0) {
            const updated = [...state.notifications];
            updated[idx] = notif;
            return {
              notifications: updated,
              unread_notifications: updated.filter(n => !n.is_read).length,
            };
          }
          return {};
        });
      },
      mark_notification_read: (notification_id: string) => {
        set((state) => {
          const updated = state.notifications.map((n) =>
            n.notification_id === notification_id ? { ...n, is_read: true } : n
          );
          return {
            notifications: updated,
            unread_notifications: updated.filter(n => !n.is_read).length,
          };
        });
      },
      unread_notifications: 0,
      set_unread_notifications: (n) => set({ unread_notifications: n }),
      clear_notifications: () => set({ notifications: [], unread_notifications: 0 }),

      // Search Query
      search_query: { ...DEFAULT_SEARCH_QUERY },
      set_search_query: (query) => set({ search_query: query }),
      reset_search_query: () => set({ search_query: { ...DEFAULT_SEARCH_QUERY } }),

      // Booking In Progress
      booking_in_progress: null,
      set_booking_in_progress: (b) => set({ booking_in_progress: b }),

      // Error Banner
      error_banner: { ...DEFAULT_ERROR_BANNER },
      set_error_banner: (eb) => set({ error_banner: eb }),
      clear_error_banner: () => set({ error_banner: { ...DEFAULT_ERROR_BANNER } }),

      // Cookie Consent
      cookie_consent: { ...DEFAULT_COOKIE_CONSENT },
      set_cookie_consent: (c) => set({ cookie_consent: c }),

      // Admin View Context
      admin_view_context: { ...DEFAULT_ADMIN_VIEW_CONTEXT },
      set_admin_view_context: (ctx) => set({ admin_view_context: ctx }),
      reset_admin_view_context: () => set({ admin_view_context: { ...DEFAULT_ADMIN_VIEW_CONTEXT } }),

      // Logout/Clear all - also disconnects socket
      clear_all: () => {
        // Disconnect socket if present
        const socket = get().socket;
        if (socket) {
          socket.disconnect();
        }
        set({
          user: null,
          auth_token: null,
          notifications: [],
          unread_notifications: 0,
          search_query: { ...DEFAULT_SEARCH_QUERY },
          booking_in_progress: null,
          error_banner: { ...DEFAULT_ERROR_BANNER },
          cookie_consent: { ...DEFAULT_COOKIE_CONSENT },
          admin_view_context: { ...DEFAULT_ADMIN_VIEW_CONTEXT },
          socket: null,
        });
      },

      // Socket management
      socket: null,
      connect_socket: () => {
        const { auth_token, user, socket } = get();
        if (!auth_token || !user) return;
        if (socket) return; // already connected

        // Note: Server URL from .env or fallback localhost
        const url = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
        const newSocket = io(url, {
          // Sends JWT for authorizing push events
          auth: { token: auth_token.token },
          reconnection: true,
        });

        // -- NOTIFICATION EVENTS via socket.io --
        // These events must match backend socket emission names!
        newSocket.on('user.notification_new', (payload: Notification) => {
          get().add_notification(payload);
        });

        newSocket.on('user.notifications', (payload: { notifications: Notification[] }) => {
          if (payload && Array.isArray(payload.notifications)) {
            get().set_notifications(payload.notifications);
          }
        });

        newSocket.on('user.notification_read', (payload: { notification_id: string }) => {
          if (payload?.notification_id) {
            get().mark_notification_read(payload.notification_id);
          }
        });

        // Optionally, other events (thread updates, etc) can be handled here.

        // On disconnect cleanup
        newSocket.on('disconnect', () => {
          set({ socket: null });
        });

        set({ socket: newSocket });
      },
      disconnect_socket: () => {
        const { socket } = get();
        if (socket) {
          socket.disconnect();
          set({ socket: null });
        }
      },
    }),
    {
      name: 'beachvillas-global-store',
      partialize: (state) => ({
        // Only persist relevant state
        user: state.user,
        auth_token: state.auth_token,
        notifications: state.notifications,
        unread_notifications: state.unread_notifications,
        search_query: state.search_query,
        booking_in_progress: state.booking_in_progress,
        error_banner: state.error_banner,
        cookie_consent: state.cookie_consent,
        admin_view_context: state.admin_view_context,
      }),
    }
  )
);
