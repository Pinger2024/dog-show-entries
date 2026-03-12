/**
 * Upload an image file via server-side FormData route (avoids R2 CORS issues).
 * Validates file type and size before uploading.
 * Returns the public URL of the uploaded file.
 */
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file (PNG, JPG, SVG, or WebP)');
  }
  const maxBytes = file.type === 'image/svg+xml' ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    const maxMB = maxBytes / 1024 / 1024;
    throw new Error(`Image must be under ${maxMB}MB`);
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? 'Upload failed — please try again');
  }

  const { publicUrl } = (await res.json()) as { publicUrl: string };
  return publicUrl;
}
