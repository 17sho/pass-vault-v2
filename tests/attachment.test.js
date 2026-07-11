import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { attachmentAad, ATTACHMENT_LIMITS, validateAttachmentMetadata, validAttachmentRecord } from '../shared/contract.mjs';
import { encryptAttachment, decryptAttachment } from '../public/crypto.mjs';

globalThis.crypto ??= webcrypto;
globalThis.btoa ??= value=>Buffer.from(value,'binary').toString('base64');
globalThis.atob ??= value=>Buffer.from(value,'base64').toString('binary');

test('附件 ID 绑定 AAD，替换 ID 无法解密', async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const bytes=new TextEncoder().encode('binary\0payload');
 const encrypted=await encryptAttachment(key,'attach_123',bytes);
 assert.deepEqual(new TextDecoder().decode(await decryptAttachment(key,'attach_123',encrypted)),'binary\0payload');
 await assert.rejects(()=>decryptAttachment(key,'attach_456',encrypted),/operation-specific|decrypt/i);
 assert.equal(new TextDecoder().decode(attachmentAad('attach_123')),'pass-vault-v2:attachment:1:attach_123');
 assert.throws(()=>attachmentAad('../escape'),/invalid_attachment_id/);
});

test('附件加密每次生成随机 96-bit IV', async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const one=await encryptAttachment(key,'attach_123',new Uint8Array([1]));
 const two=await encryptAttachment(key,'attach_123',new Uint8Array([1]));
 assert.notEqual(one.iv,two.iv);assert.equal(Buffer.from(one.iv,'base64').length,12);assert.equal(new Uint8Array(one.ciphertext).length,17);
});

test('附件元数据严格验证名称、分类、大小、contentIv 和 note 关联',()=>{
 const valid={name:'照片 📷.png',mime:'image/png',size:ATTACHMENT_LIMITS.image,category:'image',contentIv:'AAAAAAAAAAAAAAAA',noteId:'note_1234'};
 assert.equal(validateAttachmentMetadata(valid),true);
 for(const bad of [{...valid,name:'x\n.png'},{...valid,name:'x'.repeat(256)},{...valid,size:ATTACHMENT_LIMITS.image+1},{...valid,category:'video',noteId:'note_1234'},{...valid,contentIv:undefined},{...valid,contentIv:'short'},{...valid,extra:'plaintext'}])assert.equal(validateAttachmentMetadata(bad),false);
 assert.equal(validAttachmentRecord({id:'attach_123',metadata:{version:1,iv:'iv',ciphertext:'cipher'},ciphertextSize:17,createdAt:1,updatedAt:1}),true);
});
