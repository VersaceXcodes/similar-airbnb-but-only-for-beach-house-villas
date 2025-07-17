import React, { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { Link } from "react-router-dom";

// For schema type safety (optional, but contract is known)
interface PasswordResetRequest {
  email: string;
}

interface ErrorResponse {
  message: string;
}

// Client API endpoint (as specified)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const FORGOT_PASSWORD_URL = `${API_BASE_URL}/auth/forgot-password`;

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UV_ForgotPassword: React.FC = () => {
  const [form, setForm] = useState<{
    email: string;
    errors: { email?: string; global?: string };
    submitting: boolean;
  }>({
    email: "",
    errors: {},
    submitting: false,
  });

  const [successMessage, setSuccessMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const emailInputRef = useRef<HTMLInputElement>(null);

  // React Query mutation for password reset
  const forgotPasswordMutation = useMutation<void, AxiosError<ErrorResponse>, PasswordResetRequest>({
    mutationFn: async (payload) => {
      // POST /auth/forgot-password expects 204 on success
      await axios.post(FORGOT_PASSWORD_URL, payload, {
        headers: { "Content-Type": "application/json" },
        validateStatus: (status) => status === 204 || (status >= 400 && status < 500),
      });
    },
    onSuccess: () => {
      setSuccessMessage("If your email exists in our system, a password reset link has been sent. Please check your inbox.");
      setForm({ email: "", errors: {}, submitting: false });
      setLoading(false);
    },
    onError: (error) => {
      // Hide internal error details, only show generic error
      let globalError = "Unable to send password reset email at this time. Please try again later.";
      if (error?.response && error.response.data?.message) {
        globalError = error.response.data.message;
      }
      setForm((f) => ({
        ...f,
        submitting: false,
        errors: { global: globalError }
      }));
      setSuccessMessage("");
      setLoading(false);
      // Optionally autofocus the email input for retry
      if (emailInputRef.current) emailInputRef.current.focus();
    }
  });

  // Email change handler
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({
      ...prev,
      email: e.target.value,
      errors: { ...prev.errors, email: undefined, global: undefined }
    }));
    setSuccessMessage("");
  };

  // Client-side validation
  const validateEmail = (email: string): string | undefined => {
    if (!email.trim()) return "Email is required.";
    if (!EMAIL_REGEX.test(email.trim())) return "Please enter a valid email address.";
    return undefined;
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setForm((prev) => ({ ...prev, errors: { email: undefined, global: undefined }, submitting: true }));
    setLoading(true);
    setSuccessMessage("");

    // Validate email first
    const emailError = validateEmail(form.email);
    if (emailError) {
      setForm((prev) => ({ ...prev, errors: { email: emailError }, submitting: false }));
      setLoading(false);
      // Focus field to guide user
      if (emailInputRef.current) emailInputRef.current.focus();
      return;
    }

    // Fire react-query mutation
    forgotPasswordMutation.mutate({ email: form.email.trim() });
  };

  return (
    <>
      <div className="max-w-md mx-auto mt-16 px-6 py-8 bg-white shadow-md rounded-lg border border-gray-200">
        <h2 className="text-2xl font-semibold mb-3 text-center text-gray-800">Forgot Password</h2>
        <p className="mb-6 text-gray-600 text-sm text-center">
          Enter your email address below. We will send you a link to reset your password if your account exists.
        </p>

        {successMessage && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-700 text-sm text-center" data-testid="success-message">
            {successMessage}
          </div>
        )}
        {form.errors.global && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm text-center" data-testid="error-message">
            {form.errors.global}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-5">
            <label htmlFor="email" className="block text-gray-800 font-medium mb-2">
              Email address
            </label>
            <input
              ref={emailInputRef}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className={`w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 ${form.errors.email ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
              placeholder="you@email.com"
              value={form.email}
              onChange={handleEmailChange}
              disabled={loading || form.submitting}
              aria-invalid={Boolean(form.errors.email)}
              aria-describedby={form.errors.email ? "email-error" : undefined}
              required
            />
            {form.errors.email && (
              <p id="email-error" className="text-xs text-red-600 mt-2">
                {form.errors.email}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium rounded py-2 transition disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={loading || form.submitting}
            aria-disabled={loading || form.submitting}
          >
            {loading ?
              <span className="flex items-center">
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
                Sending...
              </span>
            : "Send Reset Email"}
          </button>
        </form>
        <div className="mt-8 text-center">
          <Link
            to="/login"
            className="text-sm text-blue-600 hover:underline font-medium"
            tabIndex={0}
            data-testid="back-to-login-link"
          >
            &larr; Back to Login
          </Link>
        </div>
      </div>
    </>
  );
};

export default UV_ForgotPassword;