import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PPViewport} from './pp-renderer.js';
import {VolumeController} from './volume-controller.js';
import {matchingProducts} from './product-search.js';
import {readLocalModels,importLocalModel} from './browser-library.js';
const $=s=>document.querySelector(s),scene=new THREE.Scene();
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.prepend(renderer.domElement);
const camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.01,100);camera.up.set(0,1,0);
const ppViewport=new PPViewport(renderer,scene,camera);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=1.8;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.88;
scene.add(new THREE.HemisphereLight(0xffffff,0xc3c8bc,1));const key=new THREE.DirectionalLight(0xfff9ef,2);key.position.set(-3,6,4);scene.add(key);const fill=new THREE.DirectionalLight(0xeaf8ff,.8);fill.position.set(4,3,-3);scene.add(fill);
// HDR studio illumination and background.
scene.background=new THREE.Color('#eeeee8');let exportingPNG=false;
const pmrem=new THREE.PMREMGenerator(renderer);await Promise.all([new Promise(resolve=>new RGBELoader().load('./assets/studio.hdr',t=>{t.mapping=THREE.EquirectangularReflectionMapping;scene.environment=pmrem.fromEquirectangular(t).texture;resolve()},undefined,()=>resolve())),new Promise(resolve=>new RGBELoader().load('./assets/original-background.hdr',t=>{t.mapping=THREE.EquirectangularReflectionMapping;scene.background=t;scene.backgroundBlurriness=.45;scene.backgroundIntensity=1.8;resolve()},undefined,()=>resolve()))]);
const defaults={hue:194,saturation:42,lightness:57,transmission:58,roughness:42};const vals={...defaults};const defs=[['hue','色相',360],['saturation','饱和度',100],['lightness','明度',100],['transmission','透明度',100],['roughness','粗糙度',100]];
let model,current,token=0,busy=false,filter='all',frameDirty=true;const selected=new Set();
let partMeshes=[],partStyles={},activePart='all',editingCategory='solid';
let savedPartStyles;try{savedPartStyles=JSON.parse(localStorage.getItem('pp-part-styles-v1'))||{}}catch{savedPartStyles={}}
function productCategory(item){if(!item)return 'unknown';const styles=savedPartStyles[item.id];return styles?Object.values(styles).some(p=>p.category==='transparent')?'transparent':'solid':item.defaultMaterial||item.category}
function hasTranslucentParts(){return partMeshes.some(o=>partStyles[o.userData.partKey]?.category==='transparent')}
function editTargets(){return activePart==='all'?partMeshes:activePart==='handles'?partMeshes.filter(o=>o.userData.partLabel.includes('把手')):partMeshes.filter(o=>o.userData.partKey===activePart)}
function persistParts(){if(current){savedPartStyles[current.id]=structuredClone(partStyles);try{localStorage.setItem('pp-part-styles-v1',JSON.stringify(savedPartStyles))}catch{}renderList()}}
function refreshPartMaterials(){for(const o of partMeshes){const style=partStyles[o.userData.partKey];let m=o.userData.ownPPMaterial?o.material:null;if(!m){m=new THREE.MeshPhysicalMaterial({metalness:0,ior:1.49,side:THREE.DoubleSide,forceSinglePass:true,specularIntensity:.3});ppViewport.configure(m);o.material=m;o.userData.ownPPMaterial=true}m.color.set(style.color);ppViewport.setStyle(m,style)}}
function syncPartControls(){const targets=editTargets();const first=targets.find(o=>partStyles[o.userData.partKey].category==='transparent')||targets[0];if(!first)return;const style=partStyles[first.userData.partKey],hsl={};new THREE.Color(style.color).getHSL(hsl,THREE.SRGBColorSpace);Object.assign(vals,{hue:Math.round(hsl.h*360),saturation:Math.round(hsl.s*100),lightness:Math.round(hsl.l*100),roughness:style.roughness,transmission:style.transmission});editingCategory=style.category;apply(false)}
function initParts(){partMeshes=[];model.traverse(o=>{if(o.isMesh){const index=partMeshes.length;o.userData.partKey='part_'+index;o.userData.partLabel=current.parts?.[index]?.label||current.parts?.[index]?.name||o.name||('部件 '+(index+1));partMeshes.push(o)}});activePart='all';const baseColor=new THREE.Color().setHSL(vals.hue/360,vals.saturation/100,vals.lightness/100,THREE.SRGBColorSpace);partStyles={};for(const o of partMeshes){const key=o.userData.partKey;partStyles[key]=savedPartStyles[current.id]?.[key]||{color:current.parts?.[partMeshes.indexOf(o)]?.defaultColor||current.defaultColor||'#'+baseColor.getHexString(),category:current.defaultMaterial||current.category,roughness:current.defaultRoughness??(current.category === 'transparent'?2:42),transmission:current.defaultTransparency??vals.transmission}}
 $('#partSelect').replaceChildren();function option(value,label){const e=document.createElement('option');e.value=value;e.textContent=label;$('#partSelect').append(e)}option('all','整个产品');if(partMeshes.filter(o=>o.userData.partLabel.includes('把手')).length>1)option('handles','两侧把手（一起调色）');for(const o of partMeshes)option(o.userData.partKey,o.userData.partLabel);$('#partSelect').value='all';syncPartControls()}
$('#partSelect').onchange=e=>{activePart=e.target.value;syncPartControls()};
for(const category of ['solid','transparent'])$('#material-'+category).onclick=()=>{editingCategory=category;apply(true,true);if(filter!=='all'){filter=hasTranslucentParts()?'transparent':'solid';document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));renderList()}};
let pointerStart;renderer.domElement.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY}});renderer.domElement.addEventListener('pointerup',e=>{if(busy||!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)return;const pointer=new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(partMeshes,false)[0];if(hit){activePart=hit.object.userData.partKey;$('#partSelect').value=activePart;syncPartControls()}});

// Preview and PNG export share this browser-rendered scene, without an external renderer.

let dimensionBounds;
let measuredDimensions;
let dimensionsEnabled = false;
const dimensionToggle = $('#showDimensions');
const dimensionOverlay = $('#dimensionOverlay');
const colorToggle = $('#toggleColor');
const materialPanel = $('#materialPanel');
let highlightedTool;
for (const id of ['toggleColor', 'showDimensions', 'rotate', 'reset']) {
  const button = $('#' + id);
  button.addEventListener('click', () => {
    highlightedTool?.classList.remove('is-selected');
    button.classList.add('is-selected');
    highlightedTool = button;
  });
}
colorToggle.onclick = () => {
  const open = materialPanel.hidden;
  materialPanel.hidden = !open;
  colorToggle.setAttribute('aria-expanded', String(open));
  colorToggle.classList.toggle('on', open);
};

dimensionToggle.onclick = () => {
  dimensionsEnabled = !dimensionsEnabled;
  dimensionToggle.setAttribute('aria-pressed', String(dimensionsEnabled));
  dimensionToggle.classList.toggle('on', dimensionsEnabled);
  frameDirty = true;
};

function drawDimensions() {
  const values = measuredDimensions;
  const hidden = !dimensionsEnabled || !dimensionBounds || !values;
  dimensionOverlay.toggleAttribute('hidden', hidden);
  if (hidden) return;
  camera.updateMatrixWorld();
  const { min, max } = dimensionBounds;
  const center = dimensionBounds.getCenter(new THREE.Vector3());
  const project = point => {
    const p = point.clone().project(camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2, z: p.z };
  };
  const screenCenter = project(center);
  const frontX = camera.position.x >= center.x ? max.x : min.x;
  const frontZ = camera.position.z >= center.z ? max.z : min.z;
  const corner = new THREE.Vector3(frontX, min.y, frontZ);
  const heightCorners = [
    new THREE.Vector3(min.x,min.y,min.z), new THREE.Vector3(max.x,min.y,min.z),
    new THREE.Vector3(min.x,min.y,max.z), new THREE.Vector3(max.x,min.y,max.z)
  ];
  const left = heightCorners.sort((a,b) => project(a).x - project(b).x)[0];
  const edges = [
    ['width', '宽', values[0], corner, new THREE.Vector3(frontX === max.x ? min.x : max.x,min.y,frontZ)],
    ['depth', '深', values[2], corner, new THREE.Vector3(frontX,min.y,frontZ === max.z ? min.z : max.z)],
    ['height', '高', values[1], left, new THREE.Vector3(left.x,max.y,left.z)]
  ];
  for (const [id, title, value, start, end] of edges) {
    const a = project(start), b = project(end);
    const line = $('#dimension-' + id), label = $('#dimension-label-' + id);
    const length = Math.hypot(b.x-a.x, b.y-a.y);
    const visible = length >= 12 && [a,b].every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.z >= -1 && p.z <= 1);
    line.style.display = label.style.display = visible ? '' : 'none';
    if (!visible) continue;
    const middle = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
    let nx = (a.y-b.y)/length, ny = (b.x-a.x)/length;
    if (nx*(middle.x-screenCenter.x) + ny*(middle.y-screenCenter.y) < 0) { nx=-nx; ny=-ny; }
    const offset = innerWidth < 600 ? 15 : 24;
    const ax=a.x+nx*offset, ay=a.y+ny*offset, bx=b.x+nx*offset, by=b.y+ny*offset;
    line.setAttribute('d', 'M'+(ax-nx*4)+' '+(ay-ny*4)+' L'+(ax+nx*4)+' '+(ay+ny*4)+' M'+ax+' '+ay+' L'+bx+' '+by+' M'+(bx-nx*4)+' '+(by-ny*4)+' L'+(bx+nx*4)+' '+(by+ny*4));
    label.setAttribute('x', String((ax+bx)/2+nx*13));
    label.setAttribute('y', String((ay+by)/2+ny*13));
    label.textContent = title + ' ' + value.toFixed(1) + ' cm';
  }
}

function renderScene(){if(!exportingPNG)drawDimensions();if(volumeController.shown&&!exportingPNG&&model){const visible=model.visible;model.visible=false;try{renderer.render(scene,camera)}finally{model.visible=visible};return}if(model)model.visible=true;ppViewport.render(model,partMeshes)}
let interacting=false;
const volumeController=new VolumeController({state:()=>({file:current.file,sourceMaxCM:current.sourceMaxCM||17,partStyles:structuredClone(partStyles),camera:camera.position.toArray().map(x=>Math.round(x*1e5)/1e5),target:controls.target.toArray().map(x=>Math.round(x*1e5)/1e5),fov:camera.fov}),hasVolume:hasTranslucentParts,canPreview:()=>!busy&&!interacting&&!controls.autoRotate,status:text=>$('#renderStatus').textContent=text,changed:()=>frameDirty=true});
$('#renderQuality').value=new URLSearchParams(location.search).get('quality')==='fast'?'fast':localStorage.getItem('pp-render-quality-v2')||'volume';volumeController.enabled=$('#renderQuality').value==='volume';$('#renderQuality').onchange=()=>{volumeController.enabled=$('#renderQuality').value==='volume';localStorage.setItem('pp-render-quality-v2',$('#renderQuality').value);invalidatePreview()};
function invalidatePreview(schedule=true){frameDirty=true;volumeController.invalidate(schedule);$('#renderStatus').textContent=hasTranslucentParts()?(volumeController.enabled?'快速显示中 · 停止操作后计算体积散射':'快速浏览 · 磨砂透光近似'):'实色 PP · 浏览器实时渲染'}
controls.addEventListener('start',()=>{interacting=true;invalidatePreview(false)});controls.addEventListener('end',()=>{interacting=false;invalidatePreview()});
$('#precise').textContent='↻ 刷新画面';$('#precise').onclick=()=>invalidatePreview();
controls.addEventListener('change',()=>invalidatePreview(!interacting));

function apply(write=true,changeType=false){
 const color=new THREE.Color().setHSL(vals.hue/360,vals.saturation/100,vals.lightness/100,THREE.SRGBColorSpace),hex='#'+color.getHexString();
 if(write){for(const o of editTargets())partStyles[o.userData.partKey]={color:hex,category:changeType?editingCategory:partStyles[o.userData.partKey].category,roughness:vals.roughness,transmission:vals.transmission};persistParts();refreshPartMaterials()}
 $('#picker').value=hex;$('#hex').textContent=hex.toUpperCase();for(const[id]of defs){$('#'+id).value=vals[id];$('#out-'+id).value=String(vals[id])}
 const types=new Set(editTargets().map(o=>partStyles[o.userData.partKey].category));const mixed=types.size>1;const transparent=types.has('transparent');$('#transmission').disabled=!transparent;$('#out-transmission').disabled=!transparent;$('#transmission').closest('.row').classList.toggle('disabled',!transparent);$('#transmission').title=transparent?'100% 更通透，0% 更乳白':'实色 PP 不使用透明度';$('#milkPreset').disabled=!transparent;
 $('#materialType').textContent=(activePart==='all'?'整个产品':$('#partSelect').selectedOptions?.[0]?.textContent||'选中部件')+' · '+(mixed?'混合材质':transparent?'半透明 PP':'实色 PP');for(const category of ['solid','transparent']){$('#material-'+category).classList.toggle('active',!mixed&&category===editingCategory);$('#material-'+category).setAttribute('aria-pressed',String(category===editingCategory))}
 if(write)invalidatePreview();if(!hasTranslucentParts())$('#renderStatus').textContent='实色 PP · 浏览器实时渲染';
}

for(const[id,label,max]of defs){const row=document.createElement('div');row.className='row';row.innerHTML=`<label for="${id}"><span>${label}</span><span class="value-field"><input type="number" id="out-${id}" aria-label="${label}精确数值" min="0" max="${max}" step="0.1" value="${vals[id]}"><span>${id==='hue'?'°':'%'}</span></span></label><input type="range" id="${id}" min="0" max="${max}" step="0.1" value="${vals[id]}">`;$('#sliders').append(row);
 const number=$('#out-'+id),range=$('#'+id);function update(raw){if(raw==='')return;const n=Number(raw);if(!Number.isFinite(n))return;vals[id]=Math.min(max,Math.max(0,n));apply()}
 range.oninput=e=>update(e.target.value);number.oninput=e=>update(e.target.value);number.onfocus=()=>number.select();number.onblur=()=>{number.value=String(vals[id])};number.onkeydown=e=>{if(e.key==='Enter'){number.blur();e.preventDefault()}};
}

function setColor(hex){const hsl={};new THREE.Color(hex).getHSL(hsl,THREE.SRGBColorSpace);vals.hue=Math.round(hsl.h*360);vals.saturation=Math.round(hsl.s*100);vals.lightness=Math.round(hsl.l*100);apply()}
$('#picker').oninput=e=>setColor(e.target.value);$('#milkPreset').onclick=()=>{$('#renderQuality').value='volume';volumeController.enabled=true;localStorage.setItem('pp-render-quality-v2','volume');Object.assign(vals,{hue:0,saturation:0,lightness:100,transmission:58,roughness:2});apply()};
let colors;try{colors=JSON.parse(localStorage.getItem('pp-colors'))}catch{}if(!Array.isArray(colors))colors=['#ffffff','#a8dd66','#51c9d4','#bc7995','#dca16c','#ab6bd6','#91c8d8','#e4a7bb','#b5c8a1','#d4c4e5','#f4f0e8'];colors=colors.filter(c=>/^#[0-9a-f]{6}$/i.test(c));colors=[...new Set(colors)];function palette(){$('#palette').replaceChildren();for(const hex of colors){const b=document.createElement('button');b.style.background=hex;b.title=hex;b.setAttribute('aria-label','应用颜色 '+hex);b.onclick=()=>setColor(hex);$('#palette').append(b)}}palette();$('#addColor').onclick=()=>{const hex=$('#picker').value;if(!colors.includes(hex))colors.push(hex);try{localStorage.setItem('pp-colors',JSON.stringify(colors))}catch{}palette()};
$('#deleteColor').onclick=()=>{const hex=$('#picker').value.toLowerCase();colors=colors.filter(c=>c.toLowerCase()!==hex);localStorage.setItem('pp-colors',JSON.stringify(colors));palette()};
const catalog=[];if(globalThis.PRODUCT_STUDIO_STATIC)catalog.push(...await readLocalModels());const loader=new GLTFLoader(),modelCache=new Map();
async function cachedModel(item){let entry=modelCache.get(item.file);if(entry){modelCache.delete(item.file);modelCache.set(item.file,entry);return entry.promise}entry={gltf:null};entry.promise=loader.loadAsync(item.file.startsWith('blob:')?item.file:item.file+'?v=components-2').then(gltf=>(entry.gltf=gltf)).catch(error=>{modelCache.delete(item.file);throw error});modelCache.set(item.file,entry);return entry.promise}
function trimModelCache(){for(const[key,entry]of modelCache){if(modelCache.size<=3)break;if(key===current?.file||!entry.gltf)continue;entry.gltf.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(o.userData.ownPPMaterial)o.material.dispose()}});modelCache.delete(key)}}
function viewState(){return{position:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov}}
function restoreView(view){camera.position.fromArray(view.position);controls.target.fromArray(view.target);camera.fov=view.fov;camera.updateProjectionMatrix();const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;invalidatePreview(false)}

function reset(){controls.autoRotate=false;$('#rotate').classList.remove('on');camera.position.fromArray(current?.defaultCamera||[2.6,2.43,4.5]);camera.up.set(0,1,0);controls.target.fromArray(current?.defaultTarget||[0,0,0]);const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping}

async function load(item){invalidatePreview(false);const ticket=++token;$('#loading').style.display='block';$('#loading').textContent='正在加载 '+item.name+'…';$('#shot').disabled=true;try{const gltf=await cachedModel(item);if(ticket!==token)return false;if(model){scene.remove(model)}if(current?.category!==item.category)vals.roughness=item.category==='transparent'?2:42;current=item;model=gltf.scene;const wrapper=new THREE.Group();wrapper.add(model);model=wrapper;scene.add(model);model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const span = Math.max(size.x, size.y, size.z);
const sourceSpanCM = item.sourceMaxCM ?? (item.dimensionsCM ? Math.max(...item.dimensionsCM) : undefined);
measuredDimensions = Number.isFinite(span) && span > 0 && Number.isFinite(sourceSpanCM) && sourceSpanCM > 0
  ? [size.x, size.y, size.z].map(value => value * sourceSpanCM / span)
  : undefined;
model.children[0].position.sub(center);
model.scale.setScalar(2.4 / span);
dimensionBounds = new THREE.Box3().setFromObject(model);
dimensionToggle.disabled = !measuredDimensions;
dimensionToggle.title = measuredDimensions ? '按模型外轮廓估算' : '暂无真实尺寸比例';
reset();initParts();refreshPartMaterials();trimModelCache();invalidatePreview();$('#name').textContent=item.name;$('#count').textContent=(catalog.indexOf(item)+1)+' / '+catalog.length+' · Y UP / '+(item.defaultCamera?'产品预设方向 · 略俯视':'30° · 俯视 25°');$('#loading').style.display='none';$('#shot').disabled=false;document.querySelectorAll('.products button').forEach(b=>b.classList.toggle('active',b.dataset.id===item.id));return true}catch(e){$('#loading').textContent='模型加载失败：'+item.name;console.error(e);return false}}
function renderList(){$('#products').replaceChildren();const results=matchingProducts(catalog,{query:$('#productSearch').value,filter,category:productCategory});$('#searchResult').textContent=results.length?'共 '+results.length+' 款产品':'没有找到匹配产品';for(const item of results){const row=document.createElement('div');row.className='product-row';const cb=document.createElement('input');cb.type='checkbox';cb.checked=selected.has(item.id);cb.setAttribute('aria-label','选择下载 '+item.name);cb.onchange=()=>{if(cb.checked)selected.add(item.id);else selected.delete(item.id);$('#selectedCount').textContent=selected.size};const b=document.createElement('button');b.textContent=item.name;b.dataset.id=item.id;b.classList.toggle('active',current?.id===item.id);b.onclick=()=>{if(!busy)load(item)};row.append(cb,b);$('#products').append(row)}}
$('#productSearch').oninput=()=>renderList();$('#productSearch').onkeydown=e=>{if(e.key==='Escape'){$('#productSearch').value='';renderList()}};
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderList();if(filter!=='all'&&productCategory(current)!==filter){const first=matchingProducts(catalog,{query:$('#productSearch').value,filter,category:productCategory})[0];if(first&&!busy)load(first)}};const milkMode=new URLSearchParams(location.search).get('material')==='milk-sss';renderList();if(catalog.length){await load(catalog[0])}else{$('#loading').style.display='none';$('#name').textContent='上传模型';$('#shot').disabled=true;}if(milkMode)$('#milkPreset').click();
$('#uploadModel').onclick=()=>$('#modelFile').click();
$('#modelFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;const button=$('#uploadModel');button.disabled=true;$('#uploadStatus').textContent='正在导入 '+file.name;try{if(!file.name.toLowerCase().endsWith('.glb'))throw Error('请选择 GLB 格式模型');const category=$('#uploadCategory').value;const item=await importLocalModel(file,category);catalog.push(item);filter=category;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));renderList();await load(item);$('#uploadStatus').textContent='已保存到本机产品库'}catch(error){$('#uploadStatus').textContent=error.message}finally{button.disabled=false;e.target.value=''}};
$('#reset').onclick=reset;$('#rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('#rotate').classList.toggle('on',controls.autoRotate);invalidatePreview()};
function download(blob,name){$('#exportStatus').textContent='已生成：';let previous=$('#exportStatus a');if(previous)URL.revokeObjectURL(previous.href);let result=document.createElement('a');result.textContent=name;result.style='color:#365b45;word-break:break-all';result.href=URL.createObjectURL(blob);result.download=name;$('#exportStatus').append(result);const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function capture(){invalidatePreview(false);if(volumeController.enabled&&hasTranslucentParts()){$('#loading').style.display='block';$('#loading').textContent='正在计算无背景体积散射定格…';try{return await volumeController.capture()}finally{$('#loading').style.display='none'}}const old=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio(),aspect=camera.aspect,background=scene.background,clearColor=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();renderer.setPixelRatio(1);renderer.setSize(2048,2048,false);camera.aspect=1;camera.updateProjectionMatrix();scene.background=null;renderer.setClearColor(0,0);try{exportingPNG=true;renderScene();return await new Promise((resolve,reject)=>renderer.domElement.toBlob(b=>b?resolve(b):reject(Error('无法导出图片')),'image/png'))}finally{exportingPNG=false;scene.background=background;renderer.setClearColor(clearColor,alpha);renderer.setPixelRatio(ratio);renderer.setSize(old.x,old.y,false);camera.aspect=aspect;camera.updateProjectionMatrix();frameDirty=true}}

$('#shot').onclick=async()=>{if(!model||busy)return;busy=true;const previousEnabled=controls.enabled;controls.enabled=false;document.body.classList.toggle('capturing',true);controls.autoRotate=false;$('#rotate').classList.remove('on');try{const blob=await capture();download(blob,current.name+'_'+$('#picker').value.slice(1)+'_无背景.png');$('#flash').style.opacity='.9';setTimeout(()=>$('#flash').style.opacity='0',100)}catch(e){$('#loading').style.display='block';$('#loading').textContent=e.message}finally{busy=false;controls.enabled=previousEnabled;document.body.classList.toggle('capturing',false);invalidatePreview()}};
// ZIP with stored entries: one browser download for all selected product snapshots.
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});function crc(data){let c=0xffffffff;for(const v of data)c=crcTable[(c^v)&255]^(c>>>8);return(c^0xffffffff)>>>0}function header(size){const a=new Uint8Array(size),v=new DataView(a.buffer);return{a,v}}
function zip(files){let chunks=[],central=[],offset=0,total=0;const enc=new TextEncoder();for(const f of files){const name=enc.encode(f.name),data=f.data,c=crc(data),h=header(30);h.v.setUint32(0,0x04034b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint32(14,c,true);h.v.setUint32(18,data.length,true);h.v.setUint32(22,data.length,true);h.v.setUint16(26,name.length,true);chunks.push(h.a,name,data);const ch=header(46);ch.v.setUint32(0,0x02014b50,true);ch.v.setUint16(4,20,true);ch.v.setUint16(6,20,true);ch.v.setUint16(8,0x800,true);ch.v.setUint32(16,c,true);ch.v.setUint32(20,data.length,true);ch.v.setUint32(24,data.length,true);ch.v.setUint16(28,name.length,true);ch.v.setUint32(42,offset,true);central.push(ch.a,name);offset+=30+name.length+data.length;total+=46+name.length}const end=header(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,total,true);end.v.setUint32(16,offset,true);return new Blob([...chunks,...central,end.a],{type:'application/zip'})}
$('#batch').onclick=async()=>{if(busy)return;const list=catalog.filter(i=>selected.has(i.id));if(!list.length){$('#batch').textContent='请先勾选右侧模型';setTimeout(()=>{$('#batch').innerHTML='↓ 下载已选模型定格图 <span id="selectedCount">0</span>'},1700);return}busy=true;$('#batch').disabled=true;controls.enabled=false;const before=current,originalView=viewState(),files=[];try{for(const[itemIndex,item]of list.entries()){if(!await load(item))throw Error('加载失败：'+item.name);restoreView(originalView);$('#loading').style.display='block';$('#loading').textContent='正在生成 '+(itemIndex+1)+' / '+list.length;const blob=await capture();files.push({name:item.name.replace(/[\\/:*?"<>|]/g,'_')+'_'+$('#picker').value.slice(1)+'_无背景.png',data:new Uint8Array(await blob.arrayBuffer())})}download(zip(files),'PP产品定格图_'+$('#picker').value.slice(1)+'.zip')}catch(e){alert(e.message)}finally{await load(before);restoreView(originalView);busy=false;controls.enabled=true;$('#batch').disabled=false;$('#loading').style.display='none';invalidatePreview()}};
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);invalidatePreview()});renderer.setAnimationLoop(()=>{if(!busy){controls.update();if(frameDirty||controls.autoRotate){renderScene();frameDirty=false}}});
