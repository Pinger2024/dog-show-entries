import { vi } from 'vitest';

/**
 * Shared Resend SDK mocks. Tests that need to inspect email send call
 * payloads (recipient, subject, body) import these and assert via
 * `vi.mocked(resendMocks.send).mock.calls[i]` etc.
 *
 * setup.ts wires the `resend` package mock to use these handles, so
 * every `new Resend()` instance shares them.
 */
export const resendMocks = {
  send: vi.fn(async () => ({ data: { id: 'em_test' }, error: null })),
  receivingGet: vi.fn(async () => ({ data: null, error: null })),
};
