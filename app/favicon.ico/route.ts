const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#e85d22"/><circle cx="32" cy="32" r="23" fill="#fff"/><path d="M19 37c0-8 6-15 14-15 7 0 12 5 12 11 0 7-7 13-16 13-6 0-10-3-10-9Z" fill="#f5bd35"/><path d="M31 23c-1-5 1-8 5-10M36 24c1-5 4-7 8-7M28 23c-3-4-6-5-9-3" fill="none" stroke="#d64a21" stroke-width="3" stroke-linecap="round"/><circle cx="39" cy="30" r="1.8" fill="#25303a"/><path d="m45 34 6 2-6 3" fill="#e85d22"/></svg>`;

export function GET() {
  return new Response(icon, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}
