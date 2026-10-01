import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/authUser', () => ({ getCurrentUser: mocks.user }));
vi.mock('@/lib/entitlements', () => ({ isAdminEmail: (email: string) => email === 'admin@example.test' }));
vi.mock('@/lib/data/resourceBudgetStore', () => ({ readResourceBudget: mocks.read, saveResourceReading: mocks.save }));
import { GET, POST } from './route';
afterEach(() => vi.clearAllMocks());
it('does not expose or mutate budget data for unauthorized users', async () => {
  mocks.user.mockResolvedValue(null);
  expect((await GET()).status).toBe(403);
  expect((await POST(new Request('https://app.test/api/operations/resources', { method: 'POST', body: '{}' }))).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it('rejects cross-origin manual writes and malformed readings', async () => {
  mocks.user.mockResolvedValue({ email: 'admin@example.test' });
  expect((await POST(new Request('https://app.test/api/operations/resources', { method: 'POST', headers: { Origin: 'https://other.test' }, body: '{}' }))).status).toBe(403);
  expect((await POST(new Request('https://app.test/api/operations/resources', { method: 'POST', body: '{}' }))).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});
