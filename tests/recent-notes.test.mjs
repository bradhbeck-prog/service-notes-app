import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../app/api/worker/recent-notes/route.js', import.meta.url), 'utf8')).replace('import { createClient } from "@supabase/supabase-js";', 'const createClient = () => globalThis.recentTestDb;');
const { GET, POST } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
const id = '00000000-0000-4000-8000-000000000001';
const participant = { id, cle_auth_user_id:'cle', workspace_id:id };
function db(results, userId='worker') {
  const calls = [];
  globalThis.recentTestDb = { auth:{getUser:async()=>({data:{user:{id:userId}}})}, from(table) {
    const chain = {};
    for (const method of ['select','eq','in','order','limit','upsert']) chain[method] = (...args) => {calls.push([table,method,...args]); return chain;};
    chain.maybeSingle = async()=>results.shift() || {data:null};
    chain.then = (resolve,reject)=>Promise.resolve(results.shift() || {data:[]}).then(resolve,reject);
    return chain;
  }};
  return calls;
}
const get = settings => new Request(`https://test.invalid/api/worker/recent-notes?participantId=${id}${settings?'&settings=1':''}`, {headers:{authorization:'Bearer test'}});
const post = limit => new Request('https://test.invalid/api/worker/recent-notes', {method:'POST',headers:{authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({participantId:id,noteLimit:limit})});
test('unauthenticated recent-note requests are refused', async()=>assert.equal((await GET(new Request(`https://test.invalid/?participantId=${id}`))).status,401));
test('unassigned worker cannot read notes or inspect the setting',async()=>{
  let calls=db([{data:participant},{data:{id}},{data:null}]);
  assert.equal((await GET(get())).status,403);
  assert.equal(calls.some(row=>row[0]==='service_notes'),false);
  db([{data:participant},{data:null}]);
  assert.equal((await GET(get(true))).status,403);
});
test('access defaults to off and never fetches notes',async()=>{
  const calls=db([{data:participant},{data:{id}},{data:{id}},{data:null}]);
  assert.deepEqual(await (await GET(get())).json(),{noteLimit:0,notes:[]});
  assert.equal(calls.some(row=>row[0]==='service_notes'),false);
});
test('worker cannot enable their own access',async()=>{
  const calls=db([{data:participant}]);
  assert.equal((await POST(post(10))).status,403);
  assert.equal(calls.some(row=>row[1]==='upsert'),false);
});
test('CLE can grant only 0, 5 or 10 notes',async()=>{
  db([{data:participant}],'cle'); assert.equal((await POST(post(500))).status,400);
  const calls=db([{data:participant},{data:[]}],'cle'); assert.equal((await POST(post(5))).status,200);
  assert.equal(calls.find(row=>row[1]==='upsert')[2].updated_by,'cle');
});
test('read is participant-specific, submitted-only and capped at the saved limit',async()=>{
  const calls=db([{data:participant},{data:{id}},{data:{id}},{data:{note_limit:5}},{data:[]}]);
  assert.equal((await GET(get())).status,200);
  assert.ok(calls.some(row=>row[0]==='service_notes'&&row[1]==='eq'&&row[2]==='participant_id'&&row[3]===id));
  assert.ok(calls.some(row=>row[0]==='service_notes'&&row[1]==='eq'&&row[2]==='status'&&row[3]==='submitted'));
  assert.ok(calls.some(row=>row[0]==='service_notes'&&row[1]==='limit'&&row[2]===5));
});
test('permission lookup failure does not reveal notes',async()=>{
  const calls=db([{data:participant},{data:{id}},{data:{id}},{error:{message:'unavailable'}}]);
  assert.equal((await GET(get())).status,503);
  assert.equal(calls.some(row=>row[0]==='service_notes'),false);
});
