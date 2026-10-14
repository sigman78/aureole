import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const LEVELS=8;
const vertexShader=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;

// 13-tap filtered downsample (Jimenez 2014). UnrealBloomPass samples each
// smaller level sparsely, so a small, very bright flake moving by a fraction of
// a pixel gains and loses energy in the coarse levels and its halo throbs.
// Overlapping box groups keep energy independent of sub-pixel position. The
// first level also passes, per tap, only colors whose luminance exceeds the
// threshold, as UnrealBloomPass's high-pass does, so the glow keeps its strength.
const downsampleFragment=/* glsl */`
  varying vec2 vUv;
  uniform sampler2D tSource;
  uniform vec2 texel;
  uniform bool uFirst;
  uniform float uThreshold, uKnee;
  vec3 s(float x,float y){
    vec3 c=texture2D(tSource,vUv+texel*vec2(x,y)).rgb;
    return uFirst?c*smoothstep(uThreshold,uThreshold+uKnee,dot(c,vec3(.2126,.7152,.0722))):c;
  }
  vec3 group(vec3 a,vec3 b,vec3 c,vec3 d,float weight){return (a+b+c+d)*.25*weight;}
  void main(){
    vec3 a=s(-2.,2.),b=s(0.,2.),c=s(2.,2.),d=s(-2.,0.),e=s(0.,0.),f=s(2.,0.);
    vec3 g=s(-2.,-2.),h=s(0.,-2.),i=s(2.,-2.),j=s(-1.,1.),k=s(1.,1.),l=s(-1.,-1.),m=s(1.,-1.);
    vec3 color=group(j,k,l,m,.5)+group(a,b,d,e,.125)+group(b,c,e,f,.125)+group(d,e,g,h,.125)+group(e,f,h,i,.125);
    gl_FragColor=vec4(color,1.);
  }
`;

// 3×3 tent upsample of the coarser accumulation, added to this level's weighted downsample.
const upsampleFragment=/* glsl */`
  varying vec2 vUv;
  uniform sampler2D tCoarse, tLevel;
  uniform vec2 texel;
  uniform float uWeight;
  uniform bool uHasCoarse;
  vec3 s(float x,float y){return texture2D(tCoarse,vUv+texel*vec2(x,y)).rgb;}
  void main(){
    vec3 tent=vec3(0.);
    if(uHasCoarse)tent=(s(-1.,1.)+s(1.,1.)+s(-1.,-1.)+s(1.,-1.)+2.*(s(0.,1.)+s(0.,-1.)+s(-1.,0.)+s(1.,0.))+4.*s(0.,0.))/16.;
    gl_FragColor=vec4(texture2D(tLevel,vUv).rgb*uWeight+tent,1.);
  }
`;

const compositeFragment=/* glsl */`
  varying vec2 vUv;
  uniform sampler2D tDiffuse, tBloom;
  uniform vec2 texel;
  uniform float uStrength;
  vec3 s(float x,float y){return texture2D(tBloom,vUv+texel*vec2(x,y)).rgb;}
  void main(){
    vec3 tent=(s(-1.,1.)+s(1.,1.)+s(-1.,-1.)+s(1.,-1.)+2.*(s(0.,1.)+s(0.,-1.)+s(-1.,0.)+s(1.,0.))+4.*s(0.,0.))/16.;
    gl_FragColor=vec4(texture2D(tDiffuse,vUv).rgb+tent*uStrength,1.);
  }
`;

// Drop-in replacement for UnrealBloomPass (same constructor and strength /
// radius / threshold fields) with a temporally stable filter chain.
export class StableBloomPass extends Pass {
  constructor(resolution,strength,radius,threshold) {
    super();
    // halo adds weight to the finest levels: a tight shine around each speckle.
    Object.assign(this,{strength,radius,threshold,halo:0});
    const options={type:THREE.HalfFloatType,depthBuffer:false};
    this.down=Array.from({length:LEVELS},()=>new THREE.WebGLRenderTarget(1,1,options));
    this.up=Array.from({length:LEVELS},()=>new THREE.WebGLRenderTarget(1,1,options));
    const material=(fragmentShader,uniforms)=>new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,depthTest:false,depthWrite:false});
    this.downsample=new FullScreenQuad(material(downsampleFragment,{tSource:{value:null},texel:{value:new THREE.Vector2()},uFirst:{value:false},uThreshold:{value:threshold},uKnee:{value:.1}}));
    this.upsample=new FullScreenQuad(material(upsampleFragment,{tCoarse:{value:null},tLevel:{value:null},texel:{value:new THREE.Vector2()},uWeight:{value:1},uHasCoarse:{value:false}}));
    this.composite=new FullScreenQuad(material(compositeFragment,{tDiffuse:{value:null},tBloom:{value:null},texel:{value:new THREE.Vector2()},uStrength:{value:strength}}));
    this.setSize(resolution.x,resolution.y);
  }
  setSize(width,height) {
    let w=width,h=height;
    for(let i=0;i<LEVELS;i++){
      w=Math.max(1,Math.round(w/2));h=Math.max(1,Math.round(h/2));
      this.down[i].setSize(w,h);this.up[i].setSize(w,h);
    }
  }
  // Wider levels gain weight as radius grows, following UnrealBloomPass's factor ramp.
  levelWeight(i){
    const factor=1-i/(LEVELS-1)*.8;
    return THREE.MathUtils.lerp(factor,1.2-factor,this.radius)+this.halo*Math.exp(-i);
  }
  render(renderer,writeBuffer,readBuffer) {
    const down=this.downsample.material.uniforms,up=this.upsample.material.uniforms;
    let source=readBuffer;
    for(let i=0;i<LEVELS;i++){
      down.tSource.value=source.texture;down.texel.value.set(1/source.width,1/source.height);
      down.uFirst.value=i===0;down.uThreshold.value=this.threshold;
      renderer.setRenderTarget(this.down[i]);this.downsample.render(renderer);
      source=this.down[i];
    }
    for(let i=LEVELS-1;i>=0;i--){
      up.tLevel.value=this.down[i].texture;up.uWeight.value=this.levelWeight(i);
      up.uHasCoarse.value=i<LEVELS-1;
      if(i<LEVELS-1){up.tCoarse.value=this.up[i+1].texture;up.texel.value.set(1/this.up[i+1].width,1/this.up[i+1].height);}
      renderer.setRenderTarget(this.up[i]);this.upsample.render(renderer);
    }
    const c=this.composite.material.uniforms;
    c.tDiffuse.value=readBuffer.texture;c.tBloom.value=this.up[0].texture;
    c.texel.value.set(1/this.up[0].width,1/this.up[0].height);c.uStrength.value=this.strength;
    renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.composite.render(renderer);
  }
  dispose(){
    for(const target of [...this.down,...this.up])target.dispose();
    for(const quad of [this.downsample,this.upsample,this.composite]){quad.material.dispose();quad.dispose();}
  }
}
