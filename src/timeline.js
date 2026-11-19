export function filterEvents(events, {category = '', from = '', to = ''} = {}) {
  return events.filter(event => {
    const date = new Date(Date.parse(event.occurred_at) + 8 * 3600000).toISOString().slice(0,10);
    return (!category || (event.category || 'other') === category) && (!from || date >= from) && (!to || date <= to);
  });
}
