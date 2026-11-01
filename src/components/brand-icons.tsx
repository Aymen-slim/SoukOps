/**
 * Brand glyphs for the social connect cards (Lucide ships no brand icons).
 * Simple, recognizable marks drawn from basic shapes; brand color is applied
 * via the `color` of the wrapping tile, paths use currentColor.
 */

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path d="M9.2 8.2c.1-.7.6-.8 1-.8h.6c.2 0 .4.1.5.4l.5 1.2c.1.2 0 .4-.1.6l-.4.5c.5 1 1.3 1.8 2.3 2.3l.5-.4c.2-.1.4-.2.6-.1l1.2.5c.3.1.4.3.4.5v.6c0 .4-.1.9-.8 1-2.9.5-6.6-3.2-6.1-6.1z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MessengerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z" />
      <path d="m7 13.5 2.8-3 2.2 2.2 3-2.7-2.8 3.5-2.2-2.2z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" />
    </svg>
  );
}
