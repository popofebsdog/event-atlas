import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const file = new URL('../.deployment-secrets.json', import.meta.url);
let secrets;
try { secrets = JSON.parse(await readFile(file, 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') throw e; secrets = { ADMIN_TOKEN: randomBytes(32).toString('hex') }; await writeFile(file, JSON.stringify(secrets,null,2), {mode:0o600,flag:'wx'}); }
if (!secrets.TURNSTILE_SECRET) {
  const raw = execFileSync('npx',['wrangler','turnstile','widget','create','GeoPORT Event Atlas','--domain','popofebsdog.github.io','--mode','managed','--json'],{encoding:'utf8'});
  const widget = JSON.parse(raw);
  const data = widget.result || widget;
  if (!data.secret || !data.sitekey) throw new Error('Widget response missing credentials; inspect widget list before retrying.');
  secrets.TURNSTILE_SECRET = data.secret; secrets.SITE_KEY = data.sitekey;
  await writeFile(file, JSON.stringify(secrets,null,2), {mode:0o600});
}
await writeFile(new URL('../.admin-key.txt', import.meta.url), secrets.ADMIN_TOKEN + '\n', {mode:0o600});
console.log('Credentials saved locally (not printed). Public site key:', secrets.SITE_KEY);
execFileSync('npx',['wrangler','secret','bulk'], {input:JSON.stringify({ADMIN_TOKEN:secrets.ADMIN_TOKEN,TURNSTILE_SECRET:secrets.TURNSTILE_SECRET}),stdio:['pipe','inherit','inherit']});
