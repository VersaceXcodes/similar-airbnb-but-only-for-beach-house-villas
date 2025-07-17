import React from "react";
import { useAppStore } from "@/store/main";

// Banner color mapping utility
const getBannerColor = (type: string): {
  bg: string;
  text: string;
  border: string;
  icon: JSX.Element;
} => {
  switch (type) {
    case "danger":
      return {
        bg: "bg-red-50",
        text: "text-red-800",
        border: "border-red-300",
        icon: (
          <svg className="h-6 w-6 text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.93-9.412c0-.42.34-.762.76-.762h.002c.423 0 .763.34.763.762V13.5a.762.762 0 11-1.525 0V8.588zm0-3.088a.762.762 0 111.525 0 .762.762 0 01-1.525 0z" clipRule="evenodd" />
          </svg>
        ),
      };
    case "warning":
      return {
        bg: "bg-yellow-50",
        text: "text-yellow-800",
        border: "border-yellow-300",
        icon: (
          <svg className="h-6 w-6 text-yellow-600 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10.29 3.86a1 1 0 00-1.58 0L2.25 12.52c-.38.5 0 1.2.59 1.2h14.32c.59 0 .97-.7.59-1.2l-6.46-8.66zM11 14a1 1 0 10-2 0 1 1 0 002 0zm-1-2a1 1 0 01-1-1V9a1 1 0 012 0v2a1 1 0 01-1 1z" clipRule="evenodd" />
          </svg>
        ),
      };
    case "success":
      return {
        bg: "bg-green-50",
        text: "text-green-800",
        border: "border-green-300",
        icon: (
          <svg className="h-6 w-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ),
      };
    case "info":
    default:
      return {
        bg: "bg-blue-50",
        text: "text-blue-800",
        border: "border-blue-200",
        icon: (
          <svg className="h-6 w-6 text-blue-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM9 9a1 1 0 112 0v3a1 1 0 11-2 0V9zm0-3a1 1 0 112 0 1 1 0 01-2 0z" clipRule="evenodd" />
          </svg>
        ),
      };
  }
};

const GV_ErrorBanner: React.FC = () => {
  // Get only needed store values/actions (no object selectors!)
  const message = useAppStore((s) => s.error_banner.message);
  const visible = useAppStore((s) => s.error_banner.visible);
  const clear_error_banner = useAppStore((s) => s.clear_error_banner);

  // Parse the message for a styled type prefix (eg: "[warning] ...")
  let type = "info";
  let displayMessage = message;
  if (typeof message === "string" && message.startsWith("[")) {
    const prefixMatch = message.match(/^\[(info|warning|danger|success)\]\s*(.*)$/i);
    if (prefixMatch) {
      type = prefixMatch[1].toLowerCase();
      displayMessage = prefixMatch[2];
    }
  }

  // Color and icon
  const { bg, text, border, icon } = getBannerColor(type);

  // Do not render if not visible or message empty
  if (!visible || !displayMessage || displayMessage.trim().length === 0) return null;

  return (
    <>
      <div
        className={`w-full z-50 ${bg} border-b ${border} shadow-md flex items-center px-4 py-3 md:px-8 sticky top-0 animate-in fade-in slide-in-from-top-5`}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        tabIndex={-1}
        style={{ minHeight: "3.25rem" }}
      >
        <div className="flex items-center flex-shrink-0">{icon}</div>
        <div className={`ml-3 flex-1 font-medium ${text} text-base truncate whitespace-pre-line`}>
          {displayMessage}
        </div>
        <button
          type="button"
          className="ml-3 flex-shrink-0 text-xl leading-none focus:outline-none rounded-full p-2 hover:bg-black/10 transition"
          aria-label="Dismiss notification banner"
          onClick={clear_error_banner}
          tabIndex={0}
        >
          <svg className={type === "danger" ? "text-red-400" : "text-gray-400"} height="20" width="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.225 6.225a.75.75 0 011.06 0L10 8.94l2.715-2.715a.75.75 0 111.06 1.06L11.062 10l2.715 2.715a.75.75 0 01-1.06 1.06L10 11.062l-2.715 2.715a.75.75 0 01-1.06-1.06L8.938 10l-2.713-2.715a.75.75 0 010-1.06z"/>
          </svg>
        </button>
      </div>
    </>
  );
};

export default GV_ErrorBanner;