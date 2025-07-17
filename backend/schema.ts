import { z } from 'zod';

// 1. USERS ===========================================================

export const userSchema = z.object({
  user_id: z.string(),
  email: z.string().email(),
  password_hash: z.string(),
  name: z.string(),
  profile_photo_url: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.string(),
  is_active: z.boolean(),
  notification_settings: z.string(),
  payout_method_details: z.string().nullable(),
  is_verified_host: z.boolean().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});

// Input for creating a user
export const createUserInputSchema = z.object({
  email: z.string().email(),
  password_hash: z.string().min(8),
  name: z.string().min(1).max(255),
  profile_photo_url: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(['admin', 'host', 'guest', 'guest_host']),
  is_active: z.boolean().optional(),
  notification_settings: z.string().optional(), // validated JSON string
  payout_method_details: z.string().nullable().optional(),
  is_verified_host: z.boolean().optional(),
});

// Input for updating a user
export const updateUserInputSchema = z.object({
  user_id: z.string(),
  email: z.string().email().optional(),
  password_hash: z.string().min(8).optional(),
  name: z.string().min(1).max(255).optional(),
  profile_photo_url: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(['admin', 'host', 'guest', 'guest_host']).optional(),
  is_active: z.boolean().optional(),
  notification_settings: z.string().optional(),
  payout_method_details: z.string().nullable().optional(),
  is_verified_host: z.boolean().optional(),
});

// Query/search schema
export const searchUserInputSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['name', 'created_at', 'email']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  role: z.enum(['admin', 'host', 'guest', 'guest_host']).optional(),
  is_active: z.boolean().optional(),
});

// API response schema example
export const userResponseSchema = z.object({
  data: userSchema,
});

export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type SearchUserInput = z.infer<typeof searchUserInputSchema>;

// 2. USER PROFILES =======================================================

export const userProfileSchema = z.object({
  profile_id: z.string(),
  user_id: z.string(),
  about: z.string().nullable(),
  locale: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});

export const createUserProfileInputSchema = z.object({
  user_id: z.string(),
  about: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
});

export const updateUserProfileInputSchema = z.object({
  profile_id: z.string(),
  about: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
});

export const searchUserProfileInputSchema = z.object({
  user_id: z.string().optional(),
  locale: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at', 'locale']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const userProfileResponseSchema = z.object({ data: userProfileSchema });

export type UserProfile = z.infer<typeof userProfileSchema>;
export type CreateUserProfileInput = z.infer<typeof createUserProfileInputSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileInputSchema>;
export type SearchUserProfileInput = z.infer<typeof searchUserProfileInputSchema>;

// 3. VILLAS =======================================================

export const villaSchema = z.object({
  villa_id: z.string(),
  host_user_id: z.string(),
  name: z.string(),
  short_description: z.string(),
  long_description: z.string(),
  address: z.string(),
  city: z.string(),
  country: z.string(),
  latitude: z.string(),
  longitude: z.string(),
  max_occupancy: z.number().int(),
  is_instant_book: z.boolean(),
  status: z.string(),
  base_price_per_night: z.number().int(),
  minimum_stay_nights: z.number().int(),
  security_deposit: z.number().int().nullable(),
  cleaning_fee: z.number().int().nullable(),
  service_fee: z.number().int().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
  admin_notes: z.string().nullable(),
});

export const createVillaInputSchema = z.object({
  host_user_id: z.string(),
  name: z.string().min(1).max(255),
  short_description: z.string().min(1).max(255),
  long_description: z.string().min(1),
  address: z.string().min(1).max(255),
  city: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  latitude: z.string(),
  longitude: z.string(),
  max_occupancy: z.number().int().positive(),
  is_instant_book: z.boolean().optional(),
  status: z.string().optional(), // Optionally replace with enum if app uses one
  base_price_per_night: z.number().int().min(0),
  minimum_stay_nights: z.number().int().min(1),
  security_deposit: z.number().int().nullable().optional(),
  cleaning_fee: z.number().int().nullable().optional(),
  service_fee: z.number().int().nullable().optional(),
  admin_notes: z.string().nullable().optional(),
});

export const updateVillaInputSchema = z.object({
  villa_id: z.string(),
  host_user_id: z.string().optional(),
  name: z.string().min(1).max(255).optional(),
  short_description: z.string().min(1).max(255).optional(),
  long_description: z.string().min(1).optional(),
  address: z.string().min(1).max(255).optional(),
  city: z.string().min(1).max(100).optional(),
  country: z.string().min(1).max(100).optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  max_occupancy: z.number().int().positive().optional(),
  is_instant_book: z.boolean().optional(),
  status: z.string().optional(),
  base_price_per_night: z.number().int().min(0).optional(),
  minimum_stay_nights: z.number().int().min(1).optional(),
  security_deposit: z.number().int().nullable().optional(),
  cleaning_fee: z.number().int().nullable().optional(),
  service_fee: z.number().int().nullable().optional(),
  admin_notes: z.string().nullable().optional(),
});

export const searchVillaInputSchema = z.object({
  query: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  host_user_id: z.string().optional(),
  status: z.string().optional(),
  is_instant_book: z.boolean().optional(),
  min_price: z.number().int().optional(),
  max_price: z.number().int().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['name', 'created_at', 'base_price_per_night']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const villaResponseSchema = z.object({ data: villaSchema });

export type Villa = z.infer<typeof villaSchema>;
export type CreateVillaInput = z.infer<typeof createVillaInputSchema>;
export type UpdateVillaInput = z.infer<typeof updateVillaInputSchema>;
export type SearchVillaInput = z.infer<typeof searchVillaInputSchema>;

// 4. VILLA PHOTOS =======================================================

export const villaPhotoSchema = z.object({
  photo_id: z.string(),
  villa_id: z.string(),
  photo_url: z.string(),
  sort_order: z.number().int(),
  uploaded_at: z.number(),
  caption: z.string().nullable(),
});

export const createVillaPhotoInputSchema = z.object({
  villa_id: z.string(),
  photo_url: z.string().url(),
  sort_order: z.number().int().min(0),
  caption: z.string().nullable().optional(),
});

export const updateVillaPhotoInputSchema = z.object({
  photo_id: z.string(),
  photo_url: z.string().url().optional(),
  sort_order: z.number().int().min(0).optional(),
  caption: z.string().nullable().optional(),
});

export const searchVillaPhotoInputSchema = z.object({
  villa_id: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['sort_order', 'uploaded_at']).default('uploaded_at'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export const villaPhotoResponseSchema = z.object({ data: villaPhotoSchema });

export type VillaPhoto = z.infer<typeof villaPhotoSchema>;
export type CreateVillaPhotoInput = z.infer<typeof createVillaPhotoInputSchema>;
export type UpdateVillaPhotoInput = z.infer<typeof updateVillaPhotoInputSchema>;
export type SearchVillaPhotoInput = z.infer<typeof searchVillaPhotoInputSchema>;

// 5. AMENITIES =======================================================

export const amenitySchema = z.object({
  amenity_id: z.string(),
  name: z.string(),
  icon_url: z.string().nullable(),
  key: z.string(),
});

export const createAmenityInputSchema = z.object({
  name: z.string().min(1).max(100),
  icon_url: z.string().url().nullable().optional(),
  key: z.string().min(1).max(100),
});

export const updateAmenityInputSchema = z.object({
  amenity_id: z.string(),
  name: z.string().min(1).max(100).optional(),
  icon_url: z.string().url().nullable().optional(),
  key: z.string().min(1).max(100).optional(),
});

export const searchAmenityInputSchema = z.object({
  key: z.string().optional(),
  name: z.string().optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['name', 'amenity_id']).default('name'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export const amenityResponseSchema = z.object({ data: amenitySchema });

export type Amenity = z.infer<typeof amenitySchema>;
export type CreateAmenityInput = z.infer<typeof createAmenityInputSchema>;
export type UpdateAmenityInput = z.infer<typeof updateAmenityInputSchema>;
export type SearchAmenityInput = z.infer<typeof searchAmenityInputSchema>;

// 6. VILLA AMENITIES ===================================================

export const villaAmenitySchema = z.object({
  villa_amenity_id: z.string(),
  villa_id: z.string(),
  amenity_id: z.string(),
});

export const createVillaAmenityInputSchema = z.object({
  villa_id: z.string(),
  amenity_id: z.string(),
});

export const updateVillaAmenityInputSchema = z.object({
  villa_amenity_id: z.string(),
  villa_id: z.string().optional(),
  amenity_id: z.string().optional(),
});

export const searchVillaAmenityInputSchema = z.object({
  villa_id: z.string().optional(),
  amenity_id: z.string().optional(),
  limit: z.number().int().positive().default(30),
  offset: z.number().int().nonnegative().default(0),
});

export const villaAmenityResponseSchema = z.object({ data: villaAmenitySchema });

export type VillaAmenity = z.infer<typeof villaAmenitySchema>;
export type CreateVillaAmenityInput = z.infer<typeof createVillaAmenityInputSchema>;
export type UpdateVillaAmenityInput = z.infer<typeof updateVillaAmenityInputSchema>;
export type SearchVillaAmenityInput = z.infer<typeof searchVillaAmenityInputSchema>;

// 7. VILLA RULES =======================================================

export const villaRuleSchema = z.object({
  villa_rule_id: z.string(),
  villa_id: z.string(),
  rule_type: z.string(),
  value: z.string(),
  created_at: z.number(),
});

export const createVillaRuleInputSchema = z.object({
  villa_id: z.string(),
  rule_type: z.string().min(1).max(100),
  value: z.string().min(1).max(255),
});

export const updateVillaRuleInputSchema = z.object({
  villa_rule_id: z.string(),
  rule_type: z.string().min(1).max(100).optional(),
  value: z.string().min(1).max(255).optional(),
});

export const searchVillaRuleInputSchema = z.object({
  villa_id: z.string().optional(),
  rule_type: z.string().optional(),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export const villaRuleResponseSchema = z.object({ data: villaRuleSchema });

export type VillaRule = z.infer<typeof villaRuleSchema>;
export type CreateVillaRuleInput = z.infer<typeof createVillaRuleInputSchema>;
export type UpdateVillaRuleInput = z.infer<typeof updateVillaRuleInputSchema>;
export type SearchVillaRuleInput = z.infer<typeof searchVillaRuleInputSchema>;

// 8. VILLA AVAILABILITY ================================================

export const villaAvailabilitySchema = z.object({
  villa_availability_id: z.string(),
  villa_id: z.string(),
  date: z.string(),
  is_available: z.boolean(),
  price_override: z.number().int().nullable(),
  minimum_stay_override: z.number().int().nullable(),
  note: z.string().nullable(),
});

export const createVillaAvailabilityInputSchema = z.object({
  villa_id: z.string(),
  date: z.string().length(8), // yyyymmdd
  is_available: z.boolean().optional(),
  price_override: z.number().int().nullable().optional(),
  minimum_stay_override: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const updateVillaAvailabilityInputSchema = z.object({
  villa_availability_id: z.string(),
  is_available: z.boolean().optional(),
  price_override: z.number().int().nullable().optional(),
  minimum_stay_override: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const searchVillaAvailabilityInputSchema = z.object({
  villa_id: z.string().optional(),
  date: z.string().optional(),
  is_available: z.boolean().optional(),
  limit: z.number().int().positive().default(30),
  offset: z.number().int().nonnegative().default(0),
});

export const villaAvailabilityResponseSchema = z.object({
  data: villaAvailabilitySchema
});

export type VillaAvailability = z.infer<typeof villaAvailabilitySchema>;
export type CreateVillaAvailabilityInput = z.infer<typeof createVillaAvailabilityInputSchema>;
export type UpdateVillaAvailabilityInput = z.infer<typeof updateVillaAvailabilityInputSchema>;
export type SearchVillaAvailabilityInput = z.infer<typeof searchVillaAvailabilityInputSchema>;

// 9. VILLA PRICING SEASONS =========================================

export const villaPricingSeasonSchema = z.object({
  villa_pricing_season_id: z.string(),
  villa_id: z.string(),
  season_name: z.string(),
  start_date: z.string().length(8), // yyyymmdd
  end_date: z.string().length(8),
  nightly_price: z.number().int(),
  minimum_stay_nights: z.number().int(),
  created_at: z.number(),
});

export const createVillaPricingSeasonInputSchema = z.object({
  villa_id: z.string(),
  season_name: z.string().min(1).max(100),
  start_date: z.string().length(8),
  end_date: z.string().length(8),
  nightly_price: z.number().int().min(0),
  minimum_stay_nights: z.number().int().min(1),
});

export const updateVillaPricingSeasonInputSchema = z.object({
  villa_pricing_season_id: z.string(),
  season_name: z.string().min(1).max(100).optional(),
  start_date: z.string().length(8).optional(),
  end_date: z.string().length(8).optional(),
  nightly_price: z.number().int().min(0).optional(),
  minimum_stay_nights: z.number().int().min(1).optional(),
});

export const searchVillaPricingSeasonInputSchema = z.object({
  villa_id: z.string().optional(),
  season_name: z.string().optional(),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['start_date', 'created_at']).default('start_date'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export const villaPricingSeasonResponseSchema = z.object({ data: villaPricingSeasonSchema });

export type VillaPricingSeason = z.infer<typeof villaPricingSeasonSchema>;
export type CreateVillaPricingSeasonInput = z.infer<typeof createVillaPricingSeasonInputSchema>;
export type UpdateVillaPricingSeasonInput = z.infer<typeof updateVillaPricingSeasonInputSchema>;
export type SearchVillaPricingSeasonInput = z.infer<typeof searchVillaPricingSeasonInputSchema>;

// 10. BOOKINGS =======================================================

export const bookingSchema = z.object({
  booking_id: z.string(),
  guest_user_id: z.string(),
  villa_id: z.string(),
  host_user_id: z.string(),
  check_in: z.string().length(8),
  check_out: z.string().length(8),
  number_of_guests: z.number().int(),
  status: z.string(),
  booking_type: z.string(),
  total_price: z.number().int(),
  currency: z.string(),
  cleaning_fee: z.number().int().nullable(),
  service_fee: z.number().int().nullable(),
  security_deposit: z.number().int().nullable(),
  payment_status: z.string(),
  cancellation_reason: z.string().nullable(),
  special_requests: z.string().nullable(),
  guest_full_name: z.string(),
  guest_email: z.string().email(),
  guest_phone: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  cancelled_at: z.number().nullable(),
  confirmed_at: z.number().nullable(),
});

export const createBookingInputSchema = z.object({
  guest_user_id: z.string(),
  villa_id: z.string(),
  host_user_id: z.string(),
  check_in: z.string().length(8),
  check_out: z.string().length(8),
  number_of_guests: z.number().int().min(1),
  status: z.string(),
  booking_type: z.string(),
  total_price: z.number().int().min(0),
  currency: z.string().min(3).max(5).optional(),
  cleaning_fee: z.number().int().nullable().optional(),
  service_fee: z.number().int().nullable().optional(),
  security_deposit: z.number().int().nullable().optional(),
  payment_status: z.string(),
  cancellation_reason: z.string().nullable().optional(),
  special_requests: z.string().nullable().optional(),
  guest_full_name: z.string().min(1).max(255),
  guest_email: z.string().email(),
  guest_phone: z.string().min(5).max(30),
});

export const updateBookingInputSchema = z.object({
  booking_id: z.string(),
  status: z.string().optional(),
  payment_status: z.string().optional(),
  cancellation_reason: z.string().nullable().optional(),
  special_requests: z.string().nullable().optional(),
  cleaning_fee: z.number().int().nullable().optional(),
  service_fee: z.number().int().nullable().optional(),
  security_deposit: z.number().int().nullable().optional(),
  confirmed_at: z.number().optional(),
  cancelled_at: z.number().nullable().optional(),
});

export const searchBookingInputSchema = z.object({
  guest_user_id: z.string().optional(),
  host_user_id: z.string().optional(),
  villa_id: z.string().optional(),
  status: z.string().optional(),
  payment_status: z.string().optional(),
  check_in_start: z.string().optional(),
  check_in_end: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at', 'check_in']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const bookingResponseSchema = z.object({ data: bookingSchema });

export type Booking = z.infer<typeof bookingSchema>;
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingInputSchema>;
export type SearchBookingInput = z.infer<typeof searchBookingInputSchema>;

// 11. BOOKING PAYMENTS ==============================================

export const bookingPaymentSchema = z.object({
  booking_payment_id: z.string(),
  booking_id: z.string(),
  payment_method: z.string(),
  status: z.string(),
  amount_paid: z.number().int(),
  transaction_reference: z.string().nullable(),
  paid_at: z.number().nullable(),
  created_at: z.number(),
});

export const createBookingPaymentInputSchema = z.object({
  booking_id: z.string(),
  payment_method: z.string().min(1).max(30),
  status: z.string(),
  amount_paid: z.number().int().min(0),
  transaction_reference: z.string().nullable().optional(),
  paid_at: z.number().optional(),
});

export const updateBookingPaymentInputSchema = z.object({
  booking_payment_id: z.string(),
  status: z.string().optional(),
  amount_paid: z.number().int().min(0).optional(),
  transaction_reference: z.string().nullable().optional(),
  paid_at: z.number().optional(),
});

export const searchBookingPaymentInputSchema = z.object({
  booking_id: z.string().optional(),
  status: z.string().optional(),
  payment_method: z.string().optional(),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().nonnegative().default(0),
});

export const bookingPaymentResponseSchema = z.object({ data: bookingPaymentSchema });

export type BookingPayment = z.infer<typeof bookingPaymentSchema>;
export type CreateBookingPaymentInput = z.infer<typeof createBookingPaymentInputSchema>;
export type UpdateBookingPaymentInput = z.infer<typeof updateBookingPaymentInputSchema>;
export type SearchBookingPaymentInput = z.infer<typeof searchBookingPaymentInputSchema>;

// 12. MESSAGE THREADS =================================================

export const messageThreadSchema = z.object({
  thread_id: z.string(),
  booking_id: z.string(),
  villa_id: z.string(),
  guest_user_id: z.string(),
  host_user_id: z.string(),
  created_at: z.number(),
});

export const createMessageThreadInputSchema = z.object({
  booking_id: z.string(),
  villa_id: z.string(),
  guest_user_id: z.string(),
  host_user_id: z.string(),
});

export const updateMessageThreadInputSchema = z.object({
  thread_id: z.string(),
  // Currently, only admin might update, so allow notes, etc., if any
});

export const searchMessageThreadInputSchema = z.object({
  booking_id: z.string().optional(),
  villa_id: z.string().optional(),
  guest_user_id: z.string().optional(),
  host_user_id: z.string().optional(),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const messageThreadResponseSchema = z.object({ data: messageThreadSchema });

export type MessageThread = z.infer<typeof messageThreadSchema>;
export type CreateMessageThreadInput = z.infer<typeof createMessageThreadInputSchema>;
export type UpdateMessageThreadInput = z.infer<typeof updateMessageThreadInputSchema>;
export type SearchMessageThreadInput = z.infer<typeof searchMessageThreadInputSchema>;

// 13. MESSAGES ==================================================

export const messageSchema = z.object({
  message_id: z.string(),
  thread_id: z.string(),
  sender_user_id: z.string(),
  receiver_user_id: z.string(),
  content: z.string(),
  sent_at: z.number(),
  is_read: z.boolean(),
});

export const createMessageInputSchema = z.object({
  thread_id: z.string(),
  sender_user_id: z.string(),
  receiver_user_id: z.string(),
  content: z.string().min(1).max(2000),
  sent_at: z.number().optional(),
});

export const updateMessageInputSchema = z.object({
  message_id: z.string(),
  content: z.string().min(1).max(2000).optional(),
  is_read: z.boolean().optional(),
});

export const searchMessageInputSchema = z.object({
  thread_id: z.string().optional(),
  sender_user_id: z.string().optional(),
  receiver_user_id: z.string().optional(),
  is_read: z.boolean().optional(),
  limit: z.number().int().positive().default(30),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['sent_at']).default('sent_at'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export const messageResponseSchema = z.object({ data: messageSchema });

export type Message = z.infer<typeof messageSchema>;
export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageInputSchema>;
export type SearchMessageInput = z.infer<typeof searchMessageInputSchema>;

// 14. REVIEWS =======================================================

export const reviewSchema = z.object({
  review_id: z.string(),
  booking_id: z.string(),
  villa_id: z.string().nullable(),
  reviewer_user_id: z.string(),
  reviewee_user_id: z.string().nullable(),
  rating: z.number().int().min(1).max(5),
  review_text: z.string(),
  review_type: z.string(),
  is_visible: z.boolean(),
  is_flagged: z.boolean(),
  admin_notes: z.string().nullable(),
  created_at: z.number(),
});

export const createReviewInputSchema = z.object({
  booking_id: z.string(),
  villa_id: z.string().nullable().optional(),
  reviewer_user_id: z.string(),
  reviewee_user_id: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(5),
  review_text: z.string().min(1).max(2000),
  review_type: z.string().min(1).max(100),
  is_visible: z.boolean().optional(),
  is_flagged: z.boolean().optional(),
  admin_notes: z.string().nullable().optional(),
});

export const updateReviewInputSchema = z.object({
  review_id: z.string(),
  rating: z.number().int().min(1).max(5).optional(),
  review_text: z.string().min(1).max(2000).optional(),
  is_visible: z.boolean().optional(),
  is_flagged: z.boolean().optional(),
  admin_notes: z.string().nullable().optional(),
});

export const searchReviewInputSchema = z.object({
  villa_id: z.string().optional(),
  reviewer_user_id: z.string().optional(),
  reviewee_user_id: z.string().optional(),
  min_rating: z.number().int().min(1).optional(),
  max_rating: z.number().int().max(5).optional(),
  is_flagged: z.boolean().optional(),
  is_visible: z.boolean().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at', 'rating']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const reviewResponseSchema = z.object({ data: reviewSchema });

export type Review = z.infer<typeof reviewSchema>;
export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewInputSchema>;
export type SearchReviewInput = z.infer<typeof searchReviewInputSchema>;

// 15. NOTIFICATIONS ==================================================

export const notificationSchema = z.object({
  notification_id: z.string(),
  user_id: z.string(),
  type: z.string(),
  content: z.string(),
  is_read: z.boolean(),
  related_booking_id: z.string().nullable(),
  related_villa_id: z.string().nullable(),
  created_at: z.number(),
});

export const createNotificationInputSchema = z.object({
  user_id: z.string(),
  type: z.string().min(1).max(100),
  content: z.string().min(1).max(2000),
  is_read: z.boolean().optional(),
  related_booking_id: z.string().nullable().optional(),
  related_villa_id: z.string().nullable().optional(),
});

export const updateNotificationInputSchema = z.object({
  notification_id: z.string(),
  is_read: z.boolean().optional(),
});

export const searchNotificationInputSchema = z.object({
  user_id: z.string().optional(),
  is_read: z.boolean().optional(),
  type: z.string().optional(),
  related_booking_id: z.string().optional(),
  related_villa_id: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const notificationResponseSchema = z.object({ data: notificationSchema });

export type Notification = z.infer<typeof notificationSchema>;
export type CreateNotificationInput = z.infer<typeof createNotificationInputSchema>;
export type UpdateNotificationInput = z.infer<typeof updateNotificationInputSchema>;
export type SearchNotificationInput = z.infer<typeof searchNotificationInputSchema>;

// 16. ADMIN ACTIONS ===================================================

export const adminActionSchema = z.object({
  admin_action_id: z.string(),
  admin_user_id: z.string(),
  action_type: z.string(),
  target_type: z.string(),
  target_id: z.string(),
  notes: z.string().nullable(),
  created_at: z.number(),
});

export const createAdminActionInputSchema = z.object({
  admin_user_id: z.string(),
  action_type: z.string().min(1).max(50),
  target_type: z.string().min(1).max(50),
  target_id: z.string().min(1),
  notes: z.string().nullable().optional(),
});

export const updateAdminActionInputSchema = z.object({
  admin_action_id: z.string(),
  notes: z.string().nullable().optional(),
});

export const searchAdminActionInputSchema = z.object({
  admin_user_id: z.string().optional(),
  action_type: z.string().optional(),
  target_type: z.string().optional(),
  target_id: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const adminActionResponseSchema = z.object({ data: adminActionSchema });

export type AdminAction = z.infer<typeof adminActionSchema>;
export type CreateAdminActionInput = z.infer<typeof createAdminActionInputSchema>;
export type UpdateAdminActionInput = z.infer<typeof updateAdminActionInputSchema>;
export type SearchAdminActionInput = z.infer<typeof searchAdminActionInputSchema>;