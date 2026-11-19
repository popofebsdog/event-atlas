import {test,expect} from '@playwright/test';
const headers={Origin:'http://localhost:5174',Authorization:'Bearer local-development-only-not-for-production'};
test('both map levels show names without hover and shared event positions expose every record',async({page,request})=>{
  const projects=[];
  try{
    for(const [name,lat,lng] of [['名稱標註 A',24.2,121],['名稱標註 B',24.8,121.5]])projects.push(await request.post('http://localhost:8787/api/projects',{headers,data:{name,lat,lng}}).then(r=>r.json()));
    for(const [title,coordinates] of [['共同位置甲',{}],['共同位置乙',{}],['獨立位置丙',{lat:24.21,lng:121.01}]])await request.post(`http://localhost:8787/api/projects/${projects[0].id}/events`,{headers,data:{title,description:'名稱與位置驗收',occurred_at:'2026-11-19T01:00:00Z',...coordinates}});
    await page.route('**/tile.openstreetmap.org/**',r=>r.abort());await page.route('**/services.arcgisonline.com/**',r=>r.abort());
    await page.goto('/');
    await expect(page.getByRole('button',{name:'開啟專案：名稱標註 A',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'開啟專案：名稱標註 B',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'開啟專案：名稱標註 A',exact:true}).click();
    for(const title of ['共同位置甲','共同位置乙','獨立位置丙'])await expect(page.getByRole('button',{name:`閱讀事件：${title}`,exact:true})).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon[title="事件群組：2 筆"]')).toBeVisible();
    await page.getByRole('button',{name:'閱讀事件：共同位置乙',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'事件網頁閱讀區'}).getByRole('heading',{name:'共同位置乙',exact:true})).toBeVisible();
    const rows=await request.get(`http://localhost:8787/api/projects/${projects[0].id}/events`).then(r=>r.json());
    expect(rows.items.filter(e=>e.lat===null)).toHaveLength(2);
  }finally{for(const p of projects)await fetch(`http://localhost:8787/api/projects/${p.id}`,{method:'DELETE',headers});}
});
