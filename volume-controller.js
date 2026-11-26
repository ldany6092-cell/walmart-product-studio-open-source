export class VolumeController {
 constructor({state,hasVolume,canPreview,status,changed}){Object.assign(this,{state,hasVolume,canPreview,status,changed});this.ticket=0;this.cache=new Map();this.enabled=true;this.shown=false;this.image=document.createElement('img');this.image.alt='乳白PP体积散射结果';this.image.style='position:absolute;top:0;height:100vh;object-fit:contain;pointer-events:none;display:none;z-index:1';document.body.append(this.image)}
 invalidate(schedule=true){this.ticket++;clearTimeout(this.timer);this.engine?.cancel();this.shown=false;this.image.style.display='none';this.changed();if(schedule&&this.enabled&&this.hasVolume()&&this.canPreview())this.timer=setTimeout(()=>this.preview(),1400)}
 async request(params,ticket){
  const key=JSON.stringify(params);if(this.cache.has(key))return this.cache.get(key);
  if(!this.loading)this.loading=import('./volume-engine.js').then(({VolumePPStudio})=>this.engine=new VolumePPStudio());
  const engine=await this.loading;if(ticket!==this.ticket)throw Object.assign(Error('已取消旧视图'),{name:'AbortError'});
  const blob=await engine.render(params,event=>{if(ticket!==this.ticket)return;const labels={building:'正在准备体积散射',compiling:'正在准备散射计算',rendering:'正在计算乳白PP散射',denoising:'正在柔化散射噪点',complete:'体积散射已完成'};this.status(labels[event.stage]||'正在更新散射材质')});
  this.cache.set(key,blob);if(this.cache.size>4)this.cache.delete(this.cache.keys().next().value);return blob;
 }
 async show(blob,aspect,ticket){if(ticket!==this.ticket)return;const url=URL.createObjectURL(blob);this.image.src=url;try{await this.image.decode()}catch(error){URL.revokeObjectURL(url);throw error}if(ticket!==this.ticket){URL.revokeObjectURL(url);return}if(this.url)URL.revokeObjectURL(this.url);this.url=url;this.image.style.width=(aspect*100)+'vh';this.image.style.left='calc((100vw - '+(aspect*100)+'vh)/2)';this.image.style.display='block';this.shown=true;this.changed();this.status('体积散射已更新 · 同材质定格导出')}
 async preview(){if(!this.enabled||!this.hasVolume()||!this.canPreview())return;const ticket=this.ticket;const scale=Math.min(1,960/innerWidth,960/innerHeight),width=Math.max(64,Math.round(innerWidth*scale)),height=Math.max(64,Math.round(innerHeight*scale));try{const blob=await this.request({...this.state(),width,height,samples:64},ticket);await this.show(blob,width/height,ticket)}catch(error){if(error.name!=='AbortError'&&ticket===this.ticket)this.status(error.message)}}
 async capture(size=2048){const ticket=this.ticket;const dim=Math.max(256,Math.min(4096,Math.round(Number(size)||2048)));const blob=await this.request({...this.state(),width:dim,height:dim,samples:128},ticket);await this.show(blob,1,ticket);return blob}
}
