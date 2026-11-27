// Full contact and public-session checks use a disposable database, never cleo_db.
import assert from 'node:assert/strict';
import { MongoClient, ObjectId } from 'mongodb';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const uri = process.env.MONGODB_URI || process.env.NUXT_MONGODB_URI;
assert.ok(uri, 'MongoDB is required');
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
const database = `cleo_test_profiles_${randomBytes(8).toString('hex')}`;
const sessionPassword = randomBytes(32).toString('hex');
let server, base, created = false;
async function start() {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port), NUXT_MONGODB_DATABASE: database, NUXT_SESSION_PASSWORD: sessionPassword, NUXT_APP_ORIGIN: base }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    assert.equal(server.exitCode, null);
    try { if ((await fetch(base + '/api/health/live', { signal: AbortSignal.timeout(500) })).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('Test server unavailable');
}
async function stop() {
  if (server && server.exitCode === null && server.signalCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
}
const request = (path, { cookie, method = 'GET', body, origin = base } = {}) => fetch(base + path, { method, headers: { Origin: origin, ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
async function json(path, options = {}, expected = 200) {
  const response = await request(path, options);
  assert.equal(response.status, expected, `${options.method || 'GET'} ${path}: ${await response.clone().text()}`);
  return response.json();
}
const profile = (body, cookie) => request('/api/public/profile', { method: 'PUT', body, cookie });
const cookieOf = response => response.headers.getSetCookie().find(cookie => cookie.startsWith('cleo-bidder='))?.split(';')[0];
try {
  await client.connect(); const db = client.db(database), now = new Date();
  const legacy = { _id: new ObjectId(), kind: 'bidder', name: 'Legacy Facebook', facebookUrl: 'https://www.facebook.com/cleo.test.legacy', facebookStatus: 'provided', createdAt: now, updatedAt: now };
  await db.collection('users').insertOne(legacy); created = true;
  await db.collection('users').createIndex({ facebookUrl: 1 }, { unique: true, partialFilterExpression: { kind: 'bidder' } });
  await start();
  // There is no administrator account or session yet.
  for (const path of ['/api/public/profile', '/api/public/favorites']) {
    for (const cookie of [undefined, 'cleo-bidder=invalid']) {
      const response = await request(path, { cookie }); assert.equal(response.status, 200);
      assert.equal(response.headers.getSetCookie().length, 0, 'Anonymous reads must not replace a concurrent signup cookie');
      assert.ok(response.headers.get('cache-control').includes('no-store'));
    }
  }
  assert.equal((await request('/api/public/profile', { method: 'PUT', body: { name: 'Cross origin', phone: '5500000101' }, origin: 'https://other.example' })).status, 403);
  for (const contact of [{}, { phone: 'abc' }, { facebookUrl: 'https://facebook.com.evil.example/user', phone: '5500000101' }]) {
    const response = await profile({ name: 'Invalid contact', ...contact }); assert.equal(response.status, 400); assert.equal(response.headers.getSetCookie().length, 0);
  }
  const [first, second] = await Promise.all([profile({ name: 'Phone A', phone: '(55) 0000-0101' }), profile({ name: 'Phone B', phone: '5500000102', facebookUrl: '' })]);
  assert.equal(first.status, 200, await first.clone().text()); assert.equal(second.status, 200, await second.clone().text());
  const a = (await first.json()).profile, b = (await second.json()).profile, aCookie = cookieOf(first), bCookie = cookieOf(second);
  assert.ok(aCookie && bCookie); assert.notEqual(aCookie, bCookie); assert.notEqual(a.id, b.id);
  assert.equal(a.phone, '+525500000101'); assert.equal(a.facebookUrl, '');
  assert.ok(first.headers.getSetCookie().some(cookie => cookie.includes('HttpOnly') && cookie.includes('Secure') && cookie.includes('SameSite=Strict')));
  assert.equal((await json('/api/public/profile', { cookie: aCookie })).profile.id, a.id);
  assert.equal((await json('/api/public/profile', { cookie: bCookie })).profile.id, b.id);
  assert.equal((await json('/api/public/profile')).profile, null);
  const old = await db.collection('users').findOne({ _id: legacy._id }); assert.deepEqual(old, legacy);
  const indexes = await db.collection('users').listIndexes().toArray();
  assert.ok(!indexes.some(index => index.name === 'facebookUrl_1'));
  assert.ok(indexes.some(index => index.name === 'bidder_facebook_contact' && index.unique));
  assert.ok(indexes.some(index => index.name === 'bidder_phone_contact' && index.unique));
  assert.equal((await db.collection('users').findOne({ _id: new ObjectId(a.id) })).facebookUrl, undefined);
  const facebook = await profile({ name: 'Facebook only', facebookUrl: 'https://m.facebook.com/Cleo.Test.Facebook' }); assert.equal(facebook.status, 200);
  const fb = (await facebook.json()).profile; assert.equal(fb.facebookUrl, 'https://www.facebook.com/cleo.test.facebook'); assert.equal(fb.phone, '');
  const both = await profile({ name: 'Both contacts', facebookUrl: 'https://www.facebook.com/cleo.test.both', phone: '+52 55 0000 0103' }); assert.equal(both.status, 200);
  assert.equal((await both.json()).profile.phone, '+525500000103');
  assert.equal((await profile({ name: 'Duplicate phone', phone: '+52 55 0000 0101' })).status, 409);
  assert.equal((await profile({ name: 'Duplicate Facebook', facebookUrl: fb.facebookUrl })).status, 409);
  assert.equal((await profile({ name: 'Invalid type', phone: 5500000104 })).status, 400);
  for (const cookie of [undefined, aCookie, bCookie]) assert.equal((await request('/api/admin/users', { cookie })).status, 401);
  assert.equal((await json('/api/auth/session', { cookie: aCookie })).user, null);
  const publicHome = await request('/'); assert.equal(publicHome.status, 200); assert.ok(publicHome.headers.get('cache-control').includes('no-store'));
  assert.ok(!(await publicHome.text()).includes(a.phone));
  console.log('PASS: profile creation before any admin account/login; no anonymous cookie writes; legacy-index migration; concurrent phone-only signups; Facebook/both contacts; validation, uniqueness and private sessions.');

  // A restart verifies persistence and gives the next group its own rate-limit window.
  await stop(); await start();
  assert.equal((await json('/api/public/profile', { cookie: aCookie })).profile.phone, a.phone);
  const category = new ObjectId(), saleCategory = new ObjectId();
  await db.collection('types').insertMany([{ _id: category, name: 'Prueba', slug: 'prueba', mode: 'auction', active: true, order: 1 }, { _id: saleCategory, name: 'Labiales', slug: 'labiales', mode: 'sale', active: true, order: 1 }]);
  const article = { _id: new ObjectId(), title: 'Subasta por teléfono', mode: 'auction', typeId: category, description: 'Prueba', initialPriceCents: 1000, currency: 'MXN', active: true, status: 'available', star: false, revision: 0, closesAt: new Date(Date.now() + 3600_000), photos: [], bids: [], bidCount: 0, highestBidAmountCents: null, highestBidder: null, createdBy: new ObjectId(), createdAt: now, updatedAt: now };
  const sale = { ...article, _id: new ObjectId(), title: 'Compra por teléfono', mode: 'sale', typeId: saleCategory, closesAt: null, saleType: 'item', units: 2, discountPriceCents: null, purchases: [] };
  await db.collection('articles').insertMany([article, sale]);
  await json(`/api/public/articles/${article._id}/bids`, { cookie: aCookie, method: 'POST', body: { amountCents: 300, requestId: randomUUID() } }, 201);
  await json(`/api/public/articles/${sale._id}/purchases`, { cookie: aCookie, method: 'POST', body: { quantity: 1, unitPriceCents: 1000, requestId: randomUUID() } }, 201);
  let savedArticle = await db.collection('articles').findOne({ _id: article._id });
  assert.equal(savedArticle.highestBidder.phone, a.phone); assert.equal(savedArticle.bids[0].bidder.phone, a.phone);
  assert.equal((await db.collection('articles').findOne({ _id: sale._id })).purchases[0].buyer.phone, a.phone);
  for (const [path, cookie] of [[`/api/public/articles/${article._id}`, undefined], [`/api/public/articles/${article._id}/bids`, undefined], ['/api/public/catalog', undefined], ['/api/public/activity', aCookie], ['/api/public/purchases', aCookie]]) {
    const data = JSON.stringify(await json(path, { cookie }));
    for (const privateValue of [a.phone, 'phone', 'facebookUrl']) assert.ok(!data.includes(privateValue), `${path} must not expose contact data`);
  }
  assert.equal((await json('/api/public/activity', { cookie: bCookie })).items.length, 0);
  assert.equal((await json('/api/public/purchases', { cookie: bCookie })).items.length, 0);

  const password = randomBytes(24).toString('hex'), salt = randomBytes(16).toString('hex');
  await db.collection('admin').insertOne({ username: 'profile-test', passwordAlgorithm: 'scrypt', passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}` });
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'profile-test', password } }); assert.equal(login.status, 200);
  const adminCookie = login.headers.getSetCookie().find(cookie => cookie.startsWith('cleo-session=')).split(';')[0];
  assert.equal((await json('/api/public/profile', { cookie: adminCookie })).profile, null, 'Admin auth does not create a bidder identity');
  assert.equal((await json('/api/admin/users', { cookie: adminCookie })).users.find(user => user.id === a.id).phone, a.phone);
  assert.equal((await json(`/api/admin/articles/${article._id}/bids`, { cookie: adminCookie })).ranking[0].phone, a.phone);
  assert.equal((await json(`/api/admin/purchases?articleId=${sale._id}`, { cookie: adminCookie })).items[0].buyer.phone, a.phone);
  for (const path of ['/panel/usuarios', `/panel/articulos/${article._id}`, `/panel/ventas?articulo=${sale._id}`]) {
    const html = await (await request(path, { cookie: adminCookie })).text(); assert.ok(html.includes(`tel:${a.phone}`), `${path} shows a usable phone contact`);
  }
  await db.collection('articles').updateOne({ _id: article._id }, { $set: { closesAt: new Date(Date.now() - 60_000) } });
  assert.equal((await json('/api/admin/appointments/articles', { cookie: adminCookie })).articles[0].phone, a.phone);
  const date = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const meetingInput = { articleId: String(article._id), recipientName: a.name, date, time: '11:00', location: 'Lugar de prueba', notes: '' };
  const meeting = await json('/api/admin/appointments', { cookie: adminCookie, method: 'POST', body: meetingInput }, 201);
  assert.equal(meeting.phone, a.phone); assert.equal(meeting.facebookUrl, '');
  const busy = JSON.stringify(await json(`/api/public/deliveries?month=${date.slice(0, 7)}`));
  assert.ok(!busy.includes(a.phone) && !busy.includes('phone') && !busy.includes(a.name));

  const changed = await profile({ name: 'Phone A updated', facebookUrl: 'https://www.facebook.com/cleo.test.updated', phone: '' }, aCookie); assert.equal(changed.status, 200);
  assert.equal((await changed.json()).profile.id, a.id);
  assert.equal((await db.collection('users').findOne({ _id: new ObjectId(a.id) })).phone, undefined, 'Switching to Facebook removes the old phone from the profile');
  savedArticle = await db.collection('articles').findOne({ _id: article._id });
  assert.equal(savedArticle.bids[0].bidder.phone, a.phone, 'Profile edits preserve agreed contact snapshots');
  assert.equal((await db.collection('articles').findOne({ _id: sale._id })).purchases[0].buyer.phone, a.phone);
  const rescheduled = await json(`/api/admin/appointments/${meeting.id}`, { cookie: adminCookie, method: 'PATCH', body: { ...meetingInput, time: '11:30', revision: meeting.revision } });
  assert.equal(rescheduled.phone, a.phone);
  const phoneAgain = await profile({ name: 'Phone A updated', phone: '5500000111', facebookUrl: '' }, aCookie); assert.equal(phoneAgain.status, 200);
  let updated = (await phoneAgain.json()).profile; assert.equal(updated.id, a.id); assert.equal(updated.facebookUrl, '');
  assert.equal((await db.collection('users').findOne({ _id: new ObjectId(a.id) })).facebookUrl, undefined);
  const addBoth = await profile({ name: updated.name, phone: updated.phone, facebookUrl: 'https://www.facebook.com/cleo.test.updated' }, aCookie); assert.equal(addBoth.status, 200);
  assert.equal((await addBoth.json()).profile.phone, updated.phone);
  assert.equal((await profile({ name: updated.name, phone: '', facebookUrl: ' ' }, aCookie)).status, 400);
  assert.equal((await json('/api/public/profile', { cookie: aCookie })).profile.phone, updated.phone, 'Invalid updates preserve the existing profile');
  const international = await profile({ name: 'International', phone: '+1 (202) 555-0103' }); assert.equal(international.status, 200); assert.equal((await international.json()).profile.phone, '+12025550103');
  const samePhone = await Promise.all([profile({ name: 'Race one', phone: '5500000199' }), profile({ name: 'Race two', phone: '+52 55 0000 0199' })]);
  assert.deepEqual(samePhone.map(response => response.status).sort(), [200, 409]);
  assert.equal(await db.collection('users').countDocuments({ phone: '+525500000199' }), 1);
  const collision = await profile({ name: 'Cannot take A', phone: updated.phone, userId: a.id }, bCookie); assert.equal(collision.status, 409); assert.equal(collision.headers.getSetCookie().length, 0);
  assert.equal((await json('/api/public/profile', { cookie: bCookie })).profile.id, b.id);
  assert.equal((await request('/api/admin/users', { cookie: aCookie })).status, 401);
  console.log('PASS: phone-only bidding/purchases; private contact snapshots; admin contact links; delivery and rescheduling; optional-contact changes; international numbers; ownership isolation; concurrent duplicates.');
  if (process.env.CLEO_PROFILE_QA === '1') {
    console.log(`Profile QA preview: ${base}`);
    await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  }
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : error.name);
  process.exitCode = 1;
} finally {
  await stop();
  if (created) { await client.db(database).dropDatabase(); console.log('Temporary profile database removed.'); }
  await client.close();
}
