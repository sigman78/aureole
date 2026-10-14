import * as THREE from 'three';
// World-space normals + light/view half vectors produce coherent glints.
// This is a finite-flake approximation, not a stochastic microfacet BRDF port.
export const particleVertex = /* glsl */`
  uniform float uTime, uTurbulence, uAssembly, uFocus, uAperture, uRoughness;
  uniform float uGlint, uPixelRatio, uPalette, uDensity, uPointerStrength, uInnerFlow;
  uniform vec3 uWeights, uLight, uPointer;
  uniform sampler2D uSurface;
  uniform float uTriangles;
  varying vec3 vRadiance;
  varying float vEnergy, vBlur;
  const float PI = 3.14159265359;
  mat3 rotY(float a) { float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c); }
  mat3 rotZ(float a) { float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.); }
  mat3 rotX(float a) { float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c); }
  uint hash(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; return x ^ (x >> 16); }
  float random(uint id) { return float(hash(id) >> 8) / 16777216.; }
  vec4 seed(uint id) { return vec4(random(id),random(id+1237u),random(id+2593u),random(id+7919u)); }
  vec4 surfaceTexel(int triangle,int field){
    int offset=triangle*8+field;
    return texelFetch(uSurface,ivec2(offset%1024,offset/1024),0);
  }
  void modelSurface(vec4 s, out vec3 p, out vec3 n) {
    int triangle=int(s.x*uTriangles);vec2 choice=surfaceTexel(triangle,6).xy;
    if(s.y>choice.x)triangle=int(choice.y);
    float r=sqrt(s.z);vec3 bary=vec3(1.-r,r*(1.-s.w),r*s.w);
    p=surfaceTexel(triangle,0).xyz*bary.x+surfaceTexel(triangle,1).xyz*bary.y+surfaceTexel(triangle,2).xyz*bary.z;
    n=normalize(surfaceTexel(triangle,3).xyz*bary.x+surfaceTexel(triangle,4).xyz*bary.y+surfaceTexel(triangle,5).xyz*bary.z);
    p+=n*.012;
  }
  vec3 latticePosition(vec4 s, vec4 jitter) {
    vec3 corners[4]=vec3[4](vec3(0.,4.5,0.),vec3(-4.3,-2.8,2.5),vec3(4.3,-2.8,2.5),vec3(0.,-2.8,-4.5));
    int node=int(s.x*85.),level=node<1?0:(node<5?1:(node<21?2:3));
    int code=node-(level==0?0:(level==1?1:(level==2?5:21)));
    for(int depth=0;depth<3;depth++) {
      if(depth>=level)break;
      int corner=code%4;code/=4;vec3 anchor=corners[corner];
      for(int k=0;k<4;k++)corners[k]=mix(corners[k],anchor,.5);
    }
    ivec2 edges[6]=ivec2[6](ivec2(0,1),ivec2(0,2),ivec2(0,3),ivec2(1,2),ivec2(1,3),ivec2(2,3));
    ivec2 edge=edges[int(s.y*6.)];
    float fuzz=s.w<.92?.035:.28;
    return mix(corners[edge.x],corners[edge.y],s.z)+(jitter.xyz-.5)*fuzz;
  }
  vec3 curl(vec3 p) {
    return vec3(sin(p.y*1.3+cos(p.z)),sin(p.z*1.2+cos(p.x)),sin(p.x*1.1+cos(p.y)));
  }
  float facet(vec3 n, vec3 l, vec3 v, float rough) {
    vec3 h = normalize(l+v);
    float nh = max(dot(n,h),0.);
    // Finite emitter width filters subpixel lobes before temporal accumulation.
    float alpha = sqrt(pow(rough*rough,2.)+.012);
    float a2=alpha*alpha;
    float d=nh*nh*(a2-1.)+1.;
    float distribution=a2/(PI*d*d);
    float nl=max(dot(n,l),0.);
    // Finite flake response; cap only extreme subpixel impulses for stability.
    return min(distribution*nl,10.);
  }
  void main(){
    uint id=uint(gl_VertexID)+4217u;
    vec4 aSeed=seed(id),shapeSeed=seed(id+104729u);
    bool bokehFlake=gl_VertexID<12000;
    float t=uTime;
    float lane=floor(aSeed.y*11.);
    vec3 p,aNormal=vec3(0.,0.,1.);
    float release=0.;
    mat3 spin=rotY(t*.055)*rotZ(.1);
    if(uWeights.x>.5){
    // Inner flow: grain speed varies smoothly across each lane, so neighbouring
    // layers slide past one another as currents inside the overall stream.
    vec2 offset=vec2((aSeed.z-.5)*.65,(aSeed.w-.5)*.7);
    float shear=sin(offset.x*11.+offset.y*8.+lane*1.7)*.6+sin(offset.y*17.-offset.x*5.+lane)*.25;
    float laneSpeed=0.008+lane*0.00025;
    float speed=laneSpeed*(1.+uInnerFlow*(bokehFlake?0.:shear));
    float phase=fract(aSeed.x+t*speed);
    float x=(phase-.5)*24.;
    float envelope=0.65+1.4*pow(sin(phase*PI),2.);
    // The braid's twist and the ribbon's wave both travel downstream at 75% of
    // the grains' speed: grains mostly ride the shape along the stream, keeping
    // only a slow residual spiral, instead of churning against a shape that
    // slid upstream.
    float drift=t*laneSpeed*.75;
    float angle=(phase-drift)*10.+lane*.56;
    vec3 flow=vec3(x, sin((x-drift*24.)*.4)*1.45 + cos(angle)*envelope + offset.x,
      sin(angle)*envelope*1.35+offset.y);
    flow=rotZ(.21)*flow;
    // Both turbulence scales drift downstream at about the grains' own speed
    // (~.22 units per time unit), so eddies travel with the stream rather than
    // standing still or running against it; the fine scale adds local swirls.
    flow+=curl(flow*.55+vec3(-t*.12,0.,t*.03))*uTurbulence*.55;
    flow+=curl(flow*1.7+vec3(-t*.37,t*.05,0.))*uInnerFlow*.16;
    // Sparse foreground flakes share the flow but extend well beyond its focus plane.
    if(bokehFlake && aSeed.w>.65) flow.z+=(aSeed.w-.65)*16.;
    p=flow;
    }else if(uWeights.y>.5){
    vec3 surfacePosition;
    modelSurface(shapeSeed,surfacePosition,aNormal);
    float boundary=(surfacePosition.x+3.6)/7.2;
    release=1.-smoothstep(boundary-.08,boundary+.04,uAssembly);
    vec3 drift=vec3(-5.-aSeed.z*4.,sin(aSeed.y*19.+t*.3)*2.,cos(aSeed.z*13.)*3.);
    p=spin*(surfacePosition+drift*release+curl(surfacePosition+t*.15)*release*uTurbulence);
    }else{
    vec3 aLattice=latticePosition(shapeSeed,aSeed);
    float grow=1.-smoothstep(aSeed.x-.08,aSeed.x+.08,uAssembly);
    vec3 crystal=rotZ(-.28)*rotY(-.55+t*.035)*(aLattice+curl(aLattice+t*.12)*grow*3.)*1.25;
    crystal.x-=1.2;
    p=crystal;
    }
    vec3 delta=p-uPointer;
    p+=normalize(delta+vec3(.001))*exp(-dot(delta,delta)*.55)*uPointerStrength*1.2;

    vec4 world=modelMatrix*vec4(p,1.);
    vec3 viewDir=normalize(cameraPosition-world.xyz);
    float azimuth=aSeed.y*PI*2.+t*(.08+aSeed.z*.1);
    float nz=aSeed.z*2.-1.;
    vec3 randomNormal=vec3(sqrt(1.-nz*nz)*cos(azimuth),sqrt(1.-nz*nz)*sin(azimuth),nz);
    vec3 surfaceNormal=spin*normalize(aNormal+randomNormal*.4);
    vec3 normal=normalize(mix(randomNormal,surfaceNormal,uWeights.y*(1.-release)));
    if(dot(normal,viewDir)<0.) normal=-normal;
    vec3 lightDir=normalize(uLight-world.xyz);
    float spec=facet(normal,lightDir,viewDir,uRoughness);
    float rim=facet(normal,normalize(vec3(5.,2.,-4.)-world.xyz),viewDir,uRoughness+.12);
    float colorIndex=fract(aSeed.y*3.17+lane*.13);
    vec3 gold=vec3(1.,.36,.055),red=vec3(.85,.025,.015),jade=vec3(.025,.32,.25);
    vec3 base=colorIndex<.67?gold:(colorIndex<.88?red:jade);
    if(uPalette>.5 && uPalette<1.5) base=mix(vec3(.65,.3,.07),vec3(1.,.78,.4),aSeed.y);
    if(uPalette>1.5) base=mix(vec3(.06,.25,.45),vec3(.65,.85,1.),aSeed.y);
    base=mix(base,vec3(1.,.6,.19),uWeights.z*.8);
    float diffuse=.14+.3*max(dot(normal,lightDir),0.);
    float fresnel=.7+.3*pow(1.-max(dot(viewDir,normal),0.),5.);
    vRadiance=base*diffuse+mix(base,vec3(1.,.72,.3),.22)*spec*fresnel*uGlint*.8;
    vRadiance+=vec3(.07,.43,.37)*rim*uGlint*.5;
    // Surface grains overlap much more than the free-flowing cloud. Keep their
    // aggregate reflection subdued while sparse flakes retain bright glints.
    float attachedGain=bokehFlake?.10:.06;
    float opticalGain=bokehFlake?mix(3.2,7.,1.-uWeights.y):uDensity*1.4;
    vRadiance*=opticalGain*(uWeights.x*.85+uWeights.y*mix(attachedGain,.65,release)+uWeights.z*.5);
    // Grains that have settled onto the solid hand over to its glint BRDF.
    vRadiance*=mix(1.,smoothstep(0.,.25,release),uWeights.y);
    vec4 mv=viewMatrix*world;
    float distanceToCamera=max(-mv.z,.1);
    // Circle-of-confusion diameter in pixels, with energy conserved as it expands.
    float core=(bokehFlake?(1.4+pow(aSeed.w,6.)*3.5):(.7+aSeed.w*.6))*uPixelRatio*14./distanceToCamera;
    float coc=abs(distanceToCamera-uFocus)/distanceToCamera*uAperture*70.*uPixelRatio;
    // Only a bounded population gets large aperture splats. Fine grains use
    // a compact footprint and fade out of focus to contain overdraw.
    // Sparse flakes skip temporal AA and are very bright, so a ~1 px sprite would
    // cover 1, 2 or 4 pixels as it moves and its energy would blink, then pulse
    // through bloom. A 4 px minimum footprint keeps the integrated energy steady.
    float diameter=clamp(sqrt(core*core+coc*coc),bokehFlake?4.*uPixelRatio:1.,bokehFlake?48.:2.5*uPixelRatio);
    vEnergy=core*core/(diameter*diameter);
    if(!bokehFlake)vEnergy/=1.+coc*.3;
    vBlur=clamp(coc/5.,0.,1.);
    gl_PointSize=diameter;
    gl_Position=projectionMatrix*mv;
  }
`;

export const particleFragment = /* glsl */`
  varying vec3 vRadiance;
  varying float vEnergy,vBlur;
  void main(){
    vec2 q=gl_PointCoord*2.-1.;
    float r=length(q);
    if(r>1.) discard;
    // Both profiles have the same unit mean over the disk. Together with
    // coreArea / splatArea in the vertex stage, defocus preserves energy.
    float sharp=exp(-r*r*4.5)*4.5/(1.-exp(-4.5));
    float bokeh=(1.-smoothstep(.75,1.,r))/.76875;
    float profile=mix(sharp,bokeh,vBlur)*.33;
    gl_FragColor=vec4(vRadiance*vEnergy*profile,1.);
  }
`;

export const finishShader = {
  uniforms: { tDiffuse:{value:null}, uTime:{value:0}, uFade:{value:1} },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime,uFade;varying vec2 vUv;
    void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;
      vec2 p=vUv-.5;float vignette=1.-.65*dot(p,p);
      c*=vignette*uFade;
      gl_FragColor=vec4(c,1.);}`
};

// Stochastic glints for the solid: each pixel's surface patch holds a finite
// number of mirror facets drawn from the GGX distribution. The count reflecting
// a finite light into the eye is binomial; dividing by its expectation gives a
// ratio with mean 1, so the glinty BRDF converges to ordinary GGX as facet
// density grows. Inspired by Deliot & Belcour 2023 (binomial facet counts over
// footprint-sized cells and slope bins); simplified, not a port of the paper.
const glintFunctions = /* glsl */`
  varying vec3 vLocal, vLocalNormal;
  uniform float uAssembly, uGlitterDensity, uLightCone, uFocus, uAperture, uPixelRatio;
  uniform mat3 uObjectFromView;
  float glintFootprint;
  float grain(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
  uint glintHash(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;return x^(x>>16);}
  float glintRandom(uint x){return float(glintHash(x)>>8)/16777216.;}
  // Binomial(n,p) by Poisson inversion for small expectations, normal above.
  float facetCount(float n,float p,uint seed){
    float mean=n*p,u=glintRandom(seed);
    if(mean<8.){
      float term=exp(-mean),cdf=term,k=0.;
      for(int i=1;i<24;i++){if(u<=cdf)break;k+=1.;term*=mean/k;cdf+=term;}
      return k;
    }
    float z=sqrt(-2.*log(max(u,1e-7)))*cos(6.2831853*glintRandom(seed^0x9e3779b9u));
    return max(0.,floor(mean+z*sqrt(mean*(1.-p))+.5));
  }
  float glintRatio(vec3 l,vec3 v,vec3 n,float roughness){
    vec3 h=normalize(l+v);
    float alpha=roughness*roughness,a2=alpha*alpha,nh=max(dot(n,h),0.);
    float d=nh*nh*(a2-1.)+1.,ndf=a2/(PI*d*d);
    // Fraction of projected facet area whose normals reflect the light's cone to the eye.
    float halfSolid=PI*uLightCone*uLightCone/(4.*max(dot(h,l),.01));
    float p=clamp(ndf*nh*halfSolid,0.,1.);
    // Slope bins in a surface-attached frame: facets stay put as the dragon turns.
    vec3 no=normalize(vLocalNormal),hn=uObjectFromView*h;
    float s=no.z>=0.?1.:-1.,a=-1./(s+no.z),b=no.x*no.y*a;
    vec3 tangent=vec3(1.+s*no.x*no.x*a,s*b,-s*no.x),bitangent=vec3(b,s+no.y*no.y*a,-no.y);
    vec2 slope=vec2(dot(hn,tangent),dot(hn,bitangent))/max(dot(hn,no),.05)/uLightCone-.5;
    ivec2 bin=ivec2(floor(slope));vec2 binT=slope-floor(slope);
    // Cells about half a pixel wide, blended trilinearly in space and bilinearly
    // in slope so counts change continuously under motion and sub-pixel jitter;
    // two levels blend as the footprint changes.
    float lod=log2(max(glintFootprint*.5,1e-6)/1e-4),level0=floor(lod),ratio=0.;
    for(int k=0;k<2;k++){
      float level=level0+float(k),size=1e-4*exp2(level),facets=uGlitterDensity*size*size;
      vec3 g=vLocal/size-.5,cellT=g-floor(g);
      ivec3 base=ivec3(floor(g));
      float count=0.;
      for(int i=0;i<8;i++){
        ivec3 corner=ivec3(i&1,(i>>1)&1,i>>2);uvec3 c=uvec3(base+corner);
        vec3 wc=mix(1.-cellT,cellT,vec3(corner));
        uint cell=glintHash(c.x*73856093u^c.y*19349663u^c.z*83492791u^uint(int(level)+64)*2654435761u);
        for(int j=0;j<4;j++){
          ivec2 o=ivec2(j&1,j>>1);uvec2 sb=uvec2(bin+o);
          vec2 w=mix(1.-binT,binT,vec2(o));
          count+=wc.x*wc.y*wc.z*w.x*w.y*facetCount(facets,p,glintHash(cell^sb.x*2246822519u^sb.y*3266489917u));
        }
      }
      ratio+=count/max(facets*p,1e-9)*(k==0?1.-(lod-level0):lod-level0);
    }
    return min(ratio,4000.);
  }
`;

// Surface dissolve uses the same x distribution as particles' sampled positions.
const dissolve=`
      float boundary=(vLocal.x+3.6)/7.2;
      if(boundary>uAssembly+grain(floor(vLocal*45.))*.09-.045) discard;`;

export function patchMetal(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,{uAssembly:uniforms.uAssembly,uGlitterDensity:uniforms.uGlitterDensity,
      uLightCone:uniforms.uLightCone,uObjectFromView:uniforms.uObjectFromView,
      uFocus:uniforms.uFocus,uAperture:uniforms.uAperture,uPixelRatio:uniforms.uPixelRatio});
    shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal, vLocalNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal=position;vLocalNormal=normal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>', '#include <common>\n'+glintFunctions);
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${dissolve}
      // A defocused pixel integrates the surface over its circle of confusion,
      // so glints converge there instead of blurring single hot facets.
      float glintCoc=abs(vViewPosition.z-uFocus)/vViewPosition.z*uAperture*70.*uPixelRatio;
      glintFootprint=length(fwidth(vLocal))*clamp(glintCoc,1.,24.*uPixelRatio);`);
    const direct='vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );';
    if(!THREE.ShaderChunk.lights_physical_pars_fragment.includes(direct))throw new Error('Unexpected three.js lighting chunk; glint patch needs updating.');
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',
      THREE.ShaderChunk.lights_physical_pars_fragment.replace(direct,
        direct+'\n\tspecularBRDF *= glintRatio( directLight.direction, geometryViewDir, geometryNormal, material.roughness );'));
  };
  material.customProgramCacheKey=()=> 'aureole-metal-glint-v2';
}

// Shadow-map material for the solid: dissolved regions must not cast shadows.
export function dissolveShadowMaterial(uniforms) {
  const material=new THREE.MeshDistanceMaterial();
  material.onBeforeCompile = shader => {
    shader.uniforms.uAssembly=uniforms.uAssembly;
    shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLocal; uniform float uAssembly;
      float grain(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>'+dissolve);
  };
  material.customProgramCacheKey=()=> 'aureole-dissolve-distance-v1';
  return material;
}
