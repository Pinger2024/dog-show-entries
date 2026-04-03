import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/shows/', '/dog/', '/promo', '/pricing', '/help', '/about', '/features'],
        disallow: ['/secretary/', '/dashboard/', '/steward/', '/admin/', '/api/', '/onboarding'],
      },
    ],
    sitemap: 'https://remishowmanager.co.uk/sitemap.xml',
  };
}
