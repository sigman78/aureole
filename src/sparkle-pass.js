import { Pass } from 'three/addons/postprocessing/Pass.js';

// Keep a small optical sparkle population out of temporal averaging. Their
// broader lobes and soft splats preserve flashes without millions of impulses.
export class SparklePass extends Pass {
  constructor(scene,camera,grains,sparkles,solid){super();Object.assign(this,{scene,camera,grains,sparkles,solid});this.needsSwap=false;}
  render(renderer,writeBuffer,readBuffer){
    const autoClear=renderer.autoClear,visible=this.grains.visible,colorWrite=this.solid.material.colorWrite;
    try{
      this.camera.clearViewOffset();
      renderer.autoClear=false;this.grains.visible=false;this.sparkles.visible=true;this.solid.material.colorWrite=false;
      renderer.setRenderTarget(this.renderToScreen?null:readBuffer);renderer.clearDepth();renderer.render(this.scene,this.camera);
    }finally{renderer.autoClear=autoClear;this.grains.visible=visible;this.sparkles.visible=false;this.solid.material.colorWrite=colorWrite;}
  }
}
