import {test,expect} from '@playwright/test';
const headers={Origin:'http://localhost:5174',Authorization:'Bearer local-development-only-not-for-production'};
test('annotations use clear filled symbols and information cards separate from chronological events',async({page,request})=>{
  const project=await request.post('http://localhost:8787/api/projects',{headers,data:{name:'標註資訊圖卡驗收',lat:24.204,lng:121.005}}).then(r=>r.json());
  try{
    await request.post(`http://localhost:8787/api/projects/${project.id}/events`,{headers,data:{title:'當日調查事件',description:'有事件時間的紀錄',occurred_at:'2026-11-19T01:00:00Z',lat:24.203,lng:121.004}});
    const created=await request.post(`http://localhost:8787/api/projects/${project.id}/features`,{headers,data:{geojson:{type:'FeatureCollection',features:[
      {type:'Feature',properties:{name:'觀測點',description:'獨立標註的參考位置'},geometry:{type:'Point',coordinates:[121.006,24.205]}},
      {type:'Feature',properties:{name:'調查線',description:'巡查路線標註'},geometry:{type:'LineString',coordinates:[[121.001,24.202],[121.005,24.204]]}},
      {type:'Feature',properties:{name:'調查面',description:'專案調查範圍'},geometry:{type:'Polygon',coordinates:[[[121,24.2],[121.01,24.2],[121.01,24.21],[121,24.2]]]}},
    ]}}}).then(r=>r.json());expect(created.items).toHaveLength(3);
    await page.route('**/tile.openstreetmap.org/**',r=>r.abort());await page.route('**/services.arcgisonline.com/**',r=>r.abort());
    await page.goto(`/#/projects/${project.id}`);
    const marker=page.locator('.leaflet-marker-icon[title="標註：觀測點"]');await expect(marker).toBeVisible();
    expect(await marker.locator('.annotation-point-symbol').evaluate(el=>{const s=getComputedStyle(el);return s.backgroundColor !== 'rgba(0, 0, 0, 0)' && el.offsetWidth>=24;})).toBe(true);
    await marker.click();
    const card=page.getByRole('article',{name:'標註資訊：觀測點',exact:true});await expect(card).toBeVisible();await expect(card.getByRole('heading',{name:'觀測點',exact:true})).toBeVisible();
    await expect(card.getByText('獨立標註的參考位置',{exact:true})).toBeVisible();await expect(card.getByText('24.20500, 121.00600',{exact:true})).toBeVisible();await expect(card.getByText('地圖標註 · 點',{exact:true})).toBeVisible();await expect(card.locator('time')).toHaveCount(0);
    await expect(page.getByRole('article',{name:'標註資訊：調查線',exact:true}).getByText(/2 個節點/)).toBeVisible();await expect(page.getByRole('article',{name:'標註資訊：調查面',exact:true}).getByText(/3 個頂點/)).toBeVisible();
    await page.setViewportSize({width:390,height:844});await expect(card).toBeVisible();await page.getByRole('button',{name:'地圖',exact:true}).click();await marker.click();await expect(card).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/annotation-cards-mobile.png'});
    await card.getByRole('button',{name:'定位標註：觀測點',exact:true}).click();await expect(page.locator('#map')).toBeVisible();
    await page.setViewportSize({width:1280,height:900});await page.getByRole('button',{name:'↖ 專案範圍',exact:true}).click();
    for(const type of ['LineString','Polygon']){
      await page.getByRole('button',{name:'事件',exact:true}).click();
      const shape=page.locator(`path.annotation-${type}`),box=await shape.boundingBox();
      await shape.click({position:type === 'Polygon' ? {x:box.width*.9,y:box.height*.2} : {x:box.width*.1,y:box.height*.9}});
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect(page.getByRole('button',{name:'地圖標註 3',exact:true})).toHaveAttribute('aria-pressed','true');
    }
    await page.screenshot({path:'test-results/annotation-cards-desktop.png'});
  }finally{await fetch(`http://localhost:8787/api/projects/${project.id}`,{method:'DELETE',headers});}
});
