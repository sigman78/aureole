import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadSculpture() {
  const gltf=await new GLTFLoader().loadAsync('/models/dragon.glb');
  gltf.scene.updateMatrixWorld(true);
  let mesh;
  gltf.scene.traverse(object=>{if(object.isMesh&&!mesh)mesh=object;});
  if(!mesh)throw new Error('The dragon model contains no mesh.');
  const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();
  const size=geometry.boundingBox.getSize(new THREE.Vector3()),center=geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x,-center.y,-center.z);
  const scale=7.2/Math.max(size.x,size.y,size.z);geometry.scale(scale,scale,scale);
  geometry.rotateY(-.35);
  mesh.geometry.dispose();mesh.material.dispose();
  return geometry;
}

// A count-independent triangle atlas and alias table allow area-weighted GPU
// surface sampling. Millions of grains share this ~11 MB mesh description.
export function surfaceAtlas(geometry) {
  const positions=geometry.attributes.position,normals=geometry.attributes.normal,index=geometry.index;
  const count=(index?index.count:positions.count)/3;
  const width=1024,height=Math.ceil(count*8/width),data=new Float32Array(width*height*4);
  const areas=new Float64Array(count),probability=new Float64Array(count),alias=new Uint32Array(count);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
  let total=0;
  for(let i=0;i<count;i++){
    for(let j=0;j<3;j++){
      const vertex=index?index.getX(i*3+j):i*3+j;
      data.set([positions.getX(vertex),positions.getY(vertex),positions.getZ(vertex),0],i*32+j*4);
      data.set([normals.getX(vertex),normals.getY(vertex),normals.getZ(vertex),0],i*32+(j+3)*4);
    }
    a.fromArray(data,i*32);b.fromArray(data,i*32+4);c.fromArray(data,i*32+8);
    areas[i]=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()*.5;total+=areas[i];
  }
  const small=[],large=[];
  for(let i=0;i<count;i++){probability[i]=areas[i]*count/total;(probability[i]<1?small:large).push(i);}
  while(small.length&&large.length){
    const low=small.pop(),high=large.pop();alias[low]=high;probability[high]-=1-probability[low];
    (probability[high]<1?small:large).push(high);
  }
  for(const i of [...small,...large]){probability[i]=1;alias[i]=i;}
  for(let i=0;i<count;i++)data.set([probability[i],alias[i],0,0],i*32+24);
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
  texture.needsUpdate=true;
  return {texture,count,bytes:data.byteLength};
}


// WebGL 2 gl_VertexID supplies persistent identities. All particle positions,
// normals and seeds are generated in GLSL; no count-sized attributes are uploaded.
export function makeParticles(count) {
  const geometry = new THREE.BufferGeometry();
  geometry.setDrawRange(0, count);
  return geometry;
}
