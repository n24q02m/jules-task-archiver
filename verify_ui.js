const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const filePath = 'file://' + path.resolve('popup.html');
  await page.goto(filePath);
  await page.setViewportSize({ width: 400, height: 600 });
  await page.screenshot({ path: 'popup_verification.png', fullPage: true });
  console.log('Screenshot saved to popup_verification.png');
  await browser.close();
})();
