import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { useAppStore } from "@/store/main";

// --- Types from Zod schemas ---
import type { Amenity } from "@schema"; // actually: amenitySchema definition
import type { VillaCreatePayload } from "@schema";

// Fallback for picking amenity types from OpenAPI if TS import doesn't work:
type AmenityType = {
  amenity_id: string;
  key: string;
  name: string;
  icon_url: string;
};

// Photo-type for pre-submit and for POST:
type PhotoInput = {
  photo_url: string;
  sort_order: number;
  caption: string;
};

// Rule input:
type RuleInput = {
  rule_type: string;
  value: string;
};

// Seasonal pricing structure (local, later mapping as a note since no direct API support)
type SeasonalPricing = {
  start: string; // yyyymmdd
  end: string;   // yyyymmdd
  price: number;
};

// Calendar block structure
type CalendarBlock = {
  date: string; // yyyymmdd
  is_available: boolean;
  price_override?: number;
  minimum_stay_override?: number;
  note?: string;
};

// ----------------------------
// Draft save/restore helpers
// ----------------------------
const DRAFT_LOCALSTORAGE_KEY_PREFIX = "beachvillas_create_listing_draft_";

// Util: get user id safe for localstorage key
function getDraftKey(user_id: string) {
  return `${DRAFT_LOCALSTORAGE_KEY_PREFIX}${user_id}`;
}

// Util: YYYY-MM-DD => yyyymmdd
function dateToCompact(date: string) {
  return date.replaceAll("-", "");
}

const UV_Host_CreateListing: React.FC = () => {
  // ------------- GLOBAL APP STATE ------------------
  const user = useAppStore(s => s.user);
  const authToken = useAppStore(s => s.auth_token);
  const setErrorBanner = useAppStore(s => s.set_error_banner);

  const navigate = useNavigate();

  // Check + enforce host role
  useEffect(() => {
    if (!user) {
      navigate("/login");
    } else if (user.role !== "host" && user.role !== "guest_host") {
      setErrorBanner({ message: "Only hosts can create listings.", visible: true });
      navigate("/host/listings");
    }
    // eslint-disable-next-line
  }, [user]);

  // ----------------- STATE: STEP & DATA -----------------------
  const [step, setStep] = useState<number>(0);

  const [basicInfo, setBasicInfo] = useState<{
    name: string;
    address: string;
    city: string;
    country: string;
    latitude: string;
    longitude: string;
    short_description: string;
    long_description: string;
    max_occupancy: number;
  }>({
    name: "",
    address: "",
    city: "",
    country: "",
    latitude: "",
    longitude: "",
    short_description: "",
    long_description: "",
    max_occupancy: 1,
  });

  // Photo state: { photo_url, caption, sort_order }
  const [photos, setPhotos] = useState<PhotoInput[]>([]);

  // Pricing state
  const [pricing, setPricing] = useState<{
    base_price_per_night: number;
    minimum_stay_nights: number;
    is_instant_book: boolean;
    cleaning_fee: number;
    service_fee: number;
    security_deposit: number;
    seasonal_pricing: SeasonalPricing[];
  }>({
    base_price_per_night: 0,
    minimum_stay_nights: 1,
    is_instant_book: true,
    cleaning_fee: 0,
    service_fee: 0,
    security_deposit: 0,
    seasonal_pricing: [],
  });

  // Calendar blocks (blocked dates etc.)
  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlock[]>([]);

  // Amenities selection (amenity keys)
  const [amenities, setAmenities] = useState<string[]>([]);

  // All amenity options loaded from backend
  const [allAmenities, setAllAmenities] = useState<AmenityType[]>([]);

  // Custom rules (e.g. pets, parties, etc.)
  const [rules, setRules] = useState<RuleInput[]>([]);

  // Error state
  const [wizardError, setWizardError] = useState<string>("");
  const [publishError, setPublishError] = useState<string>("");

  // Loading state (only for photo upload mocked here, and publish)
  const [stepLoading, setStepLoading] = useState<boolean>(false);

  // -- "saving draft" flag --
  const [saveDraftMsg, setSaveDraftMsg] = useState<string>("");

  // Ref: last saved draft for change detection
  const lastSavedDraftRef = useRef<string | null>(null);

  // ----------------- AMENITIES FETCH (React Query) ------------------
  const {
    data: amenitiesData,
    isLoading: amenitiesLoading,
    isError: amenitiesError,
    refetch: refetchAmenities,
  } = useQuery<AmenityType[], Error>({
    queryKey: ["all_amenities"],
    queryFn: async () => {
      const res = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/amenities`
      );
      return res.data as AmenityType[];
    },
    enabled: step === 4 || step === 5, // only fetch at amenities/rules steps
  });

  useEffect(() => {
    if ((step === 4 || step === 5) && amenitiesData) {
      setAllAmenities(amenitiesData);
    }
  }, [amenitiesData, step]);

  // ------------- DRAFT SAVE & RESTORE ----------------------
  // Save draft (all-wizard data except error/loading)
  function saveDraft() {
    if (!user) return;
    const payload = {
      step,
      basicInfo,
      photos,
      pricing,
      calendarBlocks,
      amenities,
      rules,
    };
    try {
      localStorage.setItem(getDraftKey(user.user_id), JSON.stringify(payload));
      setSaveDraftMsg("Draft saved!");
      lastSavedDraftRef.current = JSON.stringify(payload);
      setTimeout(() => setSaveDraftMsg(""), 2000);
    } catch (e) {
      setSaveDraftMsg("Failed to save draft.");
    }
  }

  // Restore on mount
  useEffect(() => {
    if (user && !lastSavedDraftRef.current) {
      const draft = localStorage.getItem(getDraftKey(user.user_id));
      if (draft) {
        try {
          const d = JSON.parse(draft);
          if (d && typeof d === "object" && d.basicInfo) {
            setStep(d.step ?? 0);
            setBasicInfo(d.basicInfo);
            setPhotos(d.photos || []);
            setPricing(d.pricing || { ...pricing });
            setCalendarBlocks(d.calendarBlocks || []);
            setAmenities(d.amenities || []);
            setRules(d.rules || []);
            lastSavedDraftRef.current = draft;
          }
        } catch (e) {
          // Ignore
        }
      }
    }
    // eslint-disable-next-line
  }, [user]);

  // "Abandon" listing (wipe draft and go back)
  function abandonListing() {
    if (user) {
      localStorage.removeItem(getDraftKey(user.user_id));
    }
    navigate("/host/listings");
  }

  // --------------- PHOTO UPLOAD ----------------------------
  // Requirements: select up to 20, min 3, reorder, delete, caption edit, upload then save public URL

  // -- for demo: use FileReader and upload to a random picsum.photos url (simulate upload) --
  async function handlePhotoUpload(files: FileList | null) {
    if (!files) return;
    setStepLoading(true);
    // Simulate upload for each
    const toAdd: PhotoInput[] = [];
    for (let i = 0; i < files.length && photos.length + toAdd.length < 20; ++i) {
      const file = files[i];
      // "Upload" -- pick a random `picsum.photos` URL (hash file for pseudo-uniqueness)
      const seed = file.name + file.size + Math.random().toFixed(6);
      const imgUrl = `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`;
      toAdd.push({
        photo_url: imgUrl,
        sort_order: photos.length + toAdd.length, // current appended
        caption: "",
      });
      // Note: In real app, we'd make an upload API call or use a service here
    }
    setPhotos([...photos, ...toAdd]);
    setStepLoading(false);
  }

  function handlePhotoCaption(idx: number, val: string) {
    setPhotos(photos => photos.map((p, i) => (i === idx ? { ...p, caption: val } : p)));
  }

  // Reorder photos (move[up/down])
  function reorderPhoto(from: number, to: number) {
    if (from === to || to < 0 || to >= photos.length) return;
    const arr = photos.slice();
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    // Update sort_order after reorder
    setPhotos(arr.map((p, idx) => ({ ...p, sort_order: idx })));
  }

  function deletePhoto(idx: number) {
    const arr = photos.filter((_, i) => i !== idx);
    setPhotos(arr.map((p, i) => ({ ...p, sort_order: i })));
  }

  // -------------- VALIDATION LOGIC PER STEP ----------------
  function validateStep(): boolean {
    setWizardError("");
    // Stepwise validation
    if (step === 0) {
      // BASIC INFO
      if (
        !basicInfo.name.trim() ||
        !basicInfo.address.trim() ||
        !basicInfo.city.trim() ||
        !basicInfo.country.trim() ||
        !basicInfo.short_description.trim() ||
        !basicInfo.long_description.trim() ||
        !basicInfo.latitude.trim() ||
        !basicInfo.longitude.trim() ||
        !basicInfo.max_occupancy
      ) {
        setWizardError("Please fill all required fields.");
        return false;
      }
    }
    if (step === 1) {
      if (photos.length < 3) {
        setWizardError("Upload a minimum of 3 photos.");
        return false;
      }
    }
    if (step === 2) {
      if (pricing.base_price_per_night <= 0) {
        setWizardError("Base price per night must be greater than 0.");
        return false;
      }
      if (pricing.minimum_stay_nights < 1) {
        setWizardError("Minimum stay must be at least 1 night.");
        return false;
      }
    }
    // Calendar: skip, blocks optional
    if (step === 4) {
      if (amenities.length < 1) {
        setWizardError("Select at least one amenity.");
        return false;
      }
    }
    // All good
    return true;
  }

  // --- On Advance Step ---
  function handleNextStep() {
    if (!validateStep()) return;
    setStepLoading(false);
    setStep(step + 1);
  }

  function handlePrevStep() {
    setWizardError("");
    setStep(Math.max(0, step - 1));
  }

  // ---------- SUBMIT: /villa POST -------------------
  const createVillaMutation = useMutation<
    any, // VillaDetail full object if needed, not used immediately
    Error,
    VillaCreatePayload
  >({
    mutationFn: async (payload: VillaCreatePayload) => {
      if (!authToken) throw new Error("No auth token");
      const res = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/villa`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${authToken.token}`,
            "Content-Type": "application/json",
          },
        }
      );
      return res.data;
    },
    onSuccess: (data) => {
      setPublishError("");
      // Clear draft
      if (user) {
        localStorage.removeItem(getDraftKey(user.user_id));
      }
      navigate("/host/listings");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || "Failed to publish listing.";
      setPublishError(msg);
    },
  });

  // ---- Final publish submit
  async function handlePublish() {
    setPublishError("");
    setWizardError("");
    // Final all-validation
    if (
      !validateStep() ||
      !basicInfo.name.trim() ||
      !basicInfo.short_description.trim() ||
      !basicInfo.long_description.trim() ||
      !basicInfo.address.trim() ||
      !basicInfo.city.trim() ||
      !basicInfo.country.trim() ||
      !basicInfo.latitude.trim() ||
      !basicInfo.longitude.trim() ||
      !photos.length ||
      amenities.length < 1 ||
      pricing.base_price_per_night <= 0
    ) {
      setWizardError("Please complete all required fields before publishing.");
      return;
    }

    // (Post-processing of data for payload as per API)
    const payload: VillaCreatePayload = {
      name: basicInfo.name.trim(),
      short_description: basicInfo.short_description.trim(),
      long_description: basicInfo.long_description.trim(),
      address: basicInfo.address.trim(),
      city: basicInfo.city.trim(),
      country: basicInfo.country.trim(),
      latitude: basicInfo.latitude.trim(),
      longitude: basicInfo.longitude.trim(),
      max_occupancy: Number(basicInfo.max_occupancy) || 1,
      is_instant_book: pricing.is_instant_book,
      base_price_per_night: Number(pricing.base_price_per_night) || 0,
      minimum_stay_nights: Number(pricing.minimum_stay_nights) || 1,
      security_deposit: Number(pricing.security_deposit) || 0,
      cleaning_fee: Number(pricing.cleaning_fee) || 0,
      service_fee: Number(pricing.service_fee) || 0,
      status: "pending", // by default on create (could be 'active' if auto-approved)
      photos: photos.map((p, idx) => ({
        photo_url: p.photo_url,
        sort_order: idx,
        caption: p.caption || "",
      })),
      amenities: amenities,
      rules: rules,
      // Note: The OpenAPI does not have "seasonal_pricing" or calendar blocks in POST, so not included here!
    };
    createVillaMutation.mutate(payload);
  }

  // ------------- CALENDAR: Date block widget (barebones) ---------------
  // For simplicity, free-form array of "blocked" dates (input)

  const [calendarInputDate, setCalendarInputDate] = useState(""); // yyyymmdd

  function addCalendarBlock() {
    if (!calendarInputDate || calendarBlocks.some(b => b.date === calendarInputDate)) return;
    setCalendarBlocks([
      ...calendarBlocks,
      {
        date: calendarInputDate,
        is_available: false,
      },
    ]);
    setCalendarInputDate("");
  }

  function removeCalendarBlock(date: string) {
    setCalendarBlocks(calendarBlocks.filter(b => b.date !== date));
  }

  // ------------- SEASONAL PRICING (local only, not submitted to API) ----------
  const [seasonalStart, setSeasonalStart] = useState("");
  const [seasonalEnd, setSeasonalEnd] = useState("");
  const [seasonalPrice, setSeasonalPrice] = useState<number>(0);

  function addSeasonalPricing() {
    if (
      !seasonalStart ||
      !seasonalEnd ||
      !seasonalPrice ||
      pricing.seasonal_pricing.length >= 10
    )
      return;
    setPricing(prev => ({
      ...prev,
      seasonal_pricing: [
        ...prev.seasonal_pricing,
        {
          start: seasonalStart,
          end: seasonalEnd,
          price: seasonalPrice,
        },
      ],
    }));
    setSeasonalStart("");
    setSeasonalEnd("");
    setSeasonalPrice(0);
  }

  function removeSeasonalPricing(idx: number) {
    setPricing(prev => ({
      ...prev,
      seasonal_pricing: prev.seasonal_pricing.filter((_, i) => i !== idx),
    }));
  }

  // --------------- RENDER ------------------------------
  // Steps:
  // 0. Basic Info, 1. Photos, 2. Pricing, 3. Calendar, 4. Amenities/Rules, 5. Review/Publish

  const wizardLabels = [
    "Basic Info",
    "Photos",
    "Pricing",
    "Calendar",
    "Amenities & Rules",
    "Preview & Publish",
  ];

  return (
    <>
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        {/* --- Progress bar/wizard nav --- */}
        <div className="flex items-center mb-8">
          {wizardLabels.map((label, idx) => (
            <div key={label} className="flex-1 flex items-center">
              <div
                className={`rounded-full h-8 w-8 flex items-center justify-center text-white font-bold ${
                  idx === step
                    ? "bg-blue-600"
                    : idx < step
                    ? "bg-blue-300"
                    : "bg-gray-400"
                }`}
              >
                {idx + 1}
              </div>
              {idx < wizardLabels.length - 1 && (
                <div className="flex-1 h-1 bg-gray-300 mx-2" />
              )}
            </div>
          ))}
        </div>
        <div className="text-center mb-6 font-semibold text-gray-700">
          Step {step + 1} of {wizardLabels.length}: {wizardLabels[step]}
        </div>
        {wizardError && (
          <div className="bg-red-50 border border-red-300 text-red-700 p-2 mb-4 rounded">
            {wizardError}
          </div>
        )}
        {publishError && (
          <div className="bg-red-50 border border-red-300 text-red-700 p-2 mb-4 rounded">
            {publishError}
          </div>
        )}
        {/* --- Step Content --- */}
        {step === 0 && (
          <div>
            {/* Basic Info step */}
            <div className="grid grid-cols-1 gap-4">
              <label className="block">
                <span className="font-medium">Name *</span>
                <input
                  className="form-input w-full mt-1 border-gray-300 rounded"
                  value={basicInfo.name}
                  maxLength={255}
                  onChange={e =>
                    setBasicInfo({ ...basicInfo, name: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="font-medium">Short Description *</span>
                <input
                  className="form-input w-full mt-1 border-gray-300 rounded"
                  value={basicInfo.short_description}
                  maxLength={255}
                  onChange={e =>
                    setBasicInfo({
                      ...basicInfo,
                      short_description: e.target.value,
                    })
                  }
                />
              </label>
              <label className="block">
                <span className="font-medium">Long Description *</span>
                <textarea
                  className="form-textarea w-full mt-1 border-gray-300 rounded"
                  value={basicInfo.long_description}
                  minLength={50}
                  rows={5}
                  onChange={e =>
                    setBasicInfo({
                      ...basicInfo,
                      long_description: e.target.value,
                    })
                  }
                />
              </label>
              <label className="block">
                <span className="font-medium">Address *</span>
                <input
                  className="form-input w-full mt-1 border-gray-300 rounded"
                  value={basicInfo.address}
                  maxLength={255}
                  onChange={e =>
                    setBasicInfo({ ...basicInfo, address: e.target.value })
                  }
                />
              </label>
              <div className="flex gap-3">
                <label className="block flex-1">
                  <span className="font-medium">City *</span>
                  <input
                    className="form-input w-full mt-1 border-gray-300 rounded"
                    value={basicInfo.city}
                    maxLength={100}
                    onChange={e =>
                      setBasicInfo({ ...basicInfo, city: e.target.value })
                    }
                  />
                </label>
                <label className="block flex-1">
                  <span className="font-medium">Country *</span>
                  <input
                    className="form-input w-full mt-1 border-gray-300 rounded"
                    value={basicInfo.country}
                    maxLength={100}
                    onChange={e =>
                      setBasicInfo({ ...basicInfo, country: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="flex gap-3">
                <label className="block flex-1">
                  <span className="font-medium">Latitude *</span>
                  <input
                    className="form-input w-full mt-1 border-gray-300 rounded"
                    value={basicInfo.latitude}
                    onChange={e =>
                      setBasicInfo({ ...basicInfo, latitude: e.target.value })
                    }
                    placeholder="e.g. 37.7749"
                  />
                </label>
                <label className="block flex-1">
                  <span className="font-medium">Longitude *</span>
                  <input
                    className="form-input w-full mt-1 border-gray-300 rounded"
                    value={basicInfo.longitude}
                    onChange={e =>
                      setBasicInfo({ ...basicInfo, longitude: e.target.value })
                    }
                    placeholder="e.g. -122.4194"
                  />
                </label>
                <label className="block flex-1">
                  <span className="font-medium">Max Occupancy *</span>
                  <input
                    className="form-input w-full mt-1 border-gray-300 rounded"
                    value={basicInfo.max_occupancy}
                    type="number"
                    min={1}
                    max={30}
                    onChange={e =>
                      setBasicInfo({
                        ...basicInfo,
                        max_occupancy: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            {/* Photos step */}
            <div className="mb-3">
              <label className="block font-medium mb-1">
                Upload Photos (Min 3, Max 20) *
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={photos.length >= 20}
                onChange={e => handlePhotoUpload(e.target.files)}
                className="block mb-2"
              />
              {stepLoading && <div className="text-blue-500 text-sm">Uploading...</div>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {photos.map((p, i) => (
                <div
                  key={i}
                  className="relative border rounded overflow-hidden bg-gray-50"
                >
                  <img
                    src={p.photo_url}
                    alt={`Listing photo ${i + 1}`}
                    className="w-full h-48 object-cover"
                  />
                  <input
                    value={p.caption}
                    onChange={e => handlePhotoCaption(i, e.target.value)}
                    placeholder="Caption"
                    className="absolute bottom-1 left-1 right-1 bg-white/80 text-xs p-1 rounded"
                  />
                  <div className="flex absolute top-1 right-1 gap-1">
                    <button
                      type="button"
                      className="bg-white/90 text-gray-600 px-1 rounded hover:bg-gray-100"
                      onClick={() => reorderPhoto(i, i - 1)}
                      disabled={i === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="bg-white/90 text-gray-600 px-1 rounded hover:bg-gray-100"
                      onClick={() => reorderPhoto(i, i + 1)}
                      disabled={i === photos.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="bg-red-100 text-red-700 px-1 rounded"
                      onClick={() => deletePhoto(i)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            {/* Pricing step */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="font-medium">Base Price Per Night *</span>
                <input
                  className="form-input w-full mt-1 border-gray-300 rounded"
                  type="number"
                  min={1}
                  value={pricing.base_price_per_night}
                  onChange={e =>
                    setPricing(p => ({
                      ...p,
                      base_price_per_night: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="font-medium">Minimum Stay Nights *</span>
                <input
                  className="form-input w-full mt-1 border-gray-300 rounded"
                  type="number"
                  min={1}
                  value={pricing.minimum_stay_nights}
                  onChange={e =>
                    setPricing(p => ({
                      ...p,
                      minimum_stay_nights: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="font-medium">Cleaning Fee</span>
                <input
                  className="form-input w-full mt-1 border-gray-300 rounded"
                  type="number"
                  min={0}
                  value={pricing.cleaning_fee}
                  onChange={e =>
                    setPricing(p => ({
                      ...p,
                      cleaning_fee: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="font-medium">Service Fee</span>
                <input
                  className="form-input w-full mt-1 border-gray-300 rounded"
                  type="number"
                  min={0}
                  value={pricing.service_fee}
                  onChange={e =>
                    setPricing(p => ({
                      ...p,
                      service_fee: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="font-medium">Security Deposit</span>
                <input
                  className="form-input w-full mt-1 border-gray-300 rounded"
                  type="number"
                  min={0}
                  value={pricing.security_deposit}
                  onChange={e =>
                    setPricing(p => ({
                      ...p,
                      security_deposit: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="block flex items-center gap-2">
                <span className="font-medium">Instant Book?</span>
                <input
                  type="checkbox"
                  checked={pricing.is_instant_book}
                  onChange={e =>
                    setPricing(p => ({
                      ...p,
                      is_instant_book: e.target.checked,
                    }))
                  }
                />
              </label>
            </div>
            <div className="mt-6 mb-2 font-medium">
              Seasonal Pricing <span className="text-sm font-normal text-gray-500">(optional)</span>
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="date"
                value={seasonalStart}
                onChange={e => setSeasonalStart(e.target.value)}
                className="form-input rounded border-gray-300"
                placeholder="Start date"
              />
              <input
                type="date"
                value={seasonalEnd}
                onChange={e => setSeasonalEnd(e.target.value)}
                className="form-input rounded border-gray-300"
                placeholder="End date"
              />
              <input
                type="number"
                min={1}
                value={seasonalPrice}
                onChange={e => setSeasonalPrice(Number(e.target.value))}
                className="form-input rounded border-gray-300"
                placeholder="Nightly Price"
              />
              <button
                type="button"
                onClick={addSeasonalPricing}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled={
                  !seasonalStart || !seasonalEnd || !seasonalPrice || pricing.seasonal_pricing.length >= 10
                }
              >
                Add
              </button>
            </div>
            <div>
              {pricing.seasonal_pricing.length > 0 && (
                <table className="w-full mt-2 text-sm">
                  <thead>
                    <tr className="text-gray-600">
                      <th className="font-semibold text-left">Start</th>
                      <th className="font-semibold text-left">End</th>
                      <th className="font-semibold text-left">Price</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.seasonal_pricing.map((sp, idx) => (
                      <tr key={idx}>
                        <td>{sp.start}</td>
                        <td>{sp.end}</td>
                        <td>${sp.price}</td>
                        <td>
                          <button
                            className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded"
                            onClick={() => removeSeasonalPricing(idx)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            {/* Calendar block step */}
            <div className="mb-2">
              <label className="font-medium">Blocked/Unavailable Dates (Optional)</label>
              <div className="flex gap-2 mt-2">
                <input
                  type="date"
                  value={calendarInputDate}
                  onChange={e =>
                    setCalendarInputDate(
                      e.target.value ? dateToCompact(e.target.value) : ""
                    )
                  }
                  className="form-input rounded border-gray-300"
                />
                <button
                  type="button"
                  onClick={addCalendarBlock}
                  className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                  disabled={
                    !calendarInputDate ||
                    !!calendarBlocks.find(b => b.date === calendarInputDate)
                  }
                >
                  Block Date
                </button>
              </div>
              <div className="mt-2">
                {calendarBlocks.length === 0 ? (
                  <div className="text-gray-600 text-xs">No dates blocked yet.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {calendarBlocks.map(b => (
                      <div
                        key={b.date}
                        className="bg-gray-200 px-2 py-1 rounded flex items-center"
                      >
                        <span>
                          {b.date.slice(0, 4)}-{b.date.slice(4, 6)}-{b.date.slice(6, 8)}
                        </span>
                        <button
                          className="ml-2 text-red-500 font-bold"
                          onClick={() => removeCalendarBlock(b.date)}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Note on calendar API */}
            <div className="text-xs text-gray-500 mt-2">
              Note: Calendar blocking applies after publishing via villa edit.
            </div>
          </div>
        )}
        {step === 4 && (
          <div>
            {/* Amenities & Rules step */}
            {amenitiesLoading ? (
              <div className="text-blue-600">Loading amenities...</div>
            ) : amenitiesError ? (
              <div className="text-red-500 text-xs">
                Failed to load amenities.&nbsp;
                <button
                  className="underline text-blue-600"
                  onClick={() => refetchAmenities()}
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <label className="block font-medium mb-2">
                  Select Amenities (at least one) *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {allAmenities.map(a => (
                    <label
                      key={a.amenity_id}
                      className={`cursor-pointer flex items-center gap-2 p-2 border rounded-md ${
                        amenities.includes(a.key)
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-300"
                      }`}
                    >
                      {a.icon_url && (
                        <img
                          src={a.icon_url}
                          alt={a.name}
                          className="w-6 h-6 object-contain"
                        />
                      )}
                      <input
                        type="checkbox"
                        checked={amenities.includes(a.key)}
                        onChange={e => {
                          const checked = e.target.checked;
                          setAmenities(am =>
                            checked
                              ? [...am, a.key]
                              : am.filter(key => key !== a.key)
                          );
                        }}
                      />
                      {a.name}
                    </label>
                  ))}
                </div>
              </>
            )}
            {/* Custom Rules */}
            <div className="mt-6">
              <label className="block font-medium mb-2">
                House Rules <span className="font-normal text-sm text-gray-400">(optional, e.g. Pets, Smoking, Parties)</span>
              </label>
              <RuleForm rules={rules} setRules={setRules} />
            </div>
          </div>
        )}
        {step === 5 && (
          <div>
            {/* Final Review & Publish */}
            <div className="mb-4 text-lg font-bold text-center text-blue-700">
              Preview Summary
            </div>
            <dl className="mb-2">
              <dt className="font-medium">Name:</dt>
              <dd className="mb-1">{basicInfo.name}</dd>
              <dt className="font-medium">Address:</dt>
              <dd className="mb-1">
                {basicInfo.address}, {basicInfo.city}, {basicInfo.country}
              </dd>
              <dt className="font-medium">Short Description:</dt>
              <dd className="mb-1">{basicInfo.short_description}</dd>
              <dt className="font-medium">Long Description:</dt>
              <dd className="mb-1">{basicInfo.long_description}</dd>
              <dt className="font-medium">Max Occupancy:</dt>
              <dd className="mb-1">{basicInfo.max_occupancy}</dd>
            </dl>
            <div className="mb-2">
              <span className="font-medium">Photos:</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {photos.map(p => (
                  <img
                    key={p.photo_url}
                    src={p.photo_url}
                    alt={p.caption}
                    className="w-24 h-24 object-cover rounded"
                  />
                ))}
              </div>
            </div>
            <div className="mb-2">
              <span className="font-medium">Pricing:</span>
              <div>
                ${pricing.base_price_per_night} / night, Min {pricing.minimum_stay_nights} nights.
                Cleaning Fee: ${pricing.cleaning_fee}, Service Fee: ${pricing.service_fee}, Security: ${pricing.security_deposit || 0}.
                &nbsp;{pricing.is_instant_book && (
                  <span className="text-green-700 font-semibold">Instant Book enabled</span>
                )}
              </div>
              {pricing.seasonal_pricing.length > 0 && (
                <div>
                  <span className="font-medium text-xs text-gray-500">Seasonal Rates:</span>
                  <ul className="text-xs pl-4 list-disc">
                    {pricing.seasonal_pricing.map((s, idx) => (
                      <li key={idx}>
                        {s.start} to {s.end}: ${s.price}/night
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mb-2">
              <span className="font-medium">Amenities:</span>
              <ul className="flex flex-wrap gap-2 text-sm mt-1">
                {allAmenities
                  .filter(a => amenities.includes(a.key))
                  .map(a => (
                    <li key={a.key} className="bg-blue-50 text-blue-700 px-2 py-1 rounded">
                      {a.name}
                    </li>
                  ))}
              </ul>
            </div>
            {rules.length > 0 && (
              <div className="mb-2">
                <span className="font-medium">Rules:</span>
                <ul className="list-disc pl-6 text-sm">
                  {rules.map((r, i) => (
                    <li key={i}>
                      <span className="font-semibold">{r.rule_type}:</span>&nbsp;
                      {r.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {calendarBlocks.length > 0 && (
              <div className="mb-2">
                <span className="font-medium">Blocked Dates:</span>
                <ul className="flex flex-wrap gap-2 text-xs mt-1">
                  {calendarBlocks.map((b, i) => (
                    <li
                      key={i}
                      className="bg-red-50 text-red-700 px-2 py-1 rounded"
                    >
                      {b.date.slice(0, 4)}-{b.date.slice(4, 6)}-{b.date.slice(6, 8)}
                    </li>
                  ))}
                </ul>
                <span className="block text-xs text-gray-400 mt-1">
                  (Apply blocks after publishing from calendar editor)
                </span>
              </div>
            )}
            <div className="text-xs text-gray-500 mt-3">
              You can edit this listing and calendar after publishing.
            </div>
          </div>
        )}
        {/* --- Wizard Controls --- */}
        <div className="flex flex-row justify-between mt-8">
          {step > 0 ? (
            <button
              type="button"
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded shadow-sm hover:bg-gray-300"
              onClick={handlePrevStep}
              disabled={stepLoading || createVillaMutation.isLoading}
            >
              Back
            </button>
          ) : (
            <Link
              className="px-2 py-2 text-sm text-gray-500 hover:underline"
              to="/host/listings"
            >
              &larr; Cancel / Back to Dashboard
            </Link>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveDraft}
              className="px-3 py-2 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
              disabled={stepLoading || createVillaMutation.isLoading}
              title="Save as draft"
            >
              Save Draft
            </button>
            {saveDraftMsg && (
              <span className="text-xs text-green-700">{saveDraftMsg}</span>
            )}
          </div>
          {step < wizardLabels.length - 1 && (
            <button
              type="button"
              className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
              onClick={handleNextStep}
              disabled={stepLoading || createVillaMutation.isLoading}
            >
              Next &rarr;
            </button>
          )}
          {step === wizardLabels.length - 1 && (
            <button
              type="button"
              className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700"
              onClick={handlePublish}
              disabled={stepLoading || createVillaMutation.isLoading}
            >
              {createVillaMutation.isLoading ? "Publishing..." : "Publish Listing"}
            </button>
          )}
        </div>
        <div className="flex flex-row mt-4">
          <button
            className="ml-auto text-xs text-red-600 underline"
            type="button"
            onClick={abandonListing}
            tabIndex={-1}
          >
            Abandon and Discard
          </button>
        </div>
      </div>
      {/* --- Rules input subcomponent (inline) --- */}
      {/* Renders with amenities step; defined below for single-file */}
    </>
  );
};

// --- Inline RuleForm subcomponent (no splitting for render, per instructions) ---
interface RuleFormProps {
  rules: RuleInput[];
  setRules: React.Dispatch<React.SetStateAction<RuleInput[]>>;
}
const RuleForm: React.FC<RuleFormProps> = ({ rules, setRules }) => {
  const [type, setType] = useState("");
  const [val, setVal] = useState("");

  function addRule() {
    if (!type.trim() || !val.trim()) return;
    setRules(rs => [...rs, { rule_type: type.trim(), value: val.trim() }]);
    setType("");
    setVal("");
  }
  function removeRule(idx: number) {
    setRules(rs => rs.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="border rounded px-2 py-1 text-sm flex-1"
          placeholder="Rule type (e.g. Pets, Smoking)"
          value={type}
          maxLength={100}
          onChange={e => setType(e.target.value)}
        />
        <input
          className="border rounded px-2 py-1 text-sm flex-1"
          placeholder="Value (e.g. Not allowed, Ok with fee)"
          value={val}
          maxLength={255}
          onChange={e => setVal(e.target.value)}
        />
        <button
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          type="button"
          onClick={addRule}
          disabled={!type.trim() || !val.trim() || rules.length >= 10}
        >
          Add
        </button>
      </div>
      {rules.length > 0 && (
        <ul className="list-disc ml-7 mt-2 text-xs">
          {rules.map((r, i) => (
            <li key={i} className="flex items-center gap-1">
              <span className="font-semibold">{r.rule_type}:</span>{" "}
              {r.value}
              <button
                className="ml-2 text-red-500 font-bold text-xs"
                onClick={() => removeRule(i)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default UV_Host_CreateListing;