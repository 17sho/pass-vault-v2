import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlain, validatePlain } from '../shared/contract.mjs';

const base={platform:'平台',loginUrl:'https://example.test',notes:'',tags:[]};
test('legacy account normalizes to canonical credentials',()=>assert.deepEqual(normalizePlain('account',{...base,username:'old',password:'secret'}),{...base,credentials:[{username:'old',password:'secret'}]}));
test('canonical account accepts bounded credential rows',()=>assert.equal(validatePlain('account',{...base,credentials:[{username:'a',password:'x'},{username:'b',password:'y'}]}),true));
test('account rejects malformed, excessive and unknown sensitive fields',()=>{for(const value of [{...base,credentials:[]},{...base,credentials:Array.from({length:21},()=>({username:'a',password:'b'}))},{...base,credentials:[{username:'a',password:'b',token:'leak'}]},{...base,credentials:[{username:'a'.repeat(257),password:'b'}]},{...base,credentials:[{username:'a',password:'b'}],password:'leak'}])assert.equal(validatePlain('account',value),false)});
test('account permits a sole empty row but rejects half-empty and extra empty rows',()=>{assert.equal(validatePlain('account',{...base,credentials:[{username:'',password:''}]}),true);for(const credentials of [[{username:'only-user',password:''}],[{username:'',password:'only-password'}],[{username:'a',password:'b'},{username:'',password:''}]])assert.equal(validatePlain('account',{...base,credentials}),false)});
test('website still rejects credential containers',()=>assert.equal(validatePlain('website',{name:'n',url:'u',description:'',tags:[],credentials:[{username:'a',password:'b'}]}),false));
