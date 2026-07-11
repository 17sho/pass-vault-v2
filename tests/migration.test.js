import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMigration, importMigration } from '../public/migration.mjs';

test('legacy migration validates all three type field maps', () => {
  const doc={format:'pass-vault-v2-plaintext-migration',version:1,items:[
    {id:'legacy-1',type:'account',data:{platform:'GitHub',loginUrl:'https://github.com',username:'a',password:'s',notes:'n',tags:['dev']}},
    {id:'legacy-2',type:'website',data:{name:'Docs',url:'https://example.com',description:'d',tags:[]}},
    {id:'legacy-3',type:'note',data:{title:'Memo',body:'text',tags:['x']}}
  ]};
  assert.equal(normalizeMigration(doc).length,3);
  assert.throws(()=>normalizeMigration({...doc,items:[{id:'legacy-4',type:'website',data:{name:'x',url:'https://x.test',description:'',tags:[],password:'leak'}}]}),/invalid migration item/);
});

test('plaintext migration encrypts locally before upload and never sends plaintext', async () => {
  const sent=[];
  const doc={format:'pass-vault-v2-plaintext-migration',version:1,items:[{id:'legacy-25',type:'note',data:{title:'Memo',body:'secret body',tags:[]}}]};
  const result=await importMigration(doc,{},async(_key,data)=>({iv:'iv',ciphertext:`encrypted:${data.title}`}),async(item)=>sent.push(item));
  assert.deepEqual(result,{imported:1});
  assert.deepEqual(sent,[{id:'legacy-25',type:'note',version:1,iv:'iv',ciphertext:'encrypted:Memo'}]);
  assert.equal(JSON.stringify(sent).includes('secret body'),false);
});

test('migration accepts canonical and legacy accounts and uploads canonical plaintext only',async()=>{
  const canonical={id:'canonical_1',type:'account',data:{platform:'A',loginUrl:'',credentials:[{username:'u',password:'p'}],notes:'',tags:[]}};
  const legacy={id:'legacy_123',type:'account',data:{platform:'B',loginUrl:'',username:'old',password:'secret',notes:'',tags:[]}},seen=[];
  await importMigration({format:'pass-vault-v2-plaintext-migration',version:1,items:[canonical,legacy]},'key',async(_key,data)=>{seen.push(data);return{iv:'iv',ciphertext:'cipher'}},async()=>{});
  assert.deepEqual(seen,[canonical.data,{platform:'B',loginUrl:'',notes:'',tags:[],credentials:[{username:'old',password:'secret'}]}]);
});
