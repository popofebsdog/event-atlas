export function linkedMedia(value) {
  if (!value) return {kind: 'none', src: ''};
  let url;
  try { url = new URL(value); } catch { return {kind: 'none', src: ''}; }
  if (url.protocol !== 'https:' || url.username || url.password) return {kind: 'none', src: ''};
  if (url.hostname === 'den.ncdr.nat.gov.tw') return {kind:'external',src:url.href};
  if (url.hostname === 'drive.google.com') {
    const id = url.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([\w-]+)(?:\/|$)/)?.[1] || url.searchParams.get('id');
    if (id && /^[\w-]+$/.test(id)) {
      const preview = new URL(`https://drive.google.com/file/d/${id}/preview`);
      if (url.searchParams.has('resourcekey')) preview.searchParams.set('resourcekey',url.searchParams.get('resourcekey'));
      return {kind: 'drive', src: preview.href};
    }
  }
  if (/\.pdf$/i.test(url.pathname)) return {kind:'pdf',src:url.href,page:pdfPage(url.href)};
  return {kind: /\.(?:png|jpe?g|webp|gif|avif)$/i.test(url.pathname) ? 'image' : 'web', src: url.href};
}
export function pdfPage(value){
  try {const page=Number(new URLSearchParams(new URL(value).hash.slice(1)).get('page'));return Number.isSafeInteger(page) && page>0 ? page : 1;}catch{return 1;}
}
export async function preparePhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('請選擇 JPEG、PNG 或 WebP 照片');
  if (file.size > 10 * 1024 * 1024) throw new Error('原始照片請小於 10 MB');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1,1600 / Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(bitmap.width * scale));
    canvas.height = Math.max(1,Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const result = canvas.toDataURL('image/jpeg',0.8);
    if (result.length > 1398104) throw new Error('照片壓縮後仍超過 1 MB，請縮小後重試');
    return result;
  } finally { bitmap.close(); }
}
