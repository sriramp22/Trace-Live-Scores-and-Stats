import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// Content Security Policy for the built app: only our own code may run, and the
// only outside hosts it may talk to are ESPN's score feed and its logo CDN.
// Applied to builds only, because the dev server relies on inline scripts for hot reload.
const CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https://a.espncdn.com",
  'connect-src https://site.api.espn.com',
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
]
// frame-ancestors (no other site may embed Trace) only works as a real HTTP header.
const CSP_META = CSP_DIRECTIVES.join('; ')
const CSP_HEADER = [...CSP_DIRECTIVES, "frame-ancestors 'none'"].join('; ')

// Response headers for every file the host serves. Emitted as `_headers`, which
// Cloudflare (and Netlify) read from the build output.
const HEADERS_FILE = `/*
  Content-Security-Policy: ${CSP_HEADER}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
`

const securityHeaders = (): Plugin => ({
  name: 'trace-security-headers',
  apply: 'build',
  // The <meta> copy keeps the policy in force anywhere the `_headers` file is not honoured.
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP_META }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: '_headers', source: HEADERS_FILE })
  },
})

export default defineConfig({
  plugins: [react(), securityHeaders(), cloudflare()],
  // Relative asset paths so the built app works from any URL or sub-folder when hosted.
  base: './',
  // The dev server stays on this computer only. To reach the app from a phone,
  // use `npm run phone`, which serves the built app to the local network.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
