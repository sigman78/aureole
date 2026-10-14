import * as THREE from 'three';

// Keep the artist's camera separate from OrbitControls' base pose. Cinematic
// offsets never feed back into the orbit solver and cannot accumulate drift.
export class CameraMotion {
  constructor(camera,baseCamera,controls) {
    Object.assign(this,{camera,baseCamera,controls});
    this.phase=0;this.mix=0;this.idle=0;this.interacting=false;
    this.offset=new THREE.Vector3();this.aimOffset=new THREE.Vector3();this.aim=new THREE.Vector3();
    controls.addEventListener('start',()=>{this.interacting=true;this.idle=4;});
    controls.addEventListener('end',()=>{this.interacting=false;this.idle=4;});
  }
  reset(){this.phase=0;this.mix=0;this.idle=0;this.offset.set(0,0,0);this.aimOffset.set(0,0,0);}
  update(dt,{scene,paused,speed,cameraMotion},reduceMotion) {
    this.controls.update();
    // Pause and the off switch hold the current shot; orbit still works.
    if(!paused && !reduceMotion && cameraMotion){
      this.idle=Math.max(0,this.idle-dt);
      const wanted=this.interacting||this.idle>0?0:1;
      this.mix=THREE.MathUtils.damp(this.mix,wanted,1.5,dt);
      if(wanted)this.phase+=dt*speed/.6;
      const t=this.phase;
      if(scene===0){
        this.offset.set(Math.sin(t*.105)*1.1,Math.sin(t*.073)*.24,Math.sin(t*.061)*.45);
        this.aimOffset.set(Math.sin(t*.077)*.2,Math.sin(t*.052)*.09,0);
      }else if(scene===1){
        this.offset.set(Math.sin(t*.085)*1.4,Math.sin(t*.063)*.32,Math.sin(t*.048)*.55);
        this.aimOffset.set(Math.sin(t*.059)*.08,Math.sin(t*.069)*.08,0);
      }else{
        this.offset.set(Math.sin(t*.079)*.9,Math.sin(t*.093)*.48,Math.sin(t*.057)*.65);
        this.aimOffset.set(Math.sin(t*.055)*.15,Math.sin(t*.071)*.12,0);
      }
      this.offset.multiplyScalar(this.mix);this.aimOffset.multiplyScalar(this.mix);
    }
    this.camera.copy(this.baseCamera);
    this.camera.position.addScaledVector(this.aim.copy(this.offset).applyQuaternion(this.baseCamera.quaternion),1);
    this.aim.copy(this.aimOffset).applyQuaternion(this.baseCamera.quaternion).add(this.controls.target);
    this.camera.lookAt(this.aim);this.camera.updateMatrixWorld();
  }
}
