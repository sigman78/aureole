import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

const vertexShader=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragmentShader=/* glsl */`
  varying vec2 vUv;
  uniform sampler2D tCurrent,tHistory,tDepth;
  uniform vec2 texel,jitterUV;
  uniform mat4 inverseVP,previousVP;
  uniform float feedback,focusDepth;
  uniform bool hasDepth;
  vec3 compress(vec3 c){return c/(1.+dot(c,vec3(.2126,.7152,.0722)));}
  vec3 expand(vec3 c){return c/max(1.-dot(c,vec3(.2126,.7152,.0722)),.0001);}
  void main(){
    vec2 sampleUV=vUv+jitterUV;
    vec3 center=compress(texture2D(tCurrent,sampleUV).rgb);
    vec3 lower=center,upper=center,mean=vec3(0.),square=vec3(0.);
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
      vec3 c=compress(texture2D(tCurrent,sampleUV+vec2(float(x),float(y))*texel).rgb);
      lower=min(lower,c);upper=max(upper,c);mean+=c;square+=c*c;
    }
    mean/=9.;vec3 deviation=sqrt(max(square/9.-mean*mean,vec3(0.)));
    lower=max(lower,mean-deviation*1.5);upper=min(upper,mean+deviation*1.5);
    float depth=hasDepth?texture2D(tDepth,sampleUV).r:1.;
    if(depth>=.9999)depth=focusDepth;
    vec4 world=inverseVP*vec4(sampleUV*2.-1.,depth*2.-1.,1.);
    vec4 previous=previousVP*(world/world.w);
    vec2 historyUv=previous.xy/previous.w*.5+.5;
    float valid=step(0.,historyUv.x)*step(historyUv.x,1.)*step(0.,historyUv.y)*step(historyUv.y,1.)*step(.001,previous.w);
    vec3 history=compress(texture2D(tHistory,clamp(historyUv,vec2(0.),vec2(1.))).rgb);
    history=clamp(history,lower,upper);
    vec3 current=mix(center,mean,.12);
    gl_FragColor=vec4(expand(mix(current,history,feedback*valid)),1.);
  }
`;

// Jittered HDR accumulation with camera reprojection and variance clipping.
// Particle depth is approximated by the focus plane; no particle motion vectors.
export class TemporalAAPass extends Pass {
  constructor(camera,depthPass,settings) {
    super();Object.assign(this,{camera,depthPass,settings});
    this.history=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
    this.next=this.history.clone();this.valid=false;this.sample=0;
    this.previous=new THREE.Matrix4();this.current=new THREE.Matrix4();this.unjittered=new THREE.Matrix4();this.lastPosition=new THREE.Vector3();this.lastRotation=new THREE.Quaternion();
    this.material=new THREE.ShaderMaterial({vertexShader,fragmentShader,depthTest:false,depthWrite:false,uniforms:{
      tCurrent:{value:null},tHistory:{value:this.history.texture},tDepth:{value:depthPass.target.depthTexture},
      texel:{value:new THREE.Vector2(1,1)},jitterUV:{value:new THREE.Vector2()},inverseVP:{value:new THREE.Matrix4()},previousVP:{value:this.previous},
      feedback:{value:0},focusDepth:{value:1},hasDepth:{value:false}
    }});
    this.quad=new FullScreenQuad(this.material);
    this.copyMaterial=new THREE.ShaderMaterial({...CopyShader,uniforms:THREE.UniformsUtils.clone(CopyShader.uniforms),depthTest:false,depthWrite:false});
    this.copy=new FullScreenQuad(this.copyMaterial);
  }
  reset(){this.valid=false;this.sample=0;}
  setSize(w,h){this.width=w;this.height=h;this.history.setSize(w,h);this.next.setSize(w,h);this.material.uniforms.texel.value.set(1/w,1/h);this.reset();}
  jitter(){
    this.camera.clearViewOffset();
    this.unjittered.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
    if(!this.settings.antialias)return;
    const halton=(n,b)=>{let x=0,f=1;while(n>0){f/=b;x+=f*(n%b);n=Math.floor(n/b);}return x;};
    const n=this.sample++%16+1;
    const x=halton(n,2)-.5,y=halton(n,3)-.5;
    this.material.uniforms.jitterUV.value.set(-x/this.width,y/this.height);
    this.camera.setViewOffset(this.width,this.height,x,y,this.width,this.height);
  }
  render(renderer,writeBuffer,readBuffer) {
    if(!this.settings.antialias){
      this.copyMaterial.uniforms.tDiffuse.value=readBuffer.texture;renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.copy.render(renderer);this.reset();return;
    }
    this.current.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
    const cameraJump=this.lastPosition.distanceTo(this.camera.position)>.12||this.lastRotation.angleTo(this.camera.quaternion)>.015;
    const u=this.material.uniforms;
    u.tCurrent.value=readBuffer.texture;u.tHistory.value=this.history.texture;
    u.inverseVP.value.copy(this.current).invert();
    u.feedback.value=this.valid&&!cameraJump?this.settings.stabilization:0;
    const near=this.camera.near,far=this.camera.far,z=-this.settings.focal;
    u.focusDepth.value=((near+z)*far)/((far-near)*z);
    u.hasDepth.value=this.depthPass.solid.visible&&this.settings.focus>0;
    renderer.setRenderTarget(this.next);this.quad.render(renderer);
    this.copyMaterial.uniforms.tDiffuse.value=this.next.texture;
    renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.copy.render(renderer);
    [this.history,this.next]=[this.next,this.history];
    this.previous.copy(this.unjittered);this.lastPosition.copy(this.camera.position);this.lastRotation.copy(this.camera.quaternion);this.valid=true;
  }
  dispose(){this.history.dispose();this.next.dispose();this.material.dispose();this.copyMaterial.dispose();this.quad.dispose();this.copy.dispose();}
}
