/**
 * Upload an image file via presigned R2 URL.
 * Validates file type and size before uploading.
 * Returns the public URL of the uploaded file.
 */
export async function uploadImageViaPresign(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file (PNG, JPG, SVG, or WebP)');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Image must be under 2MB');
  }

  const res = await fetch('/api/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }),
  });
  if (!res.ok) throw new Error('Failed to get upload URL');
  const { presignedUrl, publicUrl } = (await res.json()) as {
    presignedUrl: string;
    publicUrl: string;
  };
  await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  return publicUrl;
}
