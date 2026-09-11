import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `pg` es un driver nativo: no debe entrar al bundle del cliente ni ser
  // pre-empaquetado por Turbopack/webpack en el servidor.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
