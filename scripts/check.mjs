import{readdir,readFile}from'node:fs/promises';
const ignored=new Set(['.git','node_modules','dist','.wrangler']);
async function walk(p){for(const e of await readdir(p,{withFileTypes:true})){if(e.isDirectory()&&ignored.has(e.name))continue;const f=p+'/'+e.name;if(e.isDirectory())await walk(f);else if(/\.(mjs|js|ts)$/.test(f)){const s=await readFile(f,'utf8');if(/\beval\s*\(|innerHTML\s*=/.test(s))throw Error('unsafe pattern: '+f)}}}
await walk('.');console.log('静态检查通过');
