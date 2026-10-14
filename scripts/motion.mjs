// Temporal stability check: pause, step simulation time one 60 fps frame at a
// time, and measure brightness that changes non-linearly between frames.
// 8×8 block means cancel edge motion; the second difference removes steady
// drift, so what remains is blinking.
// Usage: node scripts/motion.mjs [scene=0] [frames=12]
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const [scene='0',count='12']=process.argv.slice(2);
const server=await createServer({server:{host:'127.0.0.1',port:5176,strictPort:true}});
await server.listen();
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
try{
  await page.goto('http://127.0.0.1:5176');
  await page.waitForFunction(()=>window.aureole?.state.ready);
  await page.keyboard.press(String(Number(scene)+1));
  await page.waitForFunction(s=>window.aureole.state.scene===s&&window.aureole.state.transition===1,Number(scene));
  await page.evaluate(()=>{document.body.classList.add('cinema');const c=document.getElementById('camera-motion');c.checked=false;c.dispatchEvent(new Event('change'));});
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  const blocks=[];
  for(let i=0;i<Number(count);i++){
    await page.evaluate(()=>window.aureole.step(1));
    await page.waitForTimeout(120);
    const png=(await page.screenshot()).toString('base64');
    blocks.push(await page.evaluate(async png=>{
      const image=await createImageBitmap(await (await fetch('data:image/png;base64,'+png)).blob());
      const canvas=new OffscreenCanvas(image.width,image.height),context=canvas.getContext('2d');
      context.drawImage(image,0,0);
      const {data,width,height}=context.getImageData(0,0,image.width,image.height);
      const bw=width>>3,bh=height>>3,out=new Array(bw*bh).fill(0);
      for(let y=0;y<bh*8;y++)for(let x=0;x<bw*8;x++){const i=(y*width+x)*4;out[(y>>3)*bw+(x>>3)]+=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/64;}
      return out;
    },png));
  }
  let blink=0,luma=0;const peaks=[];
  for(let i=1;i<blocks.length-1;i++){
    const d=blocks[i].map((v,k)=>Math.abs(v-(blocks[i-1][k]+blocks[i+1][k])/2));
    blink+=d.reduce((a,b)=>a+b)/d.length;peaks.push(d.sort((a,b)=>a-b)[Math.floor(d.length*.999)]);
  }
  for(const b of blocks)luma+=b.reduce((a,v)=>a+v)/b.length;
  blink/=blocks.length-2;luma/=blocks.length;
  console.log(JSON.stringify({scene:Number(scene),meanLuma:+luma.toFixed(2),blink:+blink.toFixed(4),blinkPerMilleOfLuma:+(blink/luma*1000).toFixed(2),blinkP999:+(peaks.reduce((a,b)=>a+b)/peaks.length).toFixed(2)}));
}finally{await browser.close();await server.close();}
