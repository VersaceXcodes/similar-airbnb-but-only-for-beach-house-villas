import React from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";

// UV_Error: Generic fallback error/unavailable page. No API/zod/backend.

const ERROR_CONFIG: Record<
  string,
  {
    errorMessage: string;
    showRetry: boolean;
    illustrationUrl: string;
  }
> = {
  "404": {
    errorMessage: "Page not found.",
    showRetry: false,
    illustrationUrl: "https://picsum.photos/seed/error404/400/300",
  },
  "403": {
    errorMessage: "Access forbidden.",
    showRetry: false,
    illustrationUrl: "https://picsum.photos/seed/error403/400/300",
  },
  "500": {
    errorMessage: "Server error - something went wrong.",
    showRetry: true,
    illustrationUrl: "https://picsum.photos/seed/error500/400/300",
  },
  "network": {
    errorMessage: "Network connection lost or failed.",
    showRetry: true,
    illustrationUrl: "https://picsum.photos/seed/errorNet/400/300",
  },
  "timeout": {
    errorMessage: "Request timed out.",
    showRetry: true,
    illustrationUrl: "https://picsum.photos/seed/errortimeout/400/300",
  },
};

const DEFAULT_SUPPORT_URL = "https://beachvillas.example.com/support";
const DEFAULT_ILLUSTRATION_URL = "https://picsum.photos/seed/error/400/300";

const UV_Error: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Get error code from URL query (?code=...)
  let errorCode: string = "";
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const getErrorCodeFromQuery = (): string => {
    try {
      const params = new URLSearchParams(location.search);
      const codeParam = params.get("code");
      if (codeParam) return codeParam.trim();
    } catch {}
    return "";
  };

  errorCode = getErrorCodeFromQuery();

  // Map to config
  const errorConfig =
    (errorCode && ERROR_CONFIG[errorCode]) || undefined;

  const errorMessage =
    errorConfig?.errorMessage ||
    "Something went wrong. The page you requested is unavailable or an unknown error has occurred.";
  const showRetry = !!errorConfig?.showRetry;
  const illustrationUrl = errorConfig?.illustrationUrl || DEFAULT_ILLUSTRATION_URL;

  // Handler: Go Home (via router navigation)
  // Handler: Retry (reload previous page or reload site)
  const handleRetry = React.useCallback(() => {
    // Attempt to reload last route, falling back to full page reload
    // Quick hack: try history.back(), fall back to reload
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.reload();
    }
  }, []);

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-screen py-12 bg-gray-50">
        <div className="max-w-md w-full text-center px-4 relative">
          {/* Illustration */}
          <img
            src={illustrationUrl}
            alt="Error Illustration"
            className="mx-auto mb-8 rounded-lg shadow-lg w-full h-auto max-h-72 object-contain"
            loading="lazy"
          />
          {/* Error Code and Headline */}
          {errorCode ? (
            <span className="inline-block bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full mb-3">
              Error&nbsp;{errorCode}
            </span>
          ) : null}

          <h1 className="text-3xl font-extrabold text-gray-900 mb-4">
            {errorMessage}
          </h1>
          {/* Semantic tips */}
          <p className="text-sm text-gray-500 mb-8">
            {(errorCode === "404" || errorCode === "403") && "The page you’re looking for doesn't exist or access is restricted."}
            {errorCode === "500" && "Our team has been notified. Try again or go home."}
            {(errorCode === "network" || errorCode === "timeout") && "Check your internet connection and try again."}
            {!errorCode && "You may have followed an invalid link or hit an unhandled error."}
          </p>
          <div className="flex flex-col sm:flex-row sm:justify-center gap-4 mb-6">
            {/* Go Home always */}
            <Link
              to="/"
              className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold shadow hover:bg-blue-700 transition-all"
              aria-label="Go to Home Page"
            >
              Go Home
            </Link>
            {/* Retry Optionally */}
            {showRetry && (
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center justify-center px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold shadow hover:bg-gray-200 transition-all"
                aria-label="Retry"
              >
                Retry
              </button>
            )}
            {/* Support Link */}
            <a
              href={DEFAULT_SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-6 py-3 border border-gray-200 text-blue-700 bg-white rounded-lg font-semibold shadow hover:bg-blue-50 transition-all"
              aria-label="Contact Support"
            >
              Contact Support
            </a>
          </div>
          {/* Some small print/help line */}
          <div className="mt-4 text-xs text-gray-400">
            If the problem persists, please <a href={DEFAULT_SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="underline">contact BeachVillas support</a>.
          </div>
        </div>
      </div>
    </>
  );
};

export default UV_Error;