import { validEnvelope, validKeyMaterial, validateUsername } from '../../../shared/contract.mjs';

interface Env { DB:D1Database; ASSETS:Fetcher }
type User={id:string;username:string;password_hash:string;password_salt:string;kdf:string;wrapped_key:string};
type Session=User&{user_id:string;id_hash:string;csrf_hash:string;expires_at:number};
type Envelope={id:string;type:'account'|'website'|'note';version:number;iv:string;ciphertext:string};
const COOKIE='pv_session', SESSION_SECONDS=28800, MAX_BODY=2_000_000, LOGIN_WINDOW=60_000, LOGIN_LIMIT=10;
const enc=new TextEncoder();
const SECURITY_HEADERS={
 'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
 'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
 'referrer-policy':'no-referrer',
 'strict-transport-security':'max-age=63072000; includeSubDomains; preload',
 'x-content-type-options':'nosniff',
 'x-frame-options':'DENY'
} as const;
const json=(value:unknown,status=200,headers:HeadersInit={})=>Response.json(value,{status,headers:{...SECURITY_HEADERS,'cache-control':'no-store',...headers}});
async function asset(req:Request,env:Env){const response=await env.ASSETS.fetch(req),headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY_HEADERS))headers.set(key,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
const error=(status:number,code:string)=>json({error:code},status);
const b64=(bytes:ArrayBuffer|Uint8Array)=>{const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let s='';for(const x of a)s+=String.fromCharCode(x);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')};
const random=(n=32)=>{const x=new Uint8Array(n);crypto.getRandomValues(x);return b64(x)};
const digest=async(value:string)=>b64(await crypto.subtle.digest('SHA-256',enc.encode(value)));
const passwordHash=async(password:string,salt:string)=>b64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100_000},await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']),256));
const equal=(a:string,b:string)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0};
async function body(req:Request){const length=Number(req.headers.get('content-length')||0);if(length>MAX_BODY)throw new RangeError();const text=await req.text();if(text.length>MAX_BODY)throw new RangeError();return JSON.parse(text||'{}') as Record<string,unknown>}
const validPassword=(x:unknown)=>typeof x==='string'&&x.length>=12&&x.length<=1024;
const validKey=(x:Record<string,unknown>)=>validKeyMaterial(x);
const material=(u:{kdf:string;wrapped_key:string})=>({kdf:JSON.parse(u.kdf),wrappedKey:JSON.parse(u.wrapped_key)});
function cookie(req:Request){for(const part of (req.headers.get('cookie')||'').split(';')){const [k,...v]=part.trim().split('=');if(k===COOKIE)return v.join('=')}return null}
async function session(req:Request,env:Env){const token=cookie(req);if(!token)return null;return env.DB.prepare('SELECT s.id_hash,s.user_id,s.csrf_hash,s.expires_at,u.id,u.username,u.password_hash,u.password_salt,u.kdf,u.wrapped_key FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash = ? AND s.expires_at > ?').bind(await digest(token),Date.now()).first<Session>()}
async function safe(req:Request,s:Session){const origin=req.headers.get('origin'),expected=new URL(req.url).origin,token=req.headers.get('x-csrf-token');return origin===expected&&!!token&&equal(await digest(token),s.csrf_hash)}
async function rateLimited(env:Env,key:string){const cutoff=Date.now()-LOGIN_WINDOW;await env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(cutoff).run();const row=await env.DB.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE key = ? AND attempted_at > ?').bind(key,cutoff).first<{count:number}>();return Number(row?.count||0)>=LOGIN_LIMIT}
const envelope=(x:Record<string,unknown>,id?:string):Envelope|null=>{const y={...x,...(id?{id}:{})};return Object.keys(y).every(k=>['id','type','version','iv','ciphertext'].includes(k))&&validEnvelope(y)?y as Envelope:null};

export default {async fetch(req:Request,env:Env):Promise<Response>{
 try{
  const u=new URL(req.url),p=u.pathname;
  if(!p.startsWith('/api/'))return asset(req,env);
  if(req.method==='GET'&&p==='/api/health')return json({ok:true,backend:'d1'});
  if(req.method==='POST'&&p==='/api/register'){
   const x=await body(req),name=validateUsername(x.username);if(!name.valid)return error(400,'invalid_username');if(!validPassword(x.password)||!validKey(x))return error(400,'invalid');
   if(await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(name.value).first())return error(409,'username_taken');
   const id=crypto.randomUUID(),salt=random(16),hash=await passwordHash(x.password as string,salt);
   await env.DB.prepare('INSERT INTO users(id,username,password_hash,password_salt,kdf,wrapped_key,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,name.value,hash,salt,JSON.stringify(x.kdf),JSON.stringify(x.wrappedKey),Date.now()).run();return json({ok:true},201);
  }
  if(req.method==='POST'&&p==='/api/login'){
   const x=await body(req),key=req.headers.get('CF-Connecting-IP')||'unknown';if(await rateLimited(env,key))return error(429,'rate_limited');const name=validateUsername(x.username);if(!name.valid)return error(400,'invalid_username');
   const usr=await env.DB.prepare('SELECT id,username,password_hash,password_salt,kdf,wrapped_key FROM users WHERE username = ?').bind(name.value).first<User>();
   const ok=usr&&typeof x.password==='string'&&equal(await passwordHash(x.password,usr.password_salt),usr.password_hash);
   if(!ok){await env.DB.prepare('INSERT INTO login_attempts(key,attempted_at) VALUES(?,?)').bind(key,Date.now()).run();return error(401,'invalid_credentials')}
   await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();const token=random(),csrf=random(24);
   await env.DB.prepare('INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES(?,?,?,?)').bind(await digest(token),usr.id,await digest(csrf),Date.now()+SESSION_SECONDS*1000).run();
   return json({csrf,...material(usr)},200,{'set-cookie':`${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`});
  }
  const s=await session(req,env);if(!s)return error(401,'unauthorized');
  if(!['GET','HEAD'].includes(req.method)&&!await safe(req,s))return error(403,'csrf');
  if(req.method==='GET'&&p==='/api/session')return json({username:s.username,...material(s)});
  if(req.method==='POST'&&p==='/api/logout'){await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(s.id_hash).run();return json({ok:true},200,{'set-cookie':`${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`})}
  if(req.method==='POST'&&p==='/api/change-password'){
   const x=await body(req);
   if(typeof x.currentPassword!=='string'||!equal(await passwordHash(x.currentPassword,s.password_salt),s.password_hash))return error(401,'invalid_current_password');
   if(typeof x.newPassword!=='string'||x.newPassword.length<12||x.newPassword.length>1024)return error(400,'invalid_new_password');
   if(!validKey(x))return error(400,'invalid_key_material');
   const salt=random(16),hash=await passwordHash(x.newPassword,salt);
   await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,kdf=?,wrapped_key=? WHERE id=?').bind(hash,salt,JSON.stringify(x.kdf),JSON.stringify(x.wrappedKey),s.user_id),env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(s.user_id)]);return json({ok:true},200,{'set-cookie':`${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`});
  }
  if(req.method==='GET'&&p==='/api/entries'){const r=await env.DB.prepare('SELECT id,type,version,iv,ciphertext FROM entries WHERE user_id = ? ORDER BY updated_at DESC').bind(s.user_id).all();return json({items:r.results})}
  if(p.startsWith('/api/entries/')){const id=decodeURIComponent(p.slice('/api/entries/'.length));if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return error(400,'invalid_id');
   if(req.method==='PUT'){const x=envelope(await body(req),id);if(!x)return error(400,'invalid_envelope');await env.DB.prepare('INSERT INTO entries(user_id,id,type,version,iv,ciphertext,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET type=excluded.type,version=excluded.version,iv=excluded.iv,ciphertext=excluded.ciphertext,updated_at=excluded.updated_at').bind(s.user_id,x.id,x.type,x.version,x.iv,x.ciphertext,Date.now()).run();return json(x)}
   if(req.method==='DELETE'){await env.DB.prepare('DELETE FROM entries WHERE user_id = ? AND id = ?').bind(s.user_id,id).run();return new Response(null,{status:204,headers:{...SECURITY_HEADERS,'cache-control':'no-store'}})}
  }
  if(req.method==='GET'&&p==='/api/backup'){const r=await env.DB.prepare('SELECT id,type,version,iv,ciphertext FROM entries WHERE user_id = ? ORDER BY updated_at DESC').bind(s.user_id).all();return json({version:1,...material(s),envelopes:r.results})}
  if(req.method==='PUT'&&p==='/api/backup'){const x=await body(req);if(x.version!==1||!validKey(x)||!Array.isArray(x.envelopes)||x.envelopes.length>10000)return error(400,'invalid_backup');const items=x.envelopes.map(v=>envelope(v as Record<string,unknown>));if(items.some(v=>!v))return error(400,'invalid_backup');const ids=new Set(items.map(v=>v!.id));if(ids.size!==items.length)return error(400,'invalid_backup');const now=Date.now();await env.DB.batch([env.DB.prepare('UPDATE users SET kdf=?,wrapped_key=? WHERE id=?').bind(JSON.stringify(x.kdf),JSON.stringify(x.wrappedKey),s.user_id),env.DB.prepare('DELETE FROM entries WHERE user_id = ?').bind(s.user_id),...items.map(v=>env.DB.prepare('INSERT INTO entries(user_id,id,type,version,iv,ciphertext,updated_at) VALUES(?,?,?,?,?,?,?)').bind(s.user_id,v!.id,v!.type,v!.version,v!.iv,v!.ciphertext,now))]);return json({ok:true,count:items.length})}
  return error(404,'not_found');
 }catch(e){if(e instanceof SyntaxError)return error(400,'invalid_json');if(e instanceof RangeError)return error(413,'too_large');console.error(JSON.stringify({event:'request_error',message:e instanceof Error?e.message:'unknown'}));return error(500,'internal_error')}
}} satisfies ExportedHandler<Env>;
