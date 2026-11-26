import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import * as THREE from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WebGPUPathTracer,TRANSMISSIVE_BACKGROUND_TRANSPARENT} from 'three-gpu-pathtracer/webgpu';

const abort=()=>Object.assign(new Error('已取消旧画面'),{name:'AbortError'});
const assetURL=path=>new URL(path,document.baseURI).href;
export class VolumePPStudio {
 constructor(){this.generation=0;this.chain=Promise.resolve();this.cache=new Map();this.active=null}
 cancel(){this.generation++}
 render(params,progress=()=>{}){const id=++this.generation;const task=this.chain.catch(()=>{}).then(()=>this._render(id,params,progress));this.chain=task;return task}
 async init(){
  if(this.ready)return this.ready;
  this.ready=(async()=>{
   if(!navigator.gpu)throw Error('这个浏览器未启用WebGPU，无法计算参考材质。请在支持WebGPU的浏览器中使用，或选择快速浏览。');
   this.canvas=document.createElement('canvas');this.renderer=new THREE.WebGPURenderer({canvas:this.canvas,alpha:true,antialias:false,trackTimestamp:true});await this.renderer.init();if(!this.renderer.backend.isWebGPUBackend)throw Error('当前设备无法启用WebGPU体积散射');
   this.renderer.setPixelRatio(1);this.renderer.setClearColor(0,0);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=2.4;
   this.scene=new THREE.Scene();this.scene.background=null;this.camera=new THREE.PerspectiveCamera(34,1,.01,100);
   const env=await new HDRLoader().setDataType(THREE.FloatType).loadAsync(assetURL('./assets/studio.hdr'));
   for(let i=0;i<env.image.data.length;i+=4)for(let c=0;c<3;c++)env.image.data[i+c]=env.image.data[i+c]*.2+.65;
   env.mapping=THREE.EquirectangularReflectionMapping;env.needsUpdate=true;this.scene.environment=env;this.scene.environmentIntensity=.85;
   for(const [pos,intensity,width]of [[[-3,6,4],6,5],[[4,4,2],3,4],[[1,5,-4],5,4]]){const light=new THREE.RectAreaLight(0xffffff,intensity,width,width);light.position.fromArray(pos);light.lookAt(0,0,0);this.scene.add(light)}
   this.tracer=new WebGPUPathTracer(this.renderer);this.tracer.maxBounces=16;this.tracer.maxSubsurfaceBounces=256;this.tracer.dynamicLowRes=false;this.tracer.renderDelay=0;this.tracer.fadeDuration=0;this.tracer.asyncCompile=true;this.tracer.transmissiveBackground=TRANSMISSIVE_BACKGROUND_TRANSPARENT;this.tracer.frameBudget=500000;
   this.tracer.addEventListener('progress',event=>this.progress?.({stage:event.stage,progress:event.progress,samples:event.samples}));
  })();return this.ready;
 }
 async _render(id,p,progress){
  await this.init();if(id!==this.generation)throw abort();this.progress=progress;this.failure=null;progress({stage:'building',progress:0});
  let entry=this.cache.get(p.file);const changed=this.active!==p.file;
  if(!entry){const gltf=await new GLTFLoader().loadAsync(assetURL(p.file));const wrapper=new THREE.Group();wrapper.add(gltf.scene);entry={model:wrapper,meshes:[]};entry.model.traverse(o=>{if(o.isMesh)entry.meshes.push(o)});const box=new THREE.Box3().setFromObject(entry.model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());gltf.scene.position.sub(center);wrapper.scale.setScalar(2.4/Math.max(size.x,size.y,size.z));this.cache.set(p.file,entry)}
  if(id!==this.generation)throw abort();if(changed){if(this.model)this.scene.remove(this.model);this.model=entry.model;this.scene.add(this.model);this.active=p.file}
  entry.meshes.forEach((object,index)=>{const style=p.partStyles['part_'+index]||{color:'#ffffff',category:'solid',roughness:42,transmission:58};const translucent=style.category==='transparent';const mat=object.userData.volumeMaterial?object.material:new THREE.MeshPhysicalMaterial({metalness:0,ior:1.49,side:THREE.DoubleSide});mat.color.set(translucent?0xffffff:style.color);mat.roughness=Math.max(translucent?.12:.02,style.roughness/100);mat.specularIntensity=translucent?.1:.45;mat.transmission=translucent?1:0;mat.thickness=translucent?.03:0;mat.scatterStrength=0;mat.attenuationDistance=Infinity;mat.attenuationColor.setRGB(1,1,1);
   if(translucent){const density=22*((p.sourceMaxCM||17)/17)*Math.exp(-2.3*(style.transmission/100-.58));mat.attenuationColor.setRGB(.5,.5,.5);mat.attenuationDistance=Math.log(2)/density;mat.scatterStrength=1;mat.multiscatterColor=new THREE.Color(style.color).multiplyScalar(.955);mat.scatterAnisotropy=0}object.material=mat;object.userData.volumeMaterial=true;
  });
  this.renderer.setSize(p.width,p.height,false);this.camera.aspect=p.width/p.height;this.camera.fov=p.fov;this.camera.position.fromArray(p.camera);this.camera.up.set(0,1,0);this.camera.lookAt(new THREE.Vector3().fromArray(p.target));this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);this.scene.updateMatrixWorld(true);
  this.tracer.maxSamples=p.samples||64;if(changed)this.tracer.setScene(this.scene,this.camera);else{this.tracer.updateMaterials();this.tracer.updateCamera()}
  const started=performance.now();while(!this.tracer.complete){if(id!==this.generation)throw abort();if(this.failure)throw this.failure;if(performance.now()-started>240000)throw Error('体积散射计算时间较长，请选择较低分辨率或快速浏览');this.tracer.renderSample();await this.renderer.backend.device.queue.onSubmittedWorkDone();await new Promise(resolve=>setTimeout(resolve,4))}
  if(id!==this.generation)throw abort();this.tracer.renderSample();await this.renderer.backend.device.queue.onSubmittedWorkDone();const blob=await new Promise((resolve,reject)=>this.canvas.toBlob(value=>value?resolve(value):reject(Error('无法生成散射PNG')),'image/png'));
  for(const [key,old]of this.cache){if(this.cache.size<=2)break;if(key===this.active)continue;old.model.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose()}});this.cache.delete(key)}
  progress({stage:'complete',progress:1});return blob;
 }
}
