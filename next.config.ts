import type { NextConfig } from "next";

// ── Content-Security-Policy ──────────────────────────────────────────────────
// Sin nonces (patrón "Without Nonces" de la guía de Next): no hay scripts
// inline en el código fuente (grep confirmado), así que no hace falta la
// complejidad de nonces/dynamic rendering. `proxy.ts` ya aplica X-Frame-Options,
// X-Content-Type-Options, Referrer-Policy y Permissions-Policy a páginas/API,
// pero su matcher EXCLUYE assets estáticos (imágenes, geojson) — por eso CSP y
// HSTS van acá, en next.config.ts, que cubre todo sin duplicar esos 4 headers.
//
// Hosts verificados en el código (no supuestos):
//   - server.arcgisonline.com: único host externo que el CLIENTE llama directo
//     (tile layer Esri Light Gray del Mapa, ChileMap.tsx). Los syncs a BCCh/
//     SEIA/MOP corren server-side en rutas API, no tocan este CSP.
//   - NEXT_PUBLIC_SUPABASE_URL: auth/storage/queries desde el cliente.
//   - Fuentes (Geist) se sirven self-hosted vía next/font — no hay llamada a
//     fonts.googleapis.com en runtime.
//   - style-src necesita 'unsafe-inline': ~27 usos de `style={{...}}` inline
//     (anchos de sidebar, flexBasis, etc.) en componentes.
//   - frame-src necesita 'self' (iframe de /tour/explainer.html en el Centro de
//     Ayuda) y blob: (preview de minutas/actas en PDF vía URL.createObjectURL,
//     VistaRegional.tsx). El resto de los blobs de PDF se abren con
//     window.open() en pestaña nueva, no en iframe — no requieren nada extra.
const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();

function buildCsp(isDev: boolean): string {
  const connectSrc = ["'self'", "https://server.arcgisonline.com"];
  if (SUPABASE_HOST) connectSrc.push(`https://${SUPABASE_HOST}`, `wss://${SUPABASE_HOST}`);
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https://server.arcgisonline.com`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src 'self' blob:`,
    `frame-ancestors 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join("; ");
}

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    const isDev = process.env.NODE_ENV === "development";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: buildCsp(isDev) },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
  // Los datos del modo «Autoridades» viven fuera de `public/` (gate duro por
  // capacidad en /api/territorial/[asset]); hay que incluirlos en el bundle
  // serverless para que la ruta pueda leerlos con fs en Vercel.
  outputFileTracingIncludes: {
    '/api/territorial/**': ['./territorial-data/**/*'],
    // Catastro MINVU: datos sensibles (propietario, hogares, NNA) fuera de
    // `public/` para que el gate admin de la ruta sea real.
    '/api/catastro-minvu/**': ['./private-data/**/*'],
  },
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

export default nextConfig;
