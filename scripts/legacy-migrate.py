#!/usr/bin/env python3
"""Read-only legacy decryptor. Writes a chmod-0600 browser migration file; logs counts only."""
import argparse, base64, hashlib, json, os, sqlite3, sys
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken

ALLOWED={'account','website','note'}
def env_value(path, names):
    for raw in Path(path).read_text().splitlines():
        line=raw.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        key,value=line.split('=',1)
        if key.strip() in names: return value.strip().strip('"').strip("'")
    raise RuntimeError('legacy SECRET_KEY not found')
def tags(value): return [x.strip() for x in (value or '').split(',') if x.strip()]
def map_row(r,password):
    t=r['item_type'] if r['item_type'] in ALLOWED else 'account'
    if t=='note': data={'title':r['platform'],'body':password,'tags':tags(r['tags'])}
    elif t=='website': data={'name':r['platform'],'url':r['login_url'],'description':r['note'],'tags':tags(r['tags'])}
    else: data={'platform':r['platform'],'loginUrl':r['login_url'],'username':r['username'],'password':password,'notes':r['note'],'tags':tags(r['tags'])}
    return {'id':f"legacy-{r['id']}",'type':t,'data':data}
def main():
    p=argparse.ArgumentParser();p.add_argument('--db',default='/opt/pass-manager/pass-manager.sqlite3');p.add_argument('--env',default='/etc/pass-manager/pass-manager.env');p.add_argument('--output',required=True);a=p.parse_args()
    before=hashlib.sha256(Path(a.db).read_bytes()).hexdigest()
    secret=env_value(a.env,{'SECRET_KEY','PASS_MANAGER_SECRET_KEY'})
    cipher=Fernet(base64.urlsafe_b64encode(secret.encode()[:32].ljust(32,b'0')))
    con=sqlite3.connect(f'file:{a.db}?mode=ro&immutable=1',uri=True);con.row_factory=sqlite3.Row
    items=[]
    for r in con.execute('SELECT * FROM credentials ORDER BY id'):
        try: password=cipher.decrypt(r['password_encrypted'].encode()).decode() if r['password_encrypted'] else ''
        except InvalidToken: raise RuntimeError(f"legacy row {r['id']} cannot be decrypted") from None
        items.append(map_row(r,password))
    con.close(); after=hashlib.sha256(Path(a.db).read_bytes()).hexdigest()
    if before!=after: raise RuntimeError('legacy database hash changed')
    out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True)
    fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f: json.dump({'format':'pass-vault-v2-plaintext-migration','version':1,'items':items},f,ensure_ascii=False,separators=(',',':'))
    counts={t:sum(x['type']==t for x in items) for t in sorted(ALLOWED)}
    print(json.dumps({'output':str(out),'count':len(items),'types':counts,'legacySha256':before},ensure_ascii=False))
if __name__=='__main__':
    try: main()
    except Exception as e: print(f'migration failed: {e}',file=sys.stderr);sys.exit(1)
