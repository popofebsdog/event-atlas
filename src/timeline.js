export function filterEvents(events, {category = '', from = '', to = ''} = {}) {
  return events.filter(event => {
    const date = new Date(Date.parse(event.occurred_at) + 8 * 3600000).toISOString().slice(0,10);
    return (!category || (event.category || 'other') === category) && (!from || date >= from) && (!to || date <= to);
  });
}
export function chronologicalEvents(events){
  return [...events].sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at) || (a.created_at || '').localeCompare(b.created_at || '') || String(a.id).localeCompare(String(b.id)));
}
export function formatEventTime(value){
  return new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
}
