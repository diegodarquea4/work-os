import type { MetadataRoute } from 'next'

// Panel interno autenticado, sin contenido público — sin indexación.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  }
}
