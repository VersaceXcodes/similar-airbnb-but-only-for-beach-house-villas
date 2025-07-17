import React, { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";

// Types for API response/user
interface UserShort {
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
}

interface AuthToken {
  token: string;
  expires_at: number;
}

// API payload
interface AdminLoginPayload {
  email: string;
  password: string;
}

// API response
interface AuthLoginResponse {
  token: string;
  user: UserShort;
}

// Error response
interface ErrorResponse {
  message: string;
}

const ADMIN_LOGIN_LOCKOUT_COUNT = 5;

const UV_Admin_Login: React.FC = () => {
  // Local state for form/lockout/error
  const [form, setForm] = useState<{ email: string; password: string }>({
    email: "",
    password: "",
  });
  const [error, setError] = useState<string>("");
  const [lockoutCount, setLockoutCount] = useState<number>(0);

  // Zustand global setters
  const set_auth_token = useAppStore((s) => s.set_auth_token);
  const set_user = useAppStore((s) => s.set_user);
  const set_error_banner = useAppStore((s) => s.set_error_banner);

  const navigate = useNavigate();

  // Autofocus email on mount
  const emailInputRef = useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (emailInputRef.current) emailInputRef.current.focus();
  }, []);

  // React Query mutation for login
  const { mutate, isLoading } = useMutation<
    AuthLoginResponse,
    Error,
    AdminLoginPayload
  >(
    async (payload) => {
      const response = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/auth/login`,
        payload,
        { validateStatus: () => true }
      );
      if (response.status === 200) {
        return response.data;
      } else if (response.data && response.data.message) {
        // Throw with message from server
        throw new Error((response.data as ErrorResponse).message);
      } else {
        throw new Error("Unknown error occurred");
      }
    },
    {
      onSuccess: (data) => {
        // Require admin role
        if (!data.user || data.user.role !== "admin") {
          set_user(null);
          set_auth_token(null);
          setError(
            "You must be an admin to log in. This account is not authorized."
          );
          setLockoutCount((c) => c + 1);
          return;
        }
        set_auth_token({ token: data.token, expires_at: Date.now() + 60 * 60 * 1000 }); // expires_at placeholder
        set_user(data.user);
        setError("");
        setLockoutCount(0);
        // Go to admin dashboard
        navigate("/admin", { replace: true });
      },
      onError: (e: Error) => {
        set_user(null);
        set_auth_token(null);
        setError(e.message || "Login failed. Please try again.");
        setLockoutCount((count) => count + 1);
        // Optional: Lockout system error shows error banner
        if (lockoutCount + 1 >= ADMIN_LOGIN_LOCKOUT_COUNT) {
          set_error_banner({
            message:
              "Too many failed attempts. Please wait or contact your system administrator.",
            visible: true,
          });
        }
      },
    }
  );

  // Handle form change, clear error if present
  const handleFormChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setForm((f) => ({ ...f, [name]: value }));
      if (error) setError("");
    },
    [error]
  );

  // Submit handler
  const onSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      // Lockout logic
      if (lockoutCount >= ADMIN_LOGIN_LOCKOUT_COUNT) return;
      setError("");
      mutate({
        email: form.email.trim(),
        password: form.password,
      });
    },
    [form, mutate, lockoutCount]
  );

  // Accessibility: submit on Enter in any field
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSubmit();
    }
  };

  // ErrorBoundary Fallback
  const [hasError, setHasError] = React.useState(false);
  // Error boundary pattern
  const errorBoundaryHandler: React.ErrorInfo = React.useCallback(
    (error: any) => {
      console.error("Admin Login Error:", error);
      setHasError(true);
      set_error_banner({
        message:
          "A fatal error occurred in the Admin Login screen. Please try refreshing the page.",
        visible: true,
      });
    },
    [set_error_banner]
  );

  // UI
  return (
    <>
      {/* Simple custom error boundary logic */}
      {hasError ? (
        <div className="flex items-center justify-center h-screen bg-neutral-100">
          <div className="bg-white p-8 rounded shadow max-w-sm w-full text-center border border-red-400">
            <div className="mb-2 text-2xl font-semibold text-red-700">Unexpected Error</div>
            <div className="mb-3 text-gray-700">
              There was a problem loading the admin login. Please try reloading the page or contact support.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-sky-100 to-slate-300">
          <div
            className="bg-white shadow-lg rounded-lg w-full max-w-md p-8 border border-slate-200"
            role="main"
            aria-label="Admin Login Panel"
          >
            <div className="text-center mb-6">
              <div className="text-3xl font-bold tracking-tight text-slate-700 mb-2">
                Admin Login
              </div>
              <div className="text-slate-500 text-sm">
                BeachVillas Platform Administrator Access
              </div>
            </div>
            <form
              className="space-y-4"
              onSubmit={onSubmit}
              autoComplete="off"
              aria-label="Admin Login Form"
            >
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email Address
                </label>
                <input
                  ref={emailInputRef}
                  type="email"
                  name="email"
                  id="email"
                  inputMode="email"
                  autoComplete="username"
                  autoFocus
                  value={form.email}
                  onChange={handleFormChange}
                  onKeyDown={onKeyDown}
                  className={`mt-1 block w-full rounded border px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 ${
                    error
                      ? "border-red-400 focus:ring-red-200"
                      : "border-slate-300 focus:ring-blue-100"
                  }`}
                  disabled={isLoading || lockoutCount >= ADMIN_LOGIN_LOCKOUT_COUNT}
                  required
                  aria-invalid={!!error}
                  aria-describedby={error ? "email-error" : undefined}
                />
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  id="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleFormChange}
                  onKeyDown={onKeyDown}
                  className={`mt-1 block w-full rounded border px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 ${
                    error
                      ? "border-red-400 focus:ring-red-200"
                      : "border-slate-300 focus:ring-blue-100"
                  }`}
                  disabled={isLoading || lockoutCount >= ADMIN_LOGIN_LOCKOUT_COUNT}
                  required
                  aria-invalid={!!error}
                  aria-describedby={error ? "password-error" : undefined}
                />
              </div>

              {/* Error/Lockout Handling */}
              {error && (
                <div
                  className="mt-2 rounded bg-red-100 border border-red-300 text-red-700 px-3 py-2 text-sm"
                  role="alert"
                  id="login-error"
                >
                  {error}
                </div>
              )}
              {lockoutCount > 0 && lockoutCount < ADMIN_LOGIN_LOCKOUT_COUNT && (
                <div className="text-xs text-orange-500 ml-1">
                  {`Warning: ${ADMIN_LOGIN_LOCKOUT_COUNT - lockoutCount
                    } attempt${ADMIN_LOGIN_LOCKOUT_COUNT - lockoutCount === 1 ? "" : "s"
                    } remaining before lockout.`}
                </div>
              )}

              {/* Lockout disables form */}
              {lockoutCount >= ADMIN_LOGIN_LOCKOUT_COUNT && (
                <div
                  className="mt-2 rounded bg-red-50 border border-red-200 text-red-600 px-3 py-2 text-xs"
                  role="alert"
                  id="lockout-message"
                >
                  Too many failed attempts. Your admin login has been temporarily locked.<br />
                  Please contact your system administrator.<br />
                  <span className="text-slate-500">
                    (This form is now disabled.)
                  </span>
                </div>
              )}

              {/* Submit */}
              <div className="mt-4">
                <button
                  type="submit"
                  disabled={
                    isLoading ||
                    lockoutCount >= ADMIN_LOGIN_LOCKOUT_COUNT ||
                    !form.email.trim() ||
                    !form.password
                  }
                  className={`w-full py-2 px-4 rounded font-medium transition ${
                    isLoading || lockoutCount >= ADMIN_LOGIN_LOCKOUT_COUNT
                      ? "bg-slate-300 text-slate-400 cursor-not-allowed"
                      : "bg-sky-700 text-white hover:bg-sky-800"
                  }`}
                  aria-busy={isLoading}
                >
                  {isLoading ? "Checking..." : "Login"}
                </button>
              </div>
            </form>

            {/* Footer */}
            <div className="mt-6 text-center text-xs text-slate-500">
              For authorized BeachVillas staff only.<br />
              <span className="text-xs text-slate-400 select-none">
                &copy; {new Date().getFullYear()} BeachVillas Admin
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UV_Admin_Login;