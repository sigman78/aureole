// World-space normals + light/view half vectors produce coherent glints.
// This is a finite-flake approximation, not a stochastic microfacet BRDF port.
export const particleVertex = /* glsl */`
  uniform float uTime, uTurbulence, uAssembly, uFocus, uAperture, uRoughness;
  uniform float uGlint, uPixelRatio, uPalette, uDensity, uPointerStrength;
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
    float phase=fract(aSeed.x+t*(0.008+lane*0.00025));
    float x=(phase-.5)*24.;
    float envelope=0.65+1.4*pow(sin(phase*PI),2.);
    float angle=phase*10.+lane*.56+t*.09;
    float width=(aSeed.z-.5)*.65;
    vec3 flow=vec3(x, sin(x*.4+t*.1)*1.45 + cos(angle)*envelope + width,
      sin(angle)*envelope*1.35+(aSeed.w-.5)*.7);
    flow=rotZ(.21)*flow;
    flow+=curl(flow*.55+t*.12)*uTurbulence*.55;
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
    vec4 mv=viewMatrix*world;
    float distanceToCamera=max(-mv.z,.1);
    // Circle-of-confusion diameter in pixels, with energy conserved as it expands.
    float core=(bokehFlake?(1.4+pow(aSeed.w,6.)*3.5):(.7+aSeed.w*.6))*uPixelRatio*14./distanceToCamera;
    float coc=abs(distanceToCamera-uFocus)/distanceToCamera*uAperture*70.*uPixelRatio;
    // Only a bounded population gets large aperture splats. Fine grains use
    // a compact footprint and fade out of focus to contain overdraw.
    float diameter=clamp(sqrt(core*core+coc*coc),1.,bokehFlake?48.:2.5*uPixelRatio);
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

// Surface dissolve uses the same x distribution as particles' sampled positions.
export function patchMetal(material, uniforms) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uAssembly=uniforms.uAssembly;
    shader.uniforms.uGlint=uniforms.uGlint;
    shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLocal; uniform float uAssembly,uGlint;
      float grain(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float boundary=(vLocal.x+3.6)/7.2;
      if(boundary>uAssembly+grain(floor(vLocal*45.))*.09-.045) discard;`);
    // Fine deterministic roughness variation modulates the actual PBR reflection.
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float footprint=max(length(fwidth(vLocal))*90.,1.);
      float fleck=grain(floor(vLocal*90.));
      roughnessFactor=clamp(roughnessFactor+(fleck-.5)*.3/footprint,.12,.75);`);
  };
  material.customProgramCacheKey=()=> 'aureole-metal-v1';
}
