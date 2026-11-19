import test from 'node:test';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {linkedMedia} from '../src/media.js';
import worker from '../worker/index.js';
const headers={Origin:'https://example.com'};
const environment=url=>({ALLOWED_ORIGINS:'https://example.com',DB:{prepare(){return {bind(){return this;},async first(){return {url};}};}}});
test('PDF links retain their page fragment and do not enter a generic webpage iframe',()=>{
  const media=linkedMedia('https://www.cwa.gov.tw/Data/service/notice/download/Publish_20230922095829.pdf#page=86');
  assert.equal(media.kind,'pdf');assert.equal(media.page,86);
  assert.equal(linkedMedia('https://example.com/FILE.PDF?download=1#page=0').page,1);
});
test('stored links without extensions are detected using the actual response MIME type',async()=>{
  const remote=mock.method(globalThis,'fetch',async(_url,options)=>{assert.equal(options.method,'HEAD');return new Response(null,{headers:{'Content-Type':'application/pdf'}});});
  try{const r=await worker.fetch(new Request('https://api.example.com/api/events/example/media',{headers}),environment('https://example.com/download?id=1#page=86'));assert.equal(r.status,200);assert.equal((await r.json()).kind,'pdf');}finally{remote.mock.restore();}
});
test('PDF reads preserve byte ranges and expose only safe document response headers',async()=>{
  const remote=mock.method(globalThis,'fetch',async(_url,options)=>{assert.equal(new Headers(options.headers).get('Range'),'bytes=0-7');assert.equal(new Headers(options.headers).has('Authorization'),false);return new Response('%PDF-1.7',{status:206,headers:{'Content-Type':'application/pdf','Content-Length':'8','Content-Range':'bytes 0-7/2000','Accept-Ranges':'bytes','Set-Cookie':'private=hidden'}});});
  try{const r=await worker.fetch(new Request('https://api.example.com/api/events/example/pdf',{headers:{...headers,Range:'bytes=0-7'}}),environment('https://example.com/document.pdf#page=86'));assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'application/pdf');assert.equal(r.headers.get('content-range'),'bytes 0-7/2000');assert.equal(r.headers.has('set-cookie'),false);assert.equal(await r.text(),'%PDF-1.7');}finally{remote.mock.restore();}
});
test('document reads reject private targets, private redirects, oversized files and unexpected HTML',async()=>{
  let calls=0;
  const remote=mock.method(globalThis,'fetch',async url=>{
    calls++;const path=new URL(url).pathname;
    if(path==='/redirect.pdf')return new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private.pdf'}});
    if(path==='/large.pdf')return new Response(null,{headers:{'Content-Type':'application/pdf','Content-Length':String(51*1024*1024)}});
    return new Response('<html>Login required</html>',{headers:{'Content-Type':'text/html'}});
  });
  try{
    for(const url of ['https://127.0.0.1/a.pdf','https://169.254.169.254/a.pdf','https://localhost/a.pdf','https://localhost./a.pdf','https://example.com/redirect.pdf','https://example.com/large.pdf','https://example.com/login.pdf']){
      const r=await worker.fetch(new Request('https://api.example.com/api/events/example/pdf',{headers}),environment(url));assert.ok([400,413,415].includes(r.status),`${url}: ${r.status}`);
    }
    assert.equal(calls,3);
  }finally{remote.mock.restore();}
});
