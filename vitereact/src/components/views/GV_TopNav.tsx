import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";

// --- Types (from store) ---
import type { UserProfile, Notification, SearchQuery } from "@/store/main";

// Utility: API base url
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Allowed roles
const HOST_ROLES = new Set(["host", "guest_host"]);
const GUEST_ROLES = new Set(["guest", "guest_host"]);

// Route map (per architecture/xlinks)
const DASHBOARD_PATH = "/dashboard";
const HOST_LISTINGS_PATH = "/host/listings";
const HOST_BOOKINGS_PATH = "/host/bookings";
const HOST_EARNINGS_PATH = "/host/earnings";
const PROFILE_PATH = "/profile";
const MESSAGES_PATH = "/messages";
const LOGIN_PATH = "/login";
const SIGNUP_PATH = "/signup";
const FAQ_PATH = "/faq";
const HOME_PATH = "/";
const BECOME_HOST_PATH = "/host/listings/new";

// Used as page-wide error banner
function showDangerBanner(message: string) {
  const set_error_banner = useAppStore.getState().set_error_banner;
  set_error_banner({ message, visible: true });
  setTimeout(() => {
    useAppStore.getState().clear_error_banner();
  }, 4000);
}

// --- Search Suggestions API ---
const fetchSearchSuggestions = async (query: string): Promise<string[]> => {
  if (!query.trim()) return [];
  const { data } = await axios.get(
    `${API_BASE_URL}/search/suggestions`,
    { params: { query } }
  );
  return data.suggestions || [];
};

// --- Notifications API ---
const fetchNotifications = async (token: string): Promise<{ notifications: Notification[]; unread_count: number }> => {
  const { data } = await axios.get(`${API_BASE_URL}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
};

const markNotificationRead = async ({ notification_id, token }: { notification_id: string; token: string }) => {
  await axios.post(
    `${API_BASE_URL}/notifications/${notification_id}/read`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
};

// --- Logout API ---
const doLogout = async (token: string) => {
  await axios.post(`${API_BASE_URL}/auth/logout`, {}, {
    headers: {
      Authorization: `Bearer ${token}`,
    }
  });
};

// --- Main Component ---
const GV_TopNav: React.FC = () => {
  // global store access (Selectors to avoid over-re-renders!)
  const user = useAppStore((s) => s.user);
  const set_user = useAppStore((s) => s.set_user);
  const auth_token = useAppStore((s) => s.auth_token);
  const set_auth_token = useAppStore((s) => s.set_auth_token);
  const notifications = useAppStore((s) => s.notifications); // NOTE: notifications are kept globally, but we keep a fetch-latest option
  const set_notifications = useAppStore((s) => s.set_notifications);
  const unread_notifications = useAppStore((s) => s.unread_notifications);
  const set_unread_notifications = useAppStore((s) => s.set_unread_notifications);
  const clear_all = useAppStore((s) => s.clear_all);
  const global_search_query = useAppStore((s) => s.search_query);
  const set_search_query = useAppStore((s) => s.set_search_query);

  // Router
  const navigate = useNavigate();
  const location = useLocation();

  // Local states
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsBellOpen, setNotificationsBellOpen] = useState(false);
  const [activeRoleMenu, setActiveRoleMenu] = useState<string>(user?.role === "guest_host" ? "guest" : user?.role || "");
  const [searchInput, setSearchInput] = useState<SearchQuery>({
    location: global_search_query.location ?? "",
    check_in_date: global_search_query.check_in_date ?? "",
    check_out_date: global_search_query.check_out_date ?? "",
    number_of_guests: global_search_query.number_of_guests ?? 1,
    amenities: [],
    price_min: null,
    price_max: null,
    instant_book: null,
    rating: null,
    sort_by: global_search_query.sort_by ?? "popularity",
  });

  // For autocomplete suggestions
  const [searchQueryValue, setSearchQueryValue] = useState<string>(global_search_query.location ?? "");
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number | null>(null);

  // Autocomplete suggestions (react-query)
  const {
    data: suggestions = [],
    refetch: refetchSuggestions,
    isFetching: isFetchingSuggestions,
  } = useQuery<string[]>(
    ["search_suggestions", searchQueryValue],
    () => fetchSearchSuggestions(searchQueryValue),
    {
      enabled: Boolean(searchQueryValue && searchQueryValue.trim().length > 0),
      keepPreviousData: true,
    }
  );

  // Notifications (react-query, but also keep global state sync)
  const {
    data: notificationsData,
    refetch: refetchNotifications,
    isLoading: isLoadingNotifications,
  } = useQuery<{ notifications: Notification[]; unread_count: number }>(
    ["notifications"],
    () => {
      if (!auth_token?.token) {
        return Promise.resolve({ notifications: [], unread_count: 0 });
      }
      return fetchNotifications(auth_token.token);
    },
    {
      enabled: !!user && !!auth_token,
      onSuccess: (data) => {
        set_notifications(data.notifications);
        set_unread_notifications(data.unread_count);
      },
      staleTime: 10000,
    }
  );

  // Mark notification read (mutation)
  const markNotificationReadMutation = useMutation(markNotificationRead, {
    onSuccess: () => {
      refetchNotifications();
    },
    onError: () => {
      showDangerBanner("Unable to mark notification as read. Try again later.");
    },
  });

  // Logout (mutation)
  const logoutMutation = useMutation(doLogout, {
    onSuccess: async () => {
      // Clear all state and redirect home
      clear_all();
      setProfileDropdownOpen(false);
      setNavMenuOpen(false);
      navigate(HOME_PATH, { replace: true });
    },
    onError: () => {
      showDangerBanner("Logout failed. Please reload or try again.");
    },
  });

  // --- Handlers ---
  const handleLogoClick = () => {
    setNavMenuOpen(false);
    setProfileDropdownOpen(false);
    setNotificationsBellOpen(false);
    navigate(HOME_PATH);
  };

  const handleMenuToggle = () => setNavMenuOpen(!navMenuOpen);

  const handleProfileDropdown = () => setProfileDropdownOpen(!profileDropdownOpen);

  const handleNotificationsBell = async () => {
    setNotificationsBellOpen((open) => {
      const nextOpen = !open;
      if (nextOpen && user && auth_token?.token) {
        refetchNotifications();
      }
      return nextOpen;
    });
  };

  const handleRoleSwitch = (role: string) => {
    setActiveRoleMenu(role);
    // No persistent effect unless we want to update user context for API
    setProfileDropdownOpen(false);
  };

  const handleLogoutClick = async () => {
    if (auth_token && auth_token.token) {
      logoutMutation.mutate(auth_token.token);
    } else {
      clear_all();
      setProfileDropdownOpen(false);
      setNavMenuOpen(false);
      navigate(HOME_PATH, { replace: true });
    }
  };

  // Search Form
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSearchInput((q) => ({
      ...q,
      [name]: name === "number_of_guests" ? parseInt(value) || 1 : value,
    }));

    if (name === "location") {
      setSearchQueryValue(value);
      setSelectedSuggestionIdx(null);
    }
  };

  // Enter/arrow key for suggestions
  const handleLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      setSelectedSuggestionIdx((i) => i === null ? 0 : Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      setSelectedSuggestionIdx((i) => i === null ? suggestions.length - 1 : Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedSuggestionIdx !== null) {
      e.preventDefault();
      setSearchInput((q) => ({
        ...q,
        location: suggestions[selectedSuggestionIdx],
      }));
      setSearchQueryValue(suggestions[selectedSuggestionIdx]);
      setSelectedSuggestionIdx(null);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchInput((q) => ({
      ...q,
      location: suggestion,
    }));
    setSearchQueryValue(suggestion);
    setSelectedSuggestionIdx(null);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const loc =
      searchInput.location && typeof searchInput.location === "string"
        ? searchInput.location.trim()
        : "";
    if (!loc) {
      showDangerBanner("Please enter a location to search.");
      return;
    }

    // Update search context in global search_query
    set_search_query({
      ...searchInput,
      location: loc,
      check_in_date: searchInput.check_in_date,
      check_out_date: searchInput.check_out_date,
      number_of_guests:
        typeof searchInput.number_of_guests === "number"
          ? searchInput.number_of_guests
          : 1,
      amenities: [],
      price_min: null,
      price_max: null,
      instant_book: null,
      rating: null,
      sort_by: "popularity",
    });

    // navigate to /search?location=loc&check_in=...&check_out=...&number_of_guests=...
    const params = new URLSearchParams({
      location: loc,
    });
    if (searchInput.check_in_date) params.append("check_in", searchInput.check_in_date);
    if (searchInput.check_out_date) params.append("check_out", searchInput.check_out_date);
    if (
      typeof searchInput.number_of_guests === "number" &&
      searchInput.number_of_guests > 0
    )
      params.append("number_of_guests", String(searchInput.number_of_guests));

    navigate(`/search?${params.toString()}`);
    setNavMenuOpen(false);
  };

  // Mark notification as read then handle click
  const handleNotificationClick = (notification: Notification) => {
    if (user && auth_token?.token && !notification.is_read) {
      markNotificationReadMutation.mutate({
        notification_id: notification.notification_id,
        token: auth_token.token,
      });
    }
    setNotificationsBellOpen(false);

    // Notification navigation, per content/context
    if (notification.related_booking_id) {
      navigate(`/booking/${notification.related_booking_id}/details`);
    } else if (notification.related_villa_id) {
      navigate(`/villa/${notification.related_villa_id}`);
    } else if (notification.type === "new_message") {
      navigate(MESSAGES_PATH);
    }
  };

  // Profile image fallback
  function renderProfilePhoto(profile_photo_url: string | null | undefined, name: string) {
    if (profile_photo_url) {
      return (
        <img
          src={profile_photo_url}
          alt={name}
          className="w-8 h-8 rounded-full object-cover border"
        />
      );
    }
    // Fallback to initials
    const initials =
      name
        ?.split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase() || "?";
    return (
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center border text-gray-600 text-sm font-semibold">
        {initials}
      </div>
    );
  }

  // Close dropdowns on outside click (for accessibility UX)
  const navRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!navRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!navRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
        setNotificationsBellOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close nav drawer on route change
  useEffect(() => {
    setNavMenuOpen(false);
    setProfileDropdownOpen(false);
    setNotificationsBellOpen(false);
    // eslint-disable-next-line
  }, [location.pathname]);

  // -- UI coords --
  // Determine which main links to show
  const isGuestOrUnauthed =
    !user || user.role === "guest";
  const isHost = HOST_ROLES.has(user?.role || "");
  const isGuest = GUEST_ROLES.has(user?.role || "");
  const isDual = user?.role === "guest_host";
  const isAuthed = !!user;
  const dualRoleMenu = activeRoleMenu;

  // --- Actual render ---
  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm min-h-[60px] flex items-center w-full px-4 sm:px-8"
        ref={navRef}
        role="navigation"
        aria-label="Main Site Navigation"
      >
        {/* Logo - always left */}
        <div className="flex items-center h-16 flex-shrink-0 gap-2">
          <Link to="/" onClick={handleLogoClick} aria-label="Home">
            {/* Static logo svg (inline) */}
            <div className="flex items-center select-none">
              <svg width="30" height="30" viewBox="0 0 36 36" fill="none" aria-hidden="true" className="mr-2">
                <circle cx="18" cy="18" r="18" fill="#38bdf8"/>
                <path d="M10 23L18 13L26 23H10Z" fill="white"/>
              </svg>
              <span className="text-xl font-bold text-sky-600 tracking-wide">BeachVillas</span>
            </div>
          </Link>
        </div>

        {/* Desktop navlinks & search */}
        <div className="hidden md:flex flex-1 justify-between items-center ml-8">
          {/* Main nav links - left */}
          <div className="flex gap-4 items-center">
            <Link to={HOME_PATH} className="text-[15px] px-2 py-1 rounded hover:bg-sky-50 transition">Home</Link>
            <Link to={FAQ_PATH} className="text-[15px] px-2 py-1 rounded hover:bg-sky-50 transition">FAQ</Link>
            {isAuthed && isGuest && (
              <Link
                to={DASHBOARD_PATH}
                className="text-[15px] px-2 py-1 rounded hover:bg-sky-50 transition"
              >
                My Trips
              </Link>
            )}
            {isAuthed && isHost && (
              <Link
                to={HOST_LISTINGS_PATH}
                className="text-[15px] px-2 py-1 rounded hover:bg-sky-50 transition"
              >
                My Villas
              </Link>
            )}
            {isAuthed && isHost && (
              <Link
                to={HOST_BOOKINGS_PATH}
                className="text-[15px] px-2 py-1 rounded hover:bg-sky-50 transition"
              >
                Bookings
              </Link>
            )}
            {isAuthed && isHost && (
              <Link
                to={HOST_EARNINGS_PATH}
                className="text-[15px] px-2 py-1 rounded hover:bg-sky-50 transition"
              >
                Earnings
              </Link>
            )}
            {isAuthed && (
              <Link
                to={MESSAGES_PATH}
                className="text-[15px] px-2 py-1 rounded hover:bg-sky-50 transition"
              >
                Messages
              </Link>
            )}
            {!isAuthed && (
              <Link
                to={BECOME_HOST_PATH}
                className="text-[15px] px-2 py-1 rounded font-semibold bg-sky-100 text-sky-700 hover:bg-sky-200 transition"
              >
                Become a Host
              </Link>
            )}
          </div>

          {/* Centered search bar */}
          <div className="min-w-[340px] w-[400px] max-w-xs mx-4">
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="flex bg-gray-100 rounded-md shadow px-2 py-1 gap-2 items-center border border-gray-200">
                {/* Location autocomplete */}
                <div className="relative w-2/5">
                  <input
                    type="text"
                    name="location"
                    aria-label="Location"
                    placeholder="Location"
                    autoComplete="off"
                    className="w-full bg-transparent px-2 py-1 border-none focus:ring-0 focus:outline-none text-[15px]"
                    value={searchInput.location}
                    onChange={handleSearchChange}
                    onFocus={() => searchInput.location && setSearchQueryValue(searchInput.location)}
                    onKeyDown={handleLocationKeyDown}
                  />
                  {/* Suggestions dropdown */}
                  {Boolean(searchQueryValue && suggestions.length > 0) && (
                    <ul className="absolute z-30 top-10 left-0 w-full bg-white border rounded shadow text-gray-700 max-h-40 overflow-auto">
                      {suggestions.map((suggestion, idx) => (
                        <li
                          key={suggestion}
                          className={`px-3 py-1 cursor-pointer hover:bg-sky-100 ${selectedSuggestionIdx === idx ? "bg-sky-50" : ""}`}
                          onClick={() => handleSuggestionClick(suggestion)}
                        >
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Dates */}
                <input
                  type="date"
                  name="check_in_date"
                  className="w-[125px] px-2 py-1 text-[15px] rounded-md bg-transparent border-none focus:ring-0"
                  value={searchInput.check_in_date}
                  onChange={handleSearchChange}
                  aria-label="Check-in"
                  min={new Date().toISOString().split("T")[0]}
                />
                <span className="text-gray-400 px-1 text-[13px]">–</span>
                <input
                  type="date"
                  name="check_out_date"
                  className="w-[125px] px-2 py-1 text-[15px] rounded-md bg-transparent border-none focus:ring-0"
                  value={searchInput.check_out_date}
                  onChange={handleSearchChange}
                  aria-label="Check-out"
                  min={searchInput.check_in_date || new Date().toISOString().split("T")[0]}
                />

                {/* Guests */}
                <select
                  name="number_of_guests"
                  className="bg-transparent px-2 py-1 border-none focus:ring-0 rounded text-[15px]"
                  value={searchInput.number_of_guests}
                  onChange={handleSearchChange}
                  aria-label="Guests"
                >
                  {[...Array(16)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1} Guest{i > 0 && "s"}</option>
                  ))}
                </select>

                {/* Submit button */}
                <button
                  type="submit"
                  className="flex items-center gap-1 bg-sky-600 text-white px-3 py-1.5 rounded-md hover:bg-sky-700 transition text-[15px] ml-1"
                  aria-label="Search"
                >
                  <svg width="20" height="20" fill="none" viewBox="0 0 20 20"><circle cx="9" cy="9" r="7" stroke="white" strokeWidth="2"/><path d="M18 18L13.65 13.65" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
                  <span>Search</span>
                </button>
              </div>
            </form>
          </div>

          {/* - Right-side controls: notification bell and profile - */}
          <div className="flex items-center gap-4 ml-3">
            {/* Notification bell */}
            {isAuthed && (
              <div className="relative">
                <button
                  className="relative p-2 rounded-full hover:bg-sky-50 transition"
                  aria-label="Notifications"
                  onClick={handleNotificationsBell}
                >
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                    <path d="M12 5a4 4 0 0 0-4 4v2c0 1.243-.47 2.43-1.366 3.325A8 8 0 0 0 4 18h16a8 8 0 0 0-2.634-3.675C16.47 13.43 16 12.243 16 11V9a4 4 0 0 0-4-4Zm0 16a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2Z" stroke="#0369a1" strokeWidth="1.7"/>
                  </svg>
                  {unread_notifications > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 rounded-full w-4 h-4 text-white flex items-center justify-center text-xs font-bold border border-white pointer-events-none">{unread_notifications}</span>
                  )}
                </button>
                {/* Dropdown: notifications */}
                {notificationsBellOpen && (
                  <div className="absolute right-0 top-10 bg-white shadow-lg rounded-lg z-50 min-w-[320px] border border-gray-200 max-h-96 overflow-auto">
                    <div className="px-4 py-2 border-b border-gray-100 font-semibold text-gray-800">Notifications</div>
                    {isLoadingNotifications ? (
                      <div className="text-center p-4">Loading...</div>
                    ) : notifications.length === 0 ? (
                      <div className="text-center p-4 text-gray-400">No notifications.</div>
                    ) : (
                      <ul>
                        {notifications
                          .sort((a, b) => b.created_at - a.created_at)
                          .slice(0, 12)
                          .map((notif) => (
                            <li
                              key={notif.notification_id}
                              className={`flex items-start px-4 py-3 cursor-pointer border-b border-gray-50 hover:bg-sky-50 transition ${!notif.is_read ? "bg-sky-100" : ""}`}
                              onClick={() => handleNotificationClick(notif)}
                            >
                              <div className="flex-1">
                                <div className="text-sm text-gray-800">{notif.content}</div>
                                <div className="text-xs text-gray-400 mt-1">
                                  {new Date(notif.created_at * 1000).toLocaleString()}
                                </div>
                              </div>
                              {!notif.is_read && (
                                <span className="ml-2 mt-1 w-2 h-2 rounded-full bg-sky-600 inline-block" />
                              )}
                            </li>
                          ))}
                      </ul>
                    )}
                    <div className="p-2 text-center">
                      <Link
                        to={MESSAGES_PATH}
                        className="text-[14px] text-sky-700 hover:underline"
                        onClick={() => setNotificationsBellOpen(false)}
                      >
                        View all messages
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Profile dropdown */}
            <div className="relative">
              {isAuthed ? (
                <button
                  className="flex items-center gap-2 px-2 py-1 rounded-full bg-gray-100 hover:bg-sky-100 transition"
                  onClick={handleProfileDropdown}
                  aria-label="Profile Menu"
                >
                  {renderProfilePhoto(user?.profile_photo_url, user?.name || "User")}
                  <span className="ml-2 font-medium text-gray-700 text-[15px]">{user?.name?.split(" ")[0] || "User"}</span>
                  <svg width="16" height="16" fill="none" viewBox="0 0 20 20" className="ml-1"><path d="M6 8l4 4 4-4" stroke="#0369a1" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              ) : (
                // Unauthed: show login/signup
                <div className="flex gap-2">
                  <Link
                    to={LOGIN_PATH}
                    className="px-3 py-1 rounded-md text-sky-700 bg-sky-50 font-medium hover:bg-sky-100 transition"
                  >
                    Log In
                  </Link>
                  <Link
                    to={SIGNUP_PATH}
                    className="px-3 py-1 rounded-md text-white bg-sky-600 font-medium hover:bg-sky-700 transition"
                  >
                    Sign Up
                  </Link>
                </div>
              )}

              {profileDropdownOpen && isAuthed && (
                <div className="absolute right-0 top-12 bg-white rounded-lg shadow-lg min-w-[210px] border z-50">
                  <div className="py-2 px-4 border-b font-semibold text-gray-700">Hello, {user?.name?.split(" ")[0]}</div>
                  <ul>
                    <li>
                      <Link
                        to={PROFILE_PATH}
                        className="block px-4 py-2 text-[15px] hover:bg-sky-50 transition"
                        onClick={() => setProfileDropdownOpen(false)}
                      >
                        Profile & Settings
                      </Link>
                    </li>
                    {isDual && (
                      <li>
                        <div className="block px-4 py-2 text-[15px] font-medium text-gray-600">
                          Role:
                          <button
                            className={`ml-2 px-2 py-1 rounded ${dualRoleMenu === "guest" ? "bg-sky-600 text-white" : "bg-gray-200 text-gray-700"} hover:bg-sky-600/70 hover:text-white`}
                            onClick={() => handleRoleSwitch("guest")}
                          >
                            Guest
                          </button>
                          <button
                            className={`ml-2 px-2 py-1 rounded ${dualRoleMenu === "host" ? "bg-sky-600 text-white" : "bg-gray-200 text-gray-700"} hover:bg-sky-600/70 hover:text-white`}
                            onClick={() => handleRoleSwitch("host")}
                          >
                            Host
                          </button>
                        </div>
                      </li>
                    )}
                    <li>
                      <button
                        className="block w-full text-left px-4 py-2 text-[15px] hover:bg-sky-50 transition"
                        onClick={handleLogoutClick}
                        disabled={logoutMutation.isLoading}
                      >
                        {logoutMutation.isLoading ? "Logging out..." : "Log Out"}
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hamburger icon for mobile */}
        <div className="flex md:hidden ml-auto gap-2">
          {isAuthed && (
            <button
              className="relative p-2 ml-1 rounded-full hover:bg-sky-50 transition"
              aria-label="Notifications"
              onClick={handleNotificationsBell}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                <path d="M12 5a4 4 0 0 0-4 4v2c0 1.243-.47 2.43-1.366 3.325A8 8 0 0 0 4 18h16a8 8 0 0 0-2.634-3.675C16.47 13.43 16 12.243 16 11V9a4 4 0 0 0-4-4Zm0 16a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2Z" stroke="#0369a1" strokeWidth="1.7"/>
              </svg>
              {unread_notifications > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 rounded-full w-4 h-4 text-white flex items-center justify-center text-xs font-bold border border-white pointer-events-none">{unread_notifications}</span>
              )}
            </button>
          )}
          <button
            className="p-2 ml-2 rounded hover:bg-gray-100 transition"
            aria-label="Toggle navigation menu"
            onClick={handleMenuToggle}
          >
            <svg width="30" height="30" fill="none" viewBox="0 0 32 32">
              <rect x="4" y="9" width="24" height="2.4" rx="1" fill="#0369a1"/>
              <rect x="4" y="15" width="24" height="2.4" rx="1" fill="#0369a1"/>
              <rect x="4" y="21" width="24" height="2.4" rx="1" fill="#0369a1"/>
            </svg>
          </button>
        </div>

        {/* Mobile drawer panel */}
        {navMenuOpen && (
          <div className="fixed md:hidden top-0 left-0 w-4/5 max-w-xs bg-white shadow-xl z-[120] h-full border-r border-gray-200 animate-slidein">
            <div className="flex items-center justify-between px-4 h-16 border-b">
              <Link to="/" className="flex items-center gap-2" onClick={() => setNavMenuOpen(false)}>
                <svg width="26" height="26" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                  <circle cx="18" cy="18" r="18" fill="#38bdf8"/>
                  <path d="M10 23L18 13L26 23H10Z" fill="white"/>
                </svg>
                <span className="text-lg font-bold text-sky-600">BeachVillas</span>
              </Link>
              <button className="p-2" onClick={() => setNavMenuOpen(false)} aria-label="Close menu">
                <svg width="30" height="30" fill="none" viewBox="0 0 30 30"><path d="M8 8l14 14M22 8L8 22" stroke="#0369a1" strokeWidth="2.1" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="py-2 px-4 flex flex-col gap-1">
              <Link to={HOME_PATH} onClick={() => setNavMenuOpen(false)} className="py-2 px-1 text-[17px] block text-gray-800 rounded hover:bg-sky-50">Home</Link>
              <Link to={FAQ_PATH} onClick={() => setNavMenuOpen(false)} className="py-2 px-1 text-[17px] block text-gray-800 rounded hover:bg-sky-50">FAQ</Link>
              {isAuthed && isGuest && (
                <Link to={DASHBOARD_PATH} onClick={() => setNavMenuOpen(false)} className="py-2 px-1 text-[17px] block text-gray-800 rounded hover:bg-sky-50">My Trips</Link>
              )}
              {isAuthed && isHost && (
                <Link to={HOST_LISTINGS_PATH} onClick={() => setNavMenuOpen(false)} className="py-2 px-1 text-[17px] block text-gray-800 rounded hover:bg-sky-50">My Villas</Link>
              )}
              {isAuthed && isHost && (
                <Link to={HOST_BOOKINGS_PATH} onClick={() => setNavMenuOpen(false)} className="py-2 px-1 text-[17px] block text-gray-800 rounded hover:bg-sky-50">Bookings</Link>
              )}
              {isAuthed && isHost && (
                <Link to={HOST_EARNINGS_PATH} onClick={() => setNavMenuOpen(false)} className="py-2 px-1 text-[17px] block text-gray-800 rounded hover:bg-sky-50">Earnings</Link>
              )}
              {isAuthed && (
                <Link to={MESSAGES_PATH} onClick={() => setNavMenuOpen(false)} className="py-2 px-1 text-[17px] block text-gray-800 rounded hover:bg-sky-50">Messages</Link>
              )}
              {!isAuthed && (
                <Link
                  to={BECOME_HOST_PATH}
                  onClick={() => setNavMenuOpen(false)}
                  className="py-2 mt-2 px-1 text-[17px] block text-sky-700 font-semibold rounded bg-sky-100 hover:bg-sky-200"
                >Become a Host</Link>
              )}
            </div>
            <div className="border-t border-gray-100 my-2" />
            {/* Search bar in mobile nav */}
            <div className="px-4 py-2">
              <form onSubmit={handleSearchSubmit} className="w-full">
                <div className="flex flex-col gap-2 w-full">
                  <input
                    type="text"
                    name="location"
                    aria-label="Location"
                    placeholder="Location"
                    className="bg-gray-100 px-2 py-2 rounded-md border text-[16px] w-full"
                    value={searchInput.location}
                    onChange={handleSearchChange}
                  />
                  <div className="flex gap-1">
                    <input
                      type="date"
                      name="check_in_date"
                      className="w-2/5 px-2 py-2 text-[15px] rounded-md bg-gray-100 border"
                      value={searchInput.check_in_date}
                      onChange={handleSearchChange}
                      aria-label="Check-in"
                      min={new Date().toISOString().split("T")[0]}
                    />
                    <input
                      type="date"
                      name="check_out_date"
                      className="w-2/5 px-2 py-2 text-[15px] rounded-md bg-gray-100 border"
                      value={searchInput.check_out_date}
                      onChange={handleSearchChange}
                      aria-label="Check-out"
                      min={searchInput.check_in_date || new Date().toISOString().split("T")[0]}
                    />
                    <select
                      name="number_of_guests"
                      className="bg-gray-100 px-2 py-2 border rounded text-[15px] w-1/5"
                      value={searchInput.number_of_guests}
                      onChange={handleSearchChange}
                      aria-label="Guests"
                    >
                      {[...Array(16)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full mt-1 bg-sky-600 text-white py-2 rounded-md font-medium text-[16px] hover:bg-sky-700 transition"
                  >
                    Search
                  </button>
                </div>
              </form>
            </div>
            <div className="border-t border-gray-100 my-2" />
            <div className="px-4 py-3 flex flex-col gap-2">
              {isAuthed ? (
                <>
                  <div className="flex gap-3 items-center">
                    {renderProfilePhoto(user?.profile_photo_url, user?.name || "User")}
                    <span className="font-medium">{user?.name}</span>
                  </div>
                  <Link
                    to={PROFILE_PATH}
                    className="block px-1 py-2 mt-2 text-[16px] text-gray-800 rounded hover:bg-sky-50"
                    onClick={() => setNavMenuOpen(false)}
                  >
                    Profile & Settings
                  </Link>
                  {isDual && (
                    <div className="mt-1 flex gap-2 items-center justify-start">
                      <span className="text-xs text-gray-400">Role:</span>
                      <button
                        className={`px-2 py-1 rounded ${dualRoleMenu === "guest" ? "bg-sky-600 text-white" : "bg-gray-200 text-gray-700"} hover:bg-sky-600/70 hover:text-white`}
                        onClick={() => handleRoleSwitch("guest")}
                      >
                        Guest
                      </button>
                      <button
                        className={`px-2 py-1 rounded ${dualRoleMenu === "host" ? "bg-sky-600 text-white" : "bg-gray-200 text-gray-700"} hover:bg-sky-600/70 hover:text-white`}
                        onClick={() => handleRoleSwitch("host")}
                      >
                        Host
                      </button>
                    </div>
                  )}
                  <button
                    className="mt-2 w-full text-left px-1 py-2 text-[16px] text-red-600 rounded hover:bg-red-50 transition"
                    onClick={handleLogoutClick}
                    disabled={logoutMutation.isLoading}
                  >
                    {logoutMutation.isLoading ? "Logging out..." : "Log Out"}
                  </button>
                </>
              ) : (
                <div className="flex gap-3">
                  <Link
                    to={LOGIN_PATH}
                    className="w-1/2 py-2 text-center rounded-md text-sky-700 bg-sky-50 font-medium hover:bg-sky-100 transition"
                    onClick={() => setNavMenuOpen(false)}
                  >
                    Log In
                  </Link>
                  <Link
                    to={SIGNUP_PATH}
                    className="w-1/2 py-2 text-center rounded-md text-white bg-sky-600 font-medium hover:bg-sky-700 transition"
                    onClick={() => setNavMenuOpen(false)}
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal dim backdrop for drawer/dropdown */}
        {(navMenuOpen || profileDropdownOpen || notificationsBellOpen) && (
          <div className="fixed z-40 left-0 top-0 w-full h-full bg-black bg-opacity-10" />
        )}
      </nav>
      {/* Spacer to keep site content below nav */}
      <div className="h-[63px] min-h-[63px] w-full" />
    </>
  );
};

export default GV_TopNav;