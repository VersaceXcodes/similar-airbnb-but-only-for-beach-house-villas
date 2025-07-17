import React from "react";
import { Link } from "react-router-dom";

// Social icon SVGs (heroicons/outline, from CDN or raw SVG)
const ICON_STYLE =
  "w-6 h-6 md:w-5 md:h-5 text-gray-500 hover:text-blue-500 transition-colors";

export const GV_Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  // Social icons/svg (accessibility: label+title text)
  // Use outbound links and always new tab for socials
  return (
    <>
      <footer className="bg-gray-50 border-t border-gray-200 text-gray-700 text-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-8 md:gap-4 items-center md:items-start justify-between">
          {/* Main nav links */}
          <nav
            aria-label="Footer navigation"
            className="flex flex-col md:flex-row gap-2 md:gap-5 text-center"
          >
            <Link
              to="/"
              className="font-semibold hover:text-blue-700 transition-colors"
              tabIndex={0}
              aria-label="About BeachVillas"
            >
              About
            </Link>
            <Link
              to="/faq"
              className="font-semibold hover:text-blue-700 transition-colors"
              tabIndex={0}
              aria-label="FAQ and Help"
            >
              FAQ / Help
            </Link>
            <Link
              to="/"
              className="font-semibold hover:text-blue-700 transition-colors"
              tabIndex={0}
              aria-label="How BeachVillas Works"
            >
              How It Works
            </Link>
            <Link
              to="/faq"
              className="font-semibold hover:text-blue-700 transition-colors"
              tabIndex={0}
              aria-label="Contact Us"
            >
              Contact
            </Link>
            {/* Legal: external static URLs */}
            <a
              href="https://beachvillas.example/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:text-blue-700 transition-colors"
              tabIndex={0}
              aria-label="Terms of Service"
            >
              Terms
            </a>
            <a
              href="https://beachvillas.example/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:text-blue-700 transition-colors"
              tabIndex={0}
              aria-label="Privacy Policy"
            >
              Privacy
            </a>
          </nav>
          {/* Social and legal */}
          <div className="flex flex-col md:items-end items-center gap-4 md:gap-1 w-full md:w-auto">
            <div className="flex flex-row items-center justify-center gap-4 mb-2 md:mb-0">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter"
                title="Twitter"
                tabIndex={0}
                className="hover:text-blue-500"
              >
                {/* Twitter SVG */}
                <svg className={ICON_STYLE} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <title>Twitter</title>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M23 3a10.9 10.9 0 0 1-3.14 1.53A4.48 4.48 0 0 0 22.4.36c-.95.55-2 .95-3.12 1.16A4.48 4.48 0 0 0 16.15 0c-2.43 0-4.41 1.98-4.41 4.42 0 .35.04.69.11 1.01C7.69 5.3 4.07 3.48 1.64.87A4.47 4.47 0 0 0 .96 2.59c0 1.54.79 2.9 2 3.7a4.36 4.36 0 0 1-2-.56v.06c0 2.15 1.53 3.94 3.57 4.35-.37.1-.76.15-1.16.15-.28 0-.55-.03-.82-.08.55 1.71 2.16 2.95 4.07 2.99A9 9 0 0 1 0 19.54 12.78 12.78 0 0 0 6.92 21c8.3 0 12.84-6.89 12.84-12.85 0-.2 0-.4-.01-.59A9.22 9.22 0 0 0 23 3z"
                    />
                </svg>
                <span className="sr-only">Twitter</span>
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                title="Facebook"
                tabIndex={0}
                className="hover:text-blue-700"
              >
                {/* Facebook SVG */}
                <svg className={ICON_STYLE} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <title>Facebook</title>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 3.838A9 9 0 1 0 12 21v-7.065h-2.14V12h2.14v-1.539c0-2.125 1.225-3.304 3.096-3.304.896 0 1.83.158 1.83.158v2.01h-1.031c-1.016 0-1.332.634-1.332 1.285V12h2.265l-.362 1.935h-1.903V21a9 9 0 0 0 5.067-17.162z"
                  />
                </svg>
                <span className="sr-only">Facebook</span>
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                title="Instagram"
                tabIndex={0}
                className="hover:text-pink-600"
              >
                {/* Instagram SVG */}
                <svg className={ICON_STYLE} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <title>Instagram</title>
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" strokeWidth={2} stroke="currentColor" />
                  <circle cx="12" cy="12" r="5" strokeWidth={2} stroke="currentColor" />
                  <circle cx="18" cy="6" r="1.5" fill="currentColor" />
                </svg>
                <span className="sr-only">Instagram</span>
              </a>
            </div>
            <div className="text-xs text-gray-400 text-center md:text-right w-full md:w-auto mt-2 md:mt-0">
              &copy; {currentYear} BeachVillas.&nbsp;
              <span className="inline md:block">
                All rights reserved. &mdash; BeachVillas™
              </span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
};

export default GV_Footer;