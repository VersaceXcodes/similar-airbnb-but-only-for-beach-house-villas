import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";

// Type definitions from backend/zod schemas
type Amenity = {
  amenity_id: string;
  name: string;
  key: string;
  icon_url: string | null;
};
type UserShort = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  profile_photo_url: string | null;
  is_active: boolean;
  is_verified_host: boolean | null;
  notification_settings: Record<string, any>;
  payout_method_details: string | null;
};
type VillaSummary = {
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
};

type SearchInput = {
  location: string;
  check_in_date: string; // yyyy-mm-dd
  check_out_date: string; // yyyy-mm-dd
  number_of_guests: number;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// ------------------------------
// Data Fetchers for React Query
// ------------------------------
const fetchFeaturedVillas = async (): Promise<VillaSummary[]> => {
  const { data } = await axios.get(`${API_BASE}/villas/featured`);
  // OpenAPI: { villas: VillaSummary[] }
  return data.villas;
};

const fetchSearchSuggestions = async (query: string): Promise<string[]> => {
  if (!query || !query.length) return [];
  const { data } = await axios.get(`${API_BASE}/search/suggestions`, {
    params: { query },
  });
  // OpenAPI: { suggestions: string[] }
  return data.suggestions;
};

// ------------------------------
// The UV_HomeLanding Component
// ------------------------------
const UV_HomeLanding: React.FC = () => {
  // Global state hydration (Zustand)
  const user = useAppStore((s) => s.user);
  const search_query = useAppStore((s) => s.search_query);

  // If user is admin, redirect away to /admin
  const navigate = useNavigate();
  useEffect(() => {
    if (user && user.role === "admin") {
      navigate("/admin", { replace: true });
    }
  }, [user, navigate]);

  // Local state for the hero search bar
  const [searchInput, setSearchInput] = useState<SearchInput>({
    location: search_query?.location || "",
    check_in_date: search_query?.check_in_date || "",
    check_out_date: search_query?.check_out_date || "",
    number_of_guests: search_query?.number_of_guests || 1,
  });
  // Local for location search suggestions (dropdown)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const suggestionDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Use React Query to load featured villas
  const { data: featuredVillas, isLoading, isError, error } = useQuery<VillaSummary[], Error>({
    queryKey: ["featured_villas"],
    queryFn: fetchFeaturedVillas,
    staleTime: 3 * 60 * 1000, // 3 minutes
    refetchOnWindowFocus: false,
  });

  // Recent searches/state: for MVP just use last search_query from Zustand if user authed
  const recentSearches =
    user && search_query && search_query.location
      ? [
          {
            location: search_query.location,
            check_in_date: search_query.check_in_date,
            check_out_date: search_query.check_out_date,
            number_of_guests: search_query.number_of_guests,
          },
        ]
      : [];

  // "Become a Host" CTA: show if not user or user.role==="guest"
  const showBecomeHostCta = !user || (user.role === "guest");

  // Handle location input (autocomplete with debounce)
  useEffect(() => {
    if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current);
    if (!searchInput.location || searchInput.location.trim().length < 2) {
      setSuggestions([]);
      setSuggestionsVisible(false);
      return;
    }
    setSuggestionLoading(true);
    suggestionDebounceRef.current = setTimeout(async () => {
      try {
        const suggs = await fetchSearchSuggestions(searchInput.location.trim());
        setSuggestions(suggs);
        setSuggestionsVisible(!!suggs.length);
      } catch {
        setSuggestions([]);
        setSuggestionsVisible(false);
      } finally {
        setSuggestionLoading(false);
      }
    }, 300); // debounce ms
    // eslint-disable-next-line
  }, [searchInput.location]);

  // Hide suggestions on outside click
  const locationInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (locationInputRef.current && !locationInputRef.current.contains(e.target as Node)) {
        setSuggestionsVisible(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search submit handler
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.location) return;
    // Persist search_query to global store (hydration for later flows)
    useAppStore.getState().set_search_query({
      ...search_query,
      location: searchInput.location,
      check_in_date: searchInput.check_in_date,
      check_out_date: searchInput.check_out_date,
      number_of_guests: searchInput.number_of_guests ?? 1,
    });
    // Navigate to /search with search params as query string
    const paramsArr = [
      ["location", searchInput.location],
      ...(searchInput.check_in_date ? [["check_in", searchInput.check_in_date]] : []),
      ...(searchInput.check_out_date ? [["check_out", searchInput.check_out_date]] : []),
      ...(searchInput.number_of_guests ? [["number_of_guests", searchInput.number_of_guests.toString()]] : []),
    ];
    const searchQs = "?" + paramsArr.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    navigate(`/search${searchQs}`);
  };

  // Input change handler (for controlled fields)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSearchInput((prev) => ({
      ...prev,
      [name]: name === "number_of_guests" ? Number(value) : value,
    }));
  };

  // Suggestion click handler
  const handleSuggestionClick = (suggestion: string) => {
    setSearchInput((prev) => ({ ...prev, location: suggestion }));
    setSuggestionsVisible(false);
  };

  // "Become a Host" CTA handler (navigates to onboarding)
  const handleHostCtaClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // If not logged in, go to signup first, else direct to host onboarding
    if (!user) {
      navigate("/signup?host=1");
    } else {
      navigate("/host/listings/new");
    }
  };

  // Visually rich info blocks
  const infoBlocks = [
    {
      title: "Curated & Unique",
      desc: "Hand-picked beach villas worldwide, with authentic reviews and high-quality amenities.",
      icon: "🏖️",
    },
    {
      title: "Trust & Safety",
      desc: "Verified hosts and secure payment for a worry-free getaway. Full support every step of the way.",
      icon: "🤝",
    },
    {
      title: "Instant or Flexible",
      desc: "Book instantly or send a request – choose what works best for your holiday.",
      icon: "⚡",
    },
    {
      title: "Host Support",
      desc: "List your villa and get exposure to travelers seeking dream beach homes. We'll help you optimize earnings.",
      icon: "💼",
    },
  ];

  return (
    <>
      {/* HERO & SEARCH */}
      <div className="relative bg-gradient-to-r from-sky-100/80 to-blue-200/70 min-h-[420px] flex flex-col lg:flex-row justify-center items-center px-4 pt-10 pb-8">
        <div className="max-w-2xl w-full mx-auto z-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-blue-800 mb-4 drop-shadow-sm text-center">
            Your Dream Beach Villa Awaits
          </h1>
          <p className="text-xl md:text-2xl text-blue-800/80 mb-8 text-center">
            Find, book, and relax in beautiful beach houses around the world.
          </p>
          <form className="bg-white rounded-lg shadow-lg px-4 py-5 grid grid-cols-1 md:grid-cols-4 gap-y-3 md:gap-x-4 mb-4"
                onSubmit={handleSearchSubmit} autoComplete="off">
            {/* LOCATION Input w/ autocomplete */}
            <div className="flex flex-col relative">
              <label htmlFor="location" className="text-xs font-medium text-gray-500 mb-1">
                Location
              </label>
              <input
                ref={locationInputRef}
                name="location"
                id="location"
                type="text"
                className="w-full border rounded-md px-2 py-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                value={searchInput.location}
                onChange={handleInputChange}
                placeholder="e.g., Santorini, Miami Beach..."
                autoComplete="off"
                onFocus={() => setSuggestionsVisible(suggestions.length > 0)}
                aria-autocomplete="list"
                aria-controls="location-autocomplete"
              />
              {suggestionsVisible && (
                <ul id="location-autocomplete" className="absolute left-0 top-full mt-1 w-full bg-white border shadow-lg z-20 rounded-md max-h-44 overflow-auto">
                  {suggestionLoading ? (
                    <li className="px-3 py-2 text-blue-500 text-sm flex items-center">Loading...</li>
                  ) : suggestions.length ? (
                    suggestions.map((s, idx) => (
                      <li
                        key={s + idx}
                        className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-base"
                        tabIndex={0}
                        onClick={() => handleSuggestionClick(s)}
                      >
                        {s}
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-2 text-gray-400 text-sm">No matches</li>
                  )}
                </ul>
              )}
            </div>
            {/* CHECK IN */}
            <div className="flex flex-col">
              <label htmlFor="check_in_date" className="text-xs font-medium text-gray-500 mb-1">
                Check-in
              </label>
              <input
                name="check_in_date"
                id="check_in_date"
                type="date"
                className="w-full border rounded-md px-2 py-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                value={searchInput.check_in_date}
                min={new Date().toISOString().split("T")[0]}
                onChange={handleInputChange}
                />
            </div>
            {/* CHECK OUT */}
            <div className="flex flex-col">
              <label htmlFor="check_out_date" className="text-xs font-medium text-gray-500 mb-1">
                Check-out
              </label>
              <input
                name="check_out_date"
                id="check_out_date"
                type="date"
                className="w-full border rounded-md px-2 py-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                value={searchInput.check_out_date}
                min={searchInput.check_in_date || new Date().toISOString().split("T")[0]}
                onChange={handleInputChange}
              />
            </div>
            {/* GUESTS */}
            <div className="flex flex-col">
              <label htmlFor="number_of_guests" className="text-xs font-medium text-gray-500 mb-1">
                Guests
              </label>
              <input
                name="number_of_guests"
                id="number_of_guests"
                type="number"
                className="w-full border rounded-md px-2 py-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                value={searchInput.number_of_guests}
                min={1}
                max={20}
                onChange={handleInputChange}
              />
            </div>
            {/* SUBMIT */}
            <button
              type="submit"
              aria-label="Search for villas"
              className="col-span-full md:col-span-4 mt-2 md:mt-0 bg-blue-700 hover:bg-blue-800 rounded-lg py-2 px-6 text-white font-semibold shadow-lg transition-all duration-150 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Search Villas
            </button>
          </form>
          {/* Recent Searches / Dashboard Quick Link */}
          <div className="flex items-center justify-between mt-2">
            {user && recentSearches.length > 0 && (
              <div className="flex items-center space-x-2 text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                <span className="font-semibold">Recent search:</span>
                <span>
                  {recentSearches[0].location}
                  {recentSearches[0].check_in_date
                    ? ` • ${recentSearches[0].check_in_date} to ${recentSearches[0].check_out_date || "?"}`
                    : ""}
                  {recentSearches[0].number_of_guests
                    ? ` • ${recentSearches[0].number_of_guests} guest${recentSearches[0].number_of_guests > 1 ? "s" : ""}`
                    : ""}
                </span>
              </div>
            )}
            {user && (
              <Link
                to={user.role === "host" || user.role === "guest_host" ? "/host/listings" : "/dashboard"}
                className="ml-auto text-blue-700 underline font-medium transition hover:text-blue-900 text-sm"
              >
                {user.role === "host" || user.role === "guest_host"
                  ? "Go to Host Dashboard"
                  : "Go to Dashboard"}
              </Link>
            )}
          </div>
        </div>
        {/* Hero background image on larger screens (for "richness") */}
        <div
          className="hidden lg:block absolute top-0 right-0 w-2/5 h-full bg-cover bg-right rounded-bl-3xl shadow-lg"
          style={{ backgroundImage: 'url("https://picsum.photos/seed/beachvilla-hero/800/600")', minHeight: '420px' }}
          aria-label="Hero background beach house"
        />
      </div>

      {/* FEATURED VILLA CAROUSEL */}
      <section className="max-w-7xl w-full mx-auto py-8 px-4">
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-blue-900 flex items-center">
          Featured Villas
        </h2>
        {isLoading ? (
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-blue-100 rounded-lg h-[290px] w-[240px]" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-red-700 bg-red-50 border border-red-300 rounded p-4 mb-4">
            Sorry, we couldn't load featured villas at this time.
          </div>
        ) : featuredVillas && featuredVillas.length > 0 ? (
          <div
            className="flex overflow-x-auto gap-5 py-2"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#2563eb #e0e7ef" }}
          >
            {featuredVillas.map((villa) => (
              <Link
                to={`/villa/${villa.villa_id}`}
                key={villa.villa_id}
                className="bg-white shadow-md rounded-xl w-60 flex-shrink-0 hover:ring-2 hover:ring-blue-300 transition-transform duration-150 hover:scale-105"
                tabIndex={0}
              >
                {/* Villa Image */}
                <div className="h-40 w-full rounded-t-xl overflow-hidden bg-blue-200">
                  <img
                    src={villa.cover_photo_url || `https://picsum.photos/seed/villa${villa.villa_id}/400/250`}
                    alt={villa.name}
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
                {/* Villa Info */}
                <div className="p-4 pb-2 flex flex-col">
                  <div className="flex items-center">
                    <span className="font-bold text-lg text-blue-800 truncate">{villa.name}</span>
                    {villa.is_instant_book && (
                      <span className="ml-2 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold">Instant Book</span>
                    )}
                  </div>
                  <span className="text-sm text-gray-500 truncate">
                    {villa.city}, {villa.country}
                  </span>
                  <div className="flex items-center text-sm my-2 gap-2">
                    <span className="font-semibold text-blue-900">${villa.price_per_night}</span>
                    <span className="text-xs text-gray-400">/night</span>
                    <span className="flex items-center ml-auto gap-0.5 text-yellow-500">
                      <svg width="16" height="16" fill="currentColor" className="inline-block" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.122-6.545L.488 6.91l6.561-.955L10 0l2.951 5.955 6.561.955-4.756 4.635 1.122 6.545z"/></svg>
                      {villa.rating.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-400 ml-0.5">({villa.review_count})</span>
                  </div>
                  <span className="text-xs mt-2 line-clamp-2">{villa.short_description}</span>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {villa.amenities?.slice(0, 4).map(am => (
                      <span
                        key={am.amenity_id}
                        className="inline-flex items-center bg-sky-50 border border-sky-100 text-xs text-sky-700 px-2 py-0.5 rounded-md mr-1 mb-1"
                        title={am.name}
                      >
                        {am.icon_url ? (
                          <img src={am.icon_url} alt={am.name} className="w-4 h-4 mr-1" />
                        ) : null}
                        {am.name}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 py-8">No villas to show right now. Check back soon!</div>
        )}
      </section>

      {/* HOW IT WORKS / INFO BLOCKS */}
      <section className="bg-gradient-to-b from-white to-blue-50 py-12 px-4">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-blue-900 mb-8">
          Why Choose BeachVillas?
        </h2>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          {infoBlocks.map((b) => (
            <div
              key={b.title}
              className="bg-white rounded-lg shadow p-6 flex items-center gap-5 hover:shadow-lg transition"
            >
              <span
                className="text-4xl md:text-5xl select-none drop-shadow"
                aria-hidden="true"
                role="img"
              >
                {b.icon}
              </span>
              <div>
                <div className="font-semibold text-lg text-blue-800 mb-1">{b.title}</div>
                <div className="text-gray-600 text-base">{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
        {/* Become a Host CTA */}
        {showBecomeHostCta && (
          <div className="mx-auto mt-10 p-6 max-w-2xl rounded-xl bg-blue-700 text-white flex flex-col md:flex-row items-center justify-between shadow-lg gap-4">
            <span className="text-xl md:text-2xl font-semibold flex items-center gap-2">
              <span className="text-3xl" role="img" aria-label="host">🏡</span>
              Have a beach villa to share?
            </span>
            <button
              onClick={handleHostCtaClick}
              className="bg-white text-blue-700 font-bold px-6 py-3 rounded-lg shadow transition-all hover:bg-blue-50 hover:text-blue-900 text-lg mt-3 md:mt-0"
            >
              Become a Host
            </button>
          </div>
        )}
      </section>
    </>
  );
};

export default UV_HomeLanding;