// Integration checks run in a uniquely named temporary database, never in cleo_db.
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { MongoClient, ObjectId } from 'mongodb';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { checkDeliveries } from './check-deliveries.mjs';
import { checkActivity } from './check-activity.mjs';
import { checkSales } from './check-sales.mjs';
import { checkArticleLifecycle } from './check-article-lifecycle.mjs';

const uri = process.env.MONGODB_URI || process.env.NUXT_MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');
const database = `cleo_test_catalog_${randomBytes(8).toString('hex')}`;
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
let server;
let created = false;
try {
  await client.connect();
  const db = client.db(database);
  const password = randomBytes(24).toString('hex');
  const salt = randomBytes(16).toString('hex');
  await db.collection('admin').insertOne({ username: 'catalog-test', passwordAlgorithm: 'scrypt', passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}` });
  created = true;
  const [hot, dolls, clothes, makeup] = Array.from({ length: 4 }, () => new ObjectId());
  await db.collection('types').insertMany([
    { _id: hot, mode: 'auction', name: 'Hot Wheels', slug: 'hot-wheels', active: true, order: 1 },
    { _id: dolls, mode: 'auction', name: 'Muñecas', slug: 'munecas', active: true, order: 2 },
    { _id: clothes, mode: 'auction', name: 'Ropa', slug: 'ropa', active: true, order: 3 },
    { _id: makeup, mode: 'sale', name: 'Labiales de prueba', slug: 'test-lipstick', active: true, order: 1 },
  ]);
  await db.collection('articles').insertMany([
    { mode: 'auction', typeId: hot, title: 'Carrito [A]', status: 'auction' },
    { mode: 'auction', typeId: hot, title: 'Carrito B', status: 'draft' },
    { mode: 'auction', typeId: dolls, title: 'Muñeca A', status: 'auction' },
    { mode: 'auction', typeId: clothes, title: 'Blusa A', status: 'available' },
    { mode: 'sale', typeId: makeup, title: 'Labial A', status: 'available', active: true, units: 1 },
    { mode: 'sale', typeId: makeup, title: 'Labial B', status: 'sold' },
  ]);
  await db.collection('auctions').insertMany([
    { typeId: hot, title: 'Carrito [A]', status: 'active' },
    { typeId: hot, title: 'Carrito B', status: 'closed' },
    { typeId: dolls, title: 'Muñeca A', status: 'active' },
    { typeId: clothes, title: 'Blusa A', status: 'scheduled' },
  ]);
  const probe = createServer();
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port), NUXT_MONGODB_DATABASE: database, NUXT_SESSION_PASSWORD: randomBytes(32).toString('hex') }, stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error('Test server exited');
    try { if ((await fetch(base + '/api/auth/session', { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, 'Test server is ready');
  for (const path of ['/api/admin/types', '/api/admin/overview', '/api/admin/articles', '/api/admin/auctions']) assert.equal((await fetch(base + path)).status, 401);
  const auth = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'catalog-test', password }) });
  assert.equal(auth.status, 200);
  const cookie = auth.headers.getSetCookie().at(-1).split(';')[0];
  async function get(path, expected = 200) {
    const response = await fetch(base + path, { headers: { cookie } });
    assert.equal(response.status, expected, path);
    return response.json();
  }
  const catalog = await get('/api/admin/types?mode=auction');
  assert.deepEqual(catalog.types.map(t => t.name), ['Hot Wheels', 'Muñecas', 'Ropa']);
  const all = await get('/api/admin/overview');
  assert.equal(all.mode, 'auction');
  assert.deepEqual(all.counts, { articles: 4, active: 2, scheduled: 1, closed: 1, available: 0, sold: 0 });
  const filtered = await get(`/api/admin/overview?mode=auction&typeId=${hot}`);
  assert.deepEqual(filtered.counts, { articles: 2, active: 1, scheduled: 0, closed: 1, available: 0, sold: 0 });
  assert.equal(filtered.recentArticles.length, 2);
  assert.ok(filtered.recentArticles.every(a => a.category === 'Hot Wheels'));
  const sales = await get('/api/admin/overview?mode=sale');
  assert.deepEqual(sales.counts, { articles: 2, active: 0, scheduled: 0, closed: 0, available: 1, sold: 1 });
  assert.ok(sales.recentArticles.every(a => a.title.startsWith('Labial')));
  assert.equal((await get(`/api/admin/auctions?typeId=${hot}&status=active`)).total, 1);
  assert.equal((await get(`/api/admin/articles?mode=auction&typeId=${hot}`)).total, 2);
  assert.equal((await get(`/api/admin/articles?mode=sale&status=sold`)).total, 1);
  assert.equal((await get(`/api/admin/auctions?typeId=${hot}&q=${encodeURIComponent('[A]')}`)).total, 1);
  for (const path of [`/api/admin/overview?mode=sale&typeId=${hot}`, `/api/admin/auctions?typeId=${makeup}`, '/api/admin/overview?typeId=invalid', '/api/admin/overview?mode=invalid', `/api/admin/articles?typeId=${new ObjectId()}`, '/api/admin/types?mode=invalid', '/api/admin/auctions?mode=sale']) await get(path, 400);
  const htmlResponse = await fetch(base + `/panel?modalidad=auction&categoria=${hot}`, { headers: { cookie } });
  assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  for (const label of ['Subastas', 'Ventas', 'Hot Wheels', 'Muñecas', 'Ropa']) assert.ok(html.includes(label));
  assert.ok(html.includes(`categoria=${hot}`), 'Summary links preserve category');
  const salesHtml = await fetch(base + '/panel?modalidad=sale', { headers: { cookie } }).then(r => r.text());
  assert.ok(salesHtml.includes('Disponibles') && salesHtml.includes('Vendidos'));
  assert.ok(!salesHtml.includes('Subastas activas'));
  // Creation and uploads are exercised only against this temporary database.
  for (const path of ['/api/admin/types', '/api/admin/articles']) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401);
  }
  const postCategory = (name, mode = 'auction', origin) => fetch(base + '/api/admin/types', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify({ name, mode }) });
  assert.equal((await postCategory('Otra categoría', 'auction', 'https://invalid.example')).status, 403);
  const categoryResponse = await postCategory('  Colección de autos  '); assert.equal(categoryResponse.status, 201);
  const newCategory = await categoryResponse.json(); assert.equal(newCategory.name, 'Colección de autos');
  assert.equal((await postCategory('Coleccion de autos')).status, 409);
  assert.equal((await postCategory('x')).status, 400);
  assert.equal((await get('/api/admin/types?mode=auction')).types.length, 4);
  const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#aa8844' } }).png().toBuffer();
  const future = new Date(Date.now() + 3600_000).toISOString();
  function articleForm(overrides = {}, count = 1, photo = bytes, mime = 'image/png') {
    const form = new FormData();
    const fields = { title: 'Artículo de prueba', mode: 'auction', typeId: newCategory.id, initialPrice: '123', description: 'Descripción de prueba', active: 'true', closesAt: future, ...overrides };
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    for (let i = 0; i < count; i++) form.append('photos', new Blob([photo], { type: mime }), `photo-${i}.png`);
    return form;
  }
  async function postArticle(form, expected = 201) {
    const response = await fetch(base + '/api/admin/articles', { method: 'POST', headers: { cookie }, body: form });
    assert.equal(response.status, expected, `Create article: ${await response.clone().text()}`);
    return response.json();
  }
  const createdArticle = await postArticle(articleForm({}, 5));
  const saved = await db.collection('articles').findOne({ _id: new ObjectId(createdArticle.id) });
  assert.equal(saved.initialPriceCents, 12300);
  assert.equal(saved.highestBidAmountCents, null); assert.equal(saved.highestBidder, null);
  assert.equal(saved.active, true); assert.equal(saved.closesAt.toISOString(), future);
  assert.equal(saved.photos.length, 5); assert.ok(saved.photos.every(p => p.contentType === 'image/webp'));
  const detail = await get(`/api/admin/articles/${createdArticle.id}`);
  assert.equal(detail.description, 'Descripción de prueba'); assert.equal(detail.photos.length, 5);
  assert.equal(detail.photos[0].data, undefined);
  const photoResponse = await fetch(base + detail.photos[0].url, { headers: { cookie } });
  assert.equal(photoResponse.status, 200); assert.equal(photoResponse.headers.get('content-type'), 'image/webp');
  assert.equal((await sharp(Buffer.from(await photoResponse.arrayBuffer())).metadata()).format, 'webp');
  assert.equal((await fetch(base + detail.photos[0].url)).status, 401);
  assert.equal((await get('/api/admin/auction-eligible')).total, 1);
  const inactive = await postArticle(articleForm({ active: 'false' }));
  assert.equal((await get(`/api/admin/articles?status=inactive&typeId=${newCategory.id}`)).total, 1);
  assert.equal((await get('/api/admin/auction-eligible')).total, 1);
  assert.equal((await get(`/api/admin/articles/${inactive.id}`)).active, false);
  await postArticle(articleForm({}, 6), 400);
  await postArticle(articleForm({}, 0), 400);
  await postArticle(articleForm({}, 1, Buffer.from('not an image')), 400);
  await postArticle(articleForm({}, 1, Buffer.alloc(5 * 1024 * 1024 + 1)), 400);
  await postArticle(articleForm({ initialPrice: '1.001' }), 400);
  await postArticle(articleForm({ initialPrice: '1.50' }), 400);
  await postArticle(articleForm({ initialPrice: '-1' }), 400);
  await postArticle(articleForm({ active: 'maybe' }), 400);
  await postArticle(articleForm({ typeId: makeup.toHexString() }), 400);
  await postArticle(articleForm({ highestBidAmountCents: '100000' }), 400);
  await postArticle(articleForm({ closesAt: new Date(Date.now() - 1000).toISOString() }), 400);
  await postArticle(articleForm({ closesAt: 'invalid' }), 400);
  assert.equal(await db.collection('articles').countDocuments({ typeId: new ObjectId(newCategory.id) }), 2, 'Invalid writes leave no article/photo records');
  const editArticle = (id, form, authCookie = cookie) => fetch(base + `/api/admin/articles/${id}`, { method: 'PATCH', headers: authCookie ? { cookie: authCookie } : {}, body: form });
  const keepIds = JSON.stringify(detail.photos.map(photo => photo.id));
  assert.equal((await editArticle(createdArticle.id, articleForm({ keepPhotoIds: keepIds }, 0), null)).status, 401);
  assert.equal((await fetch(base + `/api/admin/articles/${createdArticle.id}`, { method: 'DELETE' })).status, 401);
  assert.equal((await editArticle(createdArticle.id, articleForm({ title: 'Artículo editado', initialPrice: '140', description: 'Descripción editada', keepPhotoIds: keepIds }, 0))).status, 200);
  const edited = await get(`/api/admin/articles/${createdArticle.id}`);
  assert.equal(edited.title, 'Artículo editado'); assert.equal(edited.initialPriceCents, 14000);
  assert.equal(edited.description, 'Descripción editada'); assert.deepEqual(edited.photos, detail.photos);
  assert.equal((await editArticle(createdArticle.id, articleForm({ keepPhotoIds: keepIds }, 1))).status, 400, 'Retained plus new photos cannot exceed five');
  assert.equal((await editArticle(createdArticle.id, articleForm({ keepPhotoIds: JSON.stringify([new ObjectId().toHexString()]) }, 0))).status, 400, 'Cannot retain a foreign photo');
  assert.equal((await editArticle(createdArticle.id, articleForm({ keepPhotoIds: '[]' }, 0))).status, 400);
  assert.equal((await editArticle(createdArticle.id, articleForm({ keepPhotoIds: JSON.stringify([detail.photos[0].id]) }, 1))).status, 200);
  const replaced = await get(`/api/admin/articles/${createdArticle.id}`);
  assert.equal(replaced.photos.length, 2); assert.equal(replaced.photos[0].id, detail.photos[0].id);
  assert.notEqual(replaced.photos[1].id, detail.photos[1].id);
  assert.equal((await fetch(base + detail.photos[1].url, { headers: { cookie } })).status, 404);
  await db.collection('articles').updateOne({ _id: saved._id }, { $set: { closesAt: new Date(Date.now() - 1000) } });
  assert.equal((await get('/api/admin/auction-eligible')).total, 0, 'Expired articles cannot be auctioned');
  for (const path of ['/panel/articulos/nuevo', `/panel/articulos/${createdArticle.id}`, `/panel/articulos/${createdArticle.id}/editar`, '/panel/subastas?vista=articulos']) {
    const response = await fetch(base + path, { headers: { cookie } }); assert.equal(response.status, 200, path);
    const html = await response.text(); assert.ok(!html.includes('No se pudo cargar'), path);
  }
  const starResponses = await Promise.all(Array.from({ length: 7 }, (_, i) => fetch(base + '/api/admin/articles', { method: 'POST', headers: { cookie }, body: articleForm({ title: `Featured ${i}`, star: 'true' }) })));
  assert.equal(starResponses.filter(r => r.status === 201).length, 5, 'Concurrent requests cannot exceed five stars');
  assert.equal(starResponses.filter(r => r.status === 409).length, 2);
  const starred = await db.collection('articles').find({ star: true }, { projection: { starSlot: 1 } }).toArray();
  assert.equal(starred.length, 5); assert.equal(new Set(starred.map(a => a.starSlot)).size, 5);
  const switchStar = (id, star) => fetch(base + `/api/admin/articles/${id}/star`, { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ star }) });
  assert.equal((await switchStar(inactive.id, true)).status, 409);
  assert.equal((await editArticle(inactive.id, articleForm({ star: 'true', keepPhotoIds: JSON.stringify((await get(`/api/admin/articles/${inactive.id}`)).photos.map(p => p.id)) }, 0))).status, 409, 'Editing cannot bypass the featured limit');
  assert.equal((await switchStar(starred[0]._id, false)).status, 200);
  assert.equal((await switchStar(inactive.id, true)).status, 200);
  const catalogPublic = await fetch(base + '/api/public/catalog').then(r => r.json());
  assert.equal(catalogPublic.featured.length, 4, 'Inactive star stays private');
  assert.ok(!JSON.stringify(catalogPublic).includes('highestBidder'));
  assert.equal((await fetch(base + `/api/public/articles/${inactive.id}`)).status, 404);
  assert.equal((await fetch(base + `/api/public/articles/${createdArticle.id}`)).status, 200);
  const bidArticle = await postArticle(articleForm({ title: 'Live auction test', initialPrice: '10.00', star: 'false' }));
  const publicPhoto = (await fetch(base + `/api/public/articles/${bidArticle.id}`).then(r => r.json())).article.photos[0].url;
  assert.equal((await fetch(base + publicPhoto)).status, 200);
  const saveProfile = (name, facebookUrl, userCookie) => fetch(base + '/api/public/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(userCookie ? { cookie: userCookie } : {}) }, body: JSON.stringify({ name, facebookUrl }) });
  assert.equal((await saveProfile('Bad URL', 'https://facebook.com.evil.example/name')).status, 400);
  assert.equal((await saveProfile('Bad URL', 'https://www.facebook.com/groups/123')).status, 400);
  const aliceResponse = await saveProfile('Alice', 'https://www.facebook.com/cleo.test.alice');
  assert.equal(aliceResponse.status, 200);
  const alice = (await aliceResponse.json()).profile, aliceCookie = aliceResponse.headers.getSetCookie().at(-1).split(';')[0];
  assert.equal(alice.facebookStatus, undefined, 'No profile approval state is exposed');
  const bobResponse = await saveProfile('Bob', 'https://facebook.com/cleo.test.bob');
  const bob = (await bobResponse.json()).profile, bobCookie = bobResponse.headers.getSetCookie().at(-1).split(';')[0];
  assert.notEqual(alice.id, bob.id);
  assert.equal((await saveProfile('Impersonator', alice.facebookUrl)).status, 409);
  const bid = (userCookie, cents, requestId = randomUUID(), article = bidArticle.id) => fetch(base + `/api/public/articles/${article}/bids`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(userCookie ? { cookie: userCookie } : {}) }, body: JSON.stringify({ amountCents: cents, requestId }) });
  assert.equal((await bid(undefined, 1000)).status, 401);
  assert.equal((await bid(aliceCookie, 900)).status, 409);
  assert.equal((await bid(aliceCookie, 1001)).status, 400, 'Fractional peso offers are rejected');
  const firstId = randomUUID();
  assert.equal((await bid(aliceCookie, 1000, firstId)).status, 201);
  assert.equal((await bid(aliceCookie, 1000, firstId)).status, 200);
  assert.equal((await bid(aliceCookie, 1100, firstId)).status, 409);
  assert.equal((await bid(bobCookie, 1000)).status, 409);
  const parallel = await Promise.all([bid(aliceCookie, 1200), bid(bobCookie, 1500)]);
  assert.ok(parallel.every(r => [201, 409].includes(r.status)));
  let live = await db.collection('articles').findOne({ _id: new ObjectId(bidArticle.id) }, { projection: { photos: 0 } });
  assert.equal(live.highestBidAmountCents, 1500); assert.equal(String(live.highestBidder.userId), bob.id);
  assert.deepEqual(live.bids.map(b => b.amountCents), [...live.bids.map(b => b.amountCents)].sort((a, b) => a - b));
  assert.equal(new Set(live.bids.map(b => b.amountCents)).size, live.bids.length); assert.equal(live.bidCount, live.bids.length);
  assert.equal(live.bids.filter(b => b.requestId === firstId).length, 1);
  assert.equal(live.star, false, 'Bids never select featured articles');
  const bidDetail = await get(`/api/admin/articles/${bidArticle.id}`);
  const bidEditFields = { title: 'Subasta editada con pujas', initialPrice: '10.00', keepPhotoIds: JSON.stringify(bidDetail.photos.map(p => p.id)) };
  assert.equal((await editArticle(bidArticle.id, articleForm(bidEditFields, 0))).status, 200);
  for (const override of [{ initialPrice: '11.00' }, { typeId: String(hot) }, { mode: 'sale', typeId: String(makeup) }, { closesAt: new Date(Date.now() + 7200_000).toISOString() }]) {
    assert.equal((await editArticle(bidArticle.id, articleForm({ ...bidEditFields, ...override }, 0))).status, 409, 'Bids lock auction terms');
  }
  const preserved = await db.collection('articles').findOne({ _id: live._id }, { projection: { photos: 0 } });
  assert.equal(preserved.title, 'Subasta editada con pujas'); assert.deepEqual(preserved.bids, live.bids); assert.deepEqual(preserved.highestBidder, live.highestBidder);
  const publicBids = await fetch(base + `/api/public/articles/${bidArticle.id}/bids`).then(r => r.json());
  assert.ok(!JSON.stringify(publicBids).includes('facebook')); assert.ok(!JSON.stringify(publicBids).includes('userId'));
  const ranked = await get(`/api/admin/articles/${bidArticle.id}/bids`);
  assert.equal(ranked.ranking[0].userId, bob.id); assert.equal(ranked.ranking.length, 2);
  await checkActivity({ base, db, aliceCookie, bobCookie, alice, bob, articleId: bidArticle.id });
  await saveProfile('Alice updated', 'https://www.facebook.com/cleo.test.alice.changed', aliceCookie);
  const changedProfileArticle = await postArticle(articleForm({ title: 'Postor sin aprobacion', initialPrice: '10' }));
  assert.equal((await bid(aliceCookie, 1000, randomUUID(), changedProfileArticle.id)).status, 201, 'Changing Facebook does not require approval');
  assert.equal((await bid(aliceCookie, 1001, randomUUID(), changedProfileArticle.id)).status, 400);
  assert.equal((await bid(aliceCookie, 1100, randomUUID(), changedProfileArticle.id)).status, 201, 'Minimum increase is one whole peso');
  const legacyArticle = { ...await db.collection('articles').findOne({ _id: new ObjectId(changedProfileArticle.id) }), _id: new ObjectId(), initialPriceCents: 1050, highestBidAmountCents: null, highestBidder: null, bids: [], bidCount: 0 };
  await db.collection('articles').insertOne(legacyArticle);
  await db.collection('users').updateOne({ _id: new ObjectId(alice.id) }, { $set: { facebookStatus: 'pending' } });
  assert.equal((await bid(aliceCookie, 1050, randomUUID(), String(legacyArticle._id))).status, 400);
  assert.equal((await bid(aliceCookie, 1000, randomUUID(), String(legacyArticle._id))).status, 409);
  assert.equal((await bid(aliceCookie, 1100, randomUUID(), String(legacyArticle._id))).status, 201, 'Legacy fractional starting price rounds the next offer up; old pending profiles can bid');
  assert.equal((await db.collection('articles').findOne({ _id: legacyArticle._id })).initialPriceCents, 1050, 'Historical values are not rewritten');
  const saleWithCents = await postArticle(articleForm({ mode: 'sale', typeId: String(makeup), initialPrice: '12.50', saleType: 'item', units: '5' }));
  assert.equal((await get(`/api/admin/articles/${saleWithCents.id}`)).initialPriceCents, 1250, 'Direct sale prices retain centavos');
  assert.equal(live.bids[0].bidder.facebookUrl, alice.facebookUrl, 'Bid retains immutable contact snapshot');
  await db.collection('articles').updateOne({ _id: live._id }, { $set: { closesAt: new Date(Date.now() - 1000) } });
  assert.equal((await bid(bobCookie, 2500)).status, 409, 'Expired article refuses bids');
  assert.equal((await bid(bobCookie, 20000, randomUUID(), inactive.id)).status, 409);
  const nextResponse = await fetch(base + `/api/admin/articles/${bidArticle.id}/next-bidder`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: bob.id }) });
  assert.equal(nextResponse.status, 200);
  const nextRanking = await get(`/api/admin/articles/${bidArticle.id}/bids`);
  assert.equal(nextRanking.ranking.find(b => !b.declined).userId, alice.id);
  assert.equal(nextRanking.bids.length, live.bids.length, 'Fallback preserves every bid');
  await checkDeliveries({ base, cookie, db, articleId: bidArticle.id });
  for (const path of ['/', '/perfil', `/articulos/${bidArticle.id}`, '/?modalidad=sale']) {
    const response = await fetch(base + path); assert.equal(response.status, 200, path);
    const html = await response.text(); assert.ok(!html.includes('href="/login"'), 'No public admin link');
  }
  const homeHtml = await fetch(base + '/').then(r => r.text());
  assert.ok(homeHtml.includes('SELECCIÓN CLEO')); assert.ok(homeHtml.includes('Mi perfil para pujar'));
  const listHtml = await fetch(base + '/panel/articulos', { headers: { cookie } }).then(r => r.text());
  assert.ok(listHtml.includes(`href="/panel/articulos/${bidArticle.id}"`), 'Article names link to edit/delete detail');
  const expiredDetail = await get(`/api/admin/articles/${bidArticle.id}`);
  assert.equal((await editArticle(bidArticle.id, articleForm({ ...bidEditFields, closesAt: expiredDetail.closesAt, description: 'Descripción después del cierre' }, 0))).status, 200, 'Can correct a closed article without reopening it');
  assert.equal((await fetch(base + `/api/admin/articles/${bidArticle.id}`, { method: 'DELETE', headers: { cookie } })).status, 200);
  const deleted = await db.collection('articles').findOne({ _id: live._id }, { projection: { photos: 0 } });
  assert.equal(deleted, null, 'Deleting physically removes the article and embedded bids/photos');
  assert.equal((await fetch(base + `/api/public/articles/${bidArticle.id}`)).status, 404);
  assert.equal((await fetch(base + publicPhoto)).status, 404);
  await get(`/api/admin/articles/${bidArticle.id}`, 404);
  assert.equal((await get('/api/admin/articles?q=Subasta%20editada%20con%20pujas')).total, 0);
  assert.equal((await switchStar(bidArticle.id, true)).status, 404);
  assert.equal((await editArticle(bidArticle.id, articleForm(bidEditFields, 0))).status, 404);
  assert.equal((await fetch(base + `/api/admin/articles/${inactive.id}`, { method: 'DELETE', headers: { cookie } })).status, 200);
  assert.equal((await switchStar(createdArticle.id, true)).status, 200, 'Deleting releases a featured slot');
  assert.equal(await db.collection('articles').countDocuments({ star: true }), 5);
  await checkArticleLifecycle({ base, db, cookie, aliceCookie, bobCookie, alice, bob, sourceId: changedProfileArticle.id, starredId: createdArticle.id });
  await checkSales({ base, db, cookie, aliceCookie, bobCookie, alice, bob, makeup, bytes, articleForm });
  console.log('PASS: admin creation/editing/deletion; photo retention/replacement; five concurrent manual stars; public privacy; isolated profiles; whole-peso bids without profile approval; atomic ascending bids; retries; expiry; protected auction terms; fallback preserves bid history; article deletion is permanent; public pages.');
  if (process.env.CLEO_VISUAL_QA === '1') {
    console.log(`QA preview: ${base}`);
    await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  }
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : error.name);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null && server.signalCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
  if (created) { await client.db(database).dropDatabase(); console.log('Temporary test database removed.'); }
  await client.close();
}
