// Non-blocking GPU timings for the entire HDR/postprocessing frame.
export class GpuTimer {
  constructor(gl) {
    this.gl=gl;
    this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending=[];
    this.active=null;
    this.samples=[];
    this.milliseconds=null;
  }
  begin() {
    if(!this.ext)return;
    const gl=this.gl;
    const disjoint=gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while(this.pending.length && (disjoint || gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE))){
      const query=this.pending.shift();
      if(!disjoint){
        this.samples.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
        if(this.samples.length>60)this.samples.shift();
        const sorted=[...this.samples].sort((a,b)=>a-b);
        this.milliseconds=sorted[Math.floor(sorted.length/2)];
      }
      gl.deleteQuery(query);
    }
    if(disjoint){this.samples=[];this.milliseconds=null;return;}
    if(this.pending.length>=4)return;
    this.active=gl.createQuery();
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.active);
  }
  end() {
    if(!this.active)return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);this.active=null;
  }
}
