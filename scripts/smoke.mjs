import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const server=await createServer({server:{host:'127.0.0.1',port:5174,strictPort:true}});
await server.listen();
// Reuse the installed browser; downloads, if requested later, must be project-local.
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const errors=[];
await mkdir('artifacts',{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'no-preference'});
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const snapshot=()=>page.evaluate(()=>window.aureole.state);
const slider=async(id,value)=>page.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},String(value));
try {
  await page.goto('http://127.0.0.1:5174');
  await page.waitForFunction(()=>window.aureole?.state.ready);
  const startingCamera=(await snapshot()).camera;
  await page.waitForTimeout(2500);
  assert.notDeepEqual((await snapshot()).camera,startingCamera,'Cinematic camera moves while running');
  const hardware=await page.evaluate(()=>{
    const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {userAgent:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  const profiles=[];
  for(let i=0;i<3;i++){
    await page.locator(`[data-scene="${i}"]`).click();
    await page.waitForFunction(i=>window.aureole.state.scene===i&&window.aureole.state.transition===1,i);
    await page.waitForTimeout(1800);
    const s=await snapshot();assert.equal(s.scene,i);assert(s.frames>0);
    assert.equal(s.count,2400000);assert.equal(s.drawnParticles,s.count,'Actual point draw matches selected density');assert.equal(s.particleAttributeBytes,0,'Particles generated on GPU without per-particle buffers');
    profiles.push({scene:i,fps:s.fps,count:s.count,gpuMs:s.gpuMs});
    await page.screenshot({path:`artifacts/desktop-${i}.png`});
  }
  await page.locator('#pause').click();
  const frozen=(await snapshot()).time;
  const frozenCamera=(await snapshot()).camera;
  await page.waitForTimeout(200);
  assert.equal((await snapshot()).time,frozen,'Pause freezes simulation time');
  assert((await snapshot()).camera.every((v,i)=>Math.abs(v-frozenCamera[i])<1e-8),'Pause holds the camera shot');
  await page.locator('#open-settings').click();
  await page.locator('#camera-motion').uncheck();assert.equal((await snapshot()).cameraMotion,false);
  for(const [id,value] of Object.entries({bloom:.4,exposure:1.3,focus:.8,focal:12,roughness:.5,glint:2.3,light:5,turbulence:1,speed:.4,assembly:.3,glitter:7,innerFlow:1.2})){
    await slider(id,value);assert.equal((await snapshot())[id],value);
  }
  await page.locator('#palette').selectOption('2');assert.equal((await snapshot()).palette,2);
  for(const count of [240000,1200000,4800000,2400000]){
    await page.locator('#quality').selectOption(String(count));
    await page.waitForFunction(count=>window.aureole.state.drawnParticles===count,count);
    assert.equal((await snapshot()).count,count);
  }
  await page.locator('#reset').click();assert.equal((await snapshot()).assembly,.82);assert.equal((await snapshot()).palette,0);
  await page.screenshot({path:'artifacts/desktop-controls.png'});
  await page.locator('#close-settings').click();
  await page.locator('[data-scene="1"]').click();assert.equal((await snapshot()).scene,1,'Paused navigation works');
  await page.locator('#open-settings').click();
  await page.locator('#assemble').click();assert.equal((await snapshot()).assembly,0);
  await page.locator('#assemble').click();assert.equal((await snapshot()).assembly,1);
  await slider('focus',0);await page.waitForTimeout(100);const sharp=await page.locator('#stage').screenshot();
  await slider('focus',1);await slider('focal',8);await page.waitForTimeout(100);const defocused=await page.locator('#stage').screenshot();
  assert.notDeepEqual(sharp,defocused,'Focus and aperture change the rendered image');
  await page.screenshot({path:'artifacts/desktop-dof.png'});
  await slider('focal',16);await slider('focus',.45);
  await slider('glint',0);await page.waitForTimeout(100);const matte=await page.locator('#stage').screenshot();
  await slider('glint',4);await page.waitForTimeout(100);const glitter=await page.locator('#stage').screenshot();
  assert.notDeepEqual(matte,glitter,'Glint control changes the rendered image');
  await page.locator('#reset').click();await page.locator('#close-settings').click();
  await page.locator('#cinema').click();assert(await page.locator('#restore').isVisible());
  await page.keyboard.press('h');assert(await page.locator('#interface').isVisible());
  const downloadPromise=page.waitForEvent('download');await page.locator('#capture').click();
  const download=await downloadPromise;await download.saveAs('artifacts/export.png');assert.equal(download.suggestedFilename(),'aureole-relic.png');
  await page.locator('#tour').click();assert.equal((await snapshot()).tour,true);assert.equal((await snapshot()).paused,false);
  await page.locator('#tour').click();
  const stillCamera=(await snapshot()).camera;
  await page.waitForTimeout(250);
  assert((await snapshot()).camera.every((v,i)=>Math.abs(v-stillCamera[i])<1e-8),'Camera drift off holds shot while particles keep moving');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForTimeout(100);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>window.aureole.state.paused);assert.equal((await snapshot()).paused,true);
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-scene="0"]').click();
  await page.waitForTimeout(3600);
  await page.screenshot({path:'artifacts/mobile.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.locator('#open-settings').click();await page.screenshot({path:'artifacts/mobile-controls.png'});
  assert(await page.locator('#close-settings').isVisible());
  assert.deepEqual(errors,[],'No browser or shader errors');

  const quiet=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await quiet.goto('http://127.0.0.1:5174');await quiet.waitForFunction(()=>window.aureole?.state.ready);
  assert(await quiet.evaluate(()=>window.aureole.state.paused&&!window.aureole.state.cameraMotion&&window.aureole.state.count===1200000),'Mobile starts in balanced detail and honors reduced motion');
  await quiet.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await quiet.getByText('The light needs a little help.').waitFor();
  await quiet.close();

  const unsupported=await browser.newPage();
  await unsupported.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:original.call(this,type,...args);};});
  await unsupported.goto('http://127.0.0.1:5174');await unsupported.getByText('The light needs a little help.').waitFor();
  assert(await unsupported.getByRole('button',{name:'Try again'}).isVisible(),'WebGL failure has a recovery action');
  await unsupported.close();
  await writeFile('artifacts/performance.json',JSON.stringify({hardware,viewport:{width:1440,height:900},profiles,errors},null,2));
  console.log(JSON.stringify({result:'passed',profiles,hardware},null,2));
}finally{await browser.close();await server.close();}
