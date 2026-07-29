/**
 * Chat message helpers for the doubt rooms.
 *
 * Message text is attacker-controllable: anyone in a conversation can send a
 * literal "[IMAGE]:<anything>". Never hand that value straight to an <img src>
 * or window.open() — a "javascript:" URL there executes in our origin.
 */

const IMAGE_PREFIX = '[IMAGE]:';

/**
 * Returns a safe absolute http(s) URL, or null if the input is anything else
 * (javascript:, data:, relative paths, junk).
 * Set VITE_STORAGE_HOST to additionally pin uploads to your storage host.
 */
export function safeImageUrl(raw) {
  if (typeof raw !== 'string') return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const allowedHost = import.meta.env.VITE_STORAGE_HOST;
  if (allowedHost && url.host !== allowedHost) return null;

  return url.href;
}

/**
 * Classifies a chat message into { type: 'image', url } or { type: 'text', text }.
 * An image message whose URL fails validation degrades to a harmless text notice.
 */
export function parseChatMessage(text) {
  if (typeof text !== 'string') return { type: 'text', text: '' };
  if (!text.startsWith(IMAGE_PREFIX)) return { type: 'text', text };

  const url = safeImageUrl(text.slice(IMAGE_PREFIX.length));
  return url ? { type: 'image', url } : { type: 'text', text: '[unsupported attachment]' };
}

/** Opens a validated URL in a new tab with the opener reference severed. */
export function openImageSafely(url) {
  const safe = safeImageUrl(url);
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
}
