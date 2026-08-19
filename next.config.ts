import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Los datos del modo «Autoridades» viven fuera de `public/` (gate duro por
  // capacidad en /api/territorial/[asset]); hay que incluirlos en el bundle
  // serverless para que la ruta pueda leerlos con fs en Vercel.
  outputFileTracingIncludes: {
    '/api/territorial/**': ['./territorial-data/**/*'],
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
