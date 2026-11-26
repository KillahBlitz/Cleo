import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';

export async function checkSales({ base, db, cookie, aliceCookie, bobCookie, alice, bob, makeup, articleForm }) {
  const ids = [];
  const call = (path, method = 'GET', body, auth = cookie, origin) => fetch(base + path, { method, headers: { ...(auth ? { cookie: auth } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  async function json(path, auth = cookie) { const r = await call(path, 'GET', undefined, auth); assert.equal(r.status, 200, path); return r.json(); }
  function form(overrides = {}, count = 1) { const data = articleForm({ mode: 'sale', typeId: String(makeup), title: 'Labial individual', initialPrice: '12.50', units: '5', saleType: 'item', ...overrides }, count); data.delete('closesAt'); return data; }
  async function create(overrides = {}, count = 1, expected = 201) {
    const response = await call('/api/admin/articles', 'POST', form(overrides, count)); assert.equal(response.status, expected, `Sale create: ${await response.clone().text()}`);
    const result = await response.json(); if (response.status === 201) ids.push(new ObjectId(result.id)); return result;
  }
  const purchase = (id, auth, quantity, unitPriceCents, requestId = randomUUID(), extra = {}) => call(`/api/public/articles/${id}/purchases`, 'POST', { quantity, unitPriceCents, requestId, ...extra }, auth);
  const change = (id, purchaseId, status, auth = cookie, origin) => call(`/api/admin/purchases/${id}/${purchaseId}`, 'PATCH', { status }, auth, origin);
  const current = id => db.collection('articles').findOne({ _id: new ObjectId(id) });
  function editForm(detail, changes = {}) { return form({ title: detail.title, initialPrice: String(detail.initialPriceCents / 100), units: String(detail.units), saleType: detail.saleType, discountPrice: detail.discountPriceCents == null ? '' : String(detail.discountPriceCents / 100), keepPhotoIds: JSON.stringify(detail.photos.map(p => p.id)), revision: String(detail.revision), star: String(detail.star), ...changes }, 0); }
  try {
    assert.equal((await call('/api/admin/purchases', 'GET', undefined, null)).status, 401);
    assert.equal((await call('/api/public/purchases', 'GET', undefined, null)).status, 401);
    const item = await create({}, 5), pack = await create({ title: 'Paquete de labiales', saleType: 'package', initialPrice: '200', discountPrice: '150', units: '3', star: 'true' });
    const originalDetail = await json(`/api/admin/articles/${pack.id}`);
    assert.equal(originalDetail.closesAt, null); assert.equal(originalDetail.discountPriceCents, 15000);
    assert.equal((await json(`/api/admin/articles/${item.id}`)).photos.length, 5);
    for (const overrides of [{ saleType: 'bad' }, { units: '-1' }, { units: '1.5' }, { units: '1000001' }, { saleType: 'package', discountPrice: '12.50' }, { saleType: 'package', discountPrice: '0' }, { saleType: 'package' }, { purchases: '[]' }]) await create(overrides, 1, 400);
    await create({}, 6, 400); await create({}, 0, 400); await create({ star: 'true' }, 1, 409);
    const catalog = await json(`/api/public/catalog?mode=sale&typeId=${makeup}`, null);
    assert.ok(catalog.items.some(p => p.id === pack.id)); assert.ok(catalog.featured.some(p => p.id === pack.id));
    const detail = (await json(`/api/public/articles/${pack.id}`, null)).article;
    assert.equal(detail.saleType, 'package'); assert.equal(detail.canBuy, true); assert.equal(detail.units, 3); assert.equal(detail.closesAt, null);
    assert.equal((await purchase(pack.id, null, 1, 15000)).status, 401);
    assert.equal((await call(`/api/public/articles/${pack.id}/purchases`, 'POST', { quantity: 1, unitPriceCents: 15000, requestId: randomUUID() }, aliceCookie, 'https://other.example')).status, 403);
    for (const quantity of [0, -1, 1.2, '1']) assert.equal((await purchase(pack.id, aliceCookie, quantity, 15000)).status, 400);
    assert.equal((await purchase(pack.id, aliceCookie, 1, 15000, randomUUID(), { userId: bob.id })).status, 400);
    assert.equal((await purchase(pack.id, aliceCookie, 1, 100)).status, 409, 'Client cannot set its own price');
    const attempt = randomUUID();
    const duplicate = await Promise.all([purchase(pack.id, aliceCookie, 2, 15000, attempt), purchase(pack.id, aliceCookie, 2, 15000, attempt)]);
    assert.deepEqual(duplicate.map(r => r.status).sort(), [200, 201]);
    const aliceOrder = (await duplicate[0].json()).purchase;
    assert.equal(aliceOrder.totalCents, 30000); assert.equal(aliceOrder.status, 'pending'); assert.equal(aliceOrder.buyer, undefined);
    let record = await current(pack.id); assert.equal(record.units, 1); assert.equal(record.purchases.length, 1);
    assert.equal(record.purchases[0].buyer.name, 'Alice updated'); assert.ok(record.purchases[0].buyer.facebookUrl.endsWith('alice.changed'));
    assert.equal((await purchase(pack.id, aliceCookie, 1, 15000, attempt)).status, 409);
    assert.equal((await purchase(pack.id, bobCookie, 2, 15000)).status, 409);
    const bobResponse = await purchase(pack.id, bobCookie, 1, 15000); assert.equal(bobResponse.status, 201); const bobOrder = (await bobResponse.json()).purchase;
    assert.equal((await current(pack.id)).units, 0);
    assert.ok(!(await json('/api/public/catalog?mode=sale', null)).items.some(p => p.id === pack.id), 'Reserved units leave the available catalog');
    assert.equal((await call(`/api/admin/articles/${pack.id}/sold`, 'PATCH')).status, 409, 'Pending orders cannot be bypassed by manual sale');
    assert.equal((await call(`/api/admin/articles/${pack.id}`, 'PATCH', editForm(originalDetail))).status, 409, 'A stale editor cannot overwrite reservations');
    assert.equal((await change(pack.id, aliceOrder.id, 'cancelled', null)).status, 401);
    assert.equal((await change(pack.id, aliceOrder.id, 'cancelled', aliceCookie)).status, 401);
    assert.equal((await change(pack.id, aliceOrder.id, 'cancelled', cookie, 'https://other.example')).status, 403);
    assert.equal((await change(pack.id, aliceOrder.id, 'invalid')).status, 400);
    assert.equal((await change(pack.id, aliceOrder.id, 'pending')).status, 200); assert.equal((await current(pack.id)).units, 0);
    const cancellations = await Promise.all([change(pack.id, aliceOrder.id, 'cancelled'), change(pack.id, aliceOrder.id, 'cancelled')]); assert.ok(cancellations.every(r => r.status === 200));
    assert.equal((await current(pack.id)).units, 2, 'Cancellation returns stock only once');
    assert.equal((await change(pack.id, bobOrder.id, 'completed')).status, 200); assert.equal((await current(pack.id)).units, 2, 'Completion does not deduct twice');
    assert.equal((await change(pack.id, bobOrder.id, 'cancelled')).status, 409); assert.equal((await change(pack.id, aliceOrder.id, 'pending')).status, 409, 'Closed orders cannot be reopened');
    const aliceHistory = await json('/api/public/purchases', aliceCookie), bobHistory = await json('/api/public/purchases', bobCookie);
    assert.equal(aliceHistory.items.length, 1); assert.equal(bobHistory.items.length, 1); assert.equal(aliceHistory.items[0].id, aliceOrder.id);
    assert.equal((await json(`/api/public/purchases?userId=${bob.id}`, aliceCookie)).items[0].id, aliceOrder.id);
    for (const key of ['facebook', 'buyer', 'requestId', 'userId']) assert.ok(!JSON.stringify(aliceHistory).includes(key));
    const adminHistory = await json(`/api/admin/purchases?articleId=${pack.id}`); assert.equal(adminHistory.total, 2); assert.ok(adminHistory.items.every(p => p.buyer.facebookUrl));
    const freshDetail = await json(`/api/admin/articles/${pack.id}`);
    assert.equal((await call(`/api/admin/articles/${pack.id}`, 'PATCH', editForm(freshDetail, { saleType: 'item' }))).status, 409);
    const edited = await call(`/api/admin/articles/${pack.id}`, 'PATCH', editForm(freshDetail, { units: '4', discountPrice: '140', description: 'Paquete actualizado' })); assert.equal(edited.status, 200, await edited.clone().text());
    record = await current(pack.id); assert.equal(record.units, 4); assert.equal(record.purchases[0].unitPriceCents, 15000, 'Editing preserves agreed prices');
    const finalAttempt = randomUUID(), finalResponse = await purchase(pack.id, aliceCookie, 4, 14000, finalAttempt); assert.equal(finalResponse.status, 201); const finalOrder = (await finalResponse.json()).purchase;
    assert.equal((await change(pack.id, finalOrder.id, 'completed')).status, 200);
    record = await current(pack.id); assert.equal(record.status, 'sold'); assert.equal(record.units, 0); assert.equal(record.star, false); assert.equal(record.starSlot, undefined);
    assert.equal((await purchase(pack.id, aliceCookie, 4, 14000, finalAttempt)).status, 200, 'Retry after completion returns the same purchase');
    assert.equal((await purchase(pack.id, aliceCookie, 1, 14000)).status, 409);
    assert.equal((await json('/api/public/purchases', aliceCookie)).items[0].viewable, false);
    for (const suffix of ['', '/bids', `/photos/${record.photos[0].id}`]) assert.equal((await call(`/api/public/articles/${pack.id}${suffix}`, 'GET', undefined, aliceCookie)).status, 404);
    const privatePhoto = `/api/public/activity/articles/${pack.id}/photos/${record.photos[0].id}`;
    assert.equal((await call(privatePhoto, 'GET', undefined, aliceCookie)).status, 200);
    const strangerResponse = await call('/api/public/profile', 'PUT', { name: 'Unrelated buyer', facebookUrl: 'https://www.facebook.com/cleo.test.stranger' }, null); assert.equal(strangerResponse.status, 200); const strangerCookie = strangerResponse.headers.getSetCookie().at(-1).split(';')[0];
    assert.equal((await call(privatePhoto, 'GET', undefined, strangerCookie)).status, 404);
    for (const [path, auth, label] of [['/panel/ventas', cookie, 'Compras'], ['/mi-actividad?vista=compras', aliceCookie, 'Paquete de labiales'], ['/panel/articulos/nuevo?modalidad=sale', cookie, 'Precio fijo (MXN)'], [`/articulos/${item.id}`, aliceCookie, 'Comprar']]) {
      const response = await call(path, 'GET', undefined, auth); assert.equal(response.status, 200); assert.ok((await response.text()).includes(label), path);
    }
    const itemDetail = await json(`/api/admin/articles/${item.id}`); assert.equal((await call(`/api/admin/articles/${item.id}`, 'PATCH', editForm(itemDetail, { units: '1' }))).status, 200);
    const racers = await Promise.all([purchase(item.id, aliceCookie, 1, 1250), purchase(item.id, bobCookie, 1, 1250)]); assert.deepEqual(racers.map(r => r.status).sort(), [201, 409], 'Only one buyer reserves the last unit');
    const winner = (await racers.find(r => r.status === 201).json()).purchase;
    const closures = await Promise.all([change(item.id, winner.id, 'cancelled'), change(item.id, winner.id, 'completed')]); assert.deepEqual(closures.map(r => r.status).sort(), [200, 409]);
    record = await current(item.id); assert.equal(record.units, record.purchases[0].status === 'cancelled' ? 1 : 0);
    const removable = await create({ units: '2' }); const beforeDelete = await purchase(removable.id, aliceCookie, 1, 1250); assert.equal(beforeDelete.status, 201);
    assert.equal((await call(`/api/admin/articles/${removable.id}`, 'DELETE')).status, 200); assert.equal(await current(removable.id), null);
    assert.ok(!(await json('/api/public/purchases', aliceCookie)).items.some(p => p.articleId === removable.id));
    assert.equal((await json(`/api/admin/purchases?articleId=${removable.id}`)).total, 0);
    console.log('PASS: individual/package sales, discount and photo validation; atomic stock reservations; purchase retries; private history and Facebook contact; stale inventory edits; cancellation/completion races; sold visibility; physical deletion; sales SSR.');
  } finally { await db.collection('articles').deleteMany({ _id: { $in: ids } }); }
}
