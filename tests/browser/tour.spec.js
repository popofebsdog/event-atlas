import {test,expect} from '@playwright/test';
const headers={Origin:'http://localhost:5174',Authorization:'Bearer local-development-only-not-for-production'};
async function fixture(request,inherit=false,longTitles=false){
  const project=await request.post('http://localhost:8787/api/projects',{headers,data:{name:'時間導覽驗收',lat:24.204,lng:121.005}}).then(r=>r.json());
  const events={};
  for(const [title,time,category,position] of [['處置完成','05:30','engineering',[24.194,120.9975]],['起始觀測','01:00','rainfall',inherit ? null : [24.2105,121.007]],['現地複查','02:30','survey',inherit ? null : [24.202,121.0185]]]){
    const r=await request.post(`http://localhost:8787/api/projects/${project.id}/events`,{headers,data:{title:longTitles ? `${title}：現地觀測與處置紀錄（示範）` : title,description:`${title}的事件內容`,occurred_at:`2026-11-19T${time}:00Z`,category,...(position?{lat:position[0],lng:position[1]}:{})}});expect(r.status()).toBe(201);events[title]=await r.json();
  }
  return {project,events};
}
async function open(page,project){
  await page.route('**/tile.openstreetmap.org/**',r=>r.abort());await page.route('**/services.arcgisonline.com/**',r=>r.abort());
  await page.goto(`/#/projects/${project.id}`);
}
async function centered(page,title){
  await expect.poll(async()=>{
    const map=await page.locator('#map').boundingBox(),point=await page.locator(`.leaflet-marker-icon[title="事件：${title}"]`).boundingBox();
    return map && point ? Math.hypot(point.x+point.width/2-map.x-map.width/2,point.y+point.height/2-map.y-map.height/2) : 9999;
  }).toBeLessThan(4);
}
test('manual chronological tour links map focus, timeline cards, overview and reader navigation',async({page,request})=>{
  const {project,events}=await fixture(request),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await open(page,project);
    await expect(page.locator('.timeline .event-card h3')).toHaveText(['1起始觀測','2現地複查','3處置完成']);
    const guide=page.getByRole('region',{name:'事件時間導覽',exact:true});
    await guide.getByRole('button',{name:'開始時間導覽',exact:true}).click();
    await expect(guide.getByText('第 1 / 3 筆',{exact:true})).toBeVisible();await expect(guide.getByRole('button',{name:'上一筆事件',exact:true})).toBeDisabled();await centered(page,'起始觀測');
    await expect(page.locator(`[data-event-id="${events['起始觀測'].id}"] .event-card`)).toHaveClass(/chosen/);
    await guide.getByRole('button',{name:'下一筆事件',exact:true}).click();await expect(guide.getByText('第 2 / 3 筆',{exact:true})).toBeVisible();await centered(page,'現地複查');
    await guide.getByRole('button',{name:'鳥瞰事件',exact:true}).click();await expect(guide.getByRole('button',{name:'鳥瞰事件',exact:true})).toHaveAttribute('aria-pressed','true');await expect(guide.getByText('第 2 / 3 筆',{exact:true})).toBeVisible();
    for(const title of Object.keys(events))await expect(page.locator(`.leaflet-marker-icon[title="事件：${title}"]`)).toBeInViewport();
    await guide.getByRole('button',{name:'下一筆事件',exact:true}).click();await expect(guide.getByText('第 3 / 3 筆',{exact:true})).toBeVisible();await expect(guide.getByRole('button',{name:'下一筆事件',exact:true})).toBeDisabled();
    await guide.getByRole('button',{name:'上一筆事件',exact:true}).click();await guide.getByRole('button',{name:'閱讀目前事件',exact:true}).click();
    const reader=page.getByRole('dialog',{name:'事件網頁閱讀區'}),readerGuide=reader.getByRole('region',{name:'閱讀時間導覽',exact:true});
    await expect(reader.getByRole('heading',{name:'現地複查',exact:true})).toBeVisible();await readerGuide.getByRole('button',{name:'下一筆事件',exact:true}).click();await expect(reader.getByRole('heading',{name:'處置完成',exact:true})).toBeVisible();
    await readerGuide.getByRole('button',{name:'鳥瞰事件',exact:true}).click();await expect(reader).not.toBeVisible();await expect(page.locator('#map')).toBeVisible();
    expect(errors).toEqual([]);
  }finally{await fetch(`http://localhost:8787/api/projects/${project.id}`,{method:'DELETE',headers});}
});
test('tour keeps shared-coordinate events separate in time and respects filters without inventing locations',async({page,request})=>{
  const {project}=await fixture(request,true),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await open(page,project);const guide=page.getByRole('region',{name:'事件時間導覽',exact:true});
    await guide.getByRole('button',{name:'開始時間導覽',exact:true}).click();await expect(guide.getByText('起始觀測',{exact:true})).toBeVisible();await expect(guide.getByText('沿用地區座標',{exact:true})).toBeVisible();
    await guide.getByRole('button',{name:'下一筆事件',exact:true}).click();await expect(guide.getByText('現地複查',{exact:true})).toBeVisible();await expect(page.locator('.event-pin.focused.shared')).toHaveCount(1);
    await page.getByText('篩選紀錄',{exact:true}).click();await page.locator('.timeline-filters').getByLabel('事件類型').selectOption('engineering');
    await expect(guide.getByRole('button',{name:'開始時間導覽',exact:true})).toBeVisible();await guide.getByRole('button',{name:'開始時間導覽',exact:true}).click();await expect(guide.getByText('第 1 / 1 筆',{exact:true})).toBeVisible();
    await guide.getByRole('button',{name:'鳥瞰事件',exact:true}).click();await centered(page,'處置完成');
    await page.getByRole('button',{name:'清除篩選',exact:true}).click();await expect(guide.getByText('第 3 / 3 筆',{exact:true})).toBeVisible();
    const saved=await request.get(`http://localhost:8787/api/projects/${project.id}/events`).then(r=>r.json());expect(saved.items.filter(e=>e.lat === null)).toHaveLength(2);expect(errors).toEqual([]);
  }finally{await fetch(`http://localhost:8787/api/projects/${project.id}`,{method:'DELETE',headers});}
});
test('mobile tour stays accessible, synchronizes the timeline and resets on project navigation',async({page,request})=>{
  const {project,events}=await fixture(request,false,true);
  try{
    await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await open(page,project);
    const guide=page.getByRole('region',{name:'事件時間導覽',exact:true});await guide.getByRole('button',{name:'開始時間導覽',exact:true}).click();await guide.getByRole('button',{name:'下一筆事件',exact:true}).click();await centered(page,events['現地複查'].title);
    await page.getByRole('button',{name:'時間軸',exact:true}).click();await expect(page.locator(`[data-event-id="${events['現地複查'].id}"] .event-card`)).toHaveClass(/chosen/);
    await page.getByRole('button',{name:'地圖',exact:true}).click();await expect(guide.getByText('第 2 / 3 筆',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await guide.getByRole('button',{name:'鳥瞰事件',exact:true}).click();await page.screenshot({path:'test-results/time-tour-mobile.png'});
    for(const event of Object.values(events))await expect(page.getByRole('button',{name:`閱讀事件：${event.title}`,exact:true})).toBeInViewport({ratio:1});
    await page.getByRole('button',{name:'所有地區專案',exact:true}).click();await page.locator(`[data-project-id="${project.id}"]`).click();await expect(guide.getByRole('button',{name:'開始時間導覽',exact:true})).toBeVisible();
  }finally{await fetch(`http://localhost:8787/api/projects/${project.id}`,{method:'DELETE',headers});}
});
