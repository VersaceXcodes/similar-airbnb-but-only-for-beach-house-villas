import React, { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
import { UserProfile } from "@/store/main";
import { Link, useNavigate } from "react-router-dom";

// ========== CONSTANTS ==========
const API_URL = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}`;

// ========== LOCAL TYPES ==========
interface ProfileFormState {
  name: string;
  email: string;
  phone?: string;
  about?: string;
  locale?: string;
  profile_photo_url?: string;
  notification_settings?: { web?: boolean; email?: boolean };
  payout_method_details?: string;
}

interface AvatarFileState {
  file: File | null;
  previewUrl: string;
}

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  errors: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
    global?: string;
  };
  submitting: boolean;
};

const DEFAULT_AVATAR =
  "https://picsum.photos/seed/beachvilla-userprofile/200";

// ========== API CALLS ==========

// Fetch user profile
async function fetchProfile(token: string): Promise<UserProfile> {
  const { data } = await axios.get(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
}

// PATCH update user profile (support partial)
async function patchProfile({
  token,
  updates,
}: {
  token: string;
  updates: Partial<ProfileFormState>;
}): Promise<UserProfile> {
  const { data } = await axios.patch(`${API_URL}/me`, updates, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
}

// ========== MAIN COMPONENT ==========

const UV_Profile: React.FC = () => {
  // ===== STORES & ROUTING =====
  const storeUser = useAppStore((s) => s.user);
  const set_store_user = useAppStore((s) => s.set_user);
  const auth_token_obj = useAppStore((s) => s.auth_token);
  const set_error_banner = useAppStore((s) => s.set_error_banner);

  // ----- Local state -----
  const [profile, setProfile] = useState<UserProfile | null>(storeUser || null);

  // Form state for edits (sync with profile)
  const [form, setForm] = useState<ProfileFormState>({
    name: storeUser?.name || "",
    email: storeUser?.email || "",
    phone: storeUser?.phone ?? "",
    about: storeUser?.about ?? "",
    locale: storeUser?.locale ?? "",
    profile_photo_url: storeUser?.profile_photo_url ?? "",
    notification_settings: storeUser?.notification_settings ?? { web: true, email: true },
    payout_method_details: storeUser?.payout_method_details ?? "",
  });

  // Avatar file (for preview before PATCH)
  const [avatarFile, setAvatarFile] = useState<AvatarFileState>({
    file: null,
    previewUrl:
      storeUser?.profile_photo_url && storeUser?.profile_photo_url.length > 0
        ? storeUser.profile_photo_url
        : DEFAULT_AVATAR,
  });

  // Misc UI states
  const [editing, setEditing] = useState(false);
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    errors: {},
    submitting: false,
  });
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // ====== AUTH GUARD ======
  useEffect(() => {
    // No token or no user? Redirect to login.
    if (!auth_token_obj || !auth_token_obj.token) {
      navigate("/login");
    }
  }, [auth_token_obj, navigate]);

  // ====== REMOTE DATA: Profile Query ======
  const {
    data: loadedProfile,
    isLoading,
    isError,
    error,
    refetch: refetchProfile,
  } = useQuery<UserProfile, Error>(
    ["userProfile"],
    () => fetchProfile(auth_token_obj!.token),
    {
      enabled: !!auth_token_obj?.token,
      refetchOnWindowFocus: false,
      onSuccess: (user) => {
        setProfile(user);
        setForm({
          name: user.name || "",
          email: user.email || "",
          phone: user.phone ?? "",
          about: user.about ?? "",
          locale: user.locale ?? "",
          profile_photo_url: user.profile_photo_url ?? "",
          notification_settings: user.notification_settings ?? { web: true, email: true },
          payout_method_details: user.payout_method_details ?? "",
        });
        setAvatarFile((a) => ({
          ...a,
          previewUrl:
            user.profile_photo_url && user.profile_photo_url.length > 0
              ? user.profile_photo_url
              : DEFAULT_AVATAR,
        }));
        set_store_user(user);
      },
      onError: (err: any) => {
        // Surface error in UI and banner
        set_error_banner({
          message: err?.message || "Failed to load profile.",
          visible: true,
        });
        setErrorMessage("Could not load your profile. Try reloading.");
      }
    }
  );

  // ====== MUTATIONS ======

  // PATCH /me
  const mutation = useMutation<UserProfile, Error, Partial<ProfileFormState>>({
    mutationFn: async (updates) => {
      if (!auth_token_obj) throw new Error("Missing auth");
      setLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      return patchProfile({ token: auth_token_obj.token, updates });
    },
    onSuccess: (data) => {
      setProfile(data);
      setForm({
        name: data.name || "",
        email: data.email || "",
        phone: data.phone ?? "",
        about: data.about ?? "",
        locale: data.locale ?? "",
        profile_photo_url: data.profile_photo_url ?? "",
        notification_settings: data.notification_settings ?? { web: true, email: true },
        payout_method_details: data.payout_method_details ?? "",
      });
      setAvatarFile((a) => ({
        ...a,
        previewUrl:
          data.profile_photo_url && data.profile_photo_url.length > 0
            ? data.profile_photo_url
            : DEFAULT_AVATAR,
      }));
      set_store_user(data);
      setSuccessMessage("Profile updated successfully!");
      setEditing(false);
      setLoading(false);
      // Update cache (for reactivity across app)
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    },
    onError: (err: any) => {
      setErrorMessage(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to update profile. Please try again."
      );
      setLoading(false);
    },
  });

  // Become Host PATCH
  const becomeHostMutation = useMutation<UserProfile, Error, { role: string }>({
    mutationFn: async ({ role }) => {
      if (!auth_token_obj) throw new Error("Missing auth");
      setLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      return patchProfile({ token: auth_token_obj.token, updates: { role } });
    },
    onSuccess: (data) => {
      setProfile(data);
      setForm((f) => ({
        ...f,
        notification_settings: data.notification_settings ?? f.notification_settings,
      }));
      set_store_user(data);
      setSuccessMessage("You are now a Host! Welcome!");
      setEditing(false);
      setLoading(false);
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    },
    onError: (err: any) => {
      setErrorMessage(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to change role. Try again."
      );
      setLoading(false);
    },
  });

  // ====== AVATAR FILE HANDLERS ======
  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    // Only accept image types
    if (!/^image\//.test(file.type)) {
      setErrorMessage("Selected file is not an image.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarFile({
        file: file,
        previewUrl: reader.result as string,
      });
      // "Upload" avatar means put as profile_photo_url directly (simulate, no backend upload)
      setForm((old) => ({
        ...old,
        profile_photo_url: reader.result as string,
      }));
      setEditing(true);
      setErrorMessage("");
    };
    reader.readAsDataURL(file); // for preview + transmission
  }

  // ====== FORM CHANGE HANDLERS ======

  function handleFieldChange<K extends keyof ProfileFormState>(
    field: K,
    value: ProfileFormState[K]
  ) {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      setEditing(true);
      setErrorMessage("");
      return updated;
    });
  }

  function handleNotificationSettingChange(
    field: "web" | "email",
    value: boolean
  ) {
    setForm((prev) => ({
      ...prev,
      notification_settings: {
        ...(prev.notification_settings ?? {}),
        [field]: value,
      },
    }));
    setEditing(true);
    setErrorMessage("");
  }

  // ====== ACTIONS ======

  function handleSave() {
    // Minimal validation: name and email
    if (!form.name || form.name.length < 2) {
      setErrorMessage("Name is required.");
      return;
    }
    if (!form.email || !/^\S+@\S+\.\S+$/.test(form.email)) {
      setErrorMessage("A valid email is required.");
      return;
    }
    // PATCH /me for editable fields
    mutation.mutate({
      // Only send editable (let PATCH be sparse/partial)
      name: form.name,
      email: form.email,
      phone: form.phone,
      about: form.about,
      locale: form.locale,
      profile_photo_url: form.profile_photo_url,
      notification_settings: form.notification_settings,
      payout_method_details: form.payout_method_details,
    });
  }

  function handleCancel() {
    // Revert to last known profile
    if (profile) {
      setForm({
        name: profile.name || "",
        email: profile.email || "",
        phone: profile.phone ?? "",
        about: profile.about ?? "",
        locale: profile.locale ?? "",
        profile_photo_url: profile.profile_photo_url ?? "",
        notification_settings: profile.notification_settings ?? { web: true, email: true },
        payout_method_details: profile.payout_method_details ?? "",
      });
      setAvatarFile({
        file: null,
        previewUrl:
          profile.profile_photo_url && profile.profile_photo_url.length > 0
            ? profile.profile_photo_url
            : DEFAULT_AVATAR,
      });
    }
    setErrorMessage("");
    setEditing(false);
  }

  function handleBecomeHost() {
    // Allowed when user role === guest
    if (profile && (profile.role === "guest")) {
      becomeHostMutation.mutate({ role: "host" });
    }
  }

  // ====== PASSWORD CHANGE HANDLERS (UI only, feature not implemented) ======

  function handleOpenChangePassword() {
    setChangePasswordDialogOpen(true);
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      errors: {},
      submitting: false,
    });
    setSuccessMessage("");
    setErrorMessage("");
  }

  function handleCloseChangePassword() {
    setChangePasswordDialogOpen(false);
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      errors: {},
      submitting: false,
    });
    setErrorMessage("");
  }

  function handlePasswordFieldChange(
    field: keyof PasswordFormState,
    value: string
  ) {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
      errors: { ...prev.errors, [field]: undefined, global: undefined }
    }));
  }

  function handlePasswordChangeSubmit(e: React.FormEvent) {
    e.preventDefault();
    // UI validation
    let hasError = false;
    let errors: any = {};
    if (!passwordForm.currentPassword || passwordForm.currentPassword.length < 8)
      errors.currentPassword = "Current password is required (min 8)";
    if (!passwordForm.newPassword || passwordForm.newPassword.length < 8)
      errors.newPassword = "New password must be at least 8 characters";
    if (passwordForm.newPassword !== passwordForm.confirmPassword)
      errors.confirmPassword = "Passwords do not match";

    if (Object.keys(errors).length > 0) {
      setPasswordForm((prev) => ({
        ...prev,
        errors: errors,
        submitting: false,
      }));
      return;
    }
    // Feature is not implemented/backed - show error
    setPasswordForm((prev) => ({
      ...prev,
      errors: { global: "Password change feature not available in this MVP." },
      submitting: false,
    }));
    // Optionally close the dialog after a delay
    setTimeout(() => {
      setChangePasswordDialogOpen(false);
    }, 1500);
  }

  // ====== MAIN RENDER ======
  // Error boundary (simple, inline)
  let renderError: string | null = null;
  if (isError) {
    renderError = errorMessage || error?.message || "Failed to load profile.";
  }

  // If loading user or not authed, show minimal loader
  if (isLoading || loading || !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-24 min-h-[400px] w-full">
        <div className="flex flex-row items-center gap-4">
          <svg
            className="animate-spin h-6 w-6 text-blue-500"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <span className="text-gray-700 text-lg font-light">Loading profile...</span>
        </div>
      </div>
    );
  }

  // ===== MAIN HTML =====
  return (
    <>
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-8 bg-white rounded-lg shadow-lg mt-8 mb-16 border border-gray-100">
        {/* Header and Avatar */}
        <div className="flex flex-col items-center justify-center mb-8 gap-4">
          {/* Avatar upload */}
          <div className="relative group">
            <img
              src={
                avatarFile.previewUrl
                  ? avatarFile.previewUrl
                  : DEFAULT_AVATAR
              }
              alt="Profile avatar"
              className="h-28 w-28 rounded-full border-2 border-blue-400 object-cover shadow-lg"
            />
            <button
              type="button"
              onClick={() => {
                if (avatarInputRef.current) avatarInputRef.current.click();
              }}
              className="absolute bottom-0 right-0 bg-blue-500 text-white rounded-full p-2 hover:bg-blue-600 shadow transition cursor-pointer"
              title="Change profile photo"
              tabIndex={0}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M15.232 5.232l3.536 3.536M16.2 2.800A2.285 2.285 0 0118.700 5.300l-10.1 10.100a4 4 0 00-1.062 2.016l-.621 3.107a1 1 0 001.194 1.194l3.107-.621a4 4 0 002.017-1.062l10.100-10.1A2.285 2.285 0 0016.2 2.800z"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={avatarInputRef}
              onChange={handleAvatarFileChange}
            />
          </div>
          <div className="flex flex-row items-center gap-2">
            <span className="text-2xl font-semibold text-gray-800 tracking-tight">
              {profile.name}
            </span>
            <span
              className={
                "px-2 py-1 rounded text-xs font-semibold " +
                (profile.role?.includes("host")
                  ? "bg-lime-100 text-lime-700"
                  : "bg-sky-100 text-sky-700")
              }
              title={`Your role: ${profile.role}`}
            >
              {profile.role
                ? profile.role.charAt(0).toUpperCase() +
                  profile.role.slice(1).replaceAll("_", " ")
                : "guest"}
            </span>
            {profile.is_verified_host && (
              <span
                title="Verified Host"
                className="ml-2 inline-block rounded bg-green-200 text-green-700 px-2 py-0.5 text-xs font-bold"
              >
                ✓ Verified
              </span>
            )}
          </div>
          <div className="flex flex-row gap-2 mt-2">
            {profile.role === "guest" && (
              <button
                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-full text-sm font-semibold transition"
                onClick={handleBecomeHost}
                disabled={becomeHostMutation.isLoading}
              >
                {becomeHostMutation.isLoading
                  ? "Becoming Host..."
                  : "Become a Host"}
              </button>
            )}
            {profile.role?.includes("host") && (
              <Link
                to="/host/listings"
                className="inline-flex items-center px-3 py-1.5 bg-lime-600 hover:bg-lime-700 text-white rounded-full text-sm font-semibold transition"
                title="Go to Host Dashboard"
              >
                Host Dashboard
              </Link>
            )}
          </div>
        </div>

        {/* Divider */}
        <hr className="border-gray-200 mb-8" />

        {/* Editable Profile Info */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editing) return;
            handleSave();
          }}
          className="space-y-6"
        >
          {/* Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile_name" className="font-semibold text-gray-700 block">Full Name</label>
              <input
                id="profile_name"
                type="text"
                name="name"
                value={form.name}
                disabled={!editing}
                className={`mt-1 w-full py-2 px-3 rounded border ${editing ? "border-blue-400" : "border-gray-200"} bg-white text-gray-900 focus:outline-blue-500 focus:ring-1 focus:ring-blue-500 transition`}
                onChange={(e) => handleFieldChange("name", e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="profile_email" className="font-semibold text-gray-700 block">Email Address</label>
              <input
                id="profile_email"
                type="email"
                name="email"
                value={form.email}
                disabled={!editing}
                className="mt-1 w-full py-2 px-3 rounded border border-gray-200 bg-gray-100 text-gray-800 cursor-not-allowed"
                aria-disabled="true"
                readOnly={true}
              />
            </div>
          </div>

          {/* Phone & Locale */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile_phone" className="font-semibold text-gray-700 block">Phone Number</label>
              <input
                id="profile_phone"
                type="tel"
                name="phone"
                value={form.phone || ""}
                disabled={!editing}
                className={`mt-1 w-full py-2 px-3 rounded border ${editing ? "border-blue-400" : "border-gray-200"} bg-white text-gray-900 focus:outline-blue-500`}
                onChange={(e) => handleFieldChange("phone", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="profile_locale" className="font-semibold text-gray-700 block">Locale / Language</label>
              <input
                id="profile_locale"
                type="text"
                name="locale"
                value={form.locale || ""}
                disabled={!editing}
                placeholder="e.g. en-US"
                className={`mt-1 w-full py-2 px-3 rounded border ${editing ? "border-blue-400" : "border-gray-200"} bg-white text-gray-900 focus:outline-blue-500`}
                onChange={(e) => handleFieldChange("locale", e.target.value)}
              />
            </div>
          </div>

          {/* About */}
          <div>
            <label htmlFor="profile_about" className="font-semibold text-gray-700 block">About</label>
            <textarea
              id="profile_about"
              name="about"
              value={form.about || ""}
              disabled={!editing}
              rows={3}
              className={`mt-1 w-full rounded border ${editing ? "border-blue-400" : "border-gray-200"} bg-white py-2 px-3 text-gray-900 focus:outline-blue-500`}
              onChange={(e) => handleFieldChange("about", e.target.value)}
              maxLength={500}
              placeholder="Tell us a bit about yourself..."
            />
            <div className="text-xs text-gray-400 float-right">{(form.about?.length || 0)}/500</div>
          </div>

          {/* Notification Settings */}
          <div className="">
            <div className="font-semibold text-gray-700 mb-2">Notification Preferences</div>
            <div className="flex flex-row gap-6 items-center">
              <div className="flex flex-row items-center gap-2">
                <input
                  id="notify_email"
                  type="checkbox"
                  className="accent-blue-600 w-4 h-4"
                  checked={!!form.notification_settings?.email}
                  disabled={!editing}
                  onChange={e =>
                    handleNotificationSettingChange("email", e.target.checked)
                  }
                />
                <label htmlFor="notify_email" className="text-gray-600 text-sm">Email</label>
              </div>
              <div className="flex flex-row items-center gap-2">
                <input
                  id="notify_web"
                  type="checkbox"
                  className="accent-blue-600 w-4 h-4"
                  checked={!!form.notification_settings?.web}
                  disabled={!editing}
                  onChange={e =>
                    handleNotificationSettingChange("web", e.target.checked)
                  }
                />
                <label htmlFor="notify_web" className="text-gray-600 text-sm">On-Site</label>
              </div>
            </div>
          </div>

          {/* Payout Method Details (optional) */}
          <div>
            <label htmlFor="profile_payout" className="font-semibold text-gray-700 block">Payout Method (last 4)</label>
            <input
              id="profile_payout"
              type="text"
              name="payout_method_details"
              value={form.payout_method_details || ""}
              disabled={!editing}
              className={`mt-1 w-full py-2 px-3 rounded border ${editing ? "border-blue-400" : "border-gray-200"} bg-white text-gray-900 focus:outline-blue-500`}
              onChange={(e) => handleFieldChange("payout_method_details", e.target.value)}
              maxLength={32}
              placeholder="e.g. ****4321"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-row gap-3 justify-end mt-8">
            {!editing ? (
              <button
                type="button"
                className="px-5 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
                onClick={() => setEditing(true)}
                tabIndex={0}
              >
                Edit Profile
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-md bg-green-600 text-white font-semibold hover:bg-green-700 transition"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-md bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </>
            )}
            <button
              type="button"
              className="ml-4 px-4 py-2 rounded-md bg-gray-100 text-blue-800 font-medium hover:bg-blue-50 border border-blue-100"
              onClick={handleOpenChangePassword}
              tabIndex={0}
            >
              Change Password
            </button>
          </div>
        </form>

        {/* Success & Error Messages */}
        {successMessage && (
          <div className="mt-4 text-center text-green-600 font-semibold bg-green-50 rounded p-2 border border-green-200 animate-fade-in">
            {successMessage}
          </div>
        )}
        {(errorMessage || renderError) && (
          <div className="mt-4 text-center text-red-600 font-semibold bg-red-50 rounded p-2 border border-red-200 animate-fade-in">
            {errorMessage || renderError}
          </div>
        )}

        {/* Password Change Dialog */}
        {changePasswordDialogOpen && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black bg-opacity-20 animate-fade-in">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 border-2 border-blue-100 relative">
              <button
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-700"
                title="Close"
                aria-label="Close password dialog"
                onClick={handleCloseChangePassword}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-blue-700 mb-3">Change Password</h2>
              <form onSubmit={handlePasswordChangeSubmit} className="space-y-4">
                <div>
                  <label htmlFor="current_password" className="font-medium text-gray-700 block">Current Password</label>
                  <input
                    id="current_password"
                    type="password"
                    className="mt-1 w-full py-2 px-3 rounded border border-gray-200 bg-white text-gray-900 focus:outline-blue-500"
                    disabled={passwordForm.submitting}
                    value={passwordForm.currentPassword}
                    onChange={e => handlePasswordFieldChange("currentPassword", e.target.value)}
                  />
                  {passwordForm.errors?.currentPassword && (
                    <div className="text-xs text-red-600 mt-1">{passwordForm.errors.currentPassword}</div>
                  )}
                </div>
                <div>
                  <label htmlFor="new_password" className="font-medium text-gray-700 block">New Password</label>
                  <input
                    id="new_password"
                    type="password"
                    className="mt-1 w-full py-2 px-3 rounded border border-gray-200 bg-white text-gray-900 focus:outline-blue-500"
                    disabled={passwordForm.submitting}
                    value={passwordForm.newPassword}
                    onChange={e => handlePasswordFieldChange("newPassword", e.target.value)}
                  />
                  {passwordForm.errors?.newPassword && (
                    <div className="text-xs text-red-600 mt-1">{passwordForm.errors.newPassword}</div>
                  )}
                </div>
                <div>
                  <label htmlFor="confirm_password" className="font-medium text-gray-700 block">Confirm Password</label>
                  <input
                    id="confirm_password"
                    type="password"
                    className="mt-1 w-full py-2 px-3 rounded border border-gray-200 bg-white text-gray-900 focus:outline-blue-500"
                    disabled={passwordForm.submitting}
                    value={passwordForm.confirmPassword}
                    onChange={e => handlePasswordFieldChange("confirmPassword", e.target.value)}
                  />
                  {passwordForm.errors?.confirmPassword && (
                    <div className="text-xs text-red-600 mt-1">{passwordForm.errors.confirmPassword}</div>
                  )}
                </div>
                {/* Feature unavailable warning */}
                {passwordForm.errors?.global && (
                  <div className="text-center text-red-600 mt-2 font-semibold">
                    {passwordForm.errors.global}
                  </div>
                )}
                <div className="flex flex-row justify-end gap-4 mt-4">
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
                    disabled={passwordForm.submitting}
                  >
                    Change Password
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-md bg-gray-100 text-blue-800 font-medium hover:bg-blue-50 border border-blue-200"
                    onClick={handleCloseChangePassword}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default UV_Profile;
