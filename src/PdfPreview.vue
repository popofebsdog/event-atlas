<script setup>
import {ref,watch,onMounted,onBeforeUnmount} from 'vue';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;
const props=defineProps({url:String,source:String,initialPage:{type:Number,default:1}});
const stage=ref(null),canvas=ref(null),page=ref(1),total=ref(0),zoom=ref('1'),width=ref(0),renderKey=ref(0);
const loading=ref(false),rendering=ref(false),failure=ref(''),renderedPage=ref(0),pageText=ref('');
let document,loadingTask,renderTask,observer,loadVersion=0,renderVersion=0,disposed=false;
function message(error){
  if(error?.status===413)return 'PDF 超過預覽大小，請開啟原始檔案。';
  if(error?.status===415)return '連結目前未回傳 PDF，可能需要登入或網址已變更。';
  return 'PDF 目前無法預覽，請重新載入或開啟原始檔案。';
}
async function load(){
  const version=++loadVersion;renderVersion++;renderTask?.cancel();
  const previous=loadingTask;loadingTask=null;document=null;loading.value=true;rendering.value=false;failure.value='';total.value=0;renderedPage.value=0;pageText.value='';
  try{
    await previous?.destroy();if(disposed || version !== loadVersion)return;
    const asset=new URL('pdfjs/',window.location.href);
    loadingTask=getDocument({url:props.url,cMapUrl:new URL('cmaps/',asset).href,cMapPacked:true,standardFontDataUrl:new URL('standard_fonts/',asset).href,wasmUrl:new URL('wasm/',asset).href,disableAutoFetch:true,disableStream:true});
    const result=await loadingTask.promise;if(disposed || version !== loadVersion)return;
    document=result;total.value=result.numPages;page.value=Math.min(Math.max(1,props.initialPage),result.numPages);renderKey.value++;
  }catch(error){if(!disposed && version === loadVersion)failure.value=message(error);}
  finally{if(!disposed && version === loadVersion)loading.value=false;}
}
async function render(){
  if(!document || !canvas.value || !width.value)return;
  const version=++renderVersion,source=document,currentPage=page.value,previous=renderTask;
  renderTask=null;previous?.cancel();rendering.value=true;
  try{
    await previous?.promise.catch(()=>{});
    if(disposed || version !== renderVersion)return;
    const pdfPage=await source.getPage(currentPage);if(disposed || version !== renderVersion || source !== document)return;
    const base=pdfPage.getViewport({scale:1});
    const viewport=pdfPage.getViewport({scale:Math.max(120,width.value-32)/base.width*Number(zoom.value)});
    const density=Math.min(window.devicePixelRatio || 1,2,Math.sqrt(16000000/(viewport.width*viewport.height)));
    canvas.value.width=Math.floor(viewport.width*density);canvas.value.height=Math.floor(viewport.height*density);
    canvas.value.style.width=`${Math.floor(viewport.width)}px`;canvas.value.style.height=`${Math.floor(viewport.height)}px`;
    renderTask=pdfPage.render({canvasContext:canvas.value.getContext('2d',{alpha:false}),viewport,transform:density === 1 ? null : [density,0,0,density,0,0]});
    await renderTask.promise;
    const text=await pdfPage.getTextContent();
    if(!disposed && version === renderVersion){renderedPage.value=currentPage;pageText.value=text.items.map(item=>item.str || '').join(' ').slice(0,100000);failure.value='';stage.value.scrollTop=0;}
  }catch(error){if(!disposed && version === renderVersion && error.name !== 'RenderingCancelledException')failure.value=message(error);}
  finally{if(!disposed && version === renderVersion)rendering.value=false;}
}
function goTo(value){const target=Number(value);if(Number.isInteger(target))page.value=Math.min(Math.max(1,target),total.value);}
watch([page,zoom,width,renderKey],render,{flush:'post'});
watch([()=>props.url,()=>props.initialPage],load);
onMounted(()=>{observer=new ResizeObserver(entries=>{const next=Math.floor(entries[0].contentRect.width);if(next>0 && next !== width.value)width.value=next;});observer.observe(stage.value);load();});
onBeforeUnmount(()=>{disposed=true;loadVersion++;renderVersion++;observer?.disconnect();renderTask?.cancel();loadingTask?.destroy().catch(()=>{});});
</script>

<template>
  <section class="pdf-preview" aria-label="PDF 預覽" :aria-busy="loading || rendering">
    <div v-if="total" class="pdf-toolbar">
      <button :disabled="page <= 1 || rendering" @click="goTo(page-1)">上一頁</button>
      <label>第 <input aria-label="PDF 頁碼" type="number" min="1" :max="total" :value="page" @change="goTo($event.target.value)" @keydown.enter.prevent="goTo($event.target.value)" /> / {{ total }} 頁</label>
      <button :disabled="page >= total || rendering" @click="goTo(page+1)">下一頁</button>
      <select aria-label="PDF 縮放" v-model="zoom" :disabled="rendering"><option value="1">符合寬度</option><option value="1.25">放大 125%</option><option value="1.5">放大 150%</option><option value="2">放大 200%</option></select>
    </div>
    <p v-if="loading" class="hint" role="status">正在載入 PDF…</p>
    <p v-else-if="rendering" class="hint" role="status">正在顯示第 {{ page }} 頁…</p>
    <div v-if="failure" class="pdf-failure" role="alert"><p>{{ failure }}</p><button @click="load">重新載入 PDF</button></div>
    <div ref="stage" class="pdf-stage" v-show="!failure"><canvas ref="canvas" v-show="renderedPage > 0" role="img" :aria-label="`PDF 第 ${renderedPage} 頁`"></canvas></div>
    <details v-if="pageText" class="pdf-page-text"><summary>本頁文字</summary><p>{{ pageText }}</p></details>
    <a class="pdf-source" :href="source" target="_blank" rel="noopener noreferrer">開啟原始檔案</a>
  </section>
</template>

<style>
.pdf-preview {display:flex;flex-direction:column;flex:1;min-height:0;gap:8px;min-width:0;}
.pdf-toolbar {display:flex;align-items:center;flex-wrap:wrap;gap:8px;flex-shrink:0;}
.pdf-toolbar button,.pdf-toolbar select {font-size:12px;line-height:20px;padding:4px 8px;}
.pdf-toolbar label {display:flex;align-items:center;gap:4px;font-size:12px;margin:0;}
.pdf-toolbar input {width:64px;font-size:12px;padding:4px 8px;}
.pdf-toolbar select {width:auto;}
.pdf-stage {flex:1;min-height:160px;min-width:0;overflow:auto;padding:16px;background:#edf1f3;border:1px solid var(--line);border-radius:8px;}
.pdf-stage canvas {display:block;margin:0 auto;background:white;max-width:none;}
.pdf-page-text {font-size:12px;color:var(--muted);max-height:24dvh;overflow:auto;flex-shrink:0;}
.pdf-page-text summary {cursor:pointer;}
.pdf-page-text p {white-space:pre-wrap;margin-top:8px;line-height:20px;}
.pdf-source {font-size:12px;color:var(--accent);flex-shrink:0;align-self:flex-start;}
.pdf-failure {padding:24px;background:var(--tint);border:1px solid var(--line);border-radius:8px;}
.pdf-failure p {font-size:14px;line-height:24px;margin-bottom:16px;}
</style>
