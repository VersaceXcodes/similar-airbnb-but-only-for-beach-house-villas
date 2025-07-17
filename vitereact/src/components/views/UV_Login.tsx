import React, { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { useAppStore } from "@/store/main";

// Minimal typing, could import from @schema if cross-shared.
interface LoginPayload {
  email: string;
  password?: string | null;
  provider?: string;
  provider_token?: string;
}
interface LoginResponse {
  token: string;
  user: {
    user_id: string;
    name: string;
    email: string;
    role: string;
    profile_photo_url?: string | null;
    is_active: boolean;
    notification_settings: any;
    payout_method_details?: string | null;
    is_verified_host?: boolean | null;
    phone?: string | null;
    about?: string | null;
    locale?: string | null;
    created_at?: number;
    updated_at?: number;
  };
}
interface ErrorResponse {
  message: string;
}

const API_URL = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}`;

const ROLE_OPTIONS = [
  { key: "guest", label: "Guest", description: "Travelers exploring and booking villas." },
  { key: "host", label: "Host", description: "Owners listing and renting their beach villas." },
  { key: "guest_host", label: "Both", description: "Book villas as a guest and host your own!" }
];

const UV_Login: React.FC = () => {
  // Zustand global setters/selectors (use selector pattern!)
  const set_user = useAppStore(s => s.set_user);
  const set_auth_token = useAppStore(s => s.set_auth_token);
  const set_error_banner = useAppStore(s => s.set_error_banner);

  const [form, setForm] = useState<{
    email: string;
    password: string;
    provider?: string;
    providerToken?: string;
    errors: { email?: string; password?: string; provider?: string; global?: string };
    submitting: boolean;
  }>({
    email: "",
    password: "",
    provider: undefined,
    providerToken: undefined,
    errors: {},
    submitting: false
  });

  const [showPasswordReset, setShowPasswordReset] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [rolePromptNeeded, setRolePromptNeeded] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const navigate = useNavigate();

  // --------- React Query Mutation for Login ----------
  const loginMutation = useMutation<LoginResponse, ErrorResponse, LoginPayload>({
    mutationFn: async (payload: LoginPayload) => {
      const { data } = await axios.post(
        `${API_URL}/auth/login`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );
      return data;
    },
    onSuccess: (data) => {
      // Store JWT + user in global state
      set_auth_token({ token: data.token, expires_at: Date.now() + 24 * 60 * 60 * 1000 }); // expires_at: required by store
      set_user({ ...data.user });
      // Role selection
      if (!data.user.role || data.user.role === "" || !(["host", "guest", "guest_host"].includes(data.user.role))) {
        setRolePromptNeeded(true);
        setLoading(false);
        setForm(prev => ({ ...prev, submitting: false }));
      } else {
        // Success: redirect to dashboard/host area based on role
        setRolePromptNeeded(false);
        setLoading(false);
        setForm(prev => ({ ...prev, submitting: false }));
        if (data.user.role === "host") {
          navigate("/host/listings", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      }
    },
    onError: (error: any) => {
      let msg = "Unknown error. Please try again.";
      if (axios.isAxiosError(error) && error.response) {
        const serverError: any = error.response.data;
        msg = typeof serverError?.message === "string" ? serverError.message : "Invalid login or authentication failed.";
      }
      setForm(prev => ({
        ...prev,
        errors: { ...prev.errors, global: msg },
        submitting: false
      }));
      setLoading(false);
      // Also propagate to global error banner for critical errors (API/network)
      set_error_banner({ message: msg, visible: true });
    }
  });

  // --------- Email/Password Login -----------
  const validateForm = () => {
    const errors: { email?: string; password?: string } = {};
    if (!form.email?.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Invalid email address";
    if (!form.password?.trim()) errors.password = "Password is required";
    return errors;
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
      errors: { ...prev.errors, [e.target.name]: undefined, global: undefined }
    }));
  };

  const handleLogin = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // Validation
      const errors = validateForm();
      if (Object.keys(errors).length > 0) {
        setForm(prev => ({
          ...prev,
          errors: { ...prev.errors, ...errors },
        }));
        return;
      }
      setForm(prev => ({ ...prev, submitting: true, errors: {} }));
      setLoading(true);
      loginMutation.mutate({ email: form.email, password: form.password });
    },
    [form.email, form.password, loginMutation]
  );

  // --------- Social/OAuth Login HANDLER - MOCK -----------
  // Inreal app you would use a real OAuth SDK (Google/Facebook) here.
  // For MVP, simulate with a fixed provider_token and email below.
  const handleOAuthLogin = (provider: "google" | "facebook") => {
    setForm(prev => ({
      ...prev,
      submitting: true,
      provider,
      providerToken: undefined,
      errors: { ...prev.errors, provider: undefined, global: undefined }
    }));
    setLoading(true);

    // In a real app, call Google's/Facebook's SDK and get provider_token.
    // Here, mimic that step:
    setTimeout(() => {
      // mock token
      const provider_token = "mock-token-" + provider;
      const mock_email =
        provider === "google"
          ? "google_user@example.com"
          : "facebook_user@example.com";
      loginMutation.mutate({
        provider,
        provider_token,
        email: mock_email,
        password: null,
      });
    }, 700);
  };

  // --------- Toggle Forgot Password ------------
  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate("/forgot-password");
  };

  // --------- Toggle Sign Up ------------
  const handleSignUp = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate("/signup");
  };

  // --------- Role Selection Prompt (Post-Login) ------------
  const handleSelectRole = async (key: string) => {
    setSelectedRole(key);
    setLoading(true);
    setForm(prev => ({ ...prev, submitting: true }));
    // PATCH /me -- But for now, as UV_Login doesn't require PATCH, just update store and redirect
    // In real app, would make PATCH /me call. We'll do local only for MVP.
    setTimeout(() => {
      const currUser = useAppStore.getState().user;
      if (currUser) {
        const updated = { ...currUser, role: key };
        set_user(updated);
        setLoading(false);
        setForm(prev => ({ ...prev, submitting: false }));
        if (key === "host") {
          navigate("/host/listings", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      }
    }, 500);
  };

  // ----------- UI RENDER -------------
  return (
    <>
      <div className="w-full flex flex-col items-center justify-center py-12 min-h-[80vh] bg-white">
        <div className="bg-white border border-gray-200 shadow rounded-xl w-full max-w-md p-8">
          {/* Logo/Brand */}
          <div className="flex flex-col items-center justify-center mb-7">
            <img
              src="https://picsum.photos/seed/beachvilla-login/80/80"
              alt="BeachVillas Logo"
              className="w-16 h-16 rounded-full mb-3"
            />
            <h1 className="text-2xl font-bold text-gray-800 mb-1">Sign in to BeachVillas</h1>
            <p className="text-gray-500 text-center text-sm">Exclusive beach house rentals. Log in for booking, hosting, and more!</p>
          </div>
          {/* Success Message */}
          {!!successMessage && (
            <div className="mb-3 px-3 py-2 rounded bg-green-50 text-green-700 text-sm border border-green-200">
              {successMessage}
            </div>
          )}
          {/* Global Error */}
          {form.errors.global && (
            <div className="mb-3 px-3 py-2 rounded bg-red-50 text-red-700 text-sm border border-red-200 animate-pulse">
              {form.errors.global}
            </div>
          )}
          {/* LOGIN FORM */}
          {!rolePromptNeeded ? (
            <form onSubmit={handleLogin} className="flex flex-col w-full gap-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  className={`w-full rounded border px-3 py-2 text-gray-800 bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none transition ${
                    form.errors.email
                      ? "border-red-400"
                      : "border-gray-300"
                  }`}
                  value={form.email}
                  onChange={handleFormChange}
                  disabled={loading || form.submitting}
                  required
                />
                {form.errors.email && (
                  <span className="text-xs text-red-600">{form.errors.email}</span>
                )}
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  className={`w-full rounded border px-3 py-2 text-gray-800 bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none transition ${
                    form.errors.password
                      ? "border-red-400"
                      : "border-gray-300"
                  }`}
                  value={form.password}
                  onChange={handleFormChange}
                  disabled={loading || form.submitting}
                  required
                />
                {form.errors.password && (
                  <span className="text-xs text-red-600">{form.errors.password}</span>
                )}
              </div>
              <div className="flex justify-between items-center text-xs">
                <button
                  type="button"
                  className="text-indigo-600 hover:underline"
                  onClick={handleForgotPassword}
                  tabIndex={0}
                  disabled={loading || form.submitting}
                >
                  Forgot Password?
                </button>
              </div>
              <button
                type="submit"
                className={`w-full py-2 mt-1 rounded-md font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition flex items-center justify-center
                  ${loading || form.submitting ? "opacity-70 cursor-not-allowed" : ""}
                `}
                disabled={loading || form.submitting}
              >
                {loading || form.submitting ? (
                  <svg
                    className="animate-spin h-5 w-5 mr-2 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    ></path>
                  </svg>
                ) : null}
                {loading || form.submitting ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            // ---------- ROLE SELECTION PROMPT -----------
            <div className="flex flex-col items-center gap-4 mt-3">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Select your role on BeachVillas</h2>
              <div className="flex flex-col gap-3 w-full">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    className={`w-full rounded-lg border px-4 py-3 text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition 
                      ${selectedRole === opt.key ? "border-indigo-600 bg-indigo-50" : "border-gray-300 bg-white"}
                      hover:border-indigo-400`}
                    disabled={loading}
                    onClick={() => handleSelectRole(opt.key)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium text-gray-900">{opt.label}</span>
                      {selectedRole === opt.key && (
                        <svg className="text-indigo-600 ml-2 h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{opt.description}</div>
                  </button>
                ))}
              </div>
              {loading && (
                <div className="flex items-center gap-2 mt-2 text-gray-500 text-sm">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                  </svg>
                  Setting your role...
                </div>
              )}
            </div>
          )}
          {/* -OR- Section */}
          {!rolePromptNeeded && (
            <div className="my-6 w-full flex flex-col items-center">
              <div className="relative w-full flex items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <div className="mx-2 text-xs text-gray-400">OR</div>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>
              <div className="flex flex-row w-full gap-3 mt-3">
                <button
                  type="button"
                  className="flex-1 flex justify-center items-center gap-2 bg-white border border-gray-300 rounded-md py-2 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                  onClick={() => handleOAuthLogin("google")}
                  disabled={loading || form.submitting}
                  aria-label="Sign in with Google"
                >
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="h-5 w-5 mr-1" />
                  Google
                </button>
                <button
                  type="button"
                  className="flex-1 flex justify-center items-center gap-2 bg-white border border-gray-300 rounded-md py-2 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                  onClick={() => handleOAuthLogin("facebook")}
                  disabled={loading || form.submitting}
                  aria-label="Sign in with Facebook"
                >
                  <img src="https://www.svgrepo.com/show/475698/facebook-color.svg" alt="Facebook" className="h-5 w-5 mr-1" />
                  Facebook
                </button>
              </div>
              {form.errors.provider && (
                <span className="text-xs text-red-600 mt-2">{form.errors.provider}</span>
              )}
            </div>
          )}
          {/* Sign up link and informational */}
          {!rolePromptNeeded && (
            <div className="text-sm text-center mt-8">
              <span className="text-gray-500 mr-1">Don't have an account?</span>
              <Link
                to="/signup"
                className="text-indigo-600 hover:underline font-medium"
                onClick={handleSignUp}
              >
                Sign Up
              </Link>
            </div>
          )}
          {/* Legal/Terms */}
          <div className="text-xs text-gray-400 text-center mt-6">
            By logging in, you accept our{" "}
            <a href="/faq" className="underline hover:text-indigo-600">Terms of Service</a>
            {" "}and{" "}
            <a href="/faq" className="underline hover:text-indigo-600">Privacy Policy</a>.
          </div>
        </div>
      </div>
    </>
  );
};

export default UV_Login;