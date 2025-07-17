// Simple test to verify Jest is working
describe('Backend Tests', () => {
  test('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should verify environment', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });
});