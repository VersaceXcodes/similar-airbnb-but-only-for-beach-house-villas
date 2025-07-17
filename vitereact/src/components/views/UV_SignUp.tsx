import React, { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";

// Types
type RoleOption = "guest" | "host" | "guest_host";

// Config
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// For now, these are the roles allowed by backend (see Zod)
const ROLE_OPTIONS: { label: string; value: RoleOption }[] = [
  { label: "Guest", value: "guest" },
  { label: "Host", value: "host" },
  { label: "Both", value: "guest_host" },
];

// FormState type
interface FormState {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  role: RoleOption | "";
  agreedToTerms: boolean;
  provider?: string;
  providerToken?: string;
  errors: {
    name?: string;
    email?: string;
    password?: string;
    passwordConfirm?: string;
    role?: string;
    terms?: string;
    provider?: string;
    global?: string;
  };
  submitting: boolean;
}

const passwordMinLength = 8;

// Main component
const UV_SignUp: React.FC = () => {
  // Zustand global state setters (MUST use individual selectors)
  const set_user = useAppStore((s) => s.set_user);
  const set_auth_token = useAppStore((s) => s.set_auth_token);

  const navigate = useNavigate();

  // Local state
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    role: "",
    agreedToTerms: false,
    provider: undefined,
    providerToken: undefined,
    errors: {},
    submitting: false,
  });

  const [successMessage, setSuccessMessage] = useState<string>("");
  const [rolePromptNeeded, setRolePromptNeeded] = useState<boolean>(false);

  // Ref to prevent navigation more than once
  const hasNavigatedRef = useRef(false);

  // --- Field-level client-side validation ---
  function validateFields(f: FormState): FormState["errors"] {
    const errors: FormState["errors"] = {};
    // Required
    if (!f.name.trim()) errors.name = "Name is required";
    if (!f.email.trim())
      errors.email = "Email is required";
    else if (
      !/^[\w\-\.]+@[\w\-\.]+\.[a-zA-Z]{2,}$/.test(f.email.trim())
    )
      errors.email = "Email is invalid";
    if (!f.password)
      errors.password = "Password is required";
    else if (f.password.length < passwordMinLength)
      errors.password = `Password must be at least ${passwordMinLength} characters`;
    if (!f.passwordConfirm)
      errors.passwordConfirm = "Please confirm password";
    else if (f.password !== f.passwordConfirm)
      errors.passwordConfirm = "Passwords do not match";
    if (!f.role) errors.role = "Please select your role";
    if (!f.agreedToTerms)
      errors.terms = "You must agree to the Terms & Privacy Policy";
    return errors;
  }

  // React Query mutation for /auth/signup
  const signupMutation = useMutation<
    // Response shape
    { token: string; user: any },
    { message: string },
    Partial<{
      name: string;
      email: string;
      password: string;
      role: string;
      provider?: string;
      provider_token?: string;
    }>
  >(
    async (vars) => {
      const resp = await axios.post(
        `${API_BASE_URL}/auth/signup`,
        vars
      );
      return resp.data;
    },
    {
      onSuccess: (data) => {
        // Store in Zustand
        set_auth_token({
          token: data.token,
          expires_at: Date.now() / 1000 + 60 * 60 * 24, // just for completeness; backend provides
        });
        set_user(data.user);

        // Very basic clean-up
        setForm((prev) => ({
          ...prev,
          password: "",
          passwordConfirm: "",
          submitting: false,
        }));

        setSuccessMessage("Welcome to BeachVillas! Your account has been created.");
        setTimeout(() => {
          if (!hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            navigate("/dashboard", { replace: true });
          }
        }, 1500);
      },
      onError: (err: any) => {
        let apiError = "Sign up failed. Please try again.";
        if (err?.response?.data?.message) apiError = err.response.data.message;
        setForm((prev) => ({
          ...prev,
          errors: { ...prev.errors, global: apiError },
          submitting: false,
        }));
      },
    }
  );

  // Handler - normal signup
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Client validation
    const fieldErrors = validateFields(form);

    if (Object.keys(fieldErrors).length > 0) {
      setForm((prev) => ({ ...prev, errors: fieldErrors, submitting: false }));
      return;
    }

    // Prepare API input
    const { name, email, password, role, provider, providerToken } = form;
    setForm((prev) => ({ ...prev, errors: {}, submitting: true }));

    const payload: any = {
      name: name.trim(),
      email: email.trim(),
      role,
    };

    if (provider && providerToken) {
      payload.provider = provider;
      payload.provider_token = providerToken;
    } else {
      payload.password = password;
    }

    signupMutation.mutate(payload);
  }

  // Handler - field onChange
  function handleField<K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      errors: {
        ...prev.errors,
        [field]: undefined,
        global: undefined,
      },
    }));
  }

  // Handler - role selection
  function handleRoleChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleField("role", e.target.value as RoleOption);
  }

  // Handler - simulated OAuth signup button click
  function handleOAuthClick(provider: "google" | "facebook") {
    // For MVP, this would trigger OAuth provider flow; here, we mock it
    // In real life, use Google's/Facebook's JS SDKs to get provider_token
    // We'll simulate user gets name, email, and assign a fake token.
    const oauthStub = {
      name: "OAuth User",
      email: "oauthuser@example.com",
      provider,
      provider_token: `${provider}_SAMPLETOKEN_${Date.now()}`,
      role: form.role || "",
    };

    if (!form.role) {
      setRolePromptNeeded(true);
      setForm((prev) => ({
        ...prev,
        provider,
        providerToken: oauthStub.provider_token,
        errors: { ...prev.errors, role: "Please select a role to complete signup" },
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      name: oauthStub.name,
      email: oauthStub.email,
      password: "",
      passwordConfirm: "",
      provider,
      providerToken: oauthStub.provider_token,
      errors: {},
      submitting: true,
    }));

    signupMutation.mutate({
      name: oauthStub.name,
      email: oauthStub.email,
      role: form.role,
      provider,
      provider_token: oauthStub.provider_token,
    });
  }

  // Handler - close role selection modal (if implemented as UI overlay)
  function handleSelectRoleInPrompt(role: RoleOption) {
    setRolePromptNeeded(false);
    setForm((prev) => ({
      ...prev,
      role,
      errors: {
        ...prev.errors,
        role: undefined,
        global: undefined,
      },
    }));
  }

  // Render
  return (
    <>
      {/* Centered card */}
      <div className="w-full min-h-screen bg-gradient-to-r from-sky-100 to-blue-50 flex items-center justify-center py-8">
        <div className="w-full max-w-md bg-white shadow-lg rounded-xl p-8 relative">
          <h2 className="text-2xl font-bold text-center mb-4">Sign Up for BeachVillas</h2>
          <p className="text-center text-slate-600 mb-6">Create your account and start discovering the world’s best beach villas!</p>

          {/* Global/api error */}
          {form.errors.global && (
            <div className="mb-4 bg-red-100 text-red-700 border border-red-200 rounded px-4 py-2 text-sm text-center">
              {form.errors.global}
            </div>
          )}

          {/* Success message */}
          {successMessage && (
            <div className="mb-4 bg-green-100 text-green-800 border border-green-200 rounded px-4 py-2 text-sm text-center">
              {successMessage} Redirecting…
            </div>
          )}

          {/* MAIN SIGNUP FORM */}
          {!successMessage && (
            <form onSubmit={handleSubmit} autoComplete="off" noValidate>
              <div className="mb-4">
                <label className="block font-semibold mb-1 text-sm" htmlFor="signup-name">Full Name</label>
                <input
                  id="signup-name"
                  type="text"
                  className={`w-full p-2 border rounded focus:outline-none text-sm ${form.errors.name ? "border-red-400" : "border-slate-300"
                    }`}
                  placeholder="Your full name"
                  autoComplete="name"
                  value={form.name}
                  onChange={e => handleField("name", e.target.value)}
                  disabled={form.submitting}
                />
                {form.errors.name && (
                  <div className="text-xs text-red-600 mt-1">{form.errors.name}</div>
                )}
              </div>

              <div className="mb-4">
                <label className="block font-semibold mb-1 text-sm" htmlFor="signup-email">Email</label>
                <input
                  id="signup-email"
                  type="email"
                  className={`w-full p-2 border rounded focus:outline-none text-sm ${form.errors.email ? "border-red-400" : "border-slate-300"
                    }`}
                  placeholder="your@email.com"
                  autoComplete="email"
                  value={form.email}
                  onChange={e => handleField("email", e.target.value)}
                  disabled={form.submitting}
                />
                {form.errors.email && (
                  <div className="text-xs text-red-600 mt-1">{form.errors.email}</div>
                )}
              </div>

              <div className="mb-4">
                <label className="block font-semibold mb-1 text-sm" htmlFor="signup-password">Password</label>
                <input
                  id="signup-password"
                  type="password"
                  className={`w-full p-2 border rounded focus:outline-none text-sm ${form.errors.password ? "border-red-400" : "border-slate-300"
                    }`}
                  placeholder="Password"
                  autoComplete="new-password"
                  minLength={passwordMinLength}
                  value={form.password}
                  onChange={e => handleField("password", e.target.value)}
                  disabled={form.submitting}
                />
                {form.errors.password && (
                  <div className="text-xs text-red-600 mt-1">{form.errors.password}</div>
                )}
              </div>

              <div className="mb-4">
                <label className="block font-semibold mb-1 text-sm" htmlFor="signup-password-confirm">Confirm Password</label>
                <input
                  id="signup-password-confirm"
                  type="password"
                  className={`w-full p-2 border rounded focus:outline-none text-sm ${form.errors.passwordConfirm ? "border-red-400" : "border-slate-300"
                    }`}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  value={form.passwordConfirm}
                  onChange={e => handleField("passwordConfirm", e.target.value)}
                  disabled={form.submitting}
                />
                {form.errors.passwordConfirm && (
                  <div className="text-xs text-red-600 mt-1">{form.errors.passwordConfirm}</div>
                )}
              </div>

              {/* Role selection */}
              <div className="mb-4">
                <div className="block font-semibold mb-1 text-sm">Account Role</div>
                <div className="flex flex-row gap-3">
                  {ROLE_OPTIONS.map(opt => (
                    <label
                      key={opt.value}
                      className={`flex items-center p-2 border rounded cursor-pointer select-none ${form.role === opt.value
                        ? "border-blue-600 ring-2 ring-blue-300"
                        : "border-slate-300"
                        }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        className="mr-2"
                        value={opt.value}
                        checked={form.role === opt.value}
                        disabled={form.submitting}
                        onChange={handleRoleChange}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {form.errors.role && (
                  <div className="text-xs text-red-600 mt-1">{form.errors.role}</div>
                )}
              </div>

              <div className="mb-4 flex items-center">
                <input
                  type="checkbox"
                  id="tos"
                  name="tos"
                  className=""
                  checked={form.agreedToTerms}
                  onChange={e => handleField("agreedToTerms", e.target.checked)}
                  disabled={form.submitting}
                />
                <label htmlFor="tos" className="ml-2 text-sm">
                  I agree to the{" "}
                  <a
                    href="/faq#terms"
                    className="text-blue-600 underline hover:text-blue-800"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="/faq#privacy"
                    className="text-blue-600 underline hover:text-blue-800"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy Policy
                  </a>
                </label>
              </div>
              {form.errors.terms && (
                <div className="text-xs text-red-600 mb-1">{form.errors.terms}</div>
              )}

              <button
                type="submit"
                className="w-full py-2 px-4 mt-2 bg-blue-600 rounded text-white font-semibold hover:bg-blue-700 disabled:bg-blue-300 transition flex justify-center items-center"
                disabled={form.submitting}
              >
                {form.submitting ? (
                  <svg className="animate-spin mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    ></path>
                  </svg>
                ) : null}
                Create Account
              </button>
            </form>
          )}

          {/* Divider OR */}
          {!successMessage && (
            <div className="flex items-center mt-8 mb-2">
              <div className="flex-grow h-px bg-slate-300"></div>
              <div className="mx-3 text-slate-400 text-xs">or</div>
              <div className="flex-grow h-px bg-slate-300"></div>
            </div>
          )}

          {/* SOCIAL OAUTH BUTTONS (STUB) */}
          {!successMessage && (
            <div className="flex flex-col gap-2 mb-2">
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 font-semibold transition"
                disabled={form.submitting}
                onClick={() => handleOAuthClick("google")}
              >
                <img
                  src="https://www.svgrepo.com/show/355037/google.svg"
                  alt="Google"
                  className="w-5 h-5 mr-2"
                  loading="lazy"
                />{" "}
                Sign up with Google
              </button>
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 font-semibold transition"
                disabled={form.submitting}
                onClick={() => handleOAuthClick("facebook")}
              >
                <img
                  src="https://www.svgrepo.com/show/349535/facebook.svg"
                  alt="Facebook"
                  className="w-5 h-5 mr-2"
                  loading="lazy"
                />{" "}
                Sign up with Facebook
              </button>
            </div>
          )}

          {/* Existing account link */}
          {!successMessage && (
            <div className="text-center text-sm mt-3 mb-1">
              Already have an account?{" "}
              <Link
                to="/login"
                className="text-blue-600 hover:underline font-semibold"
              >
                Log In
              </Link>
            </div>
          )}

          {/* Legal links */}
          <div className="text-center mt-2">
            <a
              href="/faq#terms"
              className="text-xs text-slate-500 hover:underline mr-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>
            <span className="text-xs text-slate-400">|</span>
            <a
              href="/faq#privacy"
              className="text-xs text-slate-500 hover:underline ml-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
          </div>

          {/* Role prompt overlay modal */}
          {rolePromptNeeded && (
            <div className="fixed top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-30 z-30">
              <div className="bg-white max-w-sm w-full rounded-lg shadow-lg px-8 py-6">
                <h3 className="font-bold text-lg text-center mb-5">Select Your Role to Continue</h3>
                <div className="flex flex-col gap-3">
                  {ROLE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`border px-4 py-2 rounded font-semibold transition text-base ${
                        form.role === opt.value
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-blue-600 border-blue-300 hover:bg-blue-50"
                      }`}
                      onClick={() => handleSelectRoleInPrompt(opt.value)}
                      disabled={form.submitting}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  className="w-full mt-6 py-2 rounded bg-slate-300 hover:bg-slate-400 text-slate-700 font-semibold"
                  onClick={() => setRolePromptNeeded(false)}
                  disabled={form.submitting}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default UV_SignUp;