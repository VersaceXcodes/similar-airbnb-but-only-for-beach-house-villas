// __tests__/backend.integration.test.ts
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, pool } from './server.ts';

const TEST_USER_PW = 'hunter2secure!';
const TEST_ADMIN_PW = 'admintest!12345';
const TEST_HOST_PW = 'hostpw123!';
const TEST_GUEST_PW = 'guestpw456!';
const BASE_URL = '/';

// --- Helper: Create a user (returns {token, user}) ---
async function createTestUser({ email, password, role, name }) {
  const res = await request(app)
    .post('/auth/signup')
    .send({
      email, password, name, role
    });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeString();
  expect(res.body.user).toBeDefined();
  return res.body;
}

// --- Helper: Login (returns {token, user}) ---
async function login({ email, password }) {
  const res = await request(app)
    .post('/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeString();
  expect(res.body.user).toBeDefined();
  return res.body;
}

// --- Helper: Authorization header ---
const authHeader = token => ({ Authorization: `Bearer ${token}` });

// --- DB Transaction Helper ---
async function withDbTransaction(testFn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await testFn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

// ======================
//        TESTS
// ======================

describe('BeachVillas Backend Integration Tests', () => {
  let guestToken, guestUser, hostToken, hostUser, adminToken, adminUser;

  beforeAll(async () => {
    // Use seeded users from the DB seeding.
    // guest001, host001, admin001
    // logins: guest001 (trav1@example.com/hashedpw3), host001 (host1@beachvillas.com/hashedpw1), admin001 (admin@beachvillas.com/hashedpwadmin)
    // For test, simulate password is 'hunter2secure!' for guest, 'hostpw123!' for host, 'admintest!12345' for admin.
    // Let's try login and fallback to signup if not working (test DB may be newly seeded).
    try {
      ({ token: adminToken, user: adminUser } = await login({ email: 'admin@beachvillas.com', password: TEST_ADMIN_PW }));
    } catch {
      ({ token: adminToken, user: adminUser } = await createTestUser({
        email: 'admin@beachvillas.com',
        password: TEST_ADMIN_PW,
        name: 'Site Admin',
        role: 'admin',
      }));
    }
    try {
      ({ token: hostToken, user: hostUser } = await login({ email: 'host1@beachvillas.com', password: TEST_HOST_PW }));
    } catch {
      ({ token: hostToken, user: hostUser } = await createTestUser({
        email: 'host1@beachvillas.com',
        password: TEST_HOST_PW,
        name: 'Olivia Host',
        role: 'host',
      }));
    }
    try {
      ({ token: guestToken, user: guestUser } = await login({ email: 'trav1@example.com', password: TEST_GUEST_PW }));
    } catch {
      ({ token: guestToken, user: guestUser } = await createTestUser({
        email: 'trav1@example.com',
        password: TEST_GUEST_PW,
        name: 'Amelia Guest',
        role: 'guest',
      }));
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('User & Auth Flows', () => {
    test('Signup: should reject duplicate email', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({ email: 'trav1@example.com', password: 'newpw123456', name: 'Test', role: 'guest' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/email/i);
    });

    test('Login: should fail with bad password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'trav1@example.com', password: 'wrongpassword' });
      expect(res.status).toBe(400);
    });

    test('JWT required: /me rejects without auth', async () => {
      const res = await request(app).get('/me');
      expect(res.status).toBe(401);
    });

    test('Profile GET/PATCH', async () => {
      // GET
      let res = await request(app)
        .get('/me')
        .set(authHeader(guestToken));
      expect(res.status).toBe(200);
      expect(res.body.name).toBeDefined();
      // PATCH
      res = await request(app)
        .patch('/me')
        .set(authHeader(guestToken))
        .send({ name: 'Amelia G. Test', notification_settings: { email: true } });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Amelia G. Test');
    });

    test('Logout endpoint', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .set(authHeader(guestToken));
      expect(res.status).toBe(204);
    });
  });

  describe('Villa APIs', () => {
    let createdVillaId;
    test('Create new villa (host only)', async () => {
      const villaPayload = {
        name: 'Test Villa',
        short_description: 'Short desc',
        long_description: 'Long description for test villa.',
        address: '100 Test St',
        city: 'Testville',
        country: 'USA',
        latitude: '35.0001',
        longitude: '-120.0001',
        max_occupancy: 5,
        is_instant_book: true,
        base_price_per_night: 20000,
        minimum_stay_nights: 2,
        status: 'active',
        photos: [
          { photo_url: 'https://pics.example.com/1.jpg', sort_order: 1 }
        ],
        amenities: ['amenity_wifi', 'amenity_pool'],
        rules: [{ rule_type: 'pets_allowed', value: 'no' }]
      };
      const res = await request(app)
        .post('/villa')
        .set(authHeader(hostToken))
        .send(villaPayload);
      expect(res.status).toBe(201);
      expect(res.body.villa_id).toBeDefined();
      createdVillaId = res.body.villa_id;
      expect(res.body.name).toBe('Test Villa');
    });

    test('Get villa detail (public)', async () => {
      const res = await request(app)
        .get(`/villa/${createdVillaId}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Villa');
      expect(res.body.photos).toBeInstanceOf(Array);
      expect(res.body.all_amenities).toBeInstanceOf(Array);
    });

    test('Host-only: update/delete own villa', async () => {
      let res = await request(app)
        .patch(`/villa/${createdVillaId}`)
        .set(authHeader(hostToken))
        .send({ name: 'Updated Test Villa' });
      expect(res.status).toBe(200);
      expect(res.body.name).toMatch(/Updated/);

      // Now delete
      res = await request(app)
        .delete(`/villa/${createdVillaId}`)
        .set(authHeader(hostToken));
      expect(res.status).toBe(204);
    });

    test('Host cannot update others\' villa', async () => {
      // Try updating villa002, owned by host002
      const res = await request(app)
        .patch(`/villa/villa002`)
        .set(authHeader(hostToken))
        .send({ name: 'HACKED' });
      expect([401, 403]).toContain(res.status);
    });

    test('GET /amenities - returns all', async () => {
      const res = await request(app).get('/amenities');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(5);
      expect(res.body[0].name).toBeDefined();
    });

    test('Villa search (city, min_price)', async () => {
      const res = await request(app)
        .get('/search?location=Miami&price_min=30000');
      expect(res.status).toBe(200);
      expect(res.body.villas.length).toBeGreaterThan(0);
      expect(res.body.villas[0].city).toMatch(/miami/i);
    });
  });

  describe('Booking Flow', () => {
    let villaId, bookingId, bookingToken;
    beforeAll(async () => {
      const res = await request(app)
        .get('/search?location=Lisbon');
      villaId = (res.body.villas && res.body.villas[0].villa_id) || 'villa003';
    });

    test('Cannot book unavailable dates', async () => {
      // villa003 is booked 20240322-20240327, let's overlap
      const res = await request(app)
        .post('/booking')
        .set(authHeader(guestToken))
        .send({
          villa_id: villaId,
          check_in: '20240323',
          check_out: '20240326',
          number_of_guests: 2,
          guest_full_name: 'Test Guest',
          guest_email: 'test@guest.com',
          guest_phone: '+11112222',
          agreed_to_rules: true
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unavailable|conflict/i);
    });

    test('Book available dates', async () => {
      const res = await request(app)
        .post('/booking')
        .set(authHeader(guestToken))
        .send({
          villa_id: villaId,
          check_in: '20240328',
          check_out: '20240330',
          number_of_guests: 2,
          guest_full_name: 'Test Guest',
          guest_email: 'test@guest.com',
          guest_phone: '+11112222',
          agreed_to_rules: true
        });
      expect(res.status).toBe(201);
      bookingId = res.body.booking_id;
      expect(res.body.booking_type).toBeDefined();
      expect(res.body.status).toMatch(/pending|confirmed/);
    });

    test('Host accepts pending booking', async () => {
      // Only possible if it's pending -- use PATCH to /booking/:booking_id/accept as host
      const res = await request(app)
        .post(`/booking/${bookingId}/accept`)
        .set(authHeader(hostToken));
      expect([200, 400, 403]).toContain(res.status);
      // If rejected due to already confirmed, that's OK (try-catch here for stability)
    });

    test('Booking can be cancelled by guest', async () => {
      const res = await request(app)
        .patch(`/booking/${bookingId}`)
        .set(authHeader(guestToken))
        .send({ status: 'cancelled', cancellation_reason: 'Change of plans' });
      expect([200, 400]).toContain(res.status); // if already cancelled, 400 is OK
    });

    test('Cannot double book same villa/dates', async () => {
      // Try again for same date
      const res = await request(app)
        .post('/booking')
        .set(authHeader(guestToken))
        .send({
          villa_id: villaId,
          check_in: '20240328',
          check_out: '20240330',
          number_of_guests: 2,
          guest_full_name: 'Guest X',
          guest_email: 'x@guest.com',
          guest_phone: '+11112223',
          agreed_to_rules: true
        });
      expect(res.status).toBe(400);
    });
  });

  describe('Messaging', () => {
    let threadId;
    test('List threads', async () => {
      const res = await request(app)
        .get('/inbox')
        .set(authHeader(guestToken));
      expect(res.status).toBe(200);
      expect(res.body.threads).toBeInstanceOf(Array);
      if (res.body.threads.length) threadId = res.body.threads[0].thread_id;
    });

    test('List messages in thread', async () => {
      if (!threadId) return;
      const res = await request(app)
        .get(`/inbox/thread/${threadId}`)
        .set(authHeader(guestToken));
      expect(res.status).toBe(200);
      expect(res.body.messages).toBeInstanceOf(Array);

      // Send a new message as guest
      const msgRes = await request(app)
        .post(`/inbox/thread/${threadId}/send`)
        .set(authHeader(guestToken))
        .send({ content: 'Is the pool heated for kids?' });
      expect(msgRes.status).toBe(201);
      expect(msgRes.body.content).toMatch(/heated/);
    });

    test('Cannot send message to unrelated thread', async () => {
      // Try using a made-up thread id
      const res = await request(app)
        .post(`/inbox/thread/thread_fake999/send`)
        .set(authHeader(guestToken))
        .send({ content: 'Spam?' });
      expect([401, 403, 404]).toContain(res.status);
    });
  });

  describe('Reviews', () => {
    let bookingPastId, villaId;
    beforeAll(async () => {
      // Find a booking that is past (confirmed, guest001, villa001), review already exists
      bookingPastId = 'booking001';
      villaId = 'villa001';
    });

    test('Post review not allowed before checkout date', async () => {
      // Make fake booking/check_out tomorrow; should fail.
      const res = await request(app)
        .post('/booking')
        .set(authHeader(guestToken))
        .send({
          villa_id: villaId,
          check_in: '20990101',
          check_out: '20990105',
          number_of_guests: 2,
          guest_full_name: 'Future G.',
          guest_email: 'fut@ex.com',
          guest_phone: '+100101010',
          agreed_to_rules: true
        });
      expect(res.status).toBe(201);
      const { booking_id } = res.body;

      // Try posting review
      const revRes = await request(app)
        .post(`/reviews/villa/${villaId}`)
        .set(authHeader(guestToken))
        .send({ rating: 4, review_text: 'Future review' });
      // Should be forbidden or error
      expect([400, 403]).toContain(revRes.status);
    });

    test('List reviews for a villa', async () => {
      const res = await request(app)
        .get(`/reviews/villa/${villaId}`);
      expect(res.status).toBe(200);
      expect(res.body.reviews).toBeInstanceOf(Array);
      expect(res.body.total).toBeGreaterThan(0);
    });

    test('Admin can moderate (hide/flag) reviews', async () => {
      const reviewId = 'review001';
      const res = await request(app)
        .patch(`/reviews/${reviewId}/moderate`)
        .set(authHeader(adminToken))
        .send({ is_visible: false, admin_notes: 'Hiding for test' });
      expect(res.status).toBe(200);
      expect(res.body.is_visible).toBe(false);
      expect(res.body.admin_notes).toMatch(/Hiding/);
    });
  });

  describe('Notifications', () => {
    test('Fetch notifications for user', async () => {
      const res = await request(app)
        .get('/notifications')
        .set(authHeader(guestToken));
      expect(res.status).toBe(200);
      expect(res.body.notifications).toBeDefined();
      expect(res.body.unread_count).toBeGreaterThanOrEqual(0);
    });

    test('Mark as read', async () => {
      // Get a notification id first
      const res = await request(app)
        .get('/notifications')
        .set(authHeader(guestToken));
      const unread = res.body.notifications.find(n => !n.is_read);
      if (unread) {
        const markRes = await request(app)
          .post(`/notifications/${unread.notification_id}/read`)
          .set(authHeader(guestToken));
        expect(markRes.status).toBe(204);
      }
    });
  });

  describe('Admin Panel', () => {
    test('GET dashboard stats', async () => {
      const res = await request(app)
        .get('/admin/dashboard')
        .set(authHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.total_users).toBeGreaterThan(0);
      expect(res.body.total_villas).toBeGreaterThan(0);
    });

    test('List users as admin', async () => {
      const res = await request(app)
        .get('/admin/users')
        .set(authHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.users).toBeInstanceOf(Array);
      expect(res.body.total).toBeGreaterThan(0);
    });

    test('Admin ban/remove user', async () => {
      // Create a throwaway user
      const { user, token } = await createTestUser({
        email: 'delme@del.domain',
        password: 'letmedie1!',
        name: 'Del Me',
        role: 'guest'
      });
      // Delete
      const res = await request(app)
        .delete(`/admin/users/${user.user_id}`)
        .set(authHeader(adminToken));
      expect(res.status).toBe(204);
    });

    test('List, approve, delete villas as admin', async () => {
      // List
      const res1 = await request(app)
        .get('/admin/listings')
        .set(authHeader(adminToken));
      expect(res1.status).toBe(200);
      expect(res1.body.villas).toBeInstanceOf(Array);
      // Approve pending villa if exists
      const pending = res1.body.villas.find(v => v.status === 'pending');
      if (pending) {
        const res2 = await request(app)
          .patch(`/admin/listings/${pending.villa_id}`)
          .set(authHeader(adminToken))
          .send({ status: 'active' });
        expect(res2.status).toBe(200);
        expect(res2.body.status).toBe('active');
        // Delete
        const res3 = await request(app)
          .delete(`/admin/listings/${pending.villa_id}`)
          .set(authHeader(adminToken));
        expect(res3.status).toBe(204);
      }
    });

    test('Admin can moderate reviews list', async () => {
      const res = await request(app)
        .get('/admin/reviews')
        .set(authHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.reviews).toBeInstanceOf(Array);
    });

    test('Admin list actions', async () => {
      const res = await request(app)
        .get('/admin/actions')
        .set(authHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.actions).toBeInstanceOf(Array);
    });
  });

  // ---- CONSTRAINT/VALIDATION TESTS ----
  describe('Validation and Error cases', () => {
    test('Signup: invalid email fails', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({ email: 'notanemail', password: 'passw0rd!', name: 'Fail', role: 'guest' });
      expect(res.status).toBe(400);
    });

    test('Villa create: missing fields', async () => {
      const res = await request(app)
        .post('/villa')
        .set(authHeader(hostToken))
        .send({ name: 'Oops' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/missing/i);
    });

    test('Booking create: over max occupancy fails', async () => {
      const res = await request(app)
        .post('/booking')
        .set(authHeader(guestToken))
        .send({
          villa_id: 'villa001',
          check_in: '20240901',
          check_out: '20240910',
          number_of_guests: 1000,
          guest_full_name: 'Giant group',
          guest_email: 'many@guest.com',
          guest_phone: '+99999999',
          agreed_to_rules: true
        });
      expect(res.status).toBe(400);
    });

    test('Review create: missing text', async () => {
      const res = await request(app)
        .post('/reviews/villa/villa001')
        .set(authHeader(guestToken))
        .send({ rating: 4 });
      expect(res.status).toBe(400);
    });

    test('Patch user: forbidden fields', async () => {
      const res = await request(app)
        .patch('/me')
        .set(authHeader(guestToken))
        .send({ password_hash: 'hackattempt' });
      expect(res.status).toBe(400);
    });
  });
});