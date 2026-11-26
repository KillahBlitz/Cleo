// Uses a disposable database on the caller's test MongoDB, never cleo_db.
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
assert.ok(uri, 'MONGODB_URI must point to the isolated test MongoDB');
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
const database = `cleo_test_deployment_${randomBytes(8).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const salt = randomBytes(16).toString('hex');
const origin = 'https://cleo-dev.kinasisdev.com';
let server;
let created = false;

async function start(extra) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  server = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port),
      NUXT_MONGODB_URI: '', MONGODB_URI: uri, NUXT_MONGODB_DATABASE: database, NUXT_SESSION_PASSWORD: randomBytes(32).toString('hex'),
      NUXT_APP_ORIGIN: origin, NUXT_TRUST_CLOUDFLARE: 'true', ...extra },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null, 'Server must remain running');
    try {
      const response = await fetch(`${base}/api/health/live`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return base;
    } catch {}
    await delay(100);
  }
  throw new Error('Server did not start');
}
async function stop() {
  if (server && server.exitCode === null) {
    const closed = once(server, 'exit');
    server.kill('SIGTERM');
    await closed;
  }
  server = undefined;
}
try {
  await client.connect();
  await client.db(database).collection('admin').insertOne({ username: 'deploy-test', passwordAlgorithm: 'scrypt', passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}` });
  created = true;
  let base = await start({});
  const readiness = await fetch(`${base}/api/health/ready`);
  assert.equal(readiness.status, 200);
  assert.equal(readiness.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await readiness.json(), { status: 'ok' });
  assert.equal((await fetch(`${base}/api/admin/overview`)).status, 401);
  const login = (sentOrigin, ip, submittedPassword = password) => fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: sentOrigin, 'cf-connecting-ip': ip },
    body: JSON.stringify({ username: 'deploy-test', password: submittedPassword }),
  });
  assert.equal((await login('https://foreign.invalid', '198.51.100.1')).status, 403);
  const auth = await login(origin, '198.51.100.1');
  assert.equal(auth.status, 200, 'HTTPS origin must work behind an internal HTTP tunnel');
  const cookie = auth.headers.getSetCookie().find(value => value.startsWith('cleo-session='));
  assert.match(cookie, /; Secure/i);
  assert.match(cookie, /; HttpOnly/i);
  assert.equal((await fetch(`${base}/api/admin/overview`, { headers: { cookie: cookie.split(';')[0] } })).status, 200);
  for (let i = 0; i < 10; i++) assert.equal((await login(origin, '198.51.100.2', 'wrong')).status, 401);
  assert.equal((await login(origin, '198.51.100.2', 'wrong')).status, 429);
  assert.equal((await login(origin, '198.51.100.3')).status, 200, 'Other Cloudflare clients must retain access');
  await stop();
  base = await start({ MONGODB_URI: 'mongodb://127.0.0.1:1', NUXT_TRUST_CLOUDFLARE: 'false' });
  assert.equal((await fetch(`${base}/api/health/live`)).status, 200);
  const unavailable = await fetch(`${base}/api/health/ready`);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { status: 'unavailable' });
  await stop();
  base = await start({ NUXT_SESSION_PASSWORD: '' });
  assert.equal((await fetch(`${base}/api/health/live`)).status, 200);
  assert.equal((await fetch(`${base}/api/health/ready`)).status, 503);
  console.log('PASS: health/readiness, unavailable DB, missing session key, HTTPS origin, secure admin cookie, protected API and proxy client rate limiting.');
} finally {
  await stop();
  if (created) await client.db(database).dropDatabase();
  await client.close();
}
