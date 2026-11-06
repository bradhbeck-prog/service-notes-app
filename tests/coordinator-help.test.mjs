import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../app/api/admin/support-coordinators/route.js',import.meta.url),'utf8'))
 .replace('import { createClient } from "@supabase/supabase-js";', 'const createClient = () => globalThis.scTestDb;')
 .replace('import { sendAccountSetupEmail, sendPasswordHelpEmail } from "../../../../lib/sendEmail";', 'const sendAccountSetupEmail = async () => {}; const sendPasswordHelpEmail = async value => globalThis.scTestEmails.push(value);')
 .replace('import { buildProtectedAuthLink } from "../../../../lib/authLinks";', 'const buildProtectedAuthLink = () => "https://test.invalid/reset-password#test";');
const {POST}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY='test';
function setup(results) {
 const calls=[]; globalThis.scTestEmails=[];
 globalThis.scTestDb={auth:{getUser:async()=>({data:{user:{id:'admin'}}}),admin:{
  getUserById:async()=>({data:{user:{email:'wrong@test.invalid'}}}),
  listUsers:async()=>({data:{users:[{id:'correct-user',email:'correct@test.invalid'}]}}),
  generateLink:async value=>{calls.push(['generateLink',value]);return {data:{user:{id:'correct-user'}}};}
 }},from(table){const chain={};for(const method of ['select','eq','in','limit','ilike','update','upsert'])chain[method]=(...args)=>{calls.push([table,method,...args]);return chain;};chain.maybeSingle=chain.single=async()=>results.shift()||{data:null};chain.then=(resolve,reject)=>Promise.resolve(results.shift()||{data:null}).then(resolve,reject);return chain;}};
 return calls;
}
const req=body=>new Request('https://test.invalid/api/admin/support-coordinators',{method:'POST',headers:{authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body)});
test('password help repairs stale email linkage and returns an actual backup link',async()=>{
 const calls=setup([{data:{workspace_id:'ws'}},{data:{id:'sc',workspace_id:'ws',name:'SC',email:'correct@test.invalid',auth_user_id:'wrong-user'}},{data:null}]);
 const response=await POST(req({action:'send_help',coordinatorId:'sc'}));
 assert.equal(response.status,200); assert.ok((await response.json()).setupLink);
 assert.equal(calls.find(row=>row[1]==='update')[2].auth_user_id,'correct-user');
 assert.equal(globalThis.scTestEmails[0].to,'correct@test.invalid');
});
test('correcting email preserves coordinator id/assignments and sends recovery for existing correct account',async()=>{
 const updated={id:'sc',workspace_id:'ws',name:'SC',email:'correct@test.invalid',auth_user_id:null};
 const calls=setup([{data:{workspace_id:'ws'}},{data:{id:'p',name:'Participant'}},{data:{...updated,email:'wrong@test.invalid',auth_user_id:'wrong-user'}},{data:updated},{data:null},{data:null},{data:null}]);
 const response=await POST(req({action:'assign',participantId:'p',coordinatorId:'sc',name:'SC',email:'correct@test.invalid'}));
 assert.equal(response.status,200); assert.ok((await response.json()).setupLink);
 assert.ok(calls.some(row=>row[0]==='support_coordinators'&&row[1]==='update'&&row[2].auth_user_id===null));
 assert.equal(calls.find(row=>row[0]==='support_coordinator_participants'&&row[1]==='upsert')[2].support_coordinator_id,'sc');
 assert.equal(globalThis.scTestEmails[0].to,'correct@test.invalid');
});
