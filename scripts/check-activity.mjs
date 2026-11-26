import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';

export async function checkActivity({ base, db, aliceCookie, bobCookie, alice, bob, articleId }) {
  const source = await db.collection('articles').findOne({ _id: new ObjectId(articleId) });
  const expired = new Date(Date.now() - 1000), future = new Date(Date.now() + 3600_000);
  const fixture = (overrides = {}) => ({ ...source, _id: new ObjectId(), star: false, title: 'Activity fixture', closesAt: expired, declinedBidderIds: [], ...overrides });
  const closed = fixture(), second = fixture({ declinedBidderIds: [new ObjectId(bob.id)] }), declined = fixture({ declinedBidderIds: [new ObjectId(alice.id)] });
  const inactive = fixture({ active: false }), deleted = fixture({ active: false, deletedAt: new Date() }), sold = fixture({ status: 'sold', declinedBidderIds: [new ObjectId(bob.id)] });
  const otherOnly = fixture({ closesAt: future, bids: source.bids.filter(bid => String(bid.bidder.userId) === bob.id) });
  const sale = fixture({ mode: 'sale', units: 1, closesAt: null, bids: [], highestBidAmountCents: null, highestBidder: null, title: 'Venta guardada' });
  const extraSaved = Array.from({ length: 13 }, () => fixture({ bids: [], closesAt: future, highestBidAmountCents: null, highestBidder: null }));
  const fixtures = [closed, second, declined, inactive, deleted, sold, otherOnly, sale, ...extraSaved];
  await db.collection('articles').insertMany(fixtures);
  const request = async (cookie, tab = 'bids', query = '') => {
    const r = await fetch(`${base}/api/public/activity?tab=${tab}${query}`, { headers: { cookie } });
    assert.equal(r.status, 200, `Activity response: ${await r.clone().text()}`); return r.json();
  };
  const favorite = (cookie, id, saved = true, extras = {}, origin) => fetch(`${base}/api/public/favorites/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify({ saved, ...extras }) });
  const favorites = cookie => fetch(`${base}/api/public/favorites`, { headers: cookie ? { cookie } : {} }).then(r => r.json());
  try {
    assert.equal((await fetch(`${base}/api/public/activity`)).status, 401);
    assert.deepEqual(await favorites(), { signedIn: false, ids: [] });
    assert.equal((await favorite(undefined, articleId)).status, 401);
    assert.equal((await favorite(aliceCookie, articleId, true, {}, 'https://other.example')).status, 403);
    assert.equal((await favorite(aliceCookie, articleId, true, { userId: bob.id })).status, 400);
    assert.equal((await favorite(aliceCookie, inactive._id)).status, 404);
    assert.equal((await favorite(aliceCookie, deleted._id)).status, 404);
    const parallel = await Promise.all([favorite(aliceCookie, articleId), favorite(aliceCookie, articleId), favorite(aliceCookie, articleId)]);
    assert.ok(parallel.every(response => response.status === 200));
    assert.equal(await db.collection('favorites').countDocuments({ userId: new ObjectId(alice.id), articleId: new ObjectId(articleId) }), 1);
    assert.deepEqual((await favorites(aliceCookie)).ids, [articleId]); assert.deepEqual((await favorites(bobCookie)).ids, []);
    assert.equal((await favorite(bobCookie, articleId)).status, 200);
    assert.equal((await favorite(aliceCookie, articleId, false)).status, 200);
    assert.deepEqual((await favorites(bobCookie)).ids, [articleId], 'Removing a saved item affects only its owner');
    assert.equal((await favorite(aliceCookie, sale._id)).status, 200);
    const savedSales = await request(aliceCookie, 'saved'); assert.equal(savedSales.items[0].mode, 'sale'); assert.equal(savedSales.items[0].status, 'available');
    await db.collection('favorites').insertMany(extraSaved.map(article => ({ userId: new ObjectId(alice.id), articleId: article._id, createdAt: new Date() })));
    const firstPage = await request(aliceCookie, 'saved'), secondPage = await request(aliceCookie, 'saved', '&page=2');
    assert.equal(firstPage.total, 14); assert.equal(firstPage.counts.saved, 14); assert.equal(firstPage.items.length, 12); assert.equal(secondPage.items.length, 2);
    assert.equal(new Set([...firstPage.items, ...secondPage.items].map(item => item.id)).size, 14);
    const aliceData = await request(aliceCookie), bobData = await request(bobCookie);
    const row = (data, id) => data.items.find(item => item.id === String(id));
    assert.equal(aliceData.counts.active, 1); assert.equal(bobData.counts.active, 2);
    assert.equal(row(aliceData, articleId).status, 'outbid'); assert.equal(row(bobData, articleId).status, 'leading');
    assert.equal(row(aliceData, articleId).myBidAmountCents, Math.max(...source.bids.filter(bid => String(bid.bidder.userId) === alice.id).map(bid => bid.amountCents)));
    assert.equal(row(bobData, closed._id).status, 'highest'); assert.equal(row(aliceData, closed._id).status, 'waiting');
    assert.equal(row(aliceData, second._id).status, 'opportunity'); assert.equal(row(bobData, second._id).status, 'declined');
    assert.equal(row(aliceData, declined._id).status, 'declined'); assert.equal(row(aliceData, sold._id).status, 'sold');
    assert.equal(row(aliceData, inactive._id).status, 'unavailable'); assert.equal(row(aliceData, inactive._id).photoUrl, null); assert.equal(row(aliceData, deleted._id), undefined);
    assert.equal(row(aliceData, otherOnly._id), undefined);
    assert.equal(row(await request(aliceCookie, 'bids', `&userId=${bob.id}`), otherOnly._id), undefined, 'A query cannot switch the authenticated person');
    for (const privateKey of ['facebook', 'userId', 'bidderId', 'highestBidder', 'declinedBidderIds', 'createdBy']) assert.ok(!JSON.stringify(aliceData).includes(privateKey));
    const opportunities = await request(aliceCookie, 'opportunities'); assert.equal(opportunities.total, 1); assert.equal(opportunities.items[0].id, String(second._id));
    await db.collection('articles').updateOne({ _id: second._id }, { $addToSet: { declinedBidderIds: new ObjectId(alice.id) } });
    assert.equal((await request(aliceCookie, 'opportunities')).counts.opportunities, 0, 'Declining a person removes their opportunity');
    await db.collection('articles').updateOne({ _id: otherOnly._id }, { $set: { closesAt: expired } });
    const ended = await request(bobCookie); assert.equal(ended.counts.active, 1); assert.equal(row(ended, otherOnly._id).status, 'highest', 'Closed auctions never remain labelled as leading');
    for (const query of ['tab=bad', 'tab=bids&page=-1', 'tab=bids&page=abc']) assert.equal((await fetch(`${base}/api/public/activity?${query}`, { headers: { cookie: aliceCookie } })).status, 400);
    for (const cookie of [undefined, aliceCookie]) {
      const response = await fetch(`${base}/mi-actividad`, { headers: cookie ? { cookie } : {} }); assert.equal(response.status, 200);
      assert.ok(response.headers.get('cache-control')?.includes('no-store'), 'Personal activity cannot be cached publicly');
      const html = await response.text(); assert.ok(html.includes('Mi actividad')); assert.ok(!html.includes('href="/login"'));
      if (cookie) { assert.ok(html.includes('Mis pujas')); assert.ok(html.includes('Superaron tu oferta')); } else assert.ok(html.includes('Crear mi perfil'));
    }
    console.log('PASS: private activity, active/closed/outbid states, next-person opportunities, persistent favorites, owner isolation, duplicate protection, pagination and SSR.');
  } finally {
    await db.collection('favorites').deleteMany({ articleId: { $in: [...fixtures.map(item => item._id), source._id] }, userId: { $in: [new ObjectId(alice.id), new ObjectId(bob.id)] } });
    await db.collection('articles').deleteMany({ _id: { $in: fixtures.map(item => item._id) } });
  }
}
