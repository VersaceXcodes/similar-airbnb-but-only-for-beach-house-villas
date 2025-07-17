-- =========================================
-- BeachVillas MVP Schema (Production-Ready, Basic Primitives)
-- =========================================

-- 1. USERS
CREATE TABLE users (
    user_id              VARCHAR PRIMARY KEY,
    email                VARCHAR NOT NULL UNIQUE,
    password_hash        VARCHAR NOT NULL,
    name                 VARCHAR NOT NULL,
    profile_photo_url    VARCHAR,
    phone                VARCHAR,
    role                 VARCHAR NOT NULL,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    notification_settings TEXT NOT NULL DEFAULT '{}',
    payout_method_details VARCHAR,
    is_verified_host     BOOLEAN DEFAULT FALSE,
    created_at           BIGINT NOT NULL,
    updated_at           BIGINT NOT NULL
);

-- 2. USER PROFILES
CREATE TABLE user_profiles (
    profile_id   VARCHAR PRIMARY KEY,
    user_id      VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    about        TEXT,
    locale       VARCHAR,
    created_at   BIGINT NOT NULL,
    updated_at   BIGINT NOT NULL
);

-- 3. VILLAS (Listings)
CREATE TABLE villas (
    villa_id             VARCHAR PRIMARY KEY,
    host_user_id         VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name                 VARCHAR NOT NULL,
    short_description    VARCHAR NOT NULL,
    long_description     TEXT NOT NULL,
    address              VARCHAR NOT NULL,
    city                 VARCHAR NOT NULL,
    country              VARCHAR NOT NULL,
    latitude             VARCHAR NOT NULL,
    longitude            VARCHAR NOT NULL,
    max_occupancy        INTEGER NOT NULL,
    is_instant_book      BOOLEAN NOT NULL DEFAULT FALSE,
    status               VARCHAR NOT NULL DEFAULT 'pending',
    base_price_per_night INTEGER NOT NULL,
    minimum_stay_nights  INTEGER NOT NULL,
    security_deposit     INTEGER DEFAULT 0,
    cleaning_fee         INTEGER DEFAULT 0,
    service_fee          INTEGER DEFAULT 0,
    created_at           BIGINT NOT NULL,
    updated_at           BIGINT NOT NULL,
    admin_notes          TEXT
);

-- 4. VILLA PHOTOS
CREATE TABLE villa_photos (
    photo_id     VARCHAR PRIMARY KEY,
    villa_id     VARCHAR NOT NULL REFERENCES villas(villa_id) ON DELETE CASCADE,
    photo_url    VARCHAR NOT NULL,
    sort_order   INTEGER NOT NULL,
    uploaded_at  BIGINT NOT NULL,
    caption      TEXT
);

-- 5. AMENITIES (Reference)
CREATE TABLE amenities (
    amenity_id   VARCHAR PRIMARY KEY,
    name         VARCHAR NOT NULL UNIQUE,
    icon_url     VARCHAR,
    key          VARCHAR NOT NULL UNIQUE
);

-- 6. VILLA AMENITIES (Join)
CREATE TABLE villa_amenities (
    villa_amenity_id VARCHAR PRIMARY KEY,
    villa_id         VARCHAR NOT NULL REFERENCES villas(villa_id) ON DELETE CASCADE,
    amenity_id       VARCHAR NOT NULL REFERENCES amenities(amenity_id) ON DELETE CASCADE
);

-- 7. VILLA RULES
CREATE TABLE villa_rules (
    villa_rule_id VARCHAR PRIMARY KEY,
    villa_id      VARCHAR NOT NULL REFERENCES villas(villa_id) ON DELETE CASCADE,
    rule_type     VARCHAR NOT NULL,
    value         VARCHAR NOT NULL,
    created_at    BIGINT NOT NULL
);

-- 8. VILLA AVAILABILITY
CREATE TABLE villa_availability (
    villa_availability_id VARCHAR PRIMARY KEY,
    villa_id              VARCHAR NOT NULL REFERENCES villas(villa_id) ON DELETE CASCADE,
    date                  VARCHAR NOT NULL,
    is_available          BOOLEAN NOT NULL DEFAULT TRUE,
    price_override        INTEGER,
    minimum_stay_override INTEGER,
    note                  TEXT
);

-- 9. VILLA PRICING SEASONS
CREATE TABLE villa_pricing_seasons (
    villa_pricing_season_id VARCHAR PRIMARY KEY,
    villa_id                VARCHAR NOT NULL REFERENCES villas(villa_id) ON DELETE CASCADE,
    season_name             VARCHAR NOT NULL,
    start_date              VARCHAR NOT NULL,
    end_date                VARCHAR NOT NULL,
    nightly_price           INTEGER NOT NULL,
    minimum_stay_nights     INTEGER NOT NULL,
    created_at              BIGINT NOT NULL
);

-- 10. BOOKINGS
CREATE TABLE bookings (
    booking_id         VARCHAR PRIMARY KEY,
    guest_user_id      VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    villa_id           VARCHAR NOT NULL REFERENCES villas(villa_id) ON DELETE CASCADE,
    host_user_id       VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    check_in           VARCHAR NOT NULL,
    check_out          VARCHAR NOT NULL,
    number_of_guests   INTEGER NOT NULL,
    status             VARCHAR NOT NULL,
    booking_type       VARCHAR NOT NULL,
    total_price        INTEGER NOT NULL,
    currency           VARCHAR NOT NULL DEFAULT 'USD',
    cleaning_fee       INTEGER DEFAULT 0,
    service_fee        INTEGER DEFAULT 0,
    security_deposit   INTEGER DEFAULT 0,
    payment_status     VARCHAR NOT NULL,
    cancellation_reason TEXT,
    special_requests   TEXT,
    guest_full_name    VARCHAR NOT NULL,
    guest_email        VARCHAR NOT NULL,
    guest_phone        VARCHAR NOT NULL,
    created_at         BIGINT NOT NULL,
    updated_at         BIGINT NOT NULL,
    cancelled_at       BIGINT,
    confirmed_at       BIGINT
);

-- 11. BOOKING PAYMENTS
CREATE TABLE booking_payments (
    booking_payment_id     VARCHAR PRIMARY KEY,
    booking_id             VARCHAR NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    payment_method         VARCHAR NOT NULL,
    status                 VARCHAR NOT NULL,
    amount_paid            INTEGER NOT NULL,
    transaction_reference  VARCHAR,
    paid_at                BIGINT,
    created_at             BIGINT NOT NULL
);

-- 12. MESSAGE THREADS
CREATE TABLE message_threads (
    thread_id     VARCHAR PRIMARY KEY,
    booking_id    VARCHAR NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    villa_id      VARCHAR NOT NULL REFERENCES villas(villa_id) ON DELETE CASCADE,
    guest_user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    host_user_id  VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at    BIGINT NOT NULL
);

-- 13. MESSAGES
CREATE TABLE messages (
    message_id      VARCHAR PRIMARY KEY,
    thread_id       VARCHAR NOT NULL REFERENCES message_threads(thread_id) ON DELETE CASCADE,
    sender_user_id  VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    receiver_user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    sent_at         BIGINT NOT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE
);

-- 14. REVIEWS
CREATE TABLE reviews (
    review_id        VARCHAR PRIMARY KEY,
    booking_id       VARCHAR NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    villa_id         VARCHAR REFERENCES villas(villa_id) ON DELETE CASCADE,
    reviewer_user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reviewee_user_id VARCHAR REFERENCES users(user_id) ON DELETE SET NULL,
    rating           INTEGER NOT NULL,
    review_text      TEXT NOT NULL,
    review_type      VARCHAR NOT NULL,
    is_visible       BOOLEAN NOT NULL DEFAULT TRUE,
    is_flagged       BOOLEAN NOT NULL DEFAULT FALSE,
    admin_notes      TEXT,
    created_at       BIGINT NOT NULL
);

-- 15. NOTIFICATIONS
CREATE TABLE notifications (
    notification_id     VARCHAR PRIMARY KEY,
    user_id             VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type                VARCHAR NOT NULL,
    content             TEXT NOT NULL,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    related_booking_id  VARCHAR REFERENCES bookings(booking_id) ON DELETE CASCADE,
    related_villa_id    VARCHAR REFERENCES villas(villa_id) ON DELETE CASCADE,
    created_at          BIGINT NOT NULL
);

-- 16. ADMIN ACTIONS
CREATE TABLE admin_actions (
    admin_action_id VARCHAR PRIMARY KEY,
    admin_user_id   VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    action_type     VARCHAR NOT NULL,
    target_type     VARCHAR NOT NULL,
    target_id       VARCHAR NOT NULL,
    notes           TEXT,
    created_at      BIGINT NOT NULL
);

-- =========================================
-- SEED DATA (Example minimal + generous entries, incl. amenities, users, etc.)
-- =========================================

-- AMENITIES: Seed with useful core types
INSERT INTO amenities (amenity_id, name, icon_url, key) VALUES
  ('amenity_wifi', 'Wi-Fi', 'https://picsum.photos/seed/wifi/60/60', 'wifi'),
  ('amenity_pool', 'Swimming Pool', 'https://picsum.photos/seed/pool/60/60', 'pool'),
  ('amenity_aircon', 'Air Conditioning', 'https://picsum.photos/seed/aircon/60/60', 'aircon'),
  ('amenity_parking', 'Free Parking', 'https://picsum.photos/seed/parking/60/60', 'parking'),
  ('amenity_kitchen', 'Kitchen', 'https://picsum.photos/seed/kitchen/60/60', 'kitchen'),
  ('amenity_washer', 'Washer', 'https://picsum.photos/seed/washer/60/60', 'washer'),
  ('amenity_pet_friendly', 'Pet Friendly', 'https://picsum.photos/seed/pet/60/60', 'pet_friendly'),
  ('amenity_sea_view', 'Sea View', 'https://picsum.photos/seed/sea/60/60', 'sea_view'),
  ('amenity_tvs', 'Television', 'https://picsum.photos/seed/tv/60/60', 'tv'),
  ('amenity_bbq', 'BBQ Grill', 'https://picsum.photos/seed/bbq/60/60', 'bbq'),
  ('amenity_gym', 'Fitness Room', 'https://picsum.photos/seed/gym/60/60', 'gym');

-- USERS: Admin, two hosts, two travelers (guests), one guest_host combo
INSERT INTO users (user_id, email, password_hash, name, profile_photo_url, phone, role, is_active, notification_settings, payout_method_details, is_verified_host, created_at, updated_at)
VALUES
  ('admin001', 'admin@beachvillas.com', 'hashedpwadmin', 'Site Admin', 'https://picsum.photos/seed/admin/100', '+1234567890', 'admin', TRUE, '{}', NULL, FALSE, 1706764800, 1706764800),
  ('host001', 'host1@beachvillas.com', 'hashedpw1', 'Olivia Host', 'https://picsum.photos/seed/host1/100', '+1987654321', 'host', TRUE, '{}', 'Bank:1234', TRUE, 1706764801, 1706764802),
  ('host002', 'host2@beachvillas.com', 'hashedpw2', 'Noah Host', 'https://picsum.photos/seed/host2/100', NULL, 'host', TRUE, '{}', 'Bank:5678', FALSE, 1706764803, 1706764804),
  ('guest001', 'trav1@example.com', 'hashedpw3', 'Amelia Guest', 'https://picsum.photos/seed/guest1/100', '+1122334455', 'guest', TRUE, '{}', NULL, FALSE, 1706764805, 1706764806),
  ('guest002', 'trav2@example.com', 'hashedpw4', 'Liam Guest', NULL, 'guest', TRUE, '{}', NULL, FALSE, 1706764807, 1706764808),
  ('guesthost1', 'dualuser@example.com', 'hashedpw5', 'Sofia Dual', 'https://picsum.photos/seed/dual/100', '+1222333444', 'guest_host', TRUE, '{}', 'Bank:9090', TRUE, 1706764809, 1706764810);

-- USER_PROFILES
INSERT INTO user_profiles (profile_id, user_id, about, locale, created_at, updated_at) VALUES
  ('profile_admin001', 'admin001', 'Platform admin, not bookable.', 'en-US', 1706764800, 1706764800),
  ('profile_host001', 'host001', 'Our family welcomes you to our sunny villa!', 'en-US', 1706764801, 1706764802),
  ('profile_host002', 'host002', 'Lover of surf, fun, and summer getaways.', 'it-IT', 1706764803, 1706764804),
  ('profile_guest001', 'guest001', 'Beach fanatic and foodie.', 'en-US', 1706764805, 1706764806),
  ('profile_guest002', 'guest002', 'Travel writer, occasional kitesurfer.', 'fr-FR', 1706764807, 1706764808),
  ('profile_guesthost1', 'guesthost1', 'Host and explorer, here for sun and fun.', 'pt-BR', 1706764809, 1706764810);

-- VILLAS
INSERT INTO villas (villa_id, host_user_id, name, short_description, long_description, address, city, country, latitude, longitude, max_occupancy, is_instant_book, status, base_price_per_night, minimum_stay_nights, security_deposit, cleaning_fee, service_fee, created_at, updated_at, admin_notes) VALUES
  ('villa001', 'host001', 'Sunny Beach Villa', 'A bright beachfront family villa', 'Spacious and modern villa directly on the sand, with a large pool and BBQ.', '123 Ocean Dr', 'Miami', 'USA', '25.7617', '-80.1918', 6, TRUE, 'active', 35000, 2, 10000, 4000, 2500, 1706764900, 1706765000, ''),
  ('villa002', 'host002', 'Tuscan Coast House', 'Rustic Italian with Sea View', 'Stone house with panoramic sea views, olive groves, and local charm.', '8 Via Lungomare', 'Viareggio', 'Italy', '43.8718', '10.2578', 4, FALSE, 'pending', 28000, 3, 9000, 3000, 2000, 1706765001, 1706765100, NULL),
  ('villa003', 'guesthost1', 'Sofia\'s Surf Camp', 'Perfect for surfing groups', 'Right on the sand with surfboard storage, breakfast included.', '2 Beach Blvd', 'Lisbon', 'Portugal', '38.7223', '-9.1393', 8, TRUE, 'active', 45000, 4, 15000, 7000, 4000, 1706765101, 1706765200, 'Feature for adventure travelers.');

-- VILLA PHOTOS
INSERT INTO villa_photos (photo_id, villa_id, photo_url, sort_order, uploaded_at, caption) VALUES
  ('photo_villa001_1', 'villa001', 'https://picsum.photos/seed/villa001_1/600/400', 1, 1706764901, 'Poolside at sunset'),
  ('photo_villa001_2', 'villa001', 'https://picsum.photos/seed/villa001_2/600/400', 2, 1706764902, 'Front of the villa'),
  ('photo_villa002_1', 'villa002', 'https://picsum.photos/seed/villa002_1/600/400', 1, 1706765002, 'Sea view from the window'),
  ('photo_villa003_1', 'villa003', 'https://picsum.photos/seed/villa003_1/600/400', 1, 1706765102, 'Surfboards by the wall');

-- VILLA AMENITIES - assign relevant amenity_ids from above
INSERT INTO villa_amenities (villa_amenity_id, villa_id, amenity_id) VALUES
  ('va_villa001_wifi', 'villa001', 'amenity_wifi'),
  ('va_villa001_pool', 'villa001', 'amenity_pool'),
  ('va_villa001_kitchen', 'villa001', 'amenity_kitchen'),
  ('va_villa002_wifi', 'villa002', 'amenity_wifi'),
  ('va_villa002_sea_view', 'villa002', 'amenity_sea_view'),
  ('va_villa002_parking', 'villa002', 'amenity_parking'),
  ('va_villa003_wifi', 'villa003', 'amenity_wifi'),
  ('va_villa003_bbq', 'villa003', 'amenity_bbq'),
  ('va_villa003_gym', 'villa003', 'amenity_gym'),
  ('va_villa003_pet', 'villa003', 'amenity_pet_friendly'),
  ('va_villa003_aircon', 'villa003', 'amenity_aircon');

-- VILLA RULES
INSERT INTO villa_rules (villa_rule_id, villa_id, rule_type, value, created_at) VALUES
  ('vr_villa001_nosmoke', 'villa001', 'smoking', 'no', 1706764901),
  ('vr_villa001_pets', 'villa001', 'pets_allowed', 'yes', 1706764902),
  ('vr_villa001_custom', 'villa001', 'custom', 'No loud music after 10pm.', 1706764903),
  ('vr_villa002_party', 'villa002', 'party', 'no', 1706765003),
  ('vr_villa003_surf', 'villa003', 'custom', 'Surfboards must be rinsed before storage.', 1706765103);

-- VILLA AVAILABILITY: (sparse, for March 2024)
INSERT INTO villa_availability (villa_availability_id, villa_id, date, is_available, price_override, minimum_stay_override, note) VALUES
  ('avail_villa001_20240321', 'villa001', '20240321', TRUE, NULL, NULL, NULL),
  ('avail_villa001_20240322', 'villa001', '20240322', TRUE, NULL, NULL, 'Easter'),
  ('avail_villa001_20240323', 'villa001', '20240323', FALSE, NULL, NULL, 'Blocked for maintenance'),
  ('avail_villa002_20240321', 'villa002', '20240321', TRUE, 32000, 2, NULL),
  ('avail_villa003_20240321', 'villa003', '20240321', TRUE, NULL, NULL, 'Surf festival');

-- VILLA PRICING SEASONS
INSERT INTO villa_pricing_seasons (villa_pricing_season_id, villa_id, season_name, start_date, end_date, nightly_price, minimum_stay_nights, created_at) VALUES
  ('season1_villa001', 'villa001', 'Summer High', '20240601', '20240831', 45000, 4, 1706764901),
  ('season2_villa001', 'villa001', 'Early Spring', '20240301', '20240415', 42000, 3, 1706764902),
  ('season1_villa003', 'villa003', 'Surf Season', '20240318', '20240410', 52000, 5, 1706765101);

-- BOOKINGS (assigning guests to villas with hosts set properly)
INSERT INTO bookings (booking_id, guest_user_id, villa_id, host_user_id, check_in, check_out, number_of_guests, status, booking_type, total_price, currency, cleaning_fee, service_fee, security_deposit, payment_status, cancellation_reason, special_requests, guest_full_name, guest_email, guest_phone, created_at, updated_at, cancelled_at, confirmed_at) VALUES
  ('booking001', 'guest001', 'villa001', 'host001', '20240321', '20240325', 4, 'confirmed', 'instant', 154000, 'USD', 4000, 2500, 10000, 'paid', NULL, 'Need a baby crib', 'Amelia Guest', 'trav1@example.com', '+1122334455', 1706800000, 1706900000, NULL, 1706901000),
  ('booking002', 'guest002', 'villa002', 'host002', '20240321', '20240324', 2, 'pending', 'request', 92000, 'USD', 3000, 2000, 9000, 'pending', NULL, NULL, 'Liam Guest', 'trav2@example.com', '+4412345678', 1706811000, 1706812000, NULL, NULL),
  ('booking003', 'guest001', 'villa003', 'guesthost1', '20240322', '20240327', 5, 'confirmed', 'instant', 257000, 'USD', 7000, 4000, 15000, 'paid', NULL, 'Vegetarian breakfast', 'Amelia Guest', 'trav1@example.com', '+1122334455', 1706813000, 1706916000, NULL, 1706917000);

-- BOOKING PAYMENTS
INSERT INTO booking_payments (booking_payment_id, booking_id, payment_method, status, amount_paid, transaction_reference, paid_at, created_at) VALUES
  ('pay001', 'booking001', 'card', 'success', 154000, 'TX12341', 1706901010, 1706901000),
  ('pay002', 'booking002', 'mock', 'pending', 0, NULL, NULL, 1706902000),
  ('pay003', 'booking003', 'card', 'success', 257000, 'TX55588', 1706917010, 1706917000);

-- MESSAGE THREADS & MESSAGES
INSERT INTO message_threads (thread_id, booking_id, villa_id, guest_user_id, host_user_id, created_at) VALUES
  ('thread001', 'booking001', 'villa001', 'guest001', 'host001', 1706901050),
  ('thread002', 'booking002', 'villa002', 'guest002', 'host002', 1706911000),
  ('thread003', 'booking003', 'villa003', 'guest001', 'guesthost1', 1706917050);

INSERT INTO messages (message_id, thread_id, sender_user_id, receiver_user_id, content, sent_at, is_read) VALUES
  ('msg_thread001_1', 'thread001', 'guest001', 'host001', 'Excited for our stay! Is early check-in possible?', 1706901051, FALSE),
  ('msg_thread001_2', 'thread001', 'host001', 'guest001', 'Hi Amelia, yes early check-in is fine!', 1706901070, TRUE),
  ('msg_thread002_1', 'thread002', 'guest002', 'host002', 'Is the parking secure for motorcycles?', 1706911001, FALSE),
  ('msg_thread003_1', 'thread003', 'guest001', 'guesthost1', 'Will there be surf instructors available?', 1706917051, FALSE);

-- REVIEWS
INSERT INTO reviews (review_id, booking_id, villa_id, reviewer_user_id, reviewee_user_id, rating, review_text, review_type, is_visible, is_flagged, admin_notes, created_at) VALUES
  ('review001', 'booking001', 'villa001', 'guest001', 'host001', 5, 'Amazing house, beachfront is spectacular. Will return!', 'guest_to_villa', TRUE, FALSE, NULL, 1707000000),
  ('review002', 'booking003', 'villa003', 'guest001', 'guesthost1', 4, 'Great surf spot, fantastic hosts, breakfast was delicious.', 'guest_to_villa', TRUE, FALSE, NULL, 1707000500),
  ('review003', 'booking001', NULL, 'host001', 'guest001', 5, 'Wonderful guest, respected all house rules.', 'host_to_guest', TRUE, FALSE, NULL, 1707000600);

-- NOTIFICATIONS
INSERT INTO notifications (notification_id, user_id, type, content, is_read, related_booking_id, related_villa_id, created_at) VALUES
  ('notif001', 'host001', 'booking_confirmed', 'You have a new confirmed booking at Sunny Beach Villa', FALSE, 'booking001', 'villa001', 1706901200),
  ('notif002', 'guest001', 'booking_confirmed', 'Your booking has been confirmed for Sunny Beach Villa', TRUE, 'booking001', 'villa001', 1706901201),
  ('notif003', 'host002', 'booking_request', 'You received a new booking request for Tuscan Coast House', FALSE, 'booking002', 'villa002', 1706901300),
  ('notif004', 'guesthost1', 'booking_confirmed', 'Your villa was booked! Get ready for your next guest.', TRUE, 'booking003', 'villa003', 1706917100);

-- ADMIN ACTIONS
INSERT INTO admin_actions (admin_action_id, admin_user_id, action_type, target_type, target_id, notes, created_at) VALUES
  ('action001', 'admin001', 'edit_villa', 'villa', 'villa002', 'Fixed typo in description', 1706901400),
  ('action002', 'admin001', 'hide_review', 'review', 'review003', 'Unusual wording flagged by filter', 1707000610);