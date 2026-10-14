// Capture paused frames of one scene under several settings for side-by-side comparison.
// Usage: node scripts/capture.mjs <outDir> <scene> '<json list of setting objects>'
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';

const [out='artifacts/capture',scene='1',variants='[{}]']=process.argv.slice(2);
const server=await createServer({server:{host:'127.0.0.1',port:5175,strictPort:true}});
await server.listen();
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const errors=[];
await mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const slider=(id,v)=>page.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},String(v));
try{
  await page.goto('http://127.0.0.1:5175');
  await page.waitForFunction(()=>window.aureole?.state.ready);
  await page.keyboard.press(String(Number(scene)+1));
  await page.waitForFunction(s=>window.aureole.state.scene===s&&window.aureole.state.transition===1,Number(scene));
  await page.waitForTimeout(1500);
  await page.locator('#pause').click();
  await page.evaluate(()=>document.body.classList.add('cinema'));
  for(const [i,variant] of JSON.parse(variants).entries()){
    for(const [id,v] of Object.entries(variant))await slider(id,v);
    await page.waitForTimeout(1500);
    const name=Object.entries(variant).map(([k,v])=>`${k}${v}`).join('-')||`default${i}`;
    await page.screenshot({path:`${out}/scene${scene}-${name}.png`});
    console.log(name,'gpuMs',(await page.evaluate(()=>window.aureole.state.gpuMs))?.toFixed(2));
  }
}finally{
  console.log(errors.length?errors.join('\n'):'no console errors');
  await browser.close();await server.close();
}
