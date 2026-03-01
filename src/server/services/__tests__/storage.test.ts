import { describe, it, expect } from 'vitest';
import { validateUpload, getPublicUrl } from '../storage';

describe('validateUpload', () => {
  it('accepts PDF files under 10MB', () => {
    expect(validateUpload('application/pdf', 1024)).toEqual({
      valid: true,
      error: null,
    });
    expect(validateUpload('application/pdf', 10 * 1024 * 1024)).toEqual({
      valid: true,
      error: null,
    });
  });

  it('rejects PDF files over 10MB', () => {
    const result = validateUpload('application/pdf', 10 * 1024 * 1024 + 1);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10MB');
  });

  it('accepts JPEG images under 2MB', () => {
    expect(validateUpload('image/jpeg', 1024)).toEqual({
      valid: true,
      error: null,
    });
    expect(validateUpload('image/jpeg', 2 * 1024 * 1024)).toEqual({
      valid: true,
      error: null,
    });
  });

  it('accepts PNG images under 2MB', () => {
    expect(validateUpload('image/png', 1024)).toEqual({
      valid: true,
      error: null,
    });
  });

  it('accepts WebP images under 2MB', () => {
    expect(validateUpload('image/webp', 1024)).toEqual({
      valid: true,
      error: null,
    });
  });

  it('rejects images over 2MB', () => {
    const result = validateUpload('image/jpeg', 2 * 1024 * 1024 + 1);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('2MB');
  });

  it('rejects unsupported file types', () => {
    expect(validateUpload('text/plain', 100).valid).toBe(false);
    expect(validateUpload('application/zip', 100).valid).toBe(false);
    expect(validateUpload('video/mp4', 100).valid).toBe(false);
    expect(validateUpload('application/json', 100).valid).toBe(false);
  });

  it('includes the unsupported MIME type in the error', () => {
    const result = validateUpload('text/html', 100);
    expect(result.error).toContain('text/html');
  });
});

describe('getPublicUrl', () => {
  it('constructs a public URL from a key', () => {
    const url = getPublicUrl('uploads/user-123/abc.pdf');
    expect(url).toContain('uploads/user-123/abc.pdf');
    expect(url).toMatch(/^https?:\/\//);
  });
});
