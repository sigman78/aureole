import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { BokehShader } from 'three/addons/shaders/BokehShader.js';

// Defocus the solid's HDR image before rendering already-defocused particles.
// Rebuild sharp occlusion depth after the fullscreen pass, so particles behind
// the sculpture remain hidden. This avoids double-blurring particle splats.
export class DepthOfFieldPass extends Pass {
  constructor(scene,camera,particles,solid,settings) {
    super();
    Object.assign(this,{scene,camera,particles,solid,settings});
    this.needsSwap=false;
    this.isRenderPass=true;
    this.width=1;
    this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
    this.target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.material=new THREE.ShaderMaterial({
      defines:{...BokehShader.defines,DEPTH_PACKING:0},
      uniforms:THREE.UniformsUtils.clone(BokehShader.uniforms),
      vertexShader:BokehShader.vertexShader,fragmentShader:BokehShader.fragmentShader,
      depthTest:false,depthWrite:false
    });
    this.quad=new FullScreenQuad(this.material);
  }
  setSize(width,height){this.width=width;this.target.setSize(width,height);}
  render(renderer,writeBuffer,readBuffer) {
    const destination=this.renderToScreen?null:readBuffer;
    const previousAutoClear=renderer.autoClear;
    const previousVisible=this.particles.visible;
    const previousColorWrite=this.solid.material.colorWrite;
    try {
      renderer.autoClear=true;
      if(!this.solid.visible || this.settings.focus===0){
        renderer.setRenderTarget(destination);renderer.render(this.scene,this.camera);return;
      }
      this.particles.visible=false;
      renderer.setRenderTarget(this.target);renderer.render(this.scene,this.camera);
      const u=this.material.uniforms;
      u.tColor.value=this.target.texture;u.tDepth.value=this.target.depthTexture;
      u.focus.value=this.settings.focal;u.nearClip.value=this.camera.near;u.farClip.value=this.camera.far;
      u.aspect.value=this.camera.aspect;
      u.aperture.value=this.settings.focus*87.5*renderer.getPixelRatio()/(this.settings.focal*this.width);
      u.maxblur.value=24*renderer.getPixelRatio()/this.width;
      renderer.setRenderTarget(destination);this.quad.render(renderer);
      renderer.autoClear=false;renderer.clearDepth();
      this.solid.material.colorWrite=false;
      this.particles.visible=previousVisible;
      renderer.render(this.scene,this.camera);
    } finally {
      this.particles.visible=previousVisible;
      this.solid.material.colorWrite=previousColorWrite;
      renderer.autoClear=previousAutoClear;
    }
  }
  dispose(){this.target.dispose();this.material.dispose();this.quad.dispose();}
}
