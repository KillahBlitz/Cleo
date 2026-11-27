import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';

// Called only by check-catalog against its disposable database.
export async function checkBidModeration({ base, db, cookie, aliceCookie, bobCookie, alice, bob, sourceId }) {
  const articles = db.collection('articles');
  const source = await articles.findOne({ _id: new ObjectId(sourceId) });
  const ids = [];
  const offer = (person, amountCents) => ({ id: new ObjectId(), requestId: randomUUID(), amountCents, createdAt: new Date(), bidder: { userId: new ObjectId(person.id), name: person.name, facebookUrl: person.facebookUrl } });
  async function fixture(bids, overrides = {}) {
    const top = bids.at(-1);
    const article = { ...source, _id: new ObjectId(), title: 'Moderación de prueba', initialPriceCents: 1000, bids, bidCount: bids.length, highestBidAmountCents: top?.amountCents ?? null, highestBidder: top?.bidder ?? null, revision: 0, declinedBidderIds: [], ...overrides };
    delete article.starSlot; article.star = false;
    ids.push(article._id); await articles.insertOne(article); return article;
  }
  const read = article => articles.findOne({ _id: article._id });
  const remove = (articleId, bidId, authCookie = cookie, origin = base) => fetch(`${base}/api/admin/articles/${articleId}/bids/${bidId}`, { method: 'DELETE', headers: { Origin: origin, ...(authCookie ? { cookie: authCookie } : {}) } });
  const get = async (path, authCookie = cookie) => {
    const response = await fetch(base + path, { headers: authCookie ? { cookie: authCookie } : {} });
    assert.equal(response.status, 200, path); return response.json();
  };
  const bid = (article, amountCents) => fetch(`${base}/api/public/articles/${article._id}/bids`, { method: 'POST', headers: { cookie: aliceCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountCents, requestId: randomUUID() }) });
  function consistent(article, expected) {
    assert.deepEqual(article.bids, expected, 'Only selected bids are physically removed; remaining snapshots and order survive');
    assert.equal(article.bidCount, expected.length);
    assert.equal(article.highestBidAmountCents, expected.at(-1)?.amountCents ?? null);
    assert.deepEqual(article.highestBidder, expected.at(-1)?.bidder ?? null);
  }
  let appointmentId;
  try {
    const troll = { id: String(new ObjectId()), name: 'Oferta abusiva', facebookUrl: 'https://www.facebook.com/test.moderation' };
    const bids = [offer(alice, 1000), offer(bob, 1200), offer(alice, 1300), offer(troll, 9_999_999_900)];
    const article = await fixture(bids);
    assert.equal((await remove(article._id, bids[3].id, null)).status, 401);
    assert.equal((await remove(article._id, bids[3].id, bobCookie)).status, 401, 'Bidder sessions cannot moderate');
    assert.equal((await remove(article._id, bids[3].id, cookie, 'https://invalid.example')).status, 403);
    assert.equal((await remove(article._id, 'invalid')).status, 400);
    assert.equal((await remove('invalid', bids[3].id)).status, 400);
    assert.equal((await remove(new ObjectId(), bids[3].id)).status, 404);
    const sale = await fixture(bids, { mode: 'sale' });
    assert.equal((await remove(sale._id, bids[3].id)).status, 404);
    consistent(await read(sale), bids);
    const unrelated = await fixture([offer(bob, 1000)]);
    assert.deepEqual(await (await remove(article._id, unrelated.bids[0].id)).json(), { ok: true, removed: false });
    assert.deepEqual(await read(article), article, 'Rejected and foreign IDs leave article untouched');

    const adminHtml = await fetch(`${base}/panel/articulos/${article._id}`, { headers: { cookie } }).then(r => r.text());
    assert.ok(adminHtml.includes('Eliminar puja') && adminHtml.includes('Historial completo'));
    const publicHtml = await fetch(`${base}/articulos/${article._id}`).then(r => r.text());
    assert.ok(!publicHtml.includes('Eliminar puja'), 'Moderation controls are admin-only');
    const duplicate = await Promise.all([remove(article._id, bids[3].id), remove(article._id, bids[3].id)]);
    assert.ok(duplicate.every(r => r.status === 200));
    assert.deepEqual((await Promise.all(duplicate.map(r => r.json()))).map(r => r.removed).sort(), [false, true]);
    let saved = await read(article);
    consistent(saved, bids.slice(0, 3)); assert.equal(saved.revision, 1);
    for (const field of ['title', 'initialPriceCents', 'photos', 'status', 'active', 'star', 'closesAt']) assert.deepEqual(saved[field], article[field]);
    const serialized = JSON.stringify(saved);
    for (const value of [String(bids[3].id), bids[3].requestId, troll.name, troll.facebookUrl]) assert.ok(!serialized.includes(value), 'No tombstone or copy of the removed bid');
    const publicDetail = await get(`/api/public/articles/${article._id}`, null);
    assert.equal(publicDetail.article.highestBidAmountCents, 1300); assert.equal(publicDetail.article.bidCount, 3);
    const publicHistory = await get(`/api/public/articles/${article._id}/bids`, null);
    assert.deepEqual(publicHistory.bids.map(b => b.amountCents), [1000, 1200, 1300]);
    assert.ok(!JSON.stringify(publicHistory).includes('facebook') && !JSON.stringify(publicHistory).includes('userId'));
    let activity = (await get('/api/public/activity', aliceCookie)).items.find(item => item.id === String(article._id));
    assert.equal(activity.status, 'leading'); assert.equal(activity.highestBidAmountCents, 1300);

    assert.equal((await bid(article, 1400)).status, 201, 'A normal offer can follow the remaining highest offer after moderation');
    saved = await read(article);
    assert.equal((await remove(article._id, saved.bids.at(-1).id)).status, 200);
    const ranked = await get(`/api/admin/articles/${article._id}/bids`);
    assert.equal(ranked.ranking[0].bidId, String(bids[2].id), 'Deleting a person’s best offer reveals their previous one');
    assert.equal((await remove(article._id, bids[2].id)).status, 200);
    consistent(await read(article), bids.slice(0, 2));
    assert.equal((await remove(article._id, bids[0].id)).status, 200);
    consistent(await read(article), [bids[1]]);
    assert.ok(!(await get('/api/public/activity', aliceCookie)).items.some(item => item.id === String(article._id)), 'No participation remains after all personal offers are removed');
    activity = (await get('/api/public/activity', bobCookie)).items.find(item => item.id === String(article._id));
    assert.equal(activity.status, 'leading');
    assert.equal((await remove(article._id, bids[1].id)).status, 200);
    consistent(await read(article), []);
    assert.equal((await get(`/api/public/articles/${article._id}`, null)).article.highestBidAmountCents, null);
    assert.equal((await bid(article, 100)).status, 201, 'After all offers are deleted, an auction accepts one peso, even below its starting price');
    saved = await read(article);
    assert.equal(saved.initialPriceCents, 1000); assert.equal(saved.highestBidAmountCents, 100);

    const race = await fixture(bids.slice(0, 2));
    const [deletion, addition] = await Promise.all([remove(race._id, bids[1].id), bid(race, 1300)]);
    assert.equal(deletion.status, 200); assert.equal(addition.status, 201);
    saved = await read(race);
    assert.deepEqual(saved.bids.map(b => b.amountCents), [1000, 1300]);
    consistent(saved, saved.bids); assert.equal(saved.revision, 2, 'Concurrent valid offers are preserved');
    const double = await fixture(bids.slice(0, 3));
    assert.ok((await Promise.all([remove(double._id, bids[1].id), remove(double._id, bids[2].id)])).every(r => r.status === 200));
    consistent(await read(double), [bids[0]]);

    const closed = await fixture(bids.slice(0, 3), { closesAt: new Date(Date.now() - 60_000), declinedBidderIds: [new ObjectId(alice.id), new ObjectId(bob.id)] });
    const meeting = { articleId: closed._id, recipientName: alice.name, facebookUrl: alice.facebookUrl, active: true };
    appointmentId = (await db.collection('appointments').insertOne(meeting)).insertedId;
    assert.equal((await remove(closed._id, bids[2].id)).status, 200);
    assert.deepEqual((await read(closed)).declinedBidderIds, closed.declinedBidderIds, 'Keep a declined person who still has another offer');
    assert.equal((await remove(closed._id, bids[0].id)).status, 200);
    assert.deepEqual((await read(closed)).declinedBidderIds, [new ObjectId(bob.id)], 'Remove discarded candidate references with no remaining offers');
    assert.deepEqual((await read(closed)).closesAt, closed.closesAt, 'Moderation never reopens an expired auction');
    assert.deepEqual(await db.collection('appointments').findOne({ _id: appointmentId }), { ...meeting, _id: appointmentId }, 'An already agreed delivery stays unchanged');
    for (const overrides of [{ active: false }, { status: 'sold', soldAt: new Date(), soldBy: new ObjectId() }]) {
      const hidden = await fixture([bids[0]], overrides);
      assert.equal((await remove(hidden._id, bids[0].id)).status, 200);
      saved = await read(hidden); consistent(saved, []);
      for (const [key, value] of Object.entries(overrides)) assert.deepEqual(saved[key], value);
      assert.equal((await fetch(`${base}/api/public/articles/${hidden._id}`)).status, 404);
    }
    const fallback = await fixture([bids[0], bids[1]], { closesAt: new Date(Date.now() - 60_000) });
    const [removed, next] = await Promise.all([
      remove(fallback._id, bids[1].id),
      fetch(`${base}/api/admin/articles/${fallback._id}/next-bidder`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: bob.id }) }),
    ]);
    assert.equal(removed.status, 200); assert.ok([200, 409].includes(next.status));
    saved = await read(fallback); consistent(saved, [bids[0]]);
    assert.deepEqual(saved.declinedBidderIds, [], 'Concurrent fallback cannot leave a removed candidate selected');
    console.log('PASS: admin-only physical bid deletion; recalculated maximum/contact/count; retry and concurrent-write safety; normal bidding resumes; public and personal history; preserved closed/sold states and agreed appointments.');
  } finally {
    await articles.deleteMany({ _id: { $in: ids } });
    if (appointmentId) await db.collection('appointments').deleteOne({ _id: appointmentId });
  }
}
