const MAX_PDF_BYTES=50*1024*1024;
export class MediaError extends Error {constructor(message,status=400){super(message);this.status=status;}}

function publicURL(value,blockedHost){
  let url;try{url=new URL(value);}catch{throw new MediaError('此事件沒有可讀取的公開網址');}
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  const ip=host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
  const privateIP=ip && (ip[0]===0 || ip[0]===10 || ip[0]===127 || ip[0]>=224 || ip[0]===169 && ip[1]===254 || ip[0]===172 && ip[1]>=16 && ip[1]<=31 || ip[0]===192 && ip[1]===168 || ip[0]===100 && ip[1]>=64 && ip[1]<=127 || ip[0]===198 && [18,19].includes(ip[1]));
  if(url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || host===blockedHost || host==='localhost' || /\.(localhost|local|internal)$/.test(host) || host.includes(':') || !host.includes('.') || privateIP)throw new MediaError('僅能預覽公開 HTTPS 網址');
  url.hash='';return url;
}
async function remote(value,{method='HEAD',range,blockedHost}={}){
  let url=publicURL(value,blockedHost);const signal=AbortSignal.timeout(12000);
  for(let redirects=0;redirects<4;redirects++){
    const headers=new Headers({Accept:'application/pdf,image/*,text/html;q=0.8,*/*;q=0.5','Accept-Encoding':'identity'});
    if(range)headers.set('Range',range);
    const response=await fetch(url.href,{method,headers,redirect:'manual',signal});
    if(![301,302,303,307,308].includes(response.status))return response;
    await response.body?.cancel();
    const location=response.headers.get('location');if(!location)throw new MediaError('來源網站沒有提供有效的檔案位置',502);
    url=publicURL(new URL(location,url).href,blockedHost);
  }
  throw new MediaError('來源網址重新導向次數過多');
}

export async function inspectMedia(value,blockedHost){
  let response=await remote(value,{blockedHost});
  if([403,405,501].includes(response.status)){
    await response.body?.cancel();response=await remote(value,{method:'GET',range:'bytes=0-1023',blockedHost});
  }
  const type=(response.headers.get('content-type') || '').split(';')[0].toLowerCase().trim();
  await response.body?.cancel();
  if(!response.ok)return {kind:'web',verified:false};
  if(type==='application/pdf')return {kind:'pdf',verified:true};
  if(type.startsWith('image/'))return {kind:'image',verified:true};
  if(['text/html','application/xhtml+xml'].includes(type))return {kind:'web',verified:true};
  return type ? {kind:'external',reason:'file',verified:true} : {kind:'web',verified:false};
}

export async function pdfResponse(value,request,headers){
  const range=request.headers.get('range');
  if(range && (!/^bytes=\d+-\d*$/.test(range) || range.length>80))throw new MediaError('PDF 讀取範圍無效');
  const response=await remote(value,{method:'GET',range,blockedHost:new URL(request.url).hostname});
  if(response.status===416)return new Response(null,{status:416,headers:{...headers,'Content-Range':response.headers.get('content-range') || 'bytes */0'}});
  if(!response.ok){await response.body?.cancel();throw new MediaError('PDF 來源目前無法讀取，請稍後重試或開啟原始檔案',502);}
  const type=(response.headers.get('content-type') || '').split(';')[0].toLowerCase().trim();
  if(!['application/pdf','application/octet-stream'].includes(type)){await response.body?.cancel();throw new MediaError('此連結回傳的內容不是可預覽的 PDF，可能需要登入或網址已變更',415);}
  const length=Number(response.headers.get('content-length') || 0),total=Number(response.headers.get('content-range')?.split('/')[1] || length);
  if(length>MAX_PDF_BYTES || total>MAX_PDF_BYTES){await response.body?.cancel();throw new MediaError('PDF 超過 50 MB，請開啟原始檔案閱讀',413);}
  if(!response.body)throw new MediaError('來源回傳了空白的 PDF',502);
  const resultHeaders={...headers,'Content-Type':'application/pdf','Content-Security-Policy':"default-src 'none'; sandbox",'Access-Control-Expose-Headers':'Content-Length,Content-Range,Accept-Ranges'};
  for(const name of ['Content-Length','Content-Range','Accept-Ranges']){const value=response.headers.get(name);if(value)resultHeaders[name]=value;}
  let transferred=0;
  const body=response.body.pipeThrough(new TransformStream({transform(chunk,controller){transferred+=chunk.length;if(transferred>MAX_PDF_BYTES)throw new Error('PDF size limit exceeded');controller.enqueue(chunk);}}));
  return new Response(body,{status:response.status,headers:resultHeaders});
}
