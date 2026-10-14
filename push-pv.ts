import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
const env = (k) => Deno.env.get(k) ?? '';
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const hour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
async function sendTo(person, p) {
  const { data } = await sb.from('provider_push_subscriptions').select('*').eq('person_id', person);
  let n = 0;
  for (const s of data ?? []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 86400, urgency: 'high' }); n++; }
    catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('provider_push_subscriptions').delete().eq('endpoint', s.endpoint); }
  }
  return n;
}
async function flush() {
  const { data } = await sb.from('provider_push_outbox').select('id').is('sent_at', null).order('created_at').limit(500);
  if (!data?.length) return { held: 0 };
  const { data: got } = await sb.from('provider_push_outbox').update({ sent_at: new Date().toISOString() })
    .in('id', data.map((x) => x.id)).is('sent_at', null).select('*');
  const by = new Map();
  for (const r of (got ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!by.has(r.person_id)) by.set(r.person_id, []);
    by.get(r.person_id).push(r);
  }
  let sent = 0;
  for (const [person, list] of by) {
    const last = list[list.length - 1];
    sent += await sendTo(person, list.length === 1
      ? { title: last.title, body: last.body, tag: last.tag ?? 'pv', url: '/service.html' }
      : { title: 'Casa Castel', body: `${list.length} Neuigkeiten · ${list.length} updates`, tag: 'pv-sum', url: '/service.html' });
  }
  return { sent };
}
Deno.serve(async (req) => {
  if (!env('PUSH_SECRET') || req.headers.get('x-push-secret') !== env('PUSH_SECRET')) return new Response('forbidden', { status: 403 });
  try {
    const b = await req.json();
    if (b.kind === 'test') {
      const { data } = await sb.from('provider_push_subscriptions').select('person_id');
      let n = 0;
      for (const pid of new Set((data ?? []).map((x) => x.person_id))) n += await sendTo(pid, { title: 'Casa Castel · Test', body: 'Push funktioniert 👍 · It works', tag: 'pv-test', url: '/service.html' });
      return Response.json({ sent: n });
    }
    const h = hour();
    if (h < 8 || h >= 21) return Response.json({ held: true });
    return Response.json(await flush());
  } catch (e) { return new Response(String(e?.message ?? e), { status: 500 }); }
});
