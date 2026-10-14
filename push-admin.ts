import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
const env = (k) => Deno.env.get(k) ?? '';
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const hour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const day = (d) => WD[new Date(d + 'T12:00:00Z').getUTCDay()] + ' ' + d.slice(8, 10) + '.' + d.slice(5, 7) + '.';
async function send(p, app) {
  const { data } = await sb.from('admin_push_subscriptions').select('*').eq('app', app);
  let n = 0;
  for (const s of data ?? []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 86400, urgency: 'high' }); n++; }
    catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('admin_push_subscriptions').delete().eq('endpoint', s.endpoint); }
  }
  return n;
}
async function flushRequests() {
  const { data } = await sb.from('pw_requests').select('id,room,kind,first_name,last_name').eq('status', 'pending').is('notified_at', null);
  if (!data?.length) return { held: 0 };
  const r = data[0], one = data.length === 1;
  const body = one ? `${r.room} · ${r.first_name} ${r.last_name} · ${r.kind === 'first' ? 'first time' : 'forgot password'}` : `${data.length} password requests are waiting`;
  const sent = await send({ ch: 'pwreq', tag: 'pwreq', title: '🔑 Password request', body }, 'casa');
  await sb.from('pw_requests').update({ notified_at: new Date().toISOString() }).in('id', data.map((x) => x.id));
  return { sent };
}
async function flushVisits() {
  const { data } = await sb.from('provider_visits').select('id').eq('status', 'sent').is('admin_notified_at', null);
  if (!data?.length) return { held: 0 };
  const { data: got } = await sb.from('provider_visits').update({ admin_notified_at: new Date().toISOString() })
    .in('id', data.map((x) => x.id)).is('admin_notified_at', null).select('date,job_id,sent_by,started_by,person_id');
  if (!got?.length) return { held: 0 };
  let body = `${got.length} Besuche warten auf dich · ${got.length} visits waiting`;
  if (got.length === 1) {
    const v = got[0], pid = v.sent_by ?? v.started_by ?? v.person_id;
    const { data: j } = await sb.from('providers').select('name').eq('id', v.job_id).maybeSingle();
    const { data: p } = pid ? await sb.from('provider_people').select('name').eq('id', pid).maybeSingle() : { data: null };
    body = `${j?.name ?? 'Providers'} · ${p?.name ?? 'Provider'} hat gesendet · ${day(v.date)}`;
  }
  return { sent: await send({ ch: 'pvsent', tag: 'pvsent', title: '🧹 Fotos gesendet', body, url: '/providers.html' }, 'providers') };
}
Deno.serve(async (req) => {
  if (!env('PUSH_SECRET') || req.headers.get('x-push-secret') !== env('PUSH_SECRET')) return new Response('forbidden', { status: 403 });
  try {
    const b = await req.json();
    if (b.kind === 'test') return Response.json({
      casa: await send({ ch: 'pwreq', tag: 'pwreq', title: '🔑 Test', body: 'It works 👍' }, 'casa'),
      providers: await send({ ch: 'pvsent', tag: 'pvsent', title: '🧹 Test', body: 'It works 👍', url: '/providers.html' }, 'providers') });
    const h = hour();
    if (h < 11 || h >= 23) return Response.json({ held: true });
    return Response.json({ requests: await flushRequests(), visits: await flushVisits() });
  } catch (e) { return new Response(String(e?.message ?? e), { status: 500 }); }
});
