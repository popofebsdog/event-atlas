<script setup>
import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue';
import L from 'leaflet';
import {api} from './api';
import {readAnnotations,featureCollection,GEOMETRY_LABELS} from '../shared/annotations';
import Challenge from './Challenge.vue';

const props=defineProps({map:Object,projectId:String,features:Array,adminKey:String,visible:{type:Boolean,default:true}});
const emit=defineEmits(['saved','removed','update:adminKey','drawing-change','locate']);
const panel=ref(null),listOpen=ref(true),drawing=ref(''),vertices=ref([]),dialog=ref(null),actionDialog=ref(null);
const pending=ref([]),failure=ref(''),busy=ref(false),token=ref(''),challengeKey=ref(0),action=ref(''),target=ref(null),modalOpen=ref(false);
const enoughPoints=computed(()=>vertices.value.length >= (drawing.value === 'Polygon' ? 3 : 2));
const canSave=computed(()=>!busy.value && props.adminKey?.trim() && (!import.meta.env.VITE_TURNSTILE_SITE_KEY || token.value));
let layer,draft,doubleClickEnabled=false;
function syncInteraction(){emit('drawing-change',!!drawing.value || modalOpen.value);}
function render() {
  layer?.remove();
  layer=L.geoJSON(featureCollection(props.visible ? props.features || [] : []),{
    interactive:!drawing.value,
    style:{color:'#547d99',weight:3,fillOpacity:.15,className:'annotation-layer'},
    pointToLayer:(_,point)=>L.circleMarker(point,{radius:7,color:'#547d99',fillColor:'#fff',fillOpacity:1,weight:3,className:'annotation-layer',interactive:!drawing.value}),
    onEachFeature(feature,item){
      const label=document.createElement('span');label.textContent=feature.properties.name;
      const popup=document.createElement('div'),heading=document.createElement('strong'),description=document.createElement('p');
      heading.textContent=feature.properties.name;description.textContent=feature.properties.description;
      popup.append(heading,description);item.bindTooltip(label).bindPopup(popup);
    },
  }).addTo(props.map);
}
function renderDraft(){
  draft?.remove();draft=L.layerGroup().addTo(props.map);
  const points=vertices.value.map(([lng,lat])=>[lat,lng]);
  if(points.length>1)(drawing.value === 'Polygon' && points.length>2 ? L.polygon(points,{color:'#cf8e36',dashArray:'6 4'}) : L.polyline(points,{color:'#cf8e36',dashArray:'6 4'})).addTo(draft);
  for(const point of points)L.circleMarker(point,{radius:5,color:'#cf8e36',fillOpacity:1,interactive:false}).addTo(draft);
}
function clearDrawing(){
  drawing.value='';vertices.value=[];draft?.remove();draft=null;
  if(doubleClickEnabled)props.map.doubleClickZoom.enable();
  syncInteraction();render();
}
function start(type){
  clearDrawing();failure.value='';drawing.value=type;
  doubleClickEnabled=props.map.doubleClickZoom.enabled();props.map.doubleClickZoom.disable();
  syncInteraction();render();
}
function mapClick(event){
  if(!drawing.value || modalOpen.value)return;
  if(vertices.value.length>=1999){failure.value='已達繪製上限，請完成或取消';return;}
  vertices.value.push([Number(event.latlng.lng.toFixed(6)),Number(event.latlng.lat.toFixed(6))]);
  renderDraft();
  if(drawing.value === 'Point')finish();
}
function openEditor(items){
  pending.value=items;failure.value='';token.value='';challengeKey.value++;modalOpen.value=true;syncInteraction();dialog.value.showModal();
}
function finish(){
  try{
    let coordinates=vertices.value.map(p=>[...p]);
    if(drawing.value === 'Point')coordinates=coordinates[0];
    if(drawing.value === 'Polygon')coordinates=[[...coordinates,coordinates[0]]];
    openEditor(readAnnotations({type:drawing.value,coordinates}));
  }catch(e){failure.value=e.message;}
}
async function importFile(event){
  failure.value='';
  try{
    const file=event.target.files[0];if(!file)return;
    if(file.size>500000)throw new Error('GeoJSON 檔案需小於 500 KB');
    let data;try{data=JSON.parse(await file.text());}catch{throw new Error('GeoJSON 檔案格式無法讀取');}
    openEditor(readAnnotations(data));
  }catch(e){failure.value=e.message;}
  finally{event.target.value='';}
}
async function save(){
  if(!canSave.value)return;busy.value=true;failure.value='';
  try{
    const result=await api(`/projects/${props.projectId}/features`,{method:'POST',headers:{Authorization:`Bearer ${props.adminKey}`},body:JSON.stringify({geojson:featureCollection(pending.value),token:token.value})});
    emit('saved',result.items);listOpen.value=true;dialog.value.close();
  }catch(e){failure.value=e.message;token.value='';challengeKey.value++;}
  finally{busy.value=false;}
}
function locate(feature){emit('locate',feature);}
function askAction(kind,feature){action.value=kind;target.value=feature;failure.value='';modalOpen.value=true;syncInteraction();actionDialog.value.showModal();}
async function confirmAction(){
  if(busy.value || !props.adminKey?.trim())return;busy.value=true;failure.value='';
  try{
    const headers={Authorization:`Bearer ${props.adminKey}`};
    if(action.value === 'delete'){
      await api(`/features/${target.value.id}`,{method:'DELETE',headers});emit('removed',target.value.id);
    }else{
      await api('/admin/verify',{method:'POST',headers});
      const href=URL.createObjectURL(new Blob([JSON.stringify(featureCollection(props.features),null,2)],{type:'application/geo+json'})),link=document.createElement('a');
      link.href=href;link.download=`project-${props.projectId}.geojson`;link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
    }
    actionDialog.value.close();
  }catch(e){failure.value=e.message;}finally{busy.value=false;}
}
function closed(){modalOpen.value=false;pending.value=[];failure.value='';clearDrawing();}
function escape(event){if(event.key === 'Escape' && drawing.value && !modalOpen.value)clearDrawing();}
watch([()=>props.features,()=>props.visible],render,{deep:true});
watch(()=>props.projectId,()=>{dialog.value?.close();actionDialog.value?.close();closed();listOpen.value=false;});
onMounted(()=>{L.DomEvent.disableClickPropagation(panel.value);L.DomEvent.disableScrollPropagation(panel.value);props.map.on('click',mapClick);document.addEventListener('keydown',escape);render();});
onBeforeUnmount(()=>{props.map.off('click',mapClick);document.removeEventListener('keydown',escape);layer?.remove();draft?.remove();if(doubleClickEnabled)props.map.doubleClickZoom.enable();emit('drawing-change',false);});
</script>

<template>
  <section ref="panel" class="annotations-control" aria-label="專案地圖標註">
    <details :open="listOpen" @toggle="listOpen=$event.target.open">
      <summary>地圖標註 · {{ features.length }}</summary>
      <div class="annotation-tools">
        <button v-for="(label,type) in GEOMETRY_LABELS" :key="type" :aria-pressed="drawing === type" @click="start(type)">{{ type === 'Point' ? '標點' : '畫' + label }}</button>
        <label class="button import-geometry">匯入<input aria-label="匯入 GeoJSON" type="file" accept=".geojson,.json,application/geo+json,application/json" @change="importFile" :disabled="!!drawing" /></label>
      </div>
      <p v-if="!drawing" class="annotation-hint">此專案的點、線、面；匯入使用 WGS84 GeoJSON。</p>
      <ul v-if="features.length" class="annotation-list">
        <li v-for="feature in features" :key="feature.id"><button :aria-label="`定位標註：${feature.name}`" @click="locate(feature)"><span class="annotation-kind">{{ GEOMETRY_LABELS[feature.geometry.type] }}</span>{{ feature.name }}</button><button :aria-label="`刪除標註：${feature.name}`" @click="askAction('delete',feature)">×</button></li>
      </ul>
      <p v-else class="annotation-hint">尚無標註，選擇工具開始繪製。</p>
      <button v-if="features.length" class="annotation-export" @click="askAction('export')">匯出 GeoJSON</button>
    </details>
    <p v-if="failure && !modalOpen" class="error" role="alert">{{ failure }}</p>
  </section>
  <Teleport to="#map-drawing-controls">
    <div v-if="drawing" class="drawing-progress" role="status" @click.stop @dblclick.stop @mousedown.stop @pointerdown.stop>
      <p>{{ drawing === 'Point' ? '在地圖上選擇標註位置' : `在地圖依序選點，已選 ${vertices.length} 點` }}</p>
      <div class="annotation-tools"><button v-if="drawing !== 'Point'" :disabled="!enoughPoints" @click="finish">完成繪製</button><button :disabled="!vertices.length" @click="vertices.pop();renderDraft()">復原一點</button><button @click="clearDrawing">取消繪製</button></div>
    </div>
  </Teleport>
  <dialog ref="dialog" aria-label="儲存地圖標註" @close="closed" @cancel="busy && $event.preventDefault()">
    <form @submit.prevent="save"><div class="dialog-heading"><h2>儲存地圖標註</h2><button type="button" :disabled="busy" aria-label="關閉標註表單" @click="dialog.close()">×</button></div>
      <p class="hint">將新增 {{ pending.length }} 筆標註</p>
      <template v-if="pending.length === 1"><label>標註名稱<input v-model="pending[0].name" required maxlength="160" /></label><label>標註說明<textarea v-model="pending[0].description" maxlength="5000" rows="3"></textarea></label></template>
      <ul v-else class="import-summary"><li v-for="(item,index) in pending" :key="index">{{ GEOMETRY_LABELS[item.geometry.type] }} · {{ item.name }}</li></ul>
      <label>管理員金鑰<input type="password" autocomplete="off" required :value="adminKey" @input="emit('update:adminKey',$event.target.value)" /></label>
      <Challenge v-if="modalOpen && pending.length" :key="challengeKey" @token="token=$event" />
      <p v-if="failure" class="error" role="alert">{{ failure }}</p>
      <div class="form-footer"><button type="button" :disabled="busy" @click="dialog.close()">取消</button><button class="primary" :disabled="!canSave">{{ busy ? '儲存中…' : '儲存標註' }}</button></div>
    </form>
  </dialog>
  <dialog ref="actionDialog" :aria-label="action === 'delete' ? '刪除地圖標註' : '匯出地圖標註'" @close="closed" @cancel="busy && $event.preventDefault()">
    <form @submit.prevent="confirmAction"><h2>{{ action === 'delete' ? '刪除地圖標註' : '匯出地圖標註' }}</h2>
      <p class="hint">{{ action === 'delete' ? `確定刪除「${target?.name}」？此操作無法復原。` : `匯出此專案全部 ${features.length} 筆地圖標註。` }}</p>
      <label>管理員金鑰<input type="password" autocomplete="off" required :value="adminKey" @input="emit('update:adminKey',$event.target.value)" /></label>
      <p v-if="failure" class="error" role="alert">{{ failure }}</p>
      <div class="form-footer"><button type="button" :disabled="busy" @click="actionDialog.close()">取消</button><button :class="action === 'delete' ? 'danger-button' : 'primary'" :disabled="busy || !adminKey?.trim()">{{ busy ? '處理中…' : action === 'delete' ? '確認刪除' : '驗證並匯出' }}</button></div>
    </form>
  </dialog>
</template>

<style>
.annotations-control {padding:24px;font-size:12px;color:var(--ink);}
.annotations-control summary {cursor:pointer;font-weight:600;}
.annotations-control details[open] summary {margin-bottom:12px;}
.annotation-tools {display:flex;gap:4px;flex-wrap:wrap;}
.annotation-tools button,.annotation-tools .button {padding:4px 8px;font-size:12px;}
.annotation-tools button[aria-pressed="true"] {background:var(--accent);color:white;}
.annotation-hint,.drawing-progress {color:var(--muted);font-size:12px;line-height:20px;margin-top:8px;}
.drawing-progress .annotation-tools {margin-top:8px;}
.drawing-progress {position:absolute;z-index:600;left:16px;bottom:80px;max-width:calc(100% - 32px);padding:12px;background:var(--surface);border:1px solid var(--line);border-radius:8px;color:var(--ink);}
.import-geometry {position:relative;overflow:hidden;}
.import-geometry input {position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;}
.import-geometry:focus-within {outline:3px solid #dc9e3b;outline-offset:3px;}
.annotation-list {list-style:none;padding:0;margin:12px 0 0;}
.annotation-list li {display:flex;gap:4px;margin:4px 0;}
.annotation-list button {padding:4px 8px;font-size:12px;}
.annotation-list button:first-child {justify-content:flex-start;flex:1;min-width:0;overflow-wrap:anywhere;}
.annotation-kind {color:#547d99;font-weight:600;flex-shrink:0;}
.annotation-export {margin-top:8px;padding:4px 8px;font-size:12px;}
.import-summary {max-height:200px;overflow:auto;font-size:14px;}
.legend-annotation {background:#547d99;}
@media(max-width:540px){.annotations-control{padding:16px;}.drawing-progress{left:12px;bottom:80px;padding:8px;}}
</style>
