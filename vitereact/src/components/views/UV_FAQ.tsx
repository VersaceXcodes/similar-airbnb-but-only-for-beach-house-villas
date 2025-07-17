import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

interface FaqItem {
  question_id: string;
  question: string;
  answer: string;
  expanded: boolean;
}

interface FaqSection {
  section_id: string;
  title: string;
  faqs: FaqItem[];
}

const DEFAULT_FAQ_SECTIONS: FaqSection[] = [
  {
    section_id: "how-it-works",
    title: "How BeachVillas Works",
    faqs: [
      {
        question_id: "how-search",
        question: "How do I search for a villa?",
        answer:
          "Enter your desired location, dates, and guests in the search bar. Use filters for amenities, price, and more.",
        expanded: false,
      },
      {
        question_id: "how-book",
        question: "How do I make a booking?",
        answer:
          "Select a villa, choose your dates, click 'Book Now,' and follow the prompts. You’ll receive a confirmation upon completion.",
        expanded: false,
      },
    ],
  },
  {
    section_id: "fees",
    title: "Fees & Payments",
    faqs: [
      {
        question_id: "fees-breakdown",
        question: "What fees are included in my booking?",
        answer:
          "Bookings include nightly rate, service fee, cleaning fee, and (if applicable) a security deposit—all shown in your price breakdown before confirming.",
        expanded: false,
      },
    ],
  },
  {
    section_id: "cancellations",
    title: "Cancellations & Refunds",
    faqs: [
      {
        question_id: "cancel-policy",
        question: "What is the cancellation policy?",
        answer:
          "Cancellation policies vary by villa and are clearly listed before you book. Refunds depend on how close to the check-in date you cancel.",
        expanded: false,
      },
      {
        question_id: "refund-timing",
        question: "How long do refunds take?",
        answer:
          "Refunds are processed immediately upon cancellation but may take 5-10 business days to appear on your bank statement, depending on your payment provider.",
        expanded: false,
      },
    ],
  },
  {
    section_id: "hosts",
    title: "For Hosts (Listing a Villa)",
    faqs: [
      {
        question_id: "host-onboard",
        question: "How do I list my villa?",
        answer:
          "Sign up as a host, complete your profile, and follow the step-by-step villa listing flow. Be sure to upload clear photos and set your availability.",
        expanded: false,
      },
      {
        question_id: "host-fees",
        question: "Are there fees for hosts?",
        answer:
          "BeachVillas charges a service fee on completed bookings. This fee is automatically deducted from your payout.",
        expanded: false,
      },
      {
        question_id: "host-payouts",
        question: "How and when do I get paid?",
        answer:
          "Payouts are processed after guest check-in, typically within 24-48 hours. You can set up your payout method in your profile settings.",
        expanded: false,
      },
    ],
  },
  {
    section_id: "safety",
    title: "Safety & Trust",
    faqs: [
      {
        question_id: "verification",
        question: "Are guests and hosts verified?",
        answer:
          "All users must sign up and verify their email. Additional verification may be requested for some listings at the host's discretion.",
        expanded: false,
      },
      {
        question_id: "support",
        question: "How do I report an issue or get help?",
        answer:
          "You can contact support via our contact form or support@beachvillas.com. For urgent matters, see our safety resources linked below.",
        expanded: false,
      },
    ],
  },
  {
    section_id: "legal",
    title: "Terms, Privacy & Legal",
    faqs: [
      {
        question_id: "terms",
        question: "Where can I find Terms of Service?",
        answer:
          "Our Terms of Service are available at the bottom of every page or directly at <Link to='/terms' className='text-blue-600 underline'>Terms of Service</Link>.",
        expanded: false,
      },
      {
        question_id: "privacy",
        question: "How do you use my data?",
        answer:
          "We value your privacy. See the <Link to='/privacy' className='text-blue-600 underline'>Privacy Policy</Link> for full details.",
        expanded: false,
      },
    ],
  },
];

const SECTION_ORDER = [
  "how-it-works",
  "fees",
  "cancellations",
  "hosts",
  "safety",
  "legal",
];

// Used to scroll to section anchors
function scrollToSection(sectionId: string) {
  const el = document.getElementById(`faq-section-${sectionId}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

const UV_FAQ: React.FC = () => {
  // States
  const [faqSections, setFaqSections] = useState<FaqSection[]>(DEFAULT_FAQ_SECTIONS);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filteredFaqSections, setFilteredFaqSections] = useState<FaqSection[]>(DEFAULT_FAQ_SECTIONS);
  const [activeSectionId, setActiveSectionId] = useState<string>(SECTION_ORDER[0]);

  // Handle search/filter logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFaqSections(faqSections);
      return;
    }
    const q = searchQuery.trim().toLowerCase();
    const newFiltered = faqSections
      .map((section) => {
        const filteredFaqs = section.faqs.filter(
          (faq) =>
            faq.question.toLowerCase().includes(q) ||
            (typeof faq.answer === "string"
              ? faq.answer.toLowerCase().includes(q)
              : false)
        );
        return filteredFaqs.length > 0
          ? { ...section, faqs: filteredFaqs }
          : null;
      })
      .filter(Boolean) as FaqSection[];
    setFilteredFaqSections(newFiltered);
  }, [searchQuery, faqSections]);

  // Anchor scroll for sidebar links
  const anchorRefs: { [section_id: string]: React.RefObject<HTMLDivElement> } = {};
  SECTION_ORDER.forEach((id) => {
    anchorRefs[id] = useRef<HTMLDivElement>(null);
  });

  // Scroll to section on sidebar/nav click
  const handleSetActiveSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    setTimeout(() => scrollToSection(sectionId), 50);
  };

  // Accordion toggle: Only one open per section
  const handleToggleFaq = (
    sectionIdx: number,
    faqIdx: number
  ) => {
    setFilteredFaqSections((prev) =>
      prev.map((section, sidx) => {
        if (sidx !== sectionIdx) return section;
        return {
          ...section,
          faqs: section.faqs.map((faq, fidx) => ({
            ...faq,
            expanded: fidx === faqIdx ? !faq.expanded : false,
          })),
        };
      })
    );
    // Mirror in base faqSections as well if cleared
    if (!searchQuery.trim()) {
      setFaqSections((prev) =>
        prev.map((section, sidx) => {
          if (sidx !== sectionIdx) return section;
          return {
            ...section,
            faqs: section.faqs.map((faq, fidx) => ({
              ...faq,
              expanded: fidx === faqIdx ? !faq.expanded : false,
            })),
          };
        })
      );
    }
  };

  // Watch for anchor navigation
  const location = useLocation();
  useEffect(() => {
    // If URL hash/anchor: /faq#safety etc (future proof)
    if (location.hash) {
      const sec = location.hash.replace(/^#/, "");
      if (SECTION_ORDER.includes(sec)) {
        setActiveSectionId(sec);
        setTimeout(() => scrollToSection(sec), 50);
      }
    }
  }, [location]);

  // If search reset, restore expansion state from base
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFaqSections(faqSections);
    }
  }, [faqSections]);

  // Empty results check
  const hasFaqs = filteredFaqSections.length > 0 && filteredFaqSections.some(s => s.faqs.length > 0);

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2">FAQ / How It Works</h1>
        <div className="text-lg text-gray-600 mb-6">
          Answers to the most common questions about BeachVillas' booking process, payments,
          listings, safety, legal and more. Use the search bar or jump to a section.
        </div>
        {/* Main layout */}
        <div className="flex flex-col md:flex-row gap-8">
          {/* Section nav */}
          <nav className="md:w-1/4 mb-6 md:mb-0">
            <div className="sticky top-24 bg-white z-0 border border-gray-100 rounded-lg shadow-sm p-4">
              <div className="font-bold mb-2 tracking-wide text-gray-700">On This Page</div>
              <ul className="space-y-1">
                {SECTION_ORDER.map((secId) => {
                  const sec = faqSections.find(s => s.section_id === secId);
                  if (!sec) return null;
                  return (
                    <li key={sec.section_id}>
                      <button
                        className={`block text-left w-full px-2 py-1 rounded transition
                          ${
                            activeSectionId === sec.section_id
                              ? "bg-blue-100 text-blue-700 font-semibold"
                              : "hover:bg-gray-100 text-gray-700"
                          }`}
                        onClick={() => handleSetActiveSection(sec.section_id)}
                      >
                        {sec.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>
          {/* FAQ content */}
          <div className="md:w-3/4">
            {/* Search box */}
            <div className="mb-6 relative">
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg py-2 pr-10 pl-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Search FAQs, keywords or topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search FAQ questions"
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  tabIndex={0}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none"
                    viewBox="0 0 20 20" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 6l8 8m0-8l-8 8" />
                  </svg>
                </button>
              )}
            </div>
            {/* FAQ List */}
            {hasFaqs ? (
              filteredFaqSections.map((section, sidx) => (
                <div
                  key={section.section_id}
                  id={`faq-section-${section.section_id}`}
                  className={`mb-8 scroll-mt-24`}
                  ref={anchorRefs[section.section_id]}
                >
                  <h2
                    className={`text-2xl font-bold mb-3 ${
                      section.section_id === activeSectionId
                        ? "text-blue-600"
                        : "text-gray-900"
                    }`}
                  >
                    {section.title}
                  </h2>
                  <div className="divide-y divide-gray-200">
                    {section.faqs.map((faq, fidx) => (
                      <div key={faq.question_id}>
                        <button
                          className={`w-full text-left px-2 py-4 focus:outline-none group transition
                            flex items-center justify-between 
                            ${faq.expanded ? "bg-blue-50" : "hover:bg-gray-50"}
                            `}
                          aria-expanded={faq.expanded}
                          aria-controls={`faq-answer-${section.section_id}-${faq.question_id}`}
                          onClick={() => handleToggleFaq(sidx, fidx)}
                        >
                          <span className="font-medium text-lg text-gray-800 pr-2">
                            {faq.question}
                          </span>
                          <svg
                            className={`w-5 h-5 ml-2 transform transition-transform duration-200 ${
                              faq.expanded ? "rotate-180 text-blue-600" : "text-gray-400"
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                        <div
                          id={`faq-answer-${section.section_id}-${faq.question_id}`}
                          className={`overflow-hidden transition-all px-4 pb-4 ${
                            faq.expanded
                              ? "max-h-96 opacity-100"
                              : "max-h-0 opacity-0 pointer-events-none"
                          }`}
                          aria-hidden={!faq.expanded}
                        >
                          <div className="text-gray-800 text-base pt-1">
                            {/* Render potential <Link>s in answer as React node if answer is a jsx */}
                            {typeof faq.answer === "string" &&
                            faq.answer.includes("<Link")
                              ? (
                                  // eslint-disable-next-line react/no-danger
                                  <span
                                    dangerouslySetInnerHTML={{ __html: faq.answer.replace(
                                      /<Link to='([^']+)'[^>]*>([^<]+)<\/Link>/g,
                                      (_, to, text) =>
                                        `<a href="${to}" class="text-blue-600 underline">${text}</a>`
                                    ) }}
                                  />
                                )
                              : faq.answer}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-lg py-16 text-center">
                <div className="mb-2">No FAQ topics found for "<b>{searchQuery}</b>".</div>
                <button
                  className="text-blue-600 underline"
                  onClick={() => setSearchQuery("")}
                >
                  Reset Search
                </button>
              </div>
            )}
            {/* Bottom links */}
            <div className="border-t border-gray-100 mt-12 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-gray-500">
              <div>
                <Link to="/terms" className="mr-6 text-blue-600 underline hover:text-blue-800">
                  Terms of Service
                </Link>
                <Link to="/privacy" className="mr-6 text-blue-600 underline hover:text-blue-800">
                  Privacy Policy
                </Link>
                <Link to="/contact" className="text-blue-600 underline hover:text-blue-800">
                  Contact / Support
                </Link>
              </div>
              <div>
                © {new Date().getFullYear()} BeachVillas.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default UV_FAQ;