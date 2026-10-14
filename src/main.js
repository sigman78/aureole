import '@fontsource-variable/manrope';
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { StableBloomPass } from './stable-bloom.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadSculpture, surfaceAtlas, makeParticles } from './geometry.js';
import { particleVertex, particleFragment, finishShader, patchMetal, dissolveShadowMaterial } from './shaders.js';
import { GpuTimer } from './gpu-timer.js';
import { DepthOfFieldPass } from './depth-of-field.js';
import { CameraMotion } from './camera-motion.js';
import { TemporalAAPass } from './temporal-aa.js';
import { SparklePass } from './sparkle-pass.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 800px)').matches;
const defaults = { stabilization:.65, bloom:1.4, exposure:1.3, focus:.7, turbulence:.55, speed:.6, assembly:.82, roughness:.28, glint:2.2, light:-4, focal:15, glitter:6, innerFlow:.7 };
const state = { ...defaults, antialias:true, cameraMotion:!reducedMotion.matches, scene:0, time:0, paused:reducedMotion.matches, tour:false, palette:0, count:mobile?1200000:2400000, drawnParticles:0, gpuMs:null, frames:0, fps:0, transition:1, target:0, assemblyTarget:null, ready:false };
const titles = ['The current','The relic','Continuum'];
const descriptions = ['A river of light, finding its own way.','Between what remains and what becomes.','A simple rule. An infinite becoming.'];
let renderer, composer, controls, scene, camera, points, metal, bloom, finish, uniforms, sculpture, environment;
let gpuTimer,baseCamera,cameraMotion,temporalAA,sparkles,atlas;
let last=performance.now(), statsTime=last, frameCount=0, journeyTime=0, noticeTimer, lost=false;
let lastMotionPreference=reducedMotion.matches;
const targetWeights = new THREE.Vector3(1,0,0);
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), hit = new THREE.Vector3();
const plane = new THREE.Plane(new THREE.Vector3(0,0,1),0);
const pointerTarget = new THREE.Vector3(100,100,100);

function notice(message) {
  $('notice').textContent=message; $('notice').style.display='block';
  clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>$('notice').style.display='none',3500);
}

function fatal(message) {
  $('loading').replaceChildren();
  const box=document.createElement('div'); box.className='error-message';
  const heading=document.createElement('h1'); heading.textContent='The light needs a little help.';
  const text=document.createElement('p'); text.textContent=message;
  const retry=document.createElement('button');retry.textContent='Try again';retry.className='reset-button';retry.onclick=()=>location.reload();
  box.append(heading,text,retry);$('loading').append(box);$('loading').style.display='grid';
}

async function setup() {
  renderer=new THREE.WebGLRenderer({canvas:$('stage'),antialias:false,alpha:false,powerPreference:'high-performance'});
  if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('Floating-point rendering is unavailable. Enable hardware acceleration or try a current browser.');
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:1.65));
  renderer.setSize(innerWidth,innerHeight);
  gpuTimer=new GpuTimer(renderer.getContext());
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=state.exposure;
  renderer.setClearColor(0x000000);
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.1,100);
  camera.position.set(0,1,16);
  baseCamera=camera.clone();
  controls=new OrbitControls(baseCamera,$('stage'));
  controls.enableDamping=true;controls.dampingFactor=.055;controls.minDistance=7;controls.maxDistance=32;controls.enablePan=false;
  controls.target.set(0,.3,0);
  controls.update();controls.saveState();
  cameraMotion=new CameraMotion(camera,baseCamera,controls);
  const pmrem=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;
  room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xd3e6d9,0x3e1706,1));
  const key=new THREE.PointLight(0xffcf89,400,40,2);key.position.set(-4,6,5);key.name='key';scene.add(key);
  const rim=new THREE.PointLight(0x74e3c4,200,35,2);rim.position.set(5,2,-4);scene.add(rim);
  // The rim light grazes the dragon from behind; without self-shadowing its
  // glints light coils and limbs that the body itself hides from it.
  rim.castShadow=true;rim.shadow.mapSize.set(1024,1024);rim.shadow.camera.near=1;rim.shadow.camera.far=20;
  rim.shadow.bias=-.002;rim.shadow.normalBias=.03;rim.shadow.radius=3;
  sculpture=await loadSculpture();atlas=surfaceAtlas(sculpture);
  uniforms={
    uTime:{value:0},uTurbulence:{value:state.turbulence},uAssembly:{value:state.assembly},
    uFocus:{value:state.focal},uAperture:{value:state.focus},uRoughness:{value:state.roughness},
    uGlint:{value:state.glint},uPixelRatio:{value:renderer.getPixelRatio()},uPalette:{value:0},
    uDensity:{value:Math.pow(120000/state.count,.55)},uPointerStrength:{value:0},uInnerFlow:{value:defaults.innerFlow},uWeights:{value:new THREE.Vector3(1,0,0)},
    uLight:{value:key.position},uGlitterDensity:{value:Math.pow(10,defaults.glitter)},uLightCone:{value:.03},uObjectFromView:{value:new THREE.Matrix3()},uPointer:{value:pointerTarget.clone()},uSurface:{value:atlas.texture},uTriangles:{value:atlas.count}
  };
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:particleVertex,fragmentShader:particleFragment,
    transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending});
  points=new THREE.Points(makeParticles(state.count),material);points.geometry.setDrawRange(12000,state.count-12000);points.frustumCulled=false;scene.add(points);
  sparkles=new THREE.Points(makeParticles(12000),material);sparkles.frustumCulled=false;sparkles.visible=false;scene.add(sparkles);
  let drawnGrains=0;
  points.onAfterRender=()=>{drawnGrains=renderer.info.render.points;};
  sparkles.onAfterRender=()=>{state.drawnParticles=drawnGrains+renderer.info.render.points;};
  // An explicit envMap makes envMapIntensity apply; scene.environment would use
  // scene.environmentIntensity and drown the glinting direct light in smooth IBL.
  const metalMaterial=new THREE.MeshStandardMaterial({color:0xbfa16a,metalness:1,roughness:.48,envMap:environment.texture,envMapIntensity:.03});
  patchMetal(metalMaterial,uniforms);
  metal=new THREE.Mesh(sculpture,metalMaterial);metal.visible=false;scene.add(metal);
  metal.castShadow=metal.receiveShadow=true;metal.customDistanceMaterial=dissolveShadowMaterial(uniforms);
  const objectFromView=new THREE.Matrix4();
  metal.onBeforeRender=(renderer,scene,view)=>{
    objectFromView.multiplyMatrices(view.matrixWorldInverse,metal.matrixWorld);
    uniforms.uObjectFromView.value.setFromMatrix4(objectFromView).transpose();
  };
  composer=new EffectComposer(renderer);
  const depthPass=new DepthOfFieldPass(scene,camera,points,metal,state);
  composer.addPass(depthPass);
  temporalAA=new TemporalAAPass(camera,depthPass,state);composer.addPass(temporalAA);
  composer.addPass(new SparklePass(scene,camera,points,sparkles,metal));
  bloom=new StableBloomPass(new THREE.Vector2(innerWidth,innerHeight),state.bloom,.45,.9);bloom.halo=5;composer.addPass(bloom);
  finish=new ShaderPass(finishShader);composer.addPass(finish);composer.addPass(new OutputPass());
  $('quality').value=String(state.count);
  bindControls();resize();updatePause();updateSceneLabels();
  for(const [name,value] of Object.entries(defaults))setSetting(name,value);
  renderer.compile(scene,camera);
  state.ready=true;
  $('loading').style.display='none';
  renderer.setAnimationLoop(frame);
}

function resize() {
  if(!renderer)return;
  camera.aspect=innerWidth/innerHeight;
  // Preserve the entire subject on portrait screens instead of cropping it away.
  camera.fov=innerWidth<700?64:46;camera.updateProjectionMatrix();
  baseCamera.aspect=camera.aspect;baseCamera.fov=camera.fov;baseCamera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);composer?.setSize(innerWidth,innerHeight);
}

function updateSceneLabels() {
  $('scene-title').textContent=titles[state.scene];$('scene-description').textContent=descriptions[state.scene];
  document.querySelectorAll('[data-scene]').forEach(button=>{
    const active=Number(button.dataset.scene)===state.scene;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  });
  $('assembly-control').hidden=state.scene===0;
  $('assemble').hidden=state.scene===0;
}

function selectScene(index) {
  temporalAA?.reset();
  if(index===state.scene && state.transition===1)return;
  state.target=index;state.transition=0;journeyTime=0;
  if(state.paused || reducedMotion.matches){switchScene();state.transition=1;}
}
function switchScene() {
  state.scene=state.target;
  targetWeights.set(state.scene===0?1:0,state.scene===1?1:0,state.scene===2?1:0);
  uniforms.uWeights.value.copy(targetWeights);
  metal.visible=state.scene===1;
  controls.reset();cameraMotion.reset();updateSceneLabels();
}
function setSetting(name,value) {
  temporalAA?.reset();
  state[name]=value;
  if($(name))$(name).value=value;
  if($(name+'-value'))$(name+'-value').textContent=value.toFixed(2);
  if(!uniforms)return;
  const mapping={focus:'uAperture',focal:'uFocus',roughness:'uRoughness',glint:'uGlint',assembly:'uAssembly',turbulence:'uTurbulence'};
  if(mapping[name])uniforms[mapping[name]].value=value;
  if(name==='glitter')uniforms.uGlitterDensity.value=Math.pow(10,value);
  if(name==='innerFlow')uniforms.uInnerFlow.value=value;
  if(name==='bloom')bloom.strength=value;
  if(name==='exposure')renderer.toneMappingExposure=value;
  if(name==='light')scene.getObjectByName('key').position.x=value;
}
function updatePause() {
  $('pause').setAttribute('aria-label',state.paused?'Resume animation':'Pause animation');
  $('pause').innerHTML=state.paused?'<svg viewBox="0 0 24 24"><path d="m8 4 12 8-12 8Z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>';
}
function togglePause(){state.paused=!state.paused;updatePause();}
function syncMotionPreference(){
  const reduced=reducedMotion.matches;
  if(reduced&&!lastMotionPreference){state.paused=true;state.tour=false;state.cameraMotion=false;$('camera-motion').checked=false;$('tour').setAttribute('aria-pressed','false');updatePause();}
  lastMotionPreference=reduced;
}
function cinema(on=!document.body.classList.contains('cinema')){
  document.body.classList.toggle('cinema',on);$('restore').hidden=!on;
  (on?$('restore'):$('cinema')).focus();
}
function settings(open){
  $('settings').classList.toggle('open',open);$('open-settings').setAttribute('aria-expanded',String(open));
  (open?$('close-settings'):$('open-settings')).focus();
}

function bindControls() {
  for(const name of Object.keys(defaults))$(name)?.addEventListener('input',event=>{if(name==='assembly')state.assemblyTarget=null;setSetting(name,Number(event.target.value));});
  $('assemble').onclick=()=>{
    const target=state.assembly>.5?0:1;
    if(state.paused||reducedMotion.matches)setSetting('assembly',target);else state.assemblyTarget=target;
  };
  document.querySelectorAll('[data-scene]').forEach(button=>button.onclick=()=>selectScene(Number(button.dataset.scene)));
  document.querySelector('.wordmark').onclick=event=>{event.preventDefault();selectScene(0);};
  $('pause').onclick=togglePause;
  $('camera-motion').checked=state.cameraMotion;
  $('camera-motion').onchange=event=>{state.cameraMotion=event.target.checked;};
  $('antialias').onchange=event=>{state.antialias=event.target.checked;temporalAA.reset();};
  $('tour').onclick=()=>{state.tour=!state.tour;journeyTime=0;$('tour').setAttribute('aria-pressed',String(state.tour));if(state.tour&&state.paused)togglePause();};
  $('open-settings').onclick=()=>settings(!$('settings').classList.contains('open'));
  $('close-settings').onclick=()=>settings(false);
  $('cinema').onclick=()=>cinema();$('restore').onclick=()=>cinema(false);
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notice('Fullscreen is unavailable in this browser.');}};
  document.addEventListener('fullscreenchange',()=>$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen'));
  $('palette').onchange=event=>{state.palette=Number(event.target.value);uniforms.uPalette.value=state.palette;metal.material.color.setHex([0xbfa16a,0xd8bd7a,0xa6c3d1][state.palette]);};
  $('quality').onchange=event=>{
    state.count=Number(event.target.value);
    points.geometry.setDrawRange(12000,state.count-12000);
    uniforms.uDensity.value=Math.pow(120000/state.count,.55);
    const ratio=Math.min(devicePixelRatio,state.count<=1200000?1.25:1.65);
    renderer.setPixelRatio(ratio);composer.setPixelRatio(ratio);uniforms.uPixelRatio.value=ratio;resize();
  };
  $('reset').onclick=()=>{
    state.assemblyTarget=null;
    for(const [name,value] of Object.entries(defaults))setSetting(name,value);
    state.time=0;state.palette=0;$('palette').value='0';uniforms.uPalette.value=0;metal.material.color.setHex(0xbfa16a);
    controls.reset();cameraMotion.reset();pointerTarget.set(100,100,100);uniforms.uPointer.value.copy(pointerTarget);uniforms.uPointerStrength.value=0;
    notice('Study reset.');
  };
  $('capture').onclick=()=>{
    temporalAA.jitter();
    composer.render();
    camera.clearViewOffset();
    $('stage').toBlob(blob=>{
      if(!blob){notice('Frame could not be saved. Please try again.');return;}
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`aureole-${['current','relic','continuum'][state.scene]}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Frame saved.');
    },'image/png');
  };
  $('stage').addEventListener('pointermove',event=>{
    pointer.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1);
    raycaster.setFromCamera(pointer,camera);
    if(raycaster.ray.intersectPlane(plane,hit))pointerTarget.copy(hit);
  });
  $('stage').addEventListener('pointerleave',()=>pointerTarget.set(100,100,100));
  window.addEventListener('resize',resize);
  document.addEventListener('keydown',event=>{
    if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
    if(event.code==='Space' && event.target.tagName!=='BUTTON'){event.preventDefault();togglePause();}
    if(event.key.toLowerCase()==='h')cinema();
    if(['1','2','3'].includes(event.key))selectScene(Number(event.key)-1);
    if(event.key==='Escape'){if(document.body.classList.contains('cinema'))cinema(false);else if($('settings').classList.contains('open'))settings(false);}
  });
  reducedMotion.addEventListener('change',syncMotionPreference);
  document.addEventListener('visibilitychange',()=>{last=performance.now();});
  $('stage').addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;renderer.setAnimationLoop(null);fatal('The graphics connection was interrupted. Reload to rebuild the scene.');});
  $('stage').addEventListener('webglcontextrestored',()=>{location.reload();});
}

function frame(now) {
  syncMotionPreference();
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(document.hidden||lost)return;
  if(!state.paused){state.time+=dt*state.speed;journeyTime+=dt;}
  if(!state.paused&&state.assemblyTarget!==null){
    const next=THREE.MathUtils.damp(state.assembly,state.assemblyTarget,1.2,dt*state.speed);
    if(Math.abs(next-state.assemblyTarget)<.002){setSetting('assembly',state.assemblyTarget);state.assemblyTarget=null;}
    else setSetting('assembly',next);
  }
  $('assemble').textContent=state.assembly>.5?'Disperse particles':'Assemble particles';
  if(state.tour&&!state.paused&&journeyTime>22)selectScene((state.scene+1)%3);
  if(state.transition<1){
    const before=state.transition;state.transition=Math.min(1,state.transition+dt*.65);
    if(before<.5&&state.transition>=.5)switchScene();
    finish.uniforms.uFade.value=.12+.88*Math.abs(state.transition*2-1);
  }else finish.uniforms.uFade.value=1;
  uniforms.uTime.value=state.time;
  if(!state.paused){
    uniforms.uPointer.value.lerp(pointerTarget,1-Math.exp(-dt*5));
    uniforms.uPointerStrength.value=THREE.MathUtils.damp(uniforms.uPointerStrength.value,pointerTarget.x<90?1:0,4,dt);
  }
  metal.rotation.set(0,state.time*.055,0);
  metal.rotateZ(.1);
  cameraMotion.update(dt,state,reducedMotion.matches);
  temporalAA.jitter();
  gpuTimer.begin();
  composer.render();
  gpuTimer.end();
  camera.clearViewOffset();
  state.gpuMs=gpuTimer.milliseconds;
  state.frames++;frameCount++;
  if(now-statsTime>1000){state.fps=Math.round(frameCount*1000/(now-statsTime));const countLabel=state.count>=1000000?`${(state.count/1000000).toFixed(1)}M`:`${Math.round(state.count/1000)}K`;$('stats').textContent=`${countLabel} PARTICLES · ${state.fps} FPS`;$('stats').title=state.gpuMs===null?'GPU timing unavailable':`GPU frame: ${state.gpuMs.toFixed(2)} ms (rolling median)`;frameCount=0;statsTime=now;}
}

// Diagnostic snapshot for reproducible browser checks and profiling;
// step() advances paused simulation time by exact frames for temporal measurements.
window.aureole={step:frames=>{state.time+=frames/60*state.speed;},get state(){return {...state,surfaceAtlasBytes:atlas?.bytes,modelTriangles:atlas?.count,particleAttributeBytes:points?Object.values(points.geometry.attributes).reduce((sum,attribute)=>sum+attribute.array.byteLength,0):null,weights:uniforms?.uWeights.value.toArray(),camera:camera?.position.toArray(),renderer:renderer?.getContext().getParameter(renderer.getContext().VERSION)};}};
setup().catch(error=>{console.error(error);fatal(error.message||'WebGL could not start. Try enabling hardware acceleration in your browser.');});
