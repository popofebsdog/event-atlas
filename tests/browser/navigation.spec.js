import {test,expect} from '@playwright/test';
const headers={Origin:'http://localhost:5174',Authorization:'Bearer local-development-only-not-for-production'};
test('resizing the overview then entering a project removes the old map view listener',async({page,request})=>{
  const project=await request.post('http://localhost:8787/api/projects',{headers,data:{name:'總覽尺寸切換測試',lat:24.4,lng:121.3}}).then(r=>r.json());
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setViewportSize({width:390,height:844});
    await page.route('**/tile.openstreetmap.org/**',r=>r.abort());await page.route('**/services.arcgisonline.com/**',r=>r.abort());
    await page.goto('/');await page.locator(`[data-project-id="${project.id}"]`).waitFor();
    await page.setViewportSize({width:1440,height:1000});
    // The resize frame schedules Leaflet's debounced moveend 200ms later.
    await page.waitForTimeout(40);
    await page.locator(`[data-project-id="${project.id}"]`).click();
    await expect(page.locator('#map')).toBeVisible();await page.waitForTimeout(250);
    expect(errors).toEqual([]);
  }finally{await fetch(`http://localhost:8787/api/projects/${project.id}`,{method:'DELETE',headers});}
});
test('returning during a map zoom does not execute animation callbacks after the map is removed',async({page,request})=>{
  const project=await request.post('http://localhost:8787/api/projects',{headers,data:{name:'縮放切換測試',lat:24,lng:121}}).then(r=>r.json());
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await request.post(`http://localhost:8787/api/projects/${project.id}/features`,{headers,data:{geojson:{type:'Feature',properties:{name:'可定位測試點'},geometry:{type:'Point',coordinates:[121.002,24]}}}});
    await page.route('**/tile.openstreetmap.org/**',r=>r.abort());await page.route('**/services.arcgisonline.com/**',r=>r.abort());
    await page.goto(`/#/projects/${project.id}`);await page.getByRole('button',{name:'地圖標註 1',exact:true}).click();
    await page.getByRole('button',{name:'定位標註：可定位測試點'}).click();await page.getByRole('button',{name:'所有地區專案',exact:true}).click();
    await expect(page.locator('#overview-map')).toBeVisible();
    // Leaflet's zoom completion callback runs 250ms after the transition starts.
    await page.waitForTimeout(350);
    expect(errors).toEqual([]);
  }finally{await fetch(`http://localhost:8787/api/projects/${project.id}`,{method:'DELETE',headers});}
});
test('creating a region from the overview previews coordinates and opens its project workspace',async({page,request})=>{
  let created;
  try{
    await page.route('**/tile.openstreetmap.org/**',r=>r.abort());await page.route('**/services.arcgisonline.com/**',r=>r.abort());
    await page.goto('/');
    await page.getByRole('button',{name:'＋ 建立地區專案',exact:true}).click();
    await page.getByLabel('緯度 Latitude').fill('24.5');await page.getByLabel('經度 Longitude').fill('121.2');
    await page.getByRole('button',{name:'定位座標',exact:true}).click();
    const dialog=page.locator('dialog[open]');
    await expect(page.getByLabel('座標定位預覽')).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await page.getByLabel('地區名稱',{exact:true}).fill('總覽建立地區測試');
    await dialog.getByLabel('管理員金鑰',{exact:true}).fill('local-development-only-not-for-production');
    const response=page.waitForResponse(r=>r.url().endsWith('/api/projects') && r.request().method()==='POST');
    await page.getByRole('button',{name:'儲存並公開',exact:true}).click();created=await(await response).json();
    await expect(page).toHaveURL(new RegExp(`#/projects/${created.id}$`));
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.getByRole('heading',{name:'總覽建立地區測試',exact:true})).toBeVisible();
  }finally{if(created?.id)await request.delete(`http://localhost:8787/api/projects/${created.id}`,{headers});}
});
test('overview and project maps are separate, deep links survive reload and history stays isolated',async({page,request})=>{
  const projects=[];
  try{
    for(const [name,lat] of [['兩層測試 A',24],['兩層測試 B',25]]){
      const p=await request.post('http://localhost:8787/api/projects',{headers,data:{name,lat,lng:121}}).then(r=>r.json());projects.push(p);
      await request.post(`http://localhost:8787/api/projects/${p.id}/events`,{headers,data:{title:`${name}事件`,description:'',occurred_at:'2026-11-19T04:00:00Z',lat,lng:121.01}});
      await request.post(`http://localhost:8787/api/projects/${p.id}/features`,{headers,data:{geojson:{type:'Feature',properties:{name:`${name}標註`},geometry:{type:'Point',coordinates:[121.02,lat]}}}});
    }
    const inherited=await request.post(`http://localhost:8787/api/projects/${projects[0].id}/events`,{headers,data:{title:'沿用地點舊事件',description:'',occurred_at:'2026-11-19T03:00:00Z'}}).then(r=>r.json());
    await page.route('**/tile.openstreetmap.org/**',r=>r.abort());await page.route('**/services.arcgisonline.com/**',r=>r.abort());
    await page.goto('/');
    await expect(page.locator('#overview-map')).toBeVisible();
    await expect(page.locator('#map')).toHaveCount(0);
    await expect(page.locator('.leaflet-marker-icon[title="兩層測試 A"]')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon[title="事件：兩層測試 A事件"]')).toHaveCount(0);
    await page.getByRole('button',{name:/● 兩層測試 A/}).click();
    await expect(page).toHaveURL(new RegExp(`#/projects/${projects[0].id}$`));
    await expect(page.locator('#overview-map')).toHaveCount(0);
    await expect(page.locator('.leaflet-marker-icon[title="事件：兩層測試 A事件"]')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon[title="事件：沿用地點舊事件"]')).toBeVisible();
    expect(inherited.lat).toBeNull();
    await expect(page.locator('.leaflet-marker-icon[title="兩層測試 B"]')).toHaveCount(0);
    await expect(page.getByRole('button',{name:/兩層測試 B事件.*查看紀錄/})).toHaveCount(0);
    await page.getByRole('button',{name:'＋ 新增事件',exact:true}).click();
    await page.getByLabel('事件名稱',{exact:true}).fill('不應留下的草稿');
    await page.goBack();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('#overview-map')).toBeVisible();
    await page.goForward();
    await page.reload();
    await expect(page.getByRole('button',{name:/兩層測試 A事件.*查看紀錄/})).toBeVisible();
    await page.getByRole('button',{name:'所有地區專案',exact:true}).click();
    await expect(page.locator('#overview-map')).toBeVisible();
    await page.getByRole('button',{name:/● 兩層測試 B/}).click();
    await expect(page.getByRole('button',{name:/兩層測試 B事件.*查看紀錄/})).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon[title="事件：兩層測試 A事件"]')).toHaveCount(0);
    await page.goBack();await expect(page.locator('#overview-map')).toBeVisible();
    await page.goForward();await expect(page.getByRole('button',{name:/兩層測試 B事件.*查看紀錄/})).toBeVisible();
    await page.getByLabel('顯示事件圖層').uncheck();
    await expect(page.locator('.leaflet-marker-icon[title="事件：兩層測試 B事件"]')).toHaveCount(0);
    expect(await page.locator('.annotation-layer').count()).toBe(1);
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'時間軸',exact:true}).click();
    await expect(page.getByRole('button',{name:/兩層測試 B事件.*查看紀錄/})).toBeVisible();
    await page.getByRole('button',{name:'地圖',exact:true}).click();
    await expect(page.locator('#map')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.goto('/#/projects/missing-project');
    await expect(page.getByRole('heading',{name:'找不到地區專案'})).toBeVisible();
    await page.getByRole('button',{name:'所有地區專案',exact:true}).click();
    await expect(page.locator('#overview-map')).toBeVisible();
  }finally{for(const p of projects)await request.delete(`http://localhost:8787/api/projects/${p.id}`,{headers});}
});
test('a delayed event save does not navigate back or insert its record into another project',async({page,request})=>{
  const projects=[];let release;
  const gate=new Promise(resolve=>release=resolve);
  try{
    for(const name of ['延遲儲存 A','延遲儲存 B'])projects.push(await request.post('http://localhost:8787/api/projects',{headers,data:{name,lat:24,lng:121}}).then(r=>r.json()));
    await page.route('**/tile.openstreetmap.org/**',r=>r.abort());await page.route('**/services.arcgisonline.com/**',r=>r.abort());
    let arrived;const intercepted=new Promise(resolve=>arrived=resolve);
    await page.route(`**/projects/${projects[0].id}/events`,async route=>{if(route.request().method()==='POST'){arrived();await gate;}await route.continue();});
    await page.goto(`/#/projects/${projects[0].id}`);
    await page.getByRole('button',{name:'＋ 新增事件',exact:true}).click();
    await page.getByLabel('事件名稱',{exact:true}).fill('留在 A 的事件');await page.getByLabel('事件時間（臺灣 UTC+8）').fill('2026-11-19T15:00');
    await page.locator('dialog[open]').getByLabel('管理員金鑰',{exact:true}).fill('local-development-only-not-for-production');
    await page.getByRole('button',{name:'儲存並公開',exact:true}).click();await intercepted;
    await page.evaluate(id=>window.location.hash=`/projects/${id}`,projects[1].id);
    await expect(page.getByRole('heading',{name:'延遲儲存 B',exact:true})).toBeVisible();
    const completed=page.waitForResponse(r=>r.url().includes(`/projects/${projects[0].id}/events`) && r.request().method()==='POST');release();await completed;
    await expect(page.locator('.project-workspace')).toHaveAttribute('aria-busy','false');
    await expect(page).toHaveURL(new RegExp(`#/projects/${projects[1].id}$`));
    await expect(page.getByRole('button',{name:/留在 A 的事件.*查看紀錄/})).toHaveCount(0);
    const saved=await request.get(`http://localhost:8787/api/projects/${projects[0].id}/events`).then(r=>r.json());expect(saved.items).toHaveLength(1);
  }finally{release();for(const p of projects)await request.delete(`http://localhost:8787/api/projects/${p.id}`,{headers});}
});
test('photos being prepared in one project cannot enter a new form after navigation',async({page,request})=>{
  const projects=[];
  try{
    for(const name of ['照片處理 A','照片處理 B'])projects.push(await request.post('http://localhost:8787/api/projects',{headers,data:{name,lat:24,lng:121}}).then(r=>r.json()));
    await page.addInitScript(()=>{
      const decode=window.createImageBitmap;
      const gate=new Promise(resolve=>window.releasePhotoPreparation=resolve);
      window.createImageBitmap=async(...args)=>{await gate;return decode(...args);};
    });
    await page.route('**/tile.openstreetmap.org/**',r=>r.abort());await page.route('**/services.arcgisonline.com/**',r=>r.abort());
    await page.goto(`/#/projects/${projects[0].id}`);await page.getByRole('button',{name:'＋ 新增事件',exact:true}).click();
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=30;c.getContext('2d').fillRect(0,0,40,30);return c.toDataURL().split(',')[1];});
    await page.getByLabel('上傳照片（最多 5 張）').setInputFiles({name:'pending.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await expect(page.getByText('正在處理照片…')).toBeVisible();
    await page.evaluate(id=>window.location.hash=`/projects/${id}`,projects[1].id);
    await page.getByRole('button',{name:'＋ 新增事件',exact:true}).click();
    await expect(page.getByLabel('所屬地區專案')).toHaveValue(projects[1].id);
    await page.evaluate(()=>window.releasePhotoPreparation());
    await expect(page.getByText('正在處理照片…')).toHaveCount(0);
    await expect(page.locator('.photo-thumbnails img')).toHaveCount(0);
  }finally{for(const p of projects)await fetch(`http://localhost:8787/api/projects/${p.id}`,{method:'DELETE',headers});}
});
