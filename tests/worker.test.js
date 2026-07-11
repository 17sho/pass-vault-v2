import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../apps/worker/src/index.ts';

class Result { constructor(results=[],meta={changes:0}){this.results=results;this.meta=meta;this.success=true} }
class DB {
  users=[]; sessions=[]; entries=[]; attempts=[];
  prepare(sql){return new Statement(this,sql)}
  async batch(stmts){const out=[];for(const s of stmts)out.push(await s.run());return out}
}
class Statement {
  constructor(db,sql,args=[]){this.db=db;this.sql=sql.replace(/\s+/g,' ').trim();this.args=args}
  bind(...args){return new Statement(this.db,this.sql,args)}
  async first(){return (await this.all()).results[0]??null}
  async all(){const[d,s,a]=[this.db,this.sql,this.args];
    if(s.includes('FROM users WHERE username = ?'))return new Result(d.users.filter(x=>x.username===a[0]));
    if(s.includes('FROM sessions s JOIN users u'))return new Result(d.sessions.filter(x=>x.id_hash===a[0]&&x.expires_at>a[1]).map(x=>({...x,...d.users.find(u=>u.id===x.user_id)})));
    if(s.startsWith('SELECT id,type,version,iv,ciphertext FROM entries'))return new Result(d.entries.filter(x=>x.user_id===a[0]).map(({id,type,version,iv,ciphertext})=>({id,type,version,iv,ciphertext})));
    if(s.startsWith('SELECT COUNT(*) AS count FROM login_attempts'))return new Result([{count:d.attempts.filter(x=>x.key===a[0]&&x.attempted_at>a[1]).length}]);
    throw Error('Unhandled all SQL: '+s)
  }
  async run(){const[d,s,a]=[this.db,this.sql,this.args];
    if(s.startsWith('INSERT INTO users')){d.users.push({id:a[0],username:a[1],password_hash:a[2],password_salt:a[3],kdf:a[4],wrapped_key:a[5],created_at:a[6]});return new Result([], {changes:1})}
    if(s.startsWith('INSERT INTO sessions')){d.sessions.push({id_hash:a[0],user_id:a[1],csrf_hash:a[2],expires_at:a[3]});return new Result([], {changes:1})}
    if(s.startsWith('INSERT INTO login_attempts')){d.attempts.push({key:a[0],attempted_at:a[1]});return new Result([], {changes:1})}
    if(s.startsWith('DELETE FROM login_attempts')){d.attempts=d.attempts.filter(x=>!(x.key===a[0]||x.attempted_at<a.at(-1)));return new Result([], {changes:1})}
    if(s.startsWith('DELETE FROM sessions WHERE id_hash')){const n=d.sessions.length;d.sessions=d.sessions.filter(x=>x.id_hash!==a[0]);return new Result([], {changes:n-d.sessions.length})}
    if(s.startsWith('DELETE FROM sessions WHERE user_id = ? AND id_hash')){d.sessions=d.sessions.filter(x=>!(x.user_id===a[0]&&x.id_hash!==a[1]));return new Result([], {changes:1})}
    if(s.startsWith('DELETE FROM sessions WHERE user_id')){d.sessions=d.sessions.filter(x=>x.user_id!==a[0]);return new Result([], {changes:1})}
    if(s.startsWith('UPDATE users SET kdf=')){const u=d.users.find(x=>x.id===a[2]);Object.assign(u,{kdf:a[0],wrapped_key:a[1]});return new Result([], {changes:1})}
    if(s.startsWith('UPDATE users SET')){const u=d.users.find(x=>x.id===a[4]);Object.assign(u,{password_hash:a[0],password_salt:a[1],kdf:a[2],wrapped_key:a[3]});return new Result([], {changes:1})}
    if(s.startsWith('INSERT INTO entries')){const x={user_id:a[0],id:a[1],type:a[2],version:a[3],iv:a[4],ciphertext:a[5],updated_at:a[6]};d.entries=d.entries.filter(e=>!(e.user_id===x.user_id&&e.id===x.id));d.entries.push(x);return new Result([], {changes:1})}
    if(s.startsWith('DELETE FROM entries WHERE user_id = ? AND id')){const n=d.entries.length;d.entries=d.entries.filter(x=>!(x.user_id===a[0]&&x.id===a[1]));return new Result([], {changes:n-d.entries.length})}
    if(s.startsWith('DELETE FROM entries WHERE user_id')){d.entries=d.entries.filter(x=>x.user_id!==a[0]);return new Result([], {changes:1})}
    if(s.startsWith('DELETE FROM sessions WHERE expires_at'))return new Result();
    throw Error('Unhandled run SQL: '+s)
  }
}
const env=()=>({DB:new DB(),ASSETS:{fetch:()=>new Response('asset')}});
const call=(env,path,{method='GET',body,headers={}}={})=>worker.fetch(new Request('https://vault.test'+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},body:body&&JSON.stringify(body)}),env,{waitUntil(){}});
const creds={username:'alice',password:'correct horse battery',kdf:{salt:'client-salt',iterations:310000},wrappedKey:{iv:'opaque-iv',ciphertext:'opaque-wrapped-vault-key'}};
async function login(e){await call(e,'/api/register',{method:'POST',body:creds});const r=await call(e,'/api/login',{method:'POST',body:{username:creds.username,password:creds.password},headers:{'CF-Connecting-IP':'1.2.3.4'}});return {json:await r.json(),cookie:r.headers.get('set-cookie').split(';')[0]}}

test('静态资源和 API 都返回生产安全头',async()=>{const e=env();for(const path of ['/', '/api/health']){const r=await call(e,path);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('strict-transport-security'),'max-age=63072000; includeSubDomains; preload');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.equal(r.headers.get('referrer-policy'),'no-referrer')}});

test('完整认证、会话、CSRF、密文 CRUD、备份和改密流程',async()=>{const e=env();const a=await login(e);assert.equal(typeof a.json.csrf,'string');assert.equal((await call(e,'/api/session',{headers:{cookie:a.cookie}})).status,200);
  assert.deepEqual(a.json.kdf,creds.kdf);assert.deepEqual(a.json.wrappedKey,creds.wrappedKey);assert.equal(typeof e.DB.users[0].kdf,'string');assert.equal(typeof e.DB.users[0].wrapped_key,'string');
  const envelope={id:'entry_123',type:'account',version:1,iv:'opaque-iv',ciphertext:'opaque-ciphertext'};
  assert.equal((await call(e,'/api/entries/entry_123',{method:'PUT',body:envelope,headers:{cookie:a.cookie,origin:'https://vault.test','x-csrf-token':a.json.csrf}})).status,200);
  const list=await (await call(e,'/api/entries',{headers:{cookie:a.cookie}})).json();assert.deepEqual(list.items,[envelope]);assert.equal(JSON.stringify(e.DB).includes(creds.password),false);
  const backup=await (await call(e,'/api/backup',{headers:{cookie:a.cookie}})).json();assert.deepEqual(backup,{version:1,kdf:creds.kdf,wrappedKey:creds.wrappedKey,envelopes:[envelope]});
  assert.equal((await call(e,'/api/backup',{method:'PUT',body:backup,headers:{cookie:a.cookie,origin:'https://vault.test','x-csrf-token':a.json.csrf}})).status,200);
  const changed=await call(e,'/api/change-password',{method:'POST',body:{currentPassword:creds.password,newPassword:'another secure password',kdf:{salt:'new-salt',iterations:310000,hash:'SHA-256'},wrappedKey:{iv:'new-iv',ciphertext:'new-wrap'}},headers:{cookie:a.cookie,origin:'https://vault.test','x-csrf-token':a.json.csrf}});assert.equal(changed.status,200);assert.match(changed.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await call(e,'/api/entries/entry_123',{method:'DELETE',headers:{cookie:a.cookie,origin:'https://vault.test','x-csrf-token':a.json.csrf}})).status,401);
});
test('真实前端密钥对象可注册且旧字符串和畸形对象被拒绝',async()=>{for(const bad of [
  {...creds,kdf:JSON.stringify(creds.kdf)},
  {...creds,wrappedKey:JSON.stringify(creds.wrappedKey)},
  {...creds,kdf:{salt:'x',iterations:1}},
  {...creds,kdf:{salt:'x',iterations:310000,hash:'SHA-1'}},
  {...creds,wrappedKey:{iv:'x'}},
]){const e=env();const r=await call(e,'/api/register',{method:'POST',body:bad});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'invalid'})}});
test('拒绝跨源、明文 envelope、错误密码并实施登录限速',async()=>{const e=env();const a=await login(e);const bad={id:'entry_123',type:'account',version:1,iv:'iv',ciphertext:'cipher',password:'leak'};
  assert.equal((await call(e,'/api/entries/entry_123',{method:'PUT',body:bad,headers:{cookie:a.cookie,origin:'https://evil.test','x-csrf-token':a.json.csrf}})).status,403);
  assert.equal((await call(e,'/api/entries/entry_123',{method:'PUT',body:bad,headers:{cookie:a.cookie,origin:'https://vault.test','x-csrf-token':a.json.csrf}})).status,400);
  for(let i=0;i<10;i++)assert.equal((await call(e,'/api/login',{method:'POST',body:{username:'alice',password:'wrong password!'},headers:{'CF-Connecting-IP':'9.9.9.9'}})).status,401);
  assert.equal((await call(e,'/api/login',{method:'POST',body:{username:'alice',password:'wrong password!'},headers:{'CF-Connecting-IP':'9.9.9.9'}})).status,429);
});
test('改密区分当前密码与新密钥材料错误，并清除当前会话 cookie',async()=>{const e=env(),a=await login(e),headers={cookie:a.cookie,origin:'https://vault.test','x-csrf-token':a.json.csrf};
  let r=await call(e,'/api/change-password',{method:'POST',headers,body:{currentPassword:'wrong password here',newPassword:'another secure password',kdf:{salt:'new-salt',iterations:310000},wrappedKey:{iv:'new-iv',ciphertext:'new-wrap'}}});
  assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'invalid_current_password'});
  for(const [body,code] of [[{currentPassword:creds.password,newPassword:'short',kdf:{salt:'new-salt',iterations:310000},wrappedKey:{iv:'new-iv',ciphertext:'new-wrap'}},'invalid_new_password'],[{currentPassword:creds.password,newPassword:'another secure password',kdf:{salt:'bad',iterations:1},wrappedKey:{iv:'new-iv',ciphertext:'new-wrap'}},'invalid_key_material']]){r=await call(e,'/api/change-password',{method:'POST',headers,body});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:code})}
  r=await call(e,'/api/change-password',{method:'POST',headers,body:{currentPassword:creds.password,newPassword:'another secure password',kdf:{salt:'new-salt',iterations:310000},wrappedKey:{iv:'new-iv',ciphertext:'new-wrap'}}});
  assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await call(e,'/api/session',{headers:{cookie:a.cookie}})).status,401);
});
