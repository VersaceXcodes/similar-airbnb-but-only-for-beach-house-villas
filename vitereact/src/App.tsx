import React from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/store/main";

// Shared Components
import GV_TopNav from "@/components/views/GV_TopNav.tsx";
import GV_Footer from "@/components/views/GV_Footer.tsx";
import GV_Notifications from "@/components/views/GV_Notifications.tsx";
import GV_ErrorBanner from "@/components/views/GV_ErrorBanner.tsx";
import GV_CookieConsent from "@/components/views/GV_CookieConsent.tsx";

// Unique Views
import UV_HomeLanding from "@/components/views/UV_HomeLanding.tsx";
import UV_SearchResults from "@/components/views/UV_SearchResults.tsx";
import UV_VillaDetail from "@/components/views/UV_VillaDetail.tsx";
import UV_BookingFlow from "@/components/views/UV_BookingFlow.tsx";
import UV_BookingConfirmation from "@/components/views/UV_BookingConfirmation.tsx";
import UV_Login from "@/components/views/UV_Login.tsx";
import UV_SignUp from "@/components/views/UV_SignUp.tsx";
import UV_ForgotPassword from "@/components/views/UV_ForgotPassword.tsx";
import UV_Profile from "@/components/views/UV_Profile.tsx";
import UV_GuestDashboard from "@/components/views/UV_GuestDashboard.tsx";
import UV_BookingDetails from "@/components/views/UV_BookingDetails.tsx";
import UV_MessagesInbox from "@/components/views/UV_MessagesInbox.tsx";
import UV_MessagesThread from "@/components/views/UV_MessagesThread.tsx";
import UV_HostDashboard_Listings from "@/components/views/UV_HostDashboard_Listings.tsx";
import UV_Host_CreateListing from "@/components/views/UV_Host_CreateListing.tsx";
import UV_Host_EditListing from "@/components/views/UV_Host_EditListing.tsx";
import UV_HostDashboard_Bookings from "@/components/views/UV_HostDashboard_Bookings.tsx";
import UV_Host_Earnings from "@/components/views/UV_Host_Earnings.tsx";
import UV_Reviews from "@/components/views/UV_Reviews.tsx";
import UV_Admin_Login from "@/components/views/UV_Admin_Login.tsx";
import UV_Admin_Dashboard from "@/components/views/UV_Admin_Dashboard.tsx";
import UV_Admin_Users from "@/components/views/UV_Admin_Users.tsx";
import UV_Admin_Listings from "@/components/views/UV_Admin_Listings.tsx";
import UV_Admin_Reviews from "@/components/views/UV_Admin_Reviews.tsx";
import UV_Admin_Bookings from "@/components/views/UV_Admin_Bookings.tsx";
import UV_Admin_Messages from "@/components/views/UV_Admin_Messages.tsx";
import UV_Error from "@/components/views/UV_Error.tsx";
import UV_FAQ from "@/components/views/UV_FAQ.tsx";

// For determining which global UI is visible depending on the route:
const ADMIN_PATHS = [
  "/admin",
  "/admin/login",
  "/admin/users",
  "/admin/listings",
  "/admin/reviews",
  "/admin/bookings",
  "/admin/messages"
];

// Utility hook to check admin/error route
function useRouteFlags() {
  const location = useLocation();
  const path = location.pathname;

  // admin: /admin or /admin/...
  const isAdminRoute =
    path === "/admin/login" ||
    path === "/admin" ||
    path.startsWith("/admin/");

  // error: we treat only the '*' route as error fallback AND direct hits to /error if routed
  const isErrorRoute =
    path === "/error" || path === "/404" || path === "/500" || path === "/forbidden" || path === "/unavailable";
  return { isAdminRoute, isErrorRoute, currentPath: path };
}

// Protect admin routes
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAppStore((s) => s.user);
  if (!user || user.role !== "admin") {
    // For API-secured actions, fail deeper, but for routing we redirect to error
    return <Navigate to="/error" replace />;
  }
  return <>{children}</>;
}

// Main AppShell: Global UI + page view
const AppShell: React.FC<{children: React.ReactNode}> = ({children}) => {
  const { isAdminRoute, isErrorRoute } = useRouteFlags();
  const errorBanner = useAppStore((s) => s.error_banner);
  const user = useAppStore((s) => s.user);
  const cookieConsent = useAppStore((s) => s.cookie_consent);

  // Only show notifications if user is authed, not admin, not on error page
  const showNotifications =
    !!user &&
    user.role !== "admin" &&
    !isAdminRoute &&
    !isErrorRoute;

  // TopNav & Footer are shown unless admin/error
  const showTopNav = !isAdminRoute && !isErrorRoute;
  const showFooter = !isAdminRoute && !isErrorRoute;

  // ErrorBanner unless admin/error and it's visible
  const showErrorBanner = errorBanner && errorBanner.visible && !isAdminRoute && !isErrorRoute;

  // CookieConsent unless admin or error or already consented
  const showCookieConsent =
    !isAdminRoute &&
    !isErrorRoute &&
    (!cookieConsent || (!cookieConsent.consent_given && !cookieConsent.dismissed));

  return (
    <div className="flex flex-col min-h-screen">
      {showErrorBanner && <GV_ErrorBanner />}
      {showTopNav && <GV_TopNav />}
      {showNotifications && <GV_Notifications />}
      <div className="flex-1 flex flex-col">
        {children}
      </div>
      {showFooter && <GV_Footer />}
      {showCookieConsent && <GV_CookieConsent />}
    </div>
  );
};

const queryClient = new QueryClient();

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AppShell>
          <Routes>
            {/* Public/Landing/Discovery */}
            <Route path="/" element={<UV_HomeLanding />} />
            <Route path="/search" element={<UV_SearchResults />} />
            <Route path="/villa/:villaId" element={<UV_VillaDetail />} />
            <Route path="/faq" element={<UV_FAQ />} />

            {/* Auth/Account */}
            <Route path="/login" element={<UV_Login />} />
            <Route path="/signup" element={<UV_SignUp />} />
            <Route path="/forgot-password" element={<UV_ForgotPassword />} />

            {/* Booking Flow */}
            <Route path="/booking/:villaId" element={<UV_BookingFlow />} />
            <Route path="/booking/confirmation/:bookingId" element={<UV_BookingConfirmation />} />
            <Route path="/booking/:bookingId/details" element={<UV_BookingDetails />} />

            {/* Profile/User/Guest/Host/Book & Msg */}
            <Route path="/profile" element={<UV_Profile />} />
            <Route path="/dashboard" element={<UV_GuestDashboard />} />
            <Route path="/messages" element={<UV_MessagesInbox />} />
            <Route path="/messages/:threadId" element={<UV_MessagesThread />} />

            {/* Host Dashboard */}
            <Route path="/host/listings" element={<UV_HostDashboard_Listings />} />
            <Route path="/host/listings/new" element={<UV_Host_CreateListing />} />
            <Route path="/host/listings/:villaId/edit" element={<UV_Host_EditListing />} />
            <Route path="/host/bookings" element={<UV_HostDashboard_Bookings />} />
            <Route path="/host/earnings" element={<UV_Host_Earnings />} />

            {/* Reviews */}
            <Route path="/reviews/:villaId" element={<UV_Reviews />} />

            {/* Admin Panel */}
            <Route path="/admin/login" element={<UV_Admin_Login />} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <UV_Admin_Dashboard />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAdmin>
                  <UV_Admin_Users />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/listings"
              element={
                <RequireAdmin>
                  <UV_Admin_Listings />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/reviews"
              element={
                <RequireAdmin>
                  <UV_Admin_Reviews />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/bookings"
              element={
                <RequireAdmin>
                  <UV_Admin_Bookings />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/messages"
              element={
                <RequireAdmin>
                  <UV_Admin_Messages />
                </RequireAdmin>
              }
            />

            {/* Error route / Fallback */}
            <Route path="/error" element={<UV_Error />} />
            <Route path="*" element={<UV_Error />} />
          </Routes>
        </AppShell>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

export default App;