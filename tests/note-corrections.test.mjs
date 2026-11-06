import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise the real route handlers with a database double; never contact production.
const source = (await readFile(new URL('../app/api/note-corrections/route.js', import.meta.url), 'utf8'))
  .replace('import { createClient } from "@supabase/supabase-js";', 'const createClient = () => globalThis.correctionTestDb;');
const { GET, POST } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
const id = '00000000-0000-4000-8000-000000000001';
function db(results) {
  const calls = [];
  globalThis.correctionTestDb = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    from(table) {
      const chain = {};
      for (const method of ['select','eq','in','order','insert','update']) chain[method] = (...args) => { calls.push([table,method,...args]); return chain; };
      chain.maybeSingle = async () => results.shift() || { data: null };
      chain.then = (resolve, reject) => Promise.resolve(results.shift() || { data: null }).then(resolve, reject);
      return chain;
    },
  };
  return calls;
}
function request(body, auth = true) {
  return new Request('https://test.invalid/api/note-corrections', { method: 'POST', headers: { 'Content-Type':'application/json', ...(auth ? { authorization: 'Bearer test' } : {}) }, body: JSON.stringify(body) });
}
test('unauthenticated access is refused', async () => {
  assert.equal((await POST(request({}, false))).status, 401);
  assert.equal((await GET(new Request('https://test.invalid/api/note-corrections'))).status, 401);
});
test('a different CLE cannot request a correction', async () => {
  const calls = db([{ data: { id, participant_id: id } }, { data: null }]);
  assert.equal((await POST(request({ action:'request', noteId:id, reason:'Check text' }))).status, 403);
  assert.equal(calls.some(call => call[1] === 'insert'), false);
});
test('another worker cannot open or submit a correction', async () => {
  const calls = db([{ data: { id, worker_id:id, participant_id:id } }, { data:null }]);
  assert.equal((await POST(request({ action:'submit', id }))).status, 403);
  assert.equal(calls.some(call => call[1] === 'update'), false);
});
test('finished or canceled corrections cannot be submitted again', async () => {
  db([{ data:null }]);
  assert.equal((await POST(request({ action:'submit', id }))).status, 409);
});
test('signature and attestation are required', async () => {
  db([{ data:{ id,worker_id:id,participant_id:id } }, { data:{id} }, { data:{id} }, { data:{id} }]);
  assert.equal((await POST(request({ action:'submit', id, correctionText:'Corrected', reason:'Typo', signedName:'Worker' }))).status, 400);
});
test('submission is pending-only and never updates the original note', async () => {
  const calls = db([{ data:{id,worker_id:id,participant_id:id} }, {data:{id}}, {data:{id}}, {data:{id}}, {data:{id}}]);
  const response = await POST(request({ action:'submit', id, correctionText:'Corrected', reason:'Typo', signedName:'Worker', attested:true, submitted_at:'1900-01-01' }));
  assert.equal(response.status, 200);
  const updates = calls.filter(call => call[1] === 'update');
  assert.equal(updates.length, 1);
  assert.equal(updates[0][0], 'note_corrections');
  assert.equal(updates[0][2].submitted_by, 'user');
  assert.notEqual(updates[0][2].submitted_at, '1900-01-01');
  assert.ok(calls.some(call => call[1] === 'eq' && call[2] === 'status' && call[3] === 'pending'));
});
test('revocation wins against an already opened worker form', async () => {
  db([{ data:{id,worker_id:id,participant_id:id} }, {data:{id}}, {data:{id}}, {data:{id}}, {data:null}]);
  const response = await POST(request({ action:'submit', id, correctionText:'Corrected', reason:'Typo', signedName:'Worker', attested:true }));
  assert.equal(response.status, 409);
});
