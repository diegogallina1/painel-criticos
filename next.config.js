// Content-Security-Policy: 'self' pra tudo, com as duas exceções pontuais
// que o Vercel Web Analytics precisa (script + endpoint de coleta). Nenhum
// script, fonte ou CDN de terceiro além disso é carregado pelo app.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Não anunciar o framework por header — reduz fingerprinting trivial.
  poweredByHeader: false,
  // O app não usa next/image em lugar nenhum (avatares são emoji). Desligar
  // a otimização built-in fecha a rota /_next/image, que dependeria do
  // sharp/libvips (com CVEs conhecidos em versões antigas) para processar
  // imagens arbitrárias vindas de qualquer URL passada por um visitante.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

module.exports = nextConfig;
