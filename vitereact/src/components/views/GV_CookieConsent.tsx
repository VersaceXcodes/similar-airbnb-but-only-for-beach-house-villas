import React from "react";
import { useAppStore } from "@/store/main";
import { Link } from "react-router-dom";

// BeachVillas cookie consent banner
const GV_CookieConsent: React.FC = () => {
  // Selectors as per CRITICAL SELECTOR PATTERN
  const cookie_consent = useAppStore((s) => s.cookie_consent);
  const set_cookie_consent = useAppStore((s) => s.set_cookie_consent);
  const user = useAppStore((s) => s.user);

  // Only non-admins; do NOT render for admins at all
  if (user && user.role === "admin") return null;

  // If consent has been given OR dismissed, do not render (handled in AppShell, but double check here)
  if (cookie_consent && (cookie_consent.consent_given || cookie_consent.dismissed)) {
    return null;
  }

  // Accept handler
  const handleAccept = () => {
    set_cookie_consent({
      consent_given: true,
      dismissed: true,
      timestamp: Date.now(),
    });
  };

  // Decline handler
  const handleDecline = () => {
    set_cookie_consent({
      consent_given: false,
      dismissed: true,
      timestamp: Date.now(),
    });
  };

  // Hide/close handler (treated equivalently to decline)
  const handleClose = () => {
    set_cookie_consent({
      consent_given: false,
      dismissed: true,
      timestamp: Date.now(),
    });
  };

  // Render: accessible, fixed, attractive, privacy link, aria
  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none"
        role="dialog"
        aria-modal="false"
        aria-label="Cookie consent banner"
        data-testid="cookie-consent-banner"
      >
        <div
          className="bg-white border border-gray-200 shadow-2xl rounded-lg w-full max-w-xl mx-4 md:mx-0 mb-6 px-6 py-5 flex flex-col md:flex-row items-start md:items-center gap-4 pointer-events-auto"
        >
          {/* Content */}
          <div className="flex-1 text-gray-800 text-sm md:text-base">
            <span className="font-semibold text-gray-900">BeachVillas uses cookies</span> and similar technologies to give you the best website experience, help us analyze site usage, and deliver relevant content.{" "}
            Please review our <Link
              tabIndex={0}
              to="/faq"
              className="underline decoration-dotted hover:text-blue-700 text-blue-600 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="View our privacy and cookie policy"
            >privacy policy</Link> for more details.
          </div>
          {/* CTAs */}
          <div className="flex flex-col md:flex-row gap-2 md:gap-3 mt-0 md:mt-0 items-stretch md:items-center shrink-0">
            <button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-100"
              data-testid="cookie-consent-accept"
              onClick={handleAccept}
              aria-label="Accept cookies and privacy policy"
            >
              Accept
            </button>
            <button
              type="button"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-4 py-2 rounded shadow focus:outline-none focus:ring-2 focus:ring-gray-400 transition-all duration-100"
              data-testid="cookie-consent-decline"
              onClick={handleDecline}
              aria-label="Decline or manage cookie/tracking preferences"
            >
              Decline
            </button>
          </div>
          {/* Close X */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close cookie consent banner"
            className="ml-2 mt-2 md:mt-0 md:ml-3 flex items-center justify-center text-gray-400 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-full transition-all duration-100"
            style={{ fontSize: "1.25rem", lineHeight: "1" }}
            data-testid="cookie-consent-close"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default GV_CookieConsent;