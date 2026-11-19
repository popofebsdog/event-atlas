import {test,expect} from '@playwright/test';
const headers={Origin:'http://localhost:5174',Authorization:'Bearer local-development-only-not-for-production'};
test('text-only coordinate events reveal their record details without opening an empty media reader',async({page,request})=>{
  const project=await request.post('http://localhost:8787/api/projects',{headers,data:{name:'文字事件閱讀測試',lat:24,lng:121}}).then(r=>r.json());
  try{
    await request.post(`http://localhost:8787/api/projects/${project.id}/events`,{headers,data:{title:'只有文字與座標',description:'這是需要直接閱讀的現地調查內容',source:'測試紀錄來源',lat:24.1,lng:121.1,occurred_at:'2026-11-19T01:00:00Z'}});
    await page.route('**/tile.openstreetmap.org/**',r=>r.abort());await page.route('**/services.arcgisonline.com/**',r=>r.abort());
    await page.goto(`/#/projects/${project.id}`);await page.getByRole('button',{name:/只有文字與座標.*查看紀錄/}).click();
    const reader=page.getByRole('dialog',{name:'事件網頁閱讀區'});
    await expect(reader.getByText('這是需要直接閱讀的現地調查內容',{exact:true})).toBeVisible();
    await expect(reader.getByText('資料來源：測試紀錄來源',{exact:true})).toBeVisible();
    await expect(reader.getByText('24.10000, 121.10000',{exact:true})).toBeVisible();
    await expect(reader.locator('iframe')).toHaveCount(0);
  }finally{await fetch(`http://localhost:8787/api/projects/${project.id}`,{method:'DELETE',headers});}
});
test('photo and website use separate panes; web keeps height and can expand without reloading',async({page,request})=>{
  const p=await request.post('http://localhost:8787/api/projects',{headers,data:{name:'閱讀區版面測試',lat:24,lng:121}});
  const project=await p.json();
  try {
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=';
    const saved=await request.post(`http://localhost:8787/api/projects/${project.id}/events`,{headers,data:{title:'照片加網站測試',description:'內容',occurred_at:'2026-11-19T06:35:00Z',url:'https://example.com/story',photos:[png]}});
    expect(saved.status()).toBe(201);
    let loads=0;
    await page.route('https://example.com/story',route=>{loads++;return route.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>完整網頁內容</h1><div style="height:1800px">長頁面測試</div>'});});
    await page.route('**/tile.openstreetmap.org/**',r=>r.abort());
    await page.route('**/services.arcgisonline.com/**',r=>r.abort());
    await page.goto('/');
    await page.getByRole('button',{name:/● 閱讀區版面測試/}).click();
    await page.getByRole('button',{name:/照片加網站測試.*查看紀錄/}).click();
    await expect(page.frameLocator('iframe').getByRole('heading',{name:'完整網頁內容'})).toBeVisible();
    await expect(page.getByAltText('照片加網站測試・照片 1')).toHaveCount(0);
    expect((await page.locator('iframe').boundingBox()).height).toBeGreaterThan(500);
    const width=(await page.locator('.reader-dialog').boundingBox()).width;
    expect(width).toBeCloseTo(1280*.75,0);
    await page.getByRole('button',{name:'展開閱讀區'}).click();
    expect((await page.locator('.reader-dialog').boundingBox()).width).toBeCloseTo(1280,0);
    expect(loads).toBe(1);
    await page.getByRole('button',{name:'照片（1）',exact:true}).click();
    await expect(page.getByAltText('照片加網站測試・照片 1')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.getByRole('button',{name:'網頁',exact:true}).click();
    await expect(page.frameLocator('iframe').getByRole('heading',{name:'完整網頁內容'})).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    expect((await page.locator('iframe').boundingBox()).height).toBeGreaterThan(400);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/reader-mobile.png'});
  } finally {await request.delete(`http://localhost:8787/api/projects/${project.id}`,{headers});}
});
