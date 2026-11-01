import { expect, test } from 'playwright/test';

for (const width of [360, 768, 1440]) {
  test(`model filters stay separated at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 });
    await page.route('**/api/picks/model-only?**', route => route.fulfill({ json: {
      date:'2026-11-01', policyVersion:2004, asOf:'2026-11-01T08:00:00Z', stale:false,
      locked:true, count:0, status:'NOT_ASSEMBLED', daily:[], forecasts:[], hasMore:false, summary:null,
    }}));
    await page.goto('/denni-vyber?date=2026-11-01', { waitUntil:'domcontentloaded' });
    // Wait for the client effect: native controls exist before React hydrates them.
    await expect(page.getByText('Konkrétní predikce jsou dostupné s PRO', { exact:false })).toBeVisible();
    await page.getByRole('combobox', { name:'Model', exact:true }).selectOption('MODEL_COMBINATION');
    await expect(page.getByRole('combobox', { name:'Model', exact:true })).toHaveValue('MODEL_COMBINATION');
    await page.getByRole('combobox', { name:'Verze', exact:true }).selectOption('2003');
    await page.getByRole('button', { name:'Všechny predikce', exact:true }).click();
    await expect(page.getByRole('button', { name:'Všechny predikce', exact:true })).toHaveAttribute('aria-pressed','true');
    const request=page.waitForRequest(r=>r.url().includes('/api/picks/model-only?')&&r.url().includes('sort=probability_asc'));
    await page.getByRole('combobox', { name:'Řazení', exact:true }).selectOption('probability_asc');
    await request;
    const boxes=await Promise.all(['Datum','Model','Verze','Řazení'].map(label=>(label==='Datum'?page.getByLabel(label,{exact:true}):page.getByRole('combobox',{name:label,exact:true})).boundingBox()));
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i]!,b=boxes[j]!;
      expect(a.width).toBeGreaterThan(100);
      expect(a.x+a.width<=b.x+1||b.x+b.width<=a.x+1||a.y+a.height<=b.y+1||b.y+b.height<=a.y+1).toBeTruthy();
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
    await page.screenshot({path:info.outputPath(`filters-${width}.png`),fullPage:true});
  });
}
