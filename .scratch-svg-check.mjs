import { chromium } from "playwright";
const shots = "C:\\Users\\MYPC~1\\AppData\\Local\\Temp\\claude\\d--Projects-hr-app-preethi\\79817d10-49be-445c-a2f4-17a18235c7a4\\scratchpad\\";
const browser = await chromium.launch();
const errors = [];

for (const scheme of ["dark", "light"]) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, colorScheme: scheme });
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${scheme}] ` + m.text()); });
  await page.goto("http://localhost:5173");
  await page.waitForSelector("text=Process Overview");
  await page.waitForTimeout(300);
  await page.screenshot({ path: shots + `svg-${scheme}-empty.png` });

  await page.fill('input[placeholder="e.g. Priya"]', "Priya");
  await page.fill('input[type="number"]', "5");
  await page.fill('input[placeholder="e.g. Family trip"]', "Family trip");
  await page.click('button:has-text("Submit Request")');
  await page.waitForSelector("text=Manager Review");
  await page.screenshot({ path: shots + `svg-${scheme}-waiting.png` });

  await page.click('button:has-text("Simulate timer expiry")');
  await page.waitForSelector("text=Escalated Review");
  await page.click('button:has-text("Reject")');
  await page.waitForSelector("text=Leave Rejected");
  await page.waitForTimeout(200);
  await page.screenshot({ path: shots + `svg-${scheme}-rejected.png` });

  await page.close();
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 700 }, colorScheme: "dark" });
mobile.on("console", (m) => { if (m.type() === "error") errors.push("[mobile] " + m.text()); });
await mobile.goto("http://localhost:5173");
await mobile.waitForSelector("text=Process Overview");
await mobile.waitForTimeout(300);
await mobile.screenshot({ path: shots + "svg-mobile.png" });
await mobile.close();

console.log("ERRORS:", JSON.stringify(errors));
await browser.close();
