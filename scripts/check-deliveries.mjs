import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';

// Invoked by check-catalog against its disposable database and HTTP server.
export async function checkDeliveries({ base, cookie, db, articleId }) {
  const date = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  const monthAfter = new Date(`${month}-01T12:00:00Z`); monthAfter.setUTCMonth(monthAfter.getUTCMonth() + 1);
  const movedDate = monthAfter.toISOString().slice(0, 10);
  const fields = { date, time: '10:00', recipientName: 'Persona de prueba', location: 'Lugar privado de prueba', notes: 'Nota privada', articleId: null };
  const write = (path, method, body, authorized = true, origin) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(authorized ? { cookie } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  const create = (overrides = {}) => write('/api/admin/appointments', 'POST', { ...fields, ...overrides });
  const patch = (appointment, overrides = {}) => write(`/api/admin/appointments/${appointment.id}`, 'PATCH', { ...fields, revision: appointment.revision, ...overrides });
  const remove = appointment => write(`/api/admin/appointments/${appointment.id}`, 'DELETE', { revision: appointment.revision });
  const publicMonth = async (value = month) => { const r = await fetch(`${base}/api/public/deliveries?month=${value}`); assert.equal(r.status, 200); return r.json(); };
  const adminMonth = async (value = month) => { const r = await fetch(`${base}/api/admin/appointments?month=${value}`, { headers: { cookie } }); assert.equal(r.status, 200); return r.json(); };
  assert.equal((await fetch(`${base}/api/admin/appointments?month=${month}`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/appointments/articles`)).status, 401);
  for (const [path, method] of [['/api/admin/appointments', 'POST'], [`/api/admin/appointments/${new ObjectId()}`, 'PATCH'], [`/api/admin/appointments/${new ObjectId()}`, 'DELETE']]) assert.equal((await write(path, method, fields, false)).status, 401);
  assert.equal((await write('/api/admin/appointments', 'POST', fields, true, 'https://another.example')).status, 403);
  for (const invalid of ['', '2026-13', '2026-1', 'not-a-month', '2026-02-01']) assert.equal((await fetch(`${base}/api/public/deliveries?month=${invalid}`)).status, 400);
  for (const invalid of [{ time: '09:30' }, { time: '18:00' }, { time: '12:15' }, { time: '10:0' }, { date: '2026-02-30' }, { date: '2000-01-01' }, { recipientName: '' }, { location: '' }, { location: 'x'.repeat(301) }, { endsAt: new Date().toISOString() }]) assert.equal((await create(invalid)).status, 400, `Invalid delivery input: ${JSON.stringify(invalid)}`);
  const contenders = await Promise.all([create(), create({ recipientName: 'Otra persona' })]);
  assert.equal(contenders.filter(r => r.status === 201).length, 1, 'A slot has exactly one winner under concurrent creation');
  assert.equal(contenders.filter(r => r.status === 409).length, 1);
  let appointment = await contenders.find(r => r.status === 201).json();
  assert.equal(appointment.startsAt, `${date}T16:00:00.000Z`, '10:00 CDMX is stored as UTC');
  assert.equal(appointment.endsAt, `${date}T16:30:00.000Z`);
  const publicData = await publicMonth();
  assert.deepEqual(Object.keys(publicData).sort(), ['busy', 'month', 'now', 'timeZone']);
  assert.deepEqual(publicData.busy, [{ date, time: '10:00' }]);
  for (const privateValue of ['Persona', 'Otra persona', 'Lugar privado', 'Nota privada', 'recipientName', 'location', 'facebookUrl', 'articleId', appointment.id]) assert.ok(!JSON.stringify(publicData).includes(privateValue), 'Public calendar exposes only times');
  assert.equal((await adminMonth()).appointments[0].location, fields.location);
  const boundary = await create({ time: '17:30' }); assert.equal(boundary.status, 201);
  const last = await boundary.json();
  assert.equal(new Date(last.endsAt) - new Date(last.startsAt), 30 * 60_000);
  assert.equal(last.startsAt, `${date}T23:30:00.000Z`);
  assert.equal((await patch(appointment, { time: '17:30' })).status, 409, 'Editing cannot overlap another appointment');
  assert.ok((await publicMonth()).busy.some(slot => slot.time === '10:00'), 'Failed edits preserve the previous reservation');
  const editedResponse = await patch(appointment, { location: 'Lugar corregido' }); assert.equal(editedResponse.status, 200);
  const edited = await editedResponse.json(); assert.equal(edited.revision, 1); assert.equal(edited.location, 'Lugar corregido');
  assert.equal((await patch(appointment)).status, 409, 'Stale edits cannot overwrite a new version');
  assert.equal((await remove(appointment)).status, 409, 'Stale deletion cannot cancel an edited appointment');
  const movedResponse = await patch(edited, { date: movedDate, time: '11:30' }); assert.equal(movedResponse.status, 200);
  appointment = await movedResponse.json();
  assert.ok(!(await publicMonth()).busy.some(slot => slot.time === '10:00'), 'Rescheduling releases the former slot');
  assert.deepEqual((await publicMonth(movedDate.slice(0, 7))).busy, [{ date: movedDate, time: '11:30' }]);
  const beforeArticle = await db.collection('articles').findOne({ _id: new ObjectId(articleId) }, { projection: { bids: 1, highestBidder: 1 } });
  const articleOptions = await fetch(`${base}/api/admin/appointments/articles`, { headers: { cookie } }).then(r => r.json());
  const option = articleOptions.articles.find(item => item.id === articleId); assert.ok(option);
  const linkedResponse = await create({ time: '12:00', articleId }); assert.equal(linkedResponse.status, 201);
  const linked = await linkedResponse.json();
  assert.equal(linked.recipientName, option.recipientName); assert.equal(linked.facebookUrl, option.facebookUrl);
  assert.equal((await create({ time: '12:30', articleId })).status, 409, 'One active appointment per article');
  assert.equal((await create({ time: '12:30', articleId: String(new ObjectId()) })).status, 400);
  const afterArticle = await db.collection('articles').findOne({ _id: new ObjectId(articleId) }, { projection: { bids: 1, highestBidder: 1 } });
  assert.deepEqual(afterArticle, beforeArticle, 'Scheduling does not change bid history or highest bidder');
  assert.equal((await remove(linked)).status, 200);
  assert.equal((await remove(appointment)).status, 200);
  assert.equal((await remove(last)).status, 200);
  assert.equal((await remove(appointment)).status, 409);
  assert.deepEqual((await publicMonth()).busy, []); assert.deepEqual((await publicMonth(movedDate.slice(0, 7))).busy, []);
  const stored = await db.collection('appointments').findOne({ _id: new ObjectId(linked.id) });
  assert.equal(stored.active, false); assert.ok(stored.deletedAt instanceof Date); assert.equal(stored.facebookUrl, option.facebookUrl);
  const recreated = await create({ time: '12:00', articleId }); assert.equal(recreated.status, 201, 'Deleting releases both the article and time slot');
  await remove(await recreated.json());
  for (const [path, authorized] of [['/entregas', false], ['/panel/entregas', true]]) {
    const response = await fetch(base + path, { headers: authorized ? { cookie } : {} }); assert.equal(response.status, 200, path);
    const html = await response.text(); assert.ok(html.includes('10:00–18:00')); assert.ok(html.includes('17:30')); assert.ok(!html.includes('No se pudo cargar el calendario'));
    if (authorized) assert.ok(html.includes('Nueva cita')); else { assert.ok(!html.includes('Nueva cita')); assert.ok(!html.includes('href="/login"')); }
  }
  console.log('PASS: delivery authorization, CDMX time/30-minute boundaries, concurrent slot exclusion, private/public separation, editing, version conflicts, rescheduling, article linking, deletion and slot reuse.');
}
