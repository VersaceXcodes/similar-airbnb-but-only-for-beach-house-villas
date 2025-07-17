import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { z } from "zod";

// Zod/TypeScript types from shared schema @schema
import {
  // For type safety from DB:zodschemas:ts
  amenitySchema,
  villaRuleSchema,
  villaPhotoSchema,
  Villa as TVilla,           // Basic villa type (summary level)
  VillaPhoto,
  Amenity,
  VillaDetail as TVillaDetail,
  Rule as TRule,
  AvailableDay as TCalendarDay,
  // Create/Update payloads
  VillaUpdatePayload,
} from "@schema"; // assumes these are available

import { useAppStore } from "@/store/main";

// --- Constants
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const AMENITY_STORAGE_KEY = "beachvillas-villa-edit-draft"; // per villa_id
const MIN_PHOTOS = 3;


const UV_Host_EditListing: React.FC = () => {
  // Get villaId from URL
  const { villaId } = useParams<{ villaId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Zustand: Auth/user
  const user = useAppStore(s => s.user);
  const auth_token = useAppStore(s => s.auth_token);
  const set_error_banner = useAppStore(s => s.set_error_banner);

  // --- Local form state
  const [draftState, setDraftState] = useState<any>({});
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // --- Query: Villa details (prepopulate)
  const {
    data: villaDetail,
    isLoading: loadingVilla,
    isError: errorVilla,
    refetch: refetchVilla
  } = useQuery<TVillaDetail, Error>({
    queryKey: ["villa-detail", villaId],
    enabled: !!villaId,
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/villa/${villaId}`);
      return res.data;
    }
  });

  // --- Query: Amenities list
  const {
    data: amenitiesList,
    isLoading: loadingAmenities,
    isError: errorAmenities,
    refetch: refetchAmenities
  } = useQuery<Amenity[], Error>({
    queryKey: ["amenities-list"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/amenities`);
      return res.data;
    }
  });

  // --- Draft restoration: On mount, fill draft if any
  useEffect(() => {
    if (!villaId) return;
    // Only after villaDetail loads
    if (!loadingVilla && villaDetail) {
      // Try localStorage for draft
      const rawDraft = localStorage.getItem(`${AMENITY_STORAGE_KEY}-${villaId}`);
      if (rawDraft) {
        try {
          const parsed = JSON.parse(rawDraft);
          if (parsed && parsed.draftState && parsed.villa_id === villaId) {
            setDraftState({ ...villaDetail, ...parsed.draftState });
            return;
          }
        } catch (e) {/* ignore */}
      }
      // If no draft, hydrate from loaded detail
      setDraftState({ ...villaDetail });
    }
  }, [villaId, loadingVilla, villaDetail]);

  // Sync back end on PATCH (save changes)
  const mutationUpdate = useMutation({
    mutationFn: async (payload: Partial<VillaUpdatePayload>) => {
      // Remove extra fields not allowed by PATCH schema
      const {
        villa_id, host, host_profile, reviews, calendar, rules, all_amenities, photos, ...up
      } = draftState;

      // Compile form data
      const updatePayload: Partial<VillaUpdatePayload> = {
        ...up,
        photos: draftState.photos?.map((p: any, i: number) => ({
          photo_url: typeof p === "string" ? p : p.photo_url,
          sort_order: i,
          caption: p.caption || ""
        })) || [],
        amenities: draftState.amenities as string[] || [],
        rules: (draftState.rules || []).map((r: any) => ({
          rule_type: typeof r === "string" ? r : r.rule_type,
          value: typeof r === "string" ? "" : r.value
        })),
        status: draftState.status,
      };
      setError("");
      setIsSaving(true);
      const res = await axios.patch(`${API_BASE}/villa/${villaId}`, updatePayload, {
        headers: { Authorization: `Bearer ${auth_token?.token}` },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setSuccess(true);
      setIsSaving(false);
      setDraftState({ ...data }); // hydrate with updated
      localStorage.removeItem(`${AMENITY_STORAGE_KEY}-${villaId}`);
      queryClient.invalidateQueries({ queryKey: ["villa-detail", villaId] });
      setTimeout(() => setSuccess(false), 2000);
    },
    onError: (err: any) => {
      setIsSaving(false);
      setError(err?.response?.data?.message || "Failed to save changes");
    },
  });

  // Calendar update (PUT to /villa/{villa_id}/availability)
  const mutationCalendar = useMutation({
    mutationFn: async (calendarItems: any[]) => {
      setCalendarLoading(true);
      const res = await axios.put(
        `${API_BASE}/villa/${villaId}/availability`,
        { calendar: calendarItems },
        { headers: { Authorization: `Bearer ${auth_token?.token}` } }
      );
      setCalendarLoading(false);
      return res.data.calendar;
    },
    onSuccess: (cal) => {
      setDraftState((ds: any) => ({ ...ds, calendar: cal }));
      setCalendarLoading(false);
    },
    onError: (err: any) => {
      setCalendarLoading(false);
      setError(err?.response?.data?.message || "Failed to update calendar");
    }
  });

  // Deactivate listing (PATCH status: inactive)
  const mutationDeactivate = useMutation({
    mutationFn: async () => {
      setIsSaving(true);
      const payload = { status: "inactive" };
      const res = await axios.patch(
        `${API_BASE}/villa/${villaId}`,
        payload,
        { headers: { Authorization: `Bearer ${auth_token?.token}` } }
      );
      setIsSaving(false);
      return res.data;
    },
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["villa-detail", villaId] });
      setTimeout(() => setSuccess(false), 2000);
    },
    onError: (err: any) => {
      setIsSaving(false);
      setError(err?.response?.data?.message || "Error deactivating villa.");
    }
  });

  // Delete listing
  const mutationDelete = useMutation({
    mutationFn: async () => {
      setIsSaving(true);
      await axios.delete(
        `${API_BASE}/villa/${villaId}`,
        { headers: { Authorization: `Bearer ${auth_token?.token}` } }
      );
      setIsSaving(false);
      return true; // Deleted
    },
    onSuccess: () => {
      setDeleted(true);
      localStorage.removeItem(`${AMENITY_STORAGE_KEY}-${villaId}`);
      setTimeout(() => navigate("/host/listings", { replace: true }), 2000);
    },
    onError: (err: any) => {
      setIsSaving(false);
      setError(err?.response?.data?.message || "Error deleting villa.");
    }
  });

  // ---- Handle Form Editing ----
  // For any form field change
  const handleFormChange = (field: string, value: any) => {
    setDraftState((prev: any) => {
      const next = { ...prev, [field]: value };
      // Draft autosave
      localStorage.setItem(
        `${AMENITY_STORAGE_KEY}-${villaId}`,
        JSON.stringify({ villa_id: villaId, draftState: next })
      );
      return next;
    });
    setSuccess(false);
    setError("");
  };

  // Amenity checkbox change
  const handleAmenityToggle = (amenityKey: string) => {
    const current: string[] = Array.isArray(draftState.amenities) ? draftState.amenities : [];
    const next =
      current.includes(amenityKey)
        ? current.filter((k) => k !== amenityKey)
        : [...current, amenityKey];
    handleFormChange("amenities", next);
  };

  // Photo upload/management
  const handleImageAdd = (photo_url: string) => {
    setDraftState((prev: any) => ({
      ...prev,
      photos: [...(prev.photos || []), { photo_url, sort_order: (prev.photos?.length ?? 0), caption: "" }]
    }));
  };
  const handleImageRemove = (idx: number) => {
    setDraftState((prev: any) => ({
      ...prev,
      photos: prev.photos.filter((_: any, i: number) => i !== idx)
        .map((p: any, i: number) => ({ ...p, sort_order: i }))
    }));
  };
  const handleImageCaption = (idx: number, caption: string) => {
    setDraftState((prev: any) => ({
      ...prev,
      photos: prev.photos.map((photo: any, i: number) => i === idx ? { ...photo, caption } : photo)
    }));
  };

  // Rules
  const handleRuleChange = (idx: number, key: string, value: string) => {
    setDraftState((prev: any) => ({
      ...prev,
      rules: prev.rules.map((rule: any, i: number) => i === idx ? { ...rule, [key]: value } : rule)
    }));
  };
  const handleAddRule = () => {
    setDraftState((prev: any) => ({
      ...prev,
      rules: [...(prev.rules || []), { rule_type: "", value: "", villa_rule_id: "" }]
    }));
  };
  const handleRemoveRule = (idx: number) => {
    setDraftState((prev: any) => ({
      ...prev,
      rules: prev.rules.filter((_: any, i: number) => i !== idx)
    }));
  };

  // Calendar edit (availability or price_override change for a date)
  const handleCalendarEdit = (date: string, field: string, value: any) => {
    setDraftState((prev: any) => ({
      ...prev,
      calendar: prev.calendar.map((d: any) =>
        d.date === date ? { ...d, [field]: value } : d
      ),
    }));
  };
  // Save calendar update to backend
  const commitCalendarEdits = () => {
    if (draftState.calendar) {
      mutationCalendar.mutate(draftState.calendar);
    }
  };

  // Save-as-draft logic (manual)
  const saveDraft = () => {
    if (!villaId) return;
    localStorage.setItem(
      `${AMENITY_STORAGE_KEY}-${villaId}`,
      JSON.stringify({ villa_id: villaId, draftState })
    );
    setSuccess(true);
    setTimeout(() => setSuccess(false), 1500);
  };

  // Discard changes: Restore from main load
  const resetForm = () => {
    if (villaDetail) {
      setDraftState({ ...villaDetail });
      localStorage.removeItem(`${AMENITY_STORAGE_KEY}-${villaId}`);
      setError("");
      setSuccess(false);
    }
  };

  // Restore draft (if available)
  const restoreDraft = () => {
    if (!villaId) return;
    const rawDraft = localStorage.getItem(`${AMENITY_STORAGE_KEY}-${villaId}`);
    if (rawDraft) {
      try {
        const parsed = JSON.parse(rawDraft);
        if (parsed && parsed.draftState && parsed.villa_id === villaId) {
          setDraftState({ ...villaDetail, ...parsed.draftState });
        }
      } catch (e) {
        // Ignore
      }
    }
  };

  // --- Double confirm on delete
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Render
  if (!villaId) {
    return (
      <div className="p-4">
        <div className="text-red-500">Missing villa ID in URL.</div>
      </div>
    );
  }
  if (loadingVilla || loadingAmenities || !draftState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full border-t-4 border-b-4 border-blue-400 w-16 h-16 mb-4"></div>
        <div>Loading listing editor...</div>
      </div>
    );
  }
  if (errorVilla || errorAmenities) {
    return (
      <div className="max-w-2xl mx-auto mt-24 p-6 bg-red-100 border border-red-400 text-red-700 rounded">
        <div className="font-semibold text-lg mb-3">
          Error loading listing or amenities.
        </div>
        <div className="mb-3">{errorVilla?.message || errorAmenities?.message}</div>
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          onClick={() => {
            refetchVilla();
            refetchAmenities();
          }}
        >
          Retry
        </button>
      </div>
    );
  }
  if (deleted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="text-2xl text-green-700 font-bold mb-4">Listing Deleted</div>
        <div className="mb-4">This villa has been deleted.</div>
        <Link
          to="/host/listings"
          className="text-blue-700 underline px-4 py-2"
        >
          Back to My Villas
        </Link>
      </div>
    );
  }

  // --- Form validation (very basic sample for MVP: enforce all required fields)
  const validateForm = () => {
    if (
      !draftState.name ||
      !draftState.short_description ||
      !draftState.long_description ||
      !draftState.address ||
      !draftState.city ||
      !draftState.country ||
      !draftState.latitude ||
      !draftState.longitude ||
      !draftState.max_occupancy ||
      !draftState.base_price_per_night ||
      !draftState.minimum_stay_nights ||
      !draftState.photos || draftState.photos.length < MIN_PHOTOS
    ) {
      setError(
        `Please complete all required fields. Minimum ${MIN_PHOTOS} photos required.`
      );
      return false;
    }
    setError("");
    return true;
  };

  // ---- Render form:
  return (
    <>
      {/* Success/Error Banners */}
      {(success || error) && (
        <div className={`w-full p-3 mb-4 rounded text-white ${success ? "bg-green-600" : "bg-red-600"}`}>
          {success
            ? "Changes saved successfully!"
            : error}
        </div>
      )}
      {/* Page title & nav */}
      <div className="flex items-center justify-between mb-5 mt-8 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Edit Listing</h1>
          <div className="text-gray-500 text-sm mt-1">
            Listing ID: {villaId}
          </div>
        </div>
        <Link
          to="/host/listings"
          className="text-blue-600 hover:underline font-medium"
        >
          ← Back to My Villas
        </Link>
      </div>

      {/* Main form */}
      <form
        className="bg-white max-w-4xl mx-auto shadow p-6 rounded-lg mb-10"
        onSubmit={(e) => {
          e.preventDefault();
          if (!validateForm()) return;
          mutationUpdate.mutate({});
        }}
        autoComplete="off"
      >
        {/* Property Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Property Name</label>
            <input
              className="input w-full border px-3 py-2 rounded shadow"
              maxLength={255}
              value={draftState.name || ""}
              onChange={(e) => handleFormChange("name", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Short Description</label>
            <input
              className="input w-full border px-3 py-2 rounded shadow"
              maxLength={255}
              value={draftState.short_description || ""}
              onChange={(e) => handleFormChange("short_description", e.target.value)}
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block font-semibold text-gray-700 mb-2">Long Description</label>
            <textarea
              className="w-full border px-3 py-2 rounded shadow min-h-[80px]"
              value={draftState.long_description || ""}
              onChange={(e) => handleFormChange("long_description", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Address</label>
            <input
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.address || ""}
              onChange={(e) => handleFormChange("address", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">City</label>
            <input
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.city || ""}
              onChange={(e) => handleFormChange("city", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Country</label>
            <input
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.country || ""}
              onChange={(e) => handleFormChange("country", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Latitude</label>
            <input
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.latitude || ""}
              onChange={(e) => handleFormChange("latitude", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Longitude</label>
            <input
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.longitude || ""}
              onChange={(e) => handleFormChange("longitude", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Max Occupancy</label>
            <input
              type="number"
              min={1}
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.max_occupancy || ""}
              onChange={(e) => handleFormChange("max_occupancy", Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Instant Book</label>
            <select
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.is_instant_book ? "true" : "false"}
              onChange={(e) =>
                handleFormChange("is_instant_book", e.target.value === "true")
              }
            >
              <option value="false">Request to Book</option>
              <option value="true">Instant Book</option>
            </select>
          </div>
        </div>

        {/* Amenity Checklist */}
        <div className="mt-8">
          <h2 className="font-semibold text-lg mb-2">Amenities</h2>
          <div className="flex flex-wrap gap-4">
            {Array.isArray(amenitiesList) &&
              amenitiesList.map((a: Amenity) => (
                <label key={a.amenity_id} className="inline-flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-blue-600 w-5 h-5"
                    checked={Array.isArray(draftState.amenities) && draftState.amenities.includes(a.key)}
                    onChange={() => handleAmenityToggle(a.key)}
                  />
                  <span>
                    {a.icon_url ? (
                      <img src={a.icon_url} alt={a.name} className="inline h-5 w-5 mr-1 align-middle" />
                    ) : (
                      <span className="inline-block w-5 h-5 bg-gray-100 rounded mr-1 align-middle" />
                    )}
                    {a.name}
                  </span>
                </label>
              ))}
          </div>
        </div>

        {/* Photos */}
        <div className="mt-8">
          <h2 className="font-semibold text-lg mb-2">Photos <span className="text-xs text-gray-400">(min {MIN_PHOTOS})</span></h2>
          <div className="flex flex-wrap gap-4 mb-3">
            {draftState.photos &&
              draftState.photos.map((ph: any, idx: number) => (
                <div key={idx} className="relative border rounded p-1 bg-gray-50">
                  <img
                    src={ph.photo_url}
                    alt={`villa-photo-${idx}`}
                    className="w-40 h-28 object-cover rounded"
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center"
                    onClick={() => handleImageRemove(idx)}
                    title="Remove photo"
                  >
                    &times;
                  </button>
                  <input
                    type="text"
                    className="block mt-2 w-40 border px-1 py-1 rounded text-xs"
                    value={ph.caption || ""}
                    placeholder="Caption"
                    onChange={(e) => handleImageCaption(idx, e.target.value)}
                  />
                </div>
              ))}
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Paste image URL"
              className="border px-2 py-1 rounded w-60"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value) {
                  handleImageAdd(e.currentTarget.value);
                  e.currentTarget.value = "";
                }
              }}
            />
            <button
              type="button"
              className="bg-gray-600 text-white px-3 py-1 rounded"
              title="Add example image"
              onClick={() =>
                handleImageAdd(`https://picsum.photos/seed/villa${Math.floor(Math.random()*10000)}/400/300`)
              }
            >
              Add Example
            </button>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Paste a URL and hit Enter, or click 'Add Example' for a mock/demo image.
          </div>
        </div>

        {/* Pricing & Fees */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Base Price / Night ($)</label>
            <input
              type="number"
              min={0}
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.base_price_per_night || ""}
              onChange={(e) => handleFormChange("base_price_per_night", Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Minimum Stay (nights)</label>
            <input
              type="number"
              min={1}
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.minimum_stay_nights || ""}
              onChange={(e) => handleFormChange("minimum_stay_nights", Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Cleaning Fee ($)</label>
            <input
              type="number"
              min={0}
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.cleaning_fee ?? ""}
              onChange={(e) => handleFormChange("cleaning_fee", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Service Fee ($)</label>
            <input
              type="number"
              min={0}
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.service_fee ?? ""}
              onChange={(e) => handleFormChange("service_fee", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Security Deposit ($)</label>
            <input
              type="number"
              min={0}
              className="input w-full border px-3 py-2 rounded shadow"
              value={draftState.security_deposit ?? ""}
              onChange={(e) => handleFormChange("security_deposit", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>

        {/* House Rules */}
        <div className="mt-8">
          <h2 className="font-semibold text-lg mb-2">House Rules</h2>
          {Array.isArray(draftState.rules) && draftState.rules.length > 0 ? (
            <div className="flex flex-col space-y-2">
              {draftState.rules.map((r: any, idx: number) => (
                <div key={idx} className="flex flex-wrap gap-2 items-center">
                  <input
                    className="w-48 border px-2 py-1 rounded"
                    value={r.rule_type || ""}
                    onChange={(e) => handleRuleChange(idx, "rule_type", e.target.value)}
                    placeholder="Rule type (e.g. Pets)"
                  />
                  <input
                    className="w-64 border px-2 py-1 rounded"
                    value={r.value || ""}
                    onChange={(e) => handleRuleChange(idx, "value", e.target.value)}
                    placeholder="Rule value (e.g. Not allowed)"
                  />
                  <button
                    type="button"
                    className="text-red-600 px-2 py-1 rounded hover:bg-red-50"
                    onClick={() => handleRemoveRule(idx)}
                  >Remove</button>
                </div>
              ))}
            </div>
          ) : <div className="text-gray-400">No rules yet.</div>}
          <button
            type="button"
            className="mt-3 text-blue-600 px-3 py-1 border border-blue-200 rounded hover:bg-blue-50"
            onClick={handleAddRule}
          >
            + Add Rule
          </button>
        </div>

        {/* Calendar: For each date allow toggle availability or override price (simple demo grid) */}
        <div className="mt-8">
          <h2 className="font-semibold text-lg mb-2">Calendar/Availability</h2>
          {calendarLoading ? (
            <div className="my-4 text-blue-500 animate-pulse">Updating calendar...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs border w-full min-w-[700px] mb-2">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-2 py-1">Date</th>
                    <th className="px-2 py-1">Available</th>
                    <th className="px-2 py-1">Price Override</th>
                    <th className="px-2 py-1">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(draftState.calendar) && draftState.calendar.length > 0 ? (
                    draftState.calendar.slice(0, 30).map((day: any, i: number) => (
                      <tr key={day.date}>
                        <td className="px-2 py-1">{day.date}</td>
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={day.is_available}
                            onChange={(e) =>
                              handleCalendarEdit(day.date, "is_available", e.target.checked)
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            min={0}
                            className="border px-1 py-0.5 rounded w-20"
                            value={day.price_override ?? ""}
                            onChange={(e) =>
                              handleCalendarEdit(day.date, "price_override",
                                e.target.value ? Number(e.target.value) : null)
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            className="text-blue-600 underline text-xs"
                            onClick={commitCalendarEdits}
                            title="Save calendar changes"
                          >Save</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={4} className="text-gray-500 text-center">No calendar data available</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-xs text-gray-400">
            Calendar: Only the next 30 days are editable in this demo view. For additional support, contact admin.
          </div>
        </div>

        {/* Status + Admin controls */}
        <div className="mt-8 flex gap-6 items-center">
          <div>
            <label className="block font-semibold text-gray-700 mb-2">Status</label>
            <select
              className="input border px-3 py-2 rounded shadow"
              value={draftState.status || "active"}
              onChange={(e) => handleFormChange("status", e.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending Approval</option>
              <option value="removed">Removed</option>
            </select>
          </div>
          <div>
            {mutationDeactivate.isLoading ? (
              <span className="text-xs text-blue-600">Deactivating...</span>
            ) : (
              <button
                type="button"
                className="bg-yellow-400 px-4 py-2 rounded font-semibold text-gray-900 mr-2"
                onClick={() => {
                  if (
                    window.confirm(
                      "Deactivate this listing? It will be hidden from guests but recoverable from host dashboard."
                    )
                  ) {
                    mutationDeactivate.mutate();
                  }
                }}
                disabled={isSaving}
              >
                Deactivate
              </button>
            )}
          </div>
        </div>
        {/* Danger zone */}
        <div className="mt-8">
          <h3 className="text-red-600 font-bold mb-2 text-lg">Danger Zone</h3>
          {!confirmingDelete ? (
            <button
              type="button"
              className="bg-red-600 text-white px-4 py-2 rounded font-semibold hover:bg-red-700"
              onClick={() => setConfirmingDelete(true)}
              disabled={isSaving}
            >
              Delete Listing
            </button>
          ) : (
            <div className="flex flex-col gap-2 bg-red-50 p-4 rounded border border-red-300 max-w-xs">
              <div className="text-sm mb-1">
                Confirm PERMANENT delete? This cannot be undone.
              </div>
              <button
                type="button"
                className="bg-red-700 py-1 px-2 rounded text-white font-bold"
                onClick={() => mutationDelete.mutate()}
                disabled={isSaving}
              >
                Yes, Delete Permanently
              </button>
              <button
                type="button"
                className="bg-gray-200 py-1 px-2 rounded text-gray-700 border"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Save/Action Controls */}
        <div className="mt-12 flex flex-wrap gap-4 justify-between">
          <div className="flex gap-4">
            <button
              type="submit"
              className={`bg-blue-600 text-white font-semibold px-6 py-3 rounded shadow hover:bg-blue-700 disabled:opacity-70`}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              className="bg-gray-300 text-gray-800 px-4 py-2 rounded shadow"
              onClick={saveDraft}
              disabled={isSaving}
            >
              Save as Draft
            </button>
            <button
              type="button"
              className="bg-orange-100 border border-orange-400 text-orange-700 px-4 py-2 rounded shadow"
              onClick={resetForm}
              disabled={isSaving}
            >
              Discard Changes
            </button>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="text-sm text-blue-800 border border-blue-200 rounded px-3 py-2 hover:bg-blue-50"
              onClick={restoreDraft}
              disabled={isSaving}
            >
              Restore Draft
            </button>
            <Link
              to="/host/listings"
              className="text-sm text-gray-500 underline px-3 py-2"
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </>
  );
};

export default UV_Host_EditListing;