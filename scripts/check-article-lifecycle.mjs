import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';

export async function checkArticleLifecycle({ base, db, cookie, aliceCookie, bobCookie, alice, bob, sourceId, starredId }) {
  const source = await db.collection('articles').findOne({ _id: new ObjectId(sourceId) });
  const article = { ...source, _id: new ObjectId(), title: 'Lifecycle auction', active: true, status: 'available', star: false, closesAt: new Date(Date.now() + 86400_000) };
  const sale = { ...article, _id: new ObjectId(), title: 'Lifecycle sale', mode: 'sale', typeId: (await db.collection('types').findOne({ mode: 'sale' }))._id, bids: [], bidCount: 0, highestBidder: null, highestBidAmountCents: null, initialPriceCents: 1250 };
  const oldDeleted = { ...article, _id: new ObjectId(), deletedAt: new Date(), active: false };
  await db.collection('articles').insertMany([article, sale, oldDeleted]);
  const markSold = (id, authCookie = cookie, origin) => fetch(`${base}/api/admin/articles/${id}/sold`, { method: 'PATCH', headers: { ...(authCookie ? { cookie: authCookie } : {}), ...(origin ? { Origin: origin } : {}) } });
  const remove = (id, authCookie = cookie, origin) => fetch(`${base}/api/admin/articles/${id}`, { method: 'DELETE', headers: { ...(authCookie ? { cookie: authCookie } : {}), ...(origin ? { Origin: origin } : {}) } });
  const bid = amountCents => fetch(`${base}/api/public/articles/${article._id}/bids`, { method: 'POST', headers: { cookie: bobCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountCents, requestId: randomUUID() }) });
  const get = (path, authCookie = cookie) => fetch(`${base}${path}`, { headers: authCookie ? { cookie: authCookie } : {} }).then(r => r.json());
  let appointmentId;
  try {
    assert.equal((await markSold(article._id, null)).status, 401);
    assert.equal((await remove(article._id, null)).status, 401);
    assert.equal((await markSold(article._id, cookie, 'https://invalid.example')).status, 403);
    assert.equal((await remove(article._id, cookie, 'https://invalid.example')).status, 403);
    assert.equal((await markSold(new ObjectId())).status, 404);
    for (const [userId, userCookie] of [[alice.id, aliceCookie], [bob.id, bobCookie]]) {
      const response = await fetch(`${base}/api/public/favorites/${article._id}`, { method: 'PUT', headers: { cookie: userCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ saved: true }) });
      assert.equal(response.status, 200); assert.ok(await db.collection('favorites').findOne({ userId: new ObjectId(userId), articleId: article._id }));
    }
    const countBefore = (await get('/api/admin/overview?mode=auction')).counts.sold;
    const [soldResponse, bidResponse] = await Promise.all([markSold(article._id), bid(1200)]);
    assert.equal(soldResponse.status, 200); assert.ok([201, 409].includes(bidResponse.status));
    const sold = await db.collection('articles').findOne({ _id: article._id });
    assert.equal(sold.status, 'sold'); assert.ok(sold.soldAt instanceof Date); assert.ok(sold.soldBy instanceof ObjectId);
    assert.deepEqual(sold.bids.slice(0, source.bids.length), source.bids, 'Marking sold preserves existing offers');
    assert.equal((await bid(1300)).status, 409, 'Sold articles never accept new bids');
    assert.equal((await markSold(article._id)).status, 200);
    assert.equal((await db.collection('articles').findOne({ _id: article._id })).soldAt.getTime(), sold.soldAt.getTime(), 'Repeated clicks preserve the original sold date');
    for (const suffix of ['', '/bids', `/photos/${article.photos[0].id}`]) assert.equal((await fetch(`${base}/api/public/articles/${article._id}${suffix}`)).status, 404, 'Sold articles are hidden from public detail, bids and photos');
    assert.ok(!(await get('/api/public/catalog', null)).items.some(item => item.id === String(article._id)));
    assert.ok(!(await get('/api/admin/auction-eligible')).items.some(item => item.id === String(article._id)));
    assert.ok(!(await get('/api/admin/articles?status=active')).items.some(item => item.id === String(article._id)));
    assert.ok((await get('/api/admin/articles?status=sold&mode=auction')).items.some(item => item.id === String(article._id)));
    assert.equal((await get('/api/admin/overview?mode=auction')).counts.sold, countBefore + 1);
    const personal = await get('/api/public/activity', aliceCookie);
    const personalItem = personal.items.find(item => item.id === String(article._id));
    assert.equal(personalItem.status, 'sold'); assert.equal(personalItem.viewable, false); assert.equal(personalItem.title, article.title);
    assert.equal((await fetch(base + personalItem.photoUrl, { headers: { cookie: aliceCookie } })).status, 200);
    assert.equal((await fetch(base + personalItem.photoUrl)).status, 401);
    assert.ok(!(await get('/api/public/activity?tab=opportunities', aliceCookie)).items.some(item => item.id === String(article._id)));
    const starResponse = await fetch(`${base}/api/admin/articles/${article._id}/star`, { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ star: true }) });
    assert.equal(starResponse.status, 409);
    const nextResponse = await fetch(`${base}/api/admin/articles/${article._id}/next-bidder`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: alice.id }) });
    assert.equal(nextResponse.status, 409);
    for (const [path, authCookie, label] of [[`/panel/articulos/${article._id}`, cookie, 'Vendido'], [`/articulos/${article._id}`, null, 'Este artículo no está disponible.']]) {
      const response = await fetch(`${base}${path}`, { headers: authCookie ? { cookie: authCookie } : {} }); assert.equal(response.status, 200);
      assert.ok((await response.text()).includes(label));
    }
    const date = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    const meeting = await fetch(`${base}/api/admin/appointments`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ date, time: '14:00', recipientName: 'Comprador', location: 'Punto acordado', notes: '', articleId: String(article._id) }) });
    assert.equal(meeting.status, 201, 'An early sale can be scheduled for delivery'); appointmentId = new ObjectId((await meeting.json()).id);
    await db.collection('auctions').insertOne({ articleId: article._id, title: article.title, status: 'closed' });
    assert.equal((await remove(article._id)).status, 200);
    assert.equal(await db.collection('articles').findOne({ _id: article._id }), null);
    assert.equal(await db.collection('favorites').countDocuments({ articleId: article._id }), 0);
    assert.equal(await db.collection('auctions').countDocuments({ articleId: article._id }), 0);
    const meetingAfter = await db.collection('appointments').findOne({ _id: appointmentId });
    assert.equal(meetingAfter.articleId, null); assert.equal(meetingAfter.articleTitle, ''); assert.equal(meetingAfter.active, true); assert.equal(meetingAfter.location, 'Punto acordado');
    for (const userCookie of [aliceCookie, bobCookie]) {
      assert.ok(!(await get('/api/public/favorites', userCookie)).ids.includes(String(article._id)));
      for (const tab of ['bids', 'saved', 'opportunities']) assert.ok(!(await get(`/api/public/activity?tab=${tab}`, userCookie)).items.some(item => item.id === String(article._id)));
    }
    assert.equal((await fetch(`${base}/api/public/articles/${article._id}`)).status, 404);
    assert.equal((await fetch(`${base}/api/public/articles/${article._id}/photos/${article.photos[0].id}`)).status, 404);
    assert.equal((await markSold(article._id)).status, 404);
    await db.collection('favorites').insertOne({ articleId: article._id, userId: new ObjectId(alice.id), createdAt: new Date() });
    assert.ok(!(await get('/api/public/favorites', aliceCookie)).ids.includes(String(article._id)), 'Readers hide stale references from concurrent or older deletions');
    assert.ok(!(await get('/api/public/activity?tab=saved', aliceCookie)).items.some(item => item.id === String(article._id)));
    assert.equal((await remove(article._id)).status, 200, 'A repeated deletion completes cleanup safely');
    assert.equal(await db.collection('favorites').countDocuments({ articleId: article._id }), 0);
    assert.equal((await remove(oldDeleted._id)).status, 200); assert.equal(await db.collection('articles').findOne({ _id: oldDeleted._id }), null);
    assert.equal((await markSold(sale._id)).status, 200); assert.equal((await db.collection('articles').findOne({ _id: sale._id })).initialPriceCents, 1250);
    const featuredBefore = await db.collection('articles').countDocuments({ star: true });
    assert.equal((await markSold(starredId)).status, 200);
    assert.equal(await db.collection('articles').countDocuments({ star: true }), featuredBefore - 1);
    assert.equal((await db.collection('articles').findOne({ _id: new ObjectId(starredId) })).starSlot, undefined);
    console.log('PASS: permanent article/photo/bid deletion; favorite/auction cleanup; no ghost activity; independent appointments; sold authorization, audit, idempotency, visibility, bid exclusion and featured-slot release.');
  } finally {
    await db.collection('articles').deleteMany({ _id: { $in: [article._id, sale._id, oldDeleted._id] } });
    await db.collection('favorites').deleteMany({ articleId: article._id });
    await db.collection('auctions').deleteMany({ articleId: article._id });
    if (appointmentId) await db.collection('appointments').deleteOne({ _id: appointmentId });
  }
}
