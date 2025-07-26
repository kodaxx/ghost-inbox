import { json } from '@sveltejs/kit';
import { getWildcardEnabled, setWildcardEnabled } from '$lib/db.js';

export function GET() {
  const enabled = getWildcardEnabled();
  return json({ enabled });
}

export function POST() {
  const current = getWildcardEnabled();
  const next = !current;
  setWildcardEnabled(next);
  return json({ enabled: next });
}