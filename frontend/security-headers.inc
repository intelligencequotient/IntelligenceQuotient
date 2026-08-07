# Security headers, included per-location.
#
# nginx's `add_header` does not inherit into a block that declares its own, so
# these have to be included wherever they are needed rather than set once at
# server level — the previous server-level block was silently dropped for
# /assets/ and /index.html, which both declared their own Cache-Control header.

add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;

# Content Security Policy.
#
# `'unsafe-inline'` is still required for styles: several pages use inline style
# attributes and KaTeX injects its own <style>. Scripts do NOT get that
# exemption — the bundle is served from this origin only, so an injected inline
# <script> cannot execute.
#
# connect-src has to cover the API, the WebSocket, and Supabase Storage (question
# images). It is deliberately wide-open on https/wss rather than wrong: pin it to
# your actual hosts on deploy.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
