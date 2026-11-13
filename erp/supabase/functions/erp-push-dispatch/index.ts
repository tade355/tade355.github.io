import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// Deploy as erp-push-dispatch. Keep JWT verification enabled and require
// ERP_PUSH_DISPATCH_SECRET as a second, private scheduler credential.
Deno.serve(async (req) => {
  const expected = Deno.env.get('ERP_PUSH_DISPATCH_SECRET') || '';
  if (!expected || req.headers.get('x-erp-push-secret') !== expected)
    return new Response('Unauthorized', { status: 401 });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const publicKey = Deno.env.get('ERP_VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('ERP_VAPID_PRIVATE_KEY') || '';
  if (!url || !key || !publicKey || !privateKey)
    return new Response('Push sender is not configured', { status: 503 });

  const db = createClient(url, key);
  webpush.setVapidDetails('https://tade355.github.io/erp/', publicKey, privateKey);
  const { data: jobs, error } = await db.rpc('erp_claim_push_outbox', { batch_size: 25 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0, failed = 0;
  for (const job of jobs || []) {
    const { data: subscriptions, error: lookupError } = await db
      .from('erp_push_subscriptions').select('endpoint,p256dh,auth_secret')
      .eq('employee_id', job.recipient_id);
    if (lookupError) {
      failed++;
      await db.from('erp_push_outbox')
        .update({ last_error: lookupError.message, next_attempt_at: new Date(Date.now() + 300000).toISOString() })
        .eq('id', job.id);
      continue;
    }
    if (!subscriptions?.length) {
      await db.from('erp_push_outbox')
        .update({ next_attempt_at: new Date(Date.now() + 86400000).toISOString(), last_error: 'No subscribed device' })
        .eq('id', job.id);
      continue;
    }
    const errors: string[] = [];
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
          JSON.stringify({ title: job.title, body: job.body, url: job.target_path }),
          { TTL: 86400 },
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number })?.statusCode || 0;
        if (status === 404 || status === 410)
          await db.from('erp_push_subscriptions').delete().eq('endpoint', sub.endpoint);
        else errors.push(String((error as Error)?.message || error).slice(0, 300));
      }
    }
    const update = errors.length
      ? { last_error: errors.join('; '), next_attempt_at: new Date(Date.now() + 300000).toISOString() }
      : { delivered_at: new Date().toISOString(), last_error: null };
    await db.from('erp_push_outbox').update(update).eq('id', job.id);
    if (errors.length) failed++;
  }
  return Response.json({ claimed: jobs?.length || 0, sent, failed });
});
