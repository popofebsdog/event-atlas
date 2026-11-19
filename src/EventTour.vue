<script setup>
import {computed} from 'vue';
import {formatEventTime} from './timeline';
const props=defineProps({events:Array,currentId:String,overview:Boolean,reader:Boolean});
const emit=defineEmits(['select','overview','read']);
const index=computed(()=>props.events.findIndex(event=>event.id === props.currentId));
const current=computed(()=>props.events[index.value]);
function step(direction){const next=index.value<0 ? 0 : index.value+direction;if(next>=0 && next<props.events.length)emit('select',props.events[next].id);}
</script>

<template>
  <section class="event-tour" :class="{'event-tour-reader':reader}" :aria-label="reader ? '閱讀時間導覽' : '事件時間導覽'">
    <div class="event-tour-heading"><strong v-if="!reader">時間導覽</strong><span v-if="current" role="status">第 {{ index+1 }} / {{ events.length }} 筆</span><span v-else>共 {{ events.length }} 筆 · 由舊到新</span></div>
    <div v-if="!reader" class="event-tour-summary" aria-live="polite">
      <template v-if="current"><div class="event-tour-time"><time :datetime="current.occurred_at">{{ formatEventTime(current.occurred_at) }}</time><small v-if="current.lat == null">沿用地區座標</small></div><strong :title="current.title">{{ current.title }}</strong></template>
      <p v-else>依時間順序，逐筆查看事件位置與內容。</p>
    </div>
    <div class="event-tour-actions">
      <button aria-label="上一筆事件" :disabled="index <= 0" @click="step(-1)">← 上一筆</button>
      <button class="primary" :aria-label="index<0 ? '開始時間導覽' : '下一筆事件'" :disabled="index === events.length-1" @click="step(1)">{{ index<0 ? '開始導覽' : '下一筆 →' }}</button>
      <button aria-label="鳥瞰事件" :aria-pressed="overview" title="顯示目前時間軸上的全部事件位置" @click="emit('overview')">鳥瞰事件</button>
      <button v-if="!reader" aria-label="閱讀目前事件" :disabled="!current" @click="emit('read',current)">閱讀內容</button>
    </div>
  </section>
</template>

<style scoped>
.event-tour {padding:12px 16px;display:grid;gap:8px;flex-shrink:0;background:var(--surface);color:var(--ink);}
.event-tour-heading {display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;line-height:16px;color:var(--muted);}
.event-tour-heading strong {font-weight:600;color:var(--accent);}
.event-tour-summary {min-height:44px;display:flex;flex-direction:column;justify-content:center;gap:4px;min-width:0;}
.event-tour-time {display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;line-height:16px;color:var(--muted);}
.event-tour-time small {font-size:12px;}
.event-tour-summary strong {font-size:14px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.event-tour-summary p {font-size:14px;line-height:20px;color:var(--muted);}
.event-tour-actions {display:flex;flex-wrap:wrap;gap:8px;}
.event-tour-actions button {font-size:12px;line-height:20px;padding:4px 8px;min-height:44px;}
.event-tour-actions button:disabled {cursor:default;}
.event-tour-actions button[aria-pressed="true"] {background:var(--tint);border-color:var(--accent);color:var(--accent);}
.event-tour-reader {padding:0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;}
@media(max-width:540px){.event-tour{padding:12px;}.event-tour-reader{padding:0;}}
</style>
