import React, { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { Link, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
// TypeScript types (can be replaced/imported from @schema if available)
type Amenity = {
  amenity_id: string;
  name: string;
  icon_url: string | null;
  key: string;
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

type VillaListResponse = {
  villas: VillaSummary[];
  total: number;
  page: number;
  page_size: number;
};

// ErrorBoundary inline (fallback and error logging)
class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[SearchResults Error]", error, info);
    }
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Helper: number to $ price formatting
const formatPrice = (n: number) =>
  n
    ? n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "-";

// Helper: mini star rating
function StarRating({ value, count = 5 }: { value: number; count?: number }) {
  const rounded = Math.round(value * 2) / 2; // .5 steps
  return (
    <span className="inline-flex items-center gap-0.5 text-yellow-500">
      {Array.from({ length: count }).map((_, i) => {
        if (rounded >= i + 1) {
          return (
            <svg key={i} width={16} height={16} className="inline" fill="currentColor" viewBox="0 0 20 20"><title>star</title><path d="M10 15l-5.878 3.09 1.122-6.545-4.756-4.634 6.574-.955L10 0l2.938 5.956 6.575.955-4.756 4.634 1.121 6.545z"/></svg>
          );
        } else if (rounded >= i + 0.5) {
          return (
            <svg key={i} width={16} height={16} className="inline" fill="currentColor" viewBox="0 0 20 20"><title>star-half</title><path d="M10 15l-5.878 3.09 1.122-6.545-4.756-4.634 6.574-.955L10 0z"/><path fill="#e5e7eb" d="M10 0v15l5.878 3.09-1.121-6.545 4.756-4.634-6.574-.955z"/></svg>
          );
        } else {
          return (
            <svg key={i} width={16} height={16} className="inline" fill="#e5e7eb" viewBox="0 0 20 20"><title>star-empty</title><path d="M10 15l-5.878 3.09 1.122-6.545-4.756-4.634 6.574-.955L10 0l2.938 5.956 6.575.955-4.756 4.634 1.121 6.545z"/></svg>
          );
        }
      })}
    </span>
  );
}

// Map for amenity key : display label
const DEFAULT_AMENITIES: Record<string, string> = {
  wifi: "WiFi",
  pool: "Pool",
  kitchen: "Kitchen",
  parking: "Parking",
  ac: "A/C",
  sea_view: "Sea View",
  pet_friendly: "Pet Friendly",
  tv: "TV",
  breakfast: "Breakfast",
};

const MAP_WIDTH = 420;
const MAP_HEIGHT = 440;

const UV_SearchResults: React.FC = () => {
  // Zustand store: access only individual keys, never group destructure
  const user = useAppStore((s) => s.user);
  const globalSearchQuery = useAppStore((s) => s.search_query);
  const setGlobalSearchQuery = useAppStore((s) => s.set_search_query);

  // Routing
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const locationUrlObj = useLocation();

  // Internal state for filters UI
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedMapVilla, setSelectedMapVilla] = useState<string | null>(null);
  const [mapViewport, setMapViewport] = useState({ latitude: 0, longitude: 0, zoom: 10 });
  const [page, setPage] = useState(1); // for API pagination
  const [pageSize] = useState(18);

  // Amenity options for sidebar filter
  const { data: amenitiesOptions } = useQuery<Amenity[]>({
    queryKey: ["amenities"],
    queryFn: async () => {
      const url = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/amenities`;
      const { data } = await axios.get(url);
      return data as Amenity[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // -- Compute/parse search params (URL -> backend) --
  const filterState = useMemo(() => {
    const paramsObj: any = {};
    for (const [key, value] of searchParams.entries()) {
      if (value !== undefined && value !== "") {
        if (key === "amenities") {
          paramsObj.amenities = value.split(",").filter((x) => !!x);
        } else if (["price_min", "price_max", "number_of_guests", "rating"].includes(key)) {
          paramsObj[key] = Number(value);
        } else if (key === "instant_book") {
          paramsObj.instant_book = value === "true" || value === "1";
        } else {
          paramsObj[key] = value;
        }
      }
    }
    // Defaults
    if (!paramsObj.number_of_guests) paramsObj.number_of_guests = 1;
    if (!paramsObj.sort) paramsObj.sort = "popularity";
    // Map check_in/check_out to blank if missing
    if (!paramsObj.check_in) paramsObj.check_in = "";
    if (!paramsObj.check_out) paramsObj.check_out = "";
    if (!paramsObj.price_min) paramsObj.price_min = "";
    if (!paramsObj.price_max) paramsObj.price_max = "";

    return paramsObj as {
      location: string;
      check_in?: string;
      check_out?: string;
      number_of_guests?: number;
      amenities?: string[];
      price_min?: number | string;
      price_max?: number | string;
      instant_book?: boolean;
      rating?: number;
      sort?: string;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  // Initial sync with global search context, and vice versa
  useEffect(() => {
    // On searchParams change, set global search query
    // NOTE: Do not clobber params for non-search routes!
    if (locationUrlObj.pathname === "/search") {
      setGlobalSearchQuery({
        location: filterState.location || "",
        check_in_date: filterState.check_in || "",
        check_out_date: filterState.check_out || "",
        number_of_guests: filterState.number_of_guests || 1,
        amenities: filterState.amenities || [],
        price_min: filterState.price_min ? Number(filterState.price_min) : null,
        price_max: filterState.price_max ? Number(filterState.price_max) : null,
        instant_book: typeof filterState.instant_book === "boolean" ? filterState.instant_book : null,
        rating: filterState.rating || null,
        sort_by: filterState.sort || "popularity",
      });
    }
    // eslint-disable-next-line
  }, [searchParams.toString()]);

  // --- Fetch Villas with query ---
  const { data, isLoading, isError, error, refetch } = useQuery<VillaListResponse, any>({
    queryKey: [
      "search_villas",
      filterState.location,
      filterState.check_in,
      filterState.check_out,
      filterState.number_of_guests,
      (filterState.amenities || []).join(","),
      filterState.price_min,
      filterState.price_max,
      filterState.instant_book,
      filterState.rating,
      filterState.sort,
      page, // must be part of key for pagination
      pageSize,
    ],
    queryFn: async () => {
      // Compose params for backend
      const params: Record<string, any> = {
        location: filterState.location,
        check_in: filterState.check_in || undefined,
        check_out: filterState.check_out || undefined,
        number_of_guests: filterState.number_of_guests || 1,
        sort: filterState.sort || "popularity",
        page,
        page_size: pageSize,
      };
      if (filterState.amenities && filterState.amenities.length > 0) {
        params.amenities = filterState.amenities.join(",");
      }
      if (filterState.price_min) params.price_min = filterState.price_min;
      if (filterState.price_max) params.price_max = filterState.price_max;
      if (filterState.instant_book !== undefined) params.instant_book = filterState.instant_book;
      if (filterState.rating) params.rating = filterState.rating;
      // API call
      const url = `${
        import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
      }/search`;
      const { data } = await axios.get(url, { params });
      return data as VillaListResponse;
    },
    keepPreviousData: true,
  });

  // Derive: total, villas, empty state
  const villas = data?.villas || [];
  const total = data?.total || 0;
  const emptyState = !isLoading && !isError && (!villas || villas.length === 0);
  // Compute min/max lat/lon for map grid
  const {
    mapMinLat,
    mapMaxLat,
    mapMinLon,
    mapMaxLon,
    mapCenterLat,
    mapCenterLon,
  } = useMemo(() => {
    if (!villas || villas.length === 0)
      return {
        mapMinLat: 0,
        mapMaxLat: 0,
        mapMinLon: 0,
        mapMaxLon: 0,
        mapCenterLat: 0,
        mapCenterLon: 0,
      };
    const lats = villas.map((v) => Number(v.latitude));
    const lons = villas.map((v) => Number(v.longitude));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    return {
      mapMinLat: minLat,
      mapMaxLat: maxLat,
      mapMinLon: minLon,
      mapMaxLon: maxLon,
      mapCenterLat: centerLat,
      mapCenterLon: centerLon,
    };
  }, [villas]);

  // On result change, update map viewport to center
  useEffect(() => {
    if (villas && villas.length) {
      setMapViewport({ latitude: mapCenterLat, longitude: mapCenterLon, zoom: 10 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapCenterLat, mapCenterLon, data?.total]);

  // Handle filter 
  // -----------------
  function onFilterChange(next: Record<string, any>) {
    // Next can be a full filterState; produce proper searchParams object
    const params: Record<string, string> = {};
    for (const key of [
      "location",
      "check_in",
      "check_out",
      "number_of_guests",
      "amenities",
      "price_min",
      "price_max",
      "instant_book",
      "rating",
      "sort",
    ]) {
      if (next[key] !== null && next[key] !== undefined && next[key] !== "") {
        if (key === "amenities" && Array.isArray(next[key]) && next[key].length > 0) {
          params.amenities = next.amenities.join(",");
        } else if (key === "instant_book") {
          params.instant_book = next.instant_book ? "true" : "false";
        } else {
          params[key] = String(next[key]);
        }
      }
    }
    // Do not set page unless filters change (reset to page 1)
    setSearchParams(params, { replace: false });
    setPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Handle pagination (prev/next)
  const pageCount = data?.total ? Math.ceil(data.total / (data.page_size || pageSize)) : 1;

  // --- Form filters sidebar values ---
  const [filterDraft, setFilterDraft] = useState<any>(() => ({
    location: filterState.location || "",
    check_in: filterState.check_in || "",
    check_out: filterState.check_out || "",
    number_of_guests: filterState.number_of_guests || 1,
    amenities: filterState.amenities || [],
    price_min: filterState.price_min || "",
    price_max: filterState.price_max || "",
    instant_book: filterState.instant_book || false,
    rating: filterState.rating || "",
    sort: filterState.sort || "popularity",
  }));

  // Keep filterDraft sync if URL filters change outside of UI
  useEffect(() => {
    setFilterDraft({
      location: filterState.location || "",
      check_in: filterState.check_in || "",
      check_out: filterState.check_out || "",
      number_of_guests: filterState.number_of_guests || 1,
      amenities: filterState.amenities || [],
      price_min: filterState.price_min || "",
      price_max: filterState.price_max || "",
      instant_book: filterState.instant_book || false,
      rating: filterState.rating || "",
      sort: filterState.sort || "popularity",
    });
    // eslint-disable-next-line
  }, [filterState, amenitiesOptions?.length]);

  // Handlers for filter UI controls
  const onSidebarInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox" && name === "amenities") {
      setFilterDraft((prev: any) => {
        let nextAms = prev.amenities ? [...prev.amenities] : [];
        if (checked) {
          nextAms.push(value);
        } else {
          nextAms = nextAms.filter((k: string) => k !== value);
        }
        return { ...prev, amenities: nextAms };
      });
    } else if (type === "checkbox" && name === "instant_book") {
      setFilterDraft((prev: any) => ({
        ...prev,
        instant_book: checked,
      }));
    } else if (type === "number") {
      setFilterDraft((prev: any) => ({
        ...prev,
        [name]: Number(value),
      }));
    } else {
      setFilterDraft((prev: any) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // On filter sidebar "Apply Filters"
  function onApplyFilters(e?: React.FormEvent) {
    if (e) e.preventDefault();
    onFilterChange(filterDraft);
    setFiltersOpen(false);
  }

  // On sort dropdown change
  function onSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setFilterDraft((prev: any) => ({
      ...prev,
      sort: e.target.value,
    }));
    // Quick-apply sort immediately
    onFilterChange({ ...filterState, sort: e.target.value });
  }

  // Map pin/hover
  function handleMapVillaHover(id: string | null) {
    setSelectedMapVilla(id);
  }

  // When villa card is hovered/focused, highlight on map
  function handleCardHover(villa_id: string | null) {
    setSelectedMapVilla(villa_id);
  }

  // When villa card or marker is clicked, go to detail
  function handleCardClick(villa_id: string) {
    navigate(`/villa/${villa_id}`);
  }

  // Convert lat/lon to position for minimal static map (within grid)
  function latLonToXY(lat: number, lon: number) {
    // Clamp if only one point
    let x = 0.5,
      y = 0.5;
    if (mapMinLon !== mapMaxLon)
      x = (lon - mapMinLon) / (mapMaxLon - mapMinLon);
    if (mapMinLat !== mapMaxLat)
      y = 1 - (lat - mapMinLat) / (mapMaxLat - mapMinLat);
    // Avoid NaN
    return {
      x: Math.max(0, Math.min(1, x)) * (MAP_WIDTH - 40) + 20,
      y: Math.max(0, Math.min(1, y)) * (MAP_HEIGHT - 40) + 20,
    };
  }

  // Focus first result on filter apply
  const firstCardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (firstCardRef.current) {
      firstCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [villas]);

  // Responsive: detect mobile to auto open/close filters
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 1024);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // -- RENDER --
  return (
    <>
      <div className="w-full bg-white border-b px-0 lg:px-8 py-3 flex flex-col sticky top-0 z-20 shadow-sm">
        {/* TOP SEARCH BAR SECTION */}
        <form
          className="flex flex-col md:flex-row gap-2 items-start md:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            onApplyFilters();
          }}
        >
          <input
            type="text"
            className="px-3 py-2 border rounded-md w-full md:w-72 text-base"
            name="location"
            placeholder="Where do you want to go?"
            required
            value={filterDraft.location}
            onChange={onSidebarInput}
            autoComplete="off"
          />
          <input
            type="date"
            className="px-3 py-2 border rounded-md w-36"
            name="check_in"
            value={filterDraft.check_in}
            onChange={onSidebarInput}
          />
          <input
            type="date"
            className="px-3 py-2 border rounded-md w-36"
            name="check_out"
            value={filterDraft.check_out}
            onChange={onSidebarInput}
          />
          <input
            type="number"
            name="number_of_guests"
            min="1"
            max="20"
            className="px-3 py-2 border rounded-md w-24"
            placeholder="Guests"
            value={filterDraft.number_of_guests}
            onChange={onSidebarInput}
          />
          <button
            type="submit"
            className="bg-sky-700 hover:bg-sky-800 transition text-white font-semibold px-6 py-2 rounded-md ml-0 md:ml-2"
            aria-label="Search villas"
          >
            Search
          </button>
          <button
            type="button"
            aria-label="Toggle filters sidebar"
            onClick={() => setFiltersOpen((v) => !v)}
            className="ml-0 md:ml-2 text-sky-700 font-medium border border-sky-700 px-4 py-2 rounded-md md:hidden"
          >
            {filtersOpen ? "Hide Filters" : "Filters"}
          </button>
        </form>
        {/* SORT dropdown */}
        <div className="mt-3 flex justify-between items-center">
          <span className="text-gray-600 font-medium">
            {isLoading ? (
              <>Loading search...</>
            ) : emptyState ? (
              <>No results</>
            ) : (
              <>
                {total} villa{total === 1 ? "" : "s"} found
                {filterState.location && (
                  <>
                    {" "}
                    for <span className="font-semibold">{filterState.location}</span>
                  </>
                )}
              </>
            )}
          </span>
          <label className="flex gap-2 items-center">
            <span className="text-gray-500">Sort by:</span>
            <select
              className="border px-2 py-1 rounded"
              value={filterDraft.sort}
              name="sort"
              onChange={onSortChange}
            >
              <option value="popularity">Popularity</option>
              <option value="price_asc">Price (low-high)</option>
              <option value="price_desc">Price (high-low)</option>
              <option value="rating">Rating</option>
            </select>
          </label>
        </div>
      </div>
      {/* LAYOUT (sidebar + results + map) */}
      <div className="relative flex flex-row min-h-[55vh] w-full bg-neutral-50">
        {/* SIDEBAR - only on desktop or if toggled on mobile */}
        {(filtersOpen || !isMobile) && (
          <aside className="min-w-[230px] max-w-[290px] w-[30vw] bg-white border-r px-5 py-8 flex flex-col gap-5 sticky top-[84px] z-20">
            <h2 className="text-xl font-bold mb-2">Filters</h2>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                onApplyFilters();
              }}
            >
              <div>
                <label className="block font-medium text-gray-700 mb-1">Price / night</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    name="price_min"
                    className="border rounded px-2 py-1 w-20"
                    placeholder="Min"
                    min="0"
                    max="25000"
                    value={filterDraft.price_min}
                    onChange={onSidebarInput}
                  />
                  <span className="self-center text-gray-400">–</span>
                  <input
                    type="number"
                    name="price_max"
                    className="border rounded px-2 py-1 w-20"
                    placeholder="Max"
                    min="0"
                    max="25000"
                    value={filterDraft.price_max}
                    onChange={onSidebarInput}
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Amenities</label>
                <div className="grid grid-cols-2 gap-y-2">
                  {amenitiesOptions &&
                    amenitiesOptions.map((am) => (
                      <label key={am.key} className="flex items-center gap-2 text-sm font-normal">
                        <input
                          type="checkbox"
                          name="amenities"
                          value={am.key}
                          checked={filterDraft.amenities?.includes(am.key)}
                          onChange={onSidebarInput}
                        />
                        <span>
                          {am.icon_url && (
                            <img
                              src={am.icon_url}
                              className="inline-block w-5 h-5 mr-1 align-middle"
                              alt=""
                              aria-hidden="true"
                            />
                          )}
                          {am.name}
                        </span>
                      </label>
                    ))}
                  {/* fallback common keys */}
                  {!amenitiesOptions &&
                    Object.entries(DEFAULT_AMENITIES).map(([k, v]) => (
                      <label key={k} className="flex items-center gap-2 text-sm font-normal">
                        <input
                          type="checkbox"
                          name="amenities"
                          value={k}
                          checked={filterDraft.amenities?.includes(k)}
                          onChange={onSidebarInput}
                        />
                        <span>{v}</span>
                      </label>
                    ))}
                </div>
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Rating</label>
                <select
                  className="border rounded px-2 py-1 w-full"
                  name="rating"
                  value={filterDraft.rating}
                  onChange={onSidebarInput}
                >
                  <option value="">Any</option>
                  {[5, 4, 3, 2, 1].map((v) => (
                    <option value={v} key={v}>
                      {v}+
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-row items-center justify-between">
                <label className="font-medium text-gray-700">Instant book</label>
                <input
                  type="checkbox"
                  name="instant_book"
                  checked={!!filterDraft.instant_book}
                  onChange={onSidebarInput}
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Max guests</label>
                <input
                  type="number"
                  className="border rounded px-2 py-1 w-full"
                  min={1}
                  max={24}
                  name="number_of_guests"
                  value={filterDraft.number_of_guests}
                  onChange={onSidebarInput}
                />
              </div>
              <button
                type="submit"
                className="bg-sky-700 hover:bg-sky-800 text-white font-bold mt-2 py-2 rounded w-full"
              >
                Apply filters
              </button>
              {isMobile && (
                <button
                  type="button"
                  className="text-sky-700 font-semibold hover:underline mt-1"
                  onClick={() => setFiltersOpen(false)}
                >
                  Close
                </button>
              )}
            </form>
          </aside>
        )}

        {/* MAIN RESULTS + MAP */}
        <main className="flex-1 flex flex-col-reverse lg:flex-row gap-4 px-2 md:px-8 py-4 lg:py-8">
          {/* Results List */}
          <section className="w-full lg:w-[52%] xl:w-[56%] flex flex-col gap-5">
            {isLoading && (
              <div className="py-16 flex justify-center items-center w-full">
                <svg className="animate-spin h-8 w-8 text-sky-700" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" className="opacity-75" /></svg>
                <span className="ml-3 text-lg font-medium text-gray-700">Searching for villas...</span>
              </div>
            )}
            {isError && (
              <div className="p-8 border border-red-300 bg-red-50 rounded text-red-700 text-center my-8 font-semibold">
                Failed to load search results. Please try again later.
                <br />
                <button
                  className="mt-3 bg-sky-700 hover:bg-sky-800 text-white font-bold py-2 px-5 rounded"
                  onClick={() => refetch()}
                >
                  Retry
                </button>
              </div>
            )}
            {!isLoading && !isError && emptyState && (
              <div className="flex flex-col items-center py-16">
                <img alt="" src="https://cdn-icons-png.flaticon.com/512/4304/4304609.png" className="w-24 h-24 mb-4 opacity-80" />
                <div className="text-xl font-semibold mb-2">No villas found</div>
                <div className="mb-2 text-gray-500">Try different dates, location or relax your filters.</div>
                <button
                  className="bg-sky-700 text-white font-semibold px-6 py-2 rounded-md mt-2"
                  onClick={() => {
                    setSearchParams({}, { replace: false });
                    setPage(1);
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
            {!isLoading && !isError && villas && villas.length > 0 && (
              <div className="flex flex-col gap-6">
                {villas.map((villa, i) => (
                  <div
                    key={villa.villa_id}
                    ref={i === 0 ? firstCardRef : null}
                    className={`flex flex-row cursor-pointer rounded-xl overflow-hidden border items-stretch bg-white shadow transition
                      group ${selectedMapVilla === villa.villa_id ? "ring-2 ring-sky-500" : "hover:ring-2 hover:ring-sky-400"}
                    `}
                    tabIndex={0}
                    aria-label={`View details for ${villa.name}`}
                    onMouseEnter={() => handleCardHover(villa.villa_id)}
                    onMouseLeave={() => handleCardHover(null)}
                    onFocus={() => handleCardHover(villa.villa_id)}
                    onBlur={() => handleCardHover(null)}
                    onClick={() => handleCardClick(villa.villa_id)}
                  >
                    {/* Photo */}
                    <div
                      className="w-1/3 bg-gray-200 min-h-[172px] flex-shrink-0 flex items-center"
                      style={{ minWidth: 164, maxWidth: 220 }}
                    >
                      <img
                        alt={`${villa.name} cover`}
                        src={villa.cover_photo_url || `https://picsum.photos/seed/${villa.villa_id}/300/200`}
                        className="object-cover w-full h-full block"
                        loading="lazy"
                      />
                    </div>
                    {/* Main content */}
                    <div className="flex flex-col justify-between px-4 py-3 w-2/3">
                      <div>
                        <div className="flex gap-1.5 mb-0.5 items-center">
                          {villa.is_instant_book && (
                            <span className="text-xs px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full border border-sky-200 font-semibold mr-2">Instant book</span>
                          )}
                          <span className="font-bold text-lg truncate">{villa.name}</span>
                          <span className="text-xs ml-2 text-gray-500">
                            {villa.city}, {villa.country}
                          </span>
                        </div>
                        <div className="text-gray-600 text-sm truncate">
                          {villa.short_description}
                        </div>
                        <div className="flex gap-3 mt-1 items-center">
                          <StarRating value={villa.rating} />
                          <span className="text-xs text-gray-500">{villa.review_count} review{villa.review_count === 1 ? "" : "s"}</span>
                        </div>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {villa.amenities.slice(0, 4).map((am) => (
                            <span key={am.key} className="text-xs text-gray-700 px-2 py-0.5 bg-gray-100 rounded-full flex items-center gap-1">
                              {am.icon_url ? (
                                <img
                                  src={am.icon_url}
                                  alt=""
                                  className="w-4 h-4 inline-block align-middle"
                                />
                              ) : null}
                              {am.name}
                            </span>
                          ))}
                          {villa.amenities.length > 4 && (
                            <span className="text-xs text-gray-400">+{villa.amenities.length - 4}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-end mt-2">
                        <div>
                          <span className="text-base font-bold text-sky-700">{formatPrice(villa.price_per_night)}</span>
                          <span className="text-xs text-gray-500"> /night</span>
                        </div>
                        <span className="text-xs flex items-center gap-1 text-gray-500 ml-2">
                          Host:
                          {villa.host.profile_photo_url ? (
                            <img
                              src={villa.host.profile_photo_url}
                              className="w-6 h-6 rounded-full ml-1"
                              alt={villa.host.name}
                            />
                          ) : (
                            <span className="inline-block w-6 h-6 bg-gray-300 rounded-full ml-1" />
                          )}
                          {villa.host.name}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Pagination */}
                {pageCount > 1 && (
                  <div className="flex justify-center gap-4 items-center mt-6">
                    <button
                      className="py-2 px-5 bg-gray-200 hover:bg-gray-300 rounded font-semibold disabled:opacity-40"
                      disabled={page <= 1}
                      onClick={() => {
                        setPage((p) => Math.max(1, p - 1));
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-700 font-bold">
                      Page {page} of {pageCount}
                    </span>
                    <button
                      className="py-2 px-5 bg-gray-200 hover:bg-gray-300 rounded font-semibold disabled:opacity-40"
                      disabled={page >= pageCount}
                      onClick={() => {
                        setPage((p) => Math.min(pageCount, p + 1));
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
          {/* MAP SECTION */}
          <aside className="w-full lg:w-[44%] xl:w-[40%] min-h-[440px] max-h-[560px]">
            <div className="border rounded-2xl shadow bg-white p-0 relative" style={{ width: MAP_WIDTH, height: MAP_HEIGHT, maxWidth: "98vw", margin: "0 auto" }}>
              <div className="absolute inset-0 z-0 bg-gradient-to-br from-blue-100/40 via-sky-200/20 to-white pointer-events-none" />
              <div className="absolute inset-0 pointer-events-none border-dashed border-2 border-sky-100 rounded-2xl" />
              {/* Pins */}
              {villas &&
                villas.map((villa, i) => {
                  const xy = latLonToXY(Number(villa.latitude), Number(villa.longitude));
                  const highlight = selectedMapVilla === villa.villa_id;
                  return (
                    <div
                      key={villa.villa_id}
                      role="button"
                      aria-label={`Highlight villa ${villa.name} on map`}
                      className="group"
                      tabIndex={0}
                      style={{
                        position: "absolute",
                        left: xy.x - 16,
                        top: xy.y - (highlight ? 30 : 16),
                        zIndex: highlight ? 20 : 10,
                        cursor: "pointer",
                        transition: "all 0.18s",
                      }}
                      onMouseEnter={() => handleMapVillaHover(villa.villa_id)}
                      onMouseLeave={() => handleMapVillaHover(null)}
                      onFocus={() => handleMapVillaHover(villa.villa_id)}
                      onBlur={() => handleMapVillaHover(null)}
                      onClick={() => handleCardClick(villa.villa_id)}
                    >
                      <div className={`w-8 h-8 rounded-full border-2 bg-white flex items-center justify-center shadow
                        ${highlight ? "border-sky-900 scale-125" : "border-sky-600 opacity-60"}
                      `}>
                        <svg width={20} height={20} fill={highlight ? "#0ea5e9" : "#60a5fa"} viewBox="0 0 24 24">
                          <circle cx={12} cy={12} r={8} />
                        </svg>
                      </div>
                      {highlight && (
                        <span className="mt-2 p-2 absolute left-9 top-0 min-w-[140px] rounded-lg bg-white shadow border font-semibold text-xs text-sky-900 z-40">
                          {villa.name}
                          <br />
                          <span className="font-normal text-[11px] text-gray-500">{villa.city}, {villa.country}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
            {/* Map mini-legend */}
            <div className="pt-2 px-2 flex justify-between text-xs text-gray-500">
              <span>Map shows results in this area</span>
              <span>{villas.length} villa{villas.length === 1 ? "" : "s"}</span>
            </div>
          </aside>
        </main>
      </div>
    </>
  );
};

export default UV_SearchResults;