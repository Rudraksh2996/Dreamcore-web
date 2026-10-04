import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2' });
  
  // Click to enter
  await page.click('div');
  await new Promise(r => setTimeout(r, 1000));
  
  console.log("Starting 30s walk test...");
  
  // Press W
  await page.keyboard.down('KeyW');
  
  for (let i = 0; i < 30; i++) {
     await new Promise(r => setTimeout(r, 1000));
     const debug = await page.evaluate(() => {
        const el = document.querySelector('div[style*="z-index: 100"]');
        return el ? el.innerText.split('\n') : null;
     });
     console.log(`[Second ${i+1}] ${debug ? debug.join(' | ') : 'No debug overlay'}`);
  }
  
  await page.keyboard.up('KeyW');
  await browser.close();
})();
