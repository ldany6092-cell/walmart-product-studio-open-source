import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PPViewport} from './pp-renderer.js';
import {VolumeController} from './volume-controller.js';
import {matchingProducts} from './product-search.js';
import {
  DEFAULT_CACHE_LIMITS,
  cacheModelInLibrary,
  computeFileSignature,
  ensureModelObjectURL,
  getLastMigratedModelIds,
  getLibraryCacheStats,
  indexSelectedFiles,
  migratePersistedStateMap,
  readLocalModels,
  readModelBytes,
} from './browser-library.js';
import {
  ModelSceneCache,
  formatDisplayName,
  loadModelScene,
  supportsVolumePathTracing,
} from './model-loader.js';
import {
  getEditTargets,
  getHandleGroupOption,
  resolvePartLabel,
} from './part-utils.js';
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  EXPORT_RESOLUTION_PRESETS,
  STANDARD_VIEW_PRESETS,
  buildExportFilename,
  clampExportSize,
  clampJpgQuality,
  compositeToExportBlob,
  ensureUniqueFilename,
  getSelectedViewPresets,
  normalizeExportConfig,
  normalizeHexColor,
  resolveViewCamera,
} from './export-utils.js';
import {
  formatPantoneExportToken,
  lookupPantone,
  searchPantone,
} from './pantone-colors.js';
import {
  IDENTITY_QUATERNION,
  formatOrientationSummary,
  isIdentityOrientation,
  mountAndGroundModel,
  normalizeOrientation,
  rotateOrientationByAxis,
} from './model-orientation.js';
import {
  SURFACE_FINISH_PRESETS,
  finishFromRoughness,
  getSurfaceFinishPreset,
} from './surface-finish.js';
import {
  computeSafeFrameRect,
  computeSafeViewportRect,
  layoutDimensionAnnotation,
} from './viewport-safe-area.js';
import {
  COLOR_INPUT_MODES,
  clampInt,
  cmykToHex,
  hexToCmyk,
  hexToRgb,
  parseHexInput,
  rgbToHex,
} from './color-models.js';
import {
  FINISH_LABEL_KEYS,
  VIEW_LABEL_KEYS,
  createTranslator,
  normalizeLocale,
} from './i18n.js';

let savedLocale;
try { savedLocale = localStorage.getItem('polystudio-lang-v1'); } catch {}
const i18n = createTranslator(normalizeLocale(savedLocale));
const t = (key, params) => i18n.t(key, params);
function getViewLabel(presetOrId) {
  const id = typeof presetOrId === 'string' ? presetOrId : presetOrId?.id;
  const key = VIEW_LABEL_KEYS[id];
  return key ? t(key) : (presetOrId?.label || t('viewCurrent'));
}
function getDisplayModelName(item) {
  if (!item) return '';
  if (item.id === 'builtin_demo_coffee_cup') return t('demoModelName');
  return item.name;
}
const $=s=>document.querySelector(s),scene=new THREE.Scene();
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.prepend(renderer.domElement);
const camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.01,100);camera.up.set(0,1,0);
const ppViewport=new PPViewport(renderer,scene,camera);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=1.8;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.88;
scene.add(new THREE.HemisphereLight(0xffffff,0xc3c8bc,1));const key=new THREE.DirectionalLight(0xfff9ef,2);key.position.set(-3,6,4);scene.add(key);const fill=new THREE.DirectionalLight(0xeaf8ff,.8);fill.position.set(4,3,-3);scene.add(fill);
// HDR studio illumination and background.
scene.background=new THREE.Color('#eeeee8');let exportingPNG=false;
const pmrem=new THREE.PMREMGenerator(renderer);await Promise.all([new Promise(resolve=>new RGBELoader().load('./assets/studio.hdr',t=>{t.mapping=THREE.EquirectangularReflectionMapping;scene.environment=pmrem.fromEquirectangular(t).texture;resolve()},undefined,()=>resolve())),new Promise(resolve=>new RGBELoader().load('./assets/original-background.hdr',t=>{t.mapping=THREE.EquirectangularReflectionMapping;scene.background=t;scene.backgroundBlurriness=.45;scene.backgroundIntensity=1.8;resolve()},undefined,()=>resolve()))]);
const DEFAULT_FALLBACK_COLOR='#91c8d8';
const defaults={transmission:58,roughness:42};const vals={...defaults};const defs=[['transmission','sliderTransmission',100],['roughness','sliderRoughness',100]];
let model,current,token=0,busy=false,filter='all',frameDirty=true;const selected=new Set();
let partMeshes=[],partStyles={},activePart='all',editingCategory='solid',activeColorHex=DEFAULT_FALLBACK_COLOR,activeColorMode='pantone';
let savedPartStyles;try{savedPartStyles=JSON.parse(localStorage.getItem('pp-part-styles-v1'))||{}}catch{savedPartStyles={}}
let savedAliases;try{savedAliases=JSON.parse(localStorage.getItem('pp-model-aliases-v1'))||{}}catch{savedAliases={}}
function recordModelAlias(item){if(!item?.id)return;const sig=item.fileSignature||computeFileSignature(item);if(savedAliases[sig]!==item.id){savedAliases[sig]=item.id;try{localStorage.setItem('pp-model-aliases-v1',JSON.stringify(savedAliases))}catch{}}}
function persistSavedPartStyles(){try{localStorage.setItem('pp-part-styles-v1',JSON.stringify(savedPartStyles))}catch{}}
function captureOriginalMeshColor(mesh){if(mesh.userData.originalColor!==undefined)return mesh.userData.originalColor;if(mesh.userData.ownPPMaterial)return null;const mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;const col=mat?.color;if(col&&col.isColor){const hex='#'+col.getHexString();mesh.userData.originalColor=hex;return hex}mesh.userData.originalColor=null;return null}
function productCategory(item){if(!item)return 'unknown';const styles=savedPartStyles[item.id];return styles?Object.values(styles).some(p=>p.category==='transparent')?'transparent':'solid':item.defaultMaterial||item.category}
function hasTranslucentParts(){return partMeshes.some(o=>partStyles[o.userData.partKey]?.category==='transparent')}
function editTargets(){return getEditTargets(activePart,partMeshes)}
function persistParts(){if(current){savedPartStyles[current.id]=structuredClone(partStyles);recordModelAlias(current);persistSavedPartStyles();renderList()}}
function refreshPartMaterials(){for(const o of partMeshes){const style=partStyles[o.userData.partKey];let m=o.userData.ownPPMaterial?o.material:null;if(!m){m=new THREE.MeshPhysicalMaterial({metalness:0,ior:1.49,side:THREE.DoubleSide,forceSinglePass:true,specularIntensity:.3});ppViewport.configure(m);o.material=m;o.userData.ownPPMaterial=true}m.color.set(style.color);ppViewport.setStyle(m,style)}}
function syncPartControls(){const targets=editTargets();const first=targets.find(o=>partStyles[o.userData.partKey]?.category==='transparent')||targets[0];if(!first)return;const style=partStyles[first.userData.partKey];activeColorHex=normalizeHexColor(style.color,DEFAULT_FALLBACK_COLOR);vals.roughness=style.roughness;vals.transmission=style.transmission;editingCategory=style.category;apply(null)}
function populatePartSelect(){
  const sel=$('#partSelect');
  if(!sel)return;
  const keep=activePart;
  sel.replaceChildren();
  function option(value,label){const e=document.createElement('option');e.value=value;e.textContent=label;sel.append(e)}
  option('all',t('wholeProduct'));
  const handleGroup=getHandleGroupOption(partMeshes);
  if(handleGroup){
    const handleCount=getEditTargets('handles',partMeshes).length;
    option(handleGroup.value,t('handleGroup',{count:handleCount}));
  }
  for(const o of partMeshes)option(o.userData.partKey,o.userData.partLabel);
  sel.value=Array.from(sel.options).some(o=>o.value===keep)?keep:'all';
  activePart=sel.value;
}
function initParts(){partMeshes=[];model.traverse(o=>{if(o.isMesh){const index=partMeshes.length;o.userData.partKey='part_'+index;o.userData.partLabel=resolvePartLabel(o,index,current.parts);captureOriginalMeshColor(o);partMeshes.push(o)}});activePart='all';partStyles={};for(const o of partMeshes){const index=partMeshes.indexOf(o),key=o.userData.partKey;const saved=savedPartStyles[current.id]?.[key];const defaultRough=current.defaultRoughness??defaults.roughness;const defaultTrans=current.defaultTransparency??defaults.transmission;const defaultColor=normalizeHexColor(current.parts?.[index]?.defaultColor||o.userData.cadColor||o.userData.originalColor||current.defaultColor,DEFAULT_FALLBACK_COLOR);partStyles[key]=saved?{...saved,color:normalizeHexColor(saved.color,defaultColor),finish:saved.finish||finishFromRoughness(saved.roughness)}:{color:defaultColor,category:current.defaultMaterial||current.category||'solid',roughness:defaultRough,finish:finishFromRoughness(defaultRough),transmission:defaultTrans,pantone:''}}
 populatePartSelect();syncPartControls()}
$('#partSelect').onchange=e=>{activePart=e.target.value;syncPartControls()};
for(const category of ['solid','transparent'])$('#material-'+category).onclick=()=>{editingCategory=category;apply({category});if(filter!=='all'){filter=hasTranslucentParts()?'transparent':'solid';document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));renderList()}};
let pointerStart;renderer.domElement.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY}});renderer.domElement.addEventListener('pointerup',e=>{if(busy||!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)return;const pointer=new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(partMeshes,false)[0];if(hit){activePart=hit.object.userData.partKey;$('#partSelect').value=activePart;syncPartControls()}});

// Preview and PNG export share this browser-rendered scene, without an external renderer.

let dimensionBounds;
let measuredDimensions;
let dimensionsEnabled = false;
let safeFrameEnabled = false;
let groundTargetY = 0;
let currentContentRoot = null;
let currentSourceSpanCM;
let savedOrientations;
try { savedOrientations = JSON.parse(localStorage.getItem('pp-model-orientation-v1')) || {}; } catch { savedOrientations = {}; }
const dimensionToggle = $('#showDimensions');
const safeFrameToggle = $('#toggleSafeFrame');
const dimensionOverlay = $('#dimensionOverlay');
const materialPanel = $('#materialPanel');

const MENU_CONFIG = {
  model: { eyebrowKey: 'drawerModelEyebrow', titleKey: 'drawerModelTitle', pane: '#paneModel', btn: '#menuModel' },
  material: { eyebrowKey: 'drawerMaterialEyebrow', titleKey: 'drawerMaterialTitle', pane: '#paneMaterial', btn: '#menuMaterial' },
  view: { eyebrowKey: 'drawerViewEyebrow', titleKey: 'drawerViewTitle', pane: '#paneView', btn: '#menuView' },
  export: { eyebrowKey: 'drawerExportEyebrow', titleKey: 'drawerExportTitle', pane: '#paneExport', btn: '#menuExport' },
};
let activeMenu = 'material';
function setActiveMenu(menuId) {
  const exportFooter = $('#exportFooter');
  if (!menuId || !MENU_CONFIG[menuId]) {
    activeMenu = null;
    materialPanel.hidden = true;
    if (exportFooter) exportFooter.hidden = true;
    for (const cfg of Object.values(MENU_CONFIG)) {
      const btn = $(cfg.btn);
      btn?.classList.remove('on');
      btn?.setAttribute('aria-selected', 'false');
    }
    frameDirty = true;
    return;
  }
  activeMenu = menuId;
  materialPanel.hidden = false;
  if (exportFooter) exportFooter.hidden = menuId !== 'export';
  const currentCfg = MENU_CONFIG[menuId];
  $('#drawerEyebrow').textContent = t(currentCfg.eyebrowKey);
  $('#drawerTitle').textContent = t(currentCfg.titleKey);
  for (const [id, cfg] of Object.entries(MENU_CONFIG)) {
    const isSelected = id === menuId;
    const btn = $(cfg.btn);
    btn?.classList.toggle('on', isSelected);
    btn?.setAttribute('aria-selected', String(isSelected));
    const pane = $(cfg.pane);
    if (pane) pane.hidden = !isSelected;
  }
  frameDirty = true;
}
for (const btn of document.querySelectorAll('[data-menu]')) {
  btn.addEventListener('click', () => {
    const target = btn.dataset.menu;
    setActiveMenu(activeMenu === target && !materialPanel.hidden ? null : target);
  });
}
$('#closeDrawer').onclick = () => setActiveMenu(null);
document.addEventListener('click', e => {
  const menu = $('#openFileMenu');
  if (menu?.open && !menu.contains(e.target)) menu.open = false;
});
setActiveMenu('material');

dimensionToggle.onclick = () => {
  dimensionsEnabled = !dimensionsEnabled;
  dimensionToggle.setAttribute('aria-pressed', String(dimensionsEnabled));
  dimensionToggle.classList.toggle('on', dimensionsEnabled);
  dimensionToggle.textContent = t(dimensionsEnabled ? 'hideDimensions' : 'showDimensions');
  frameDirty = true;
};

safeFrameToggle.onclick = () => {
  safeFrameEnabled = !safeFrameEnabled;
  safeFrameToggle.setAttribute('aria-pressed', String(safeFrameEnabled));
  safeFrameToggle.classList.toggle('on', safeFrameEnabled);
  frameDirty = true;
};

function getLiveSafeViewportRect() {
  const toolbar = $('.studio-toolbar');
  const metaBar = $('.studio-meta');
  const rail = $('#catalogRail');
  const headerEl = $('header');
  const toolbarBottom = toolbar ? toolbar.getBoundingClientRect().bottom : 58;
  const headerBottom = headerEl && innerHeight > 520 ? headerEl.getBoundingClientRect().bottom : toolbarBottom;
  const bottomTop = metaBar ? metaBar.getBoundingClientRect().top : innerHeight - 36;
  const leftRight = rail && !rail.hidden ? rail.getBoundingClientRect().right : 0;
  const rightLeft = materialPanel && !materialPanel.hidden ? materialPanel.getBoundingClientRect().left : innerWidth;
  return computeSafeViewportRect({
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    topBarBottom: Math.max(toolbarBottom, headerBottom),
    bottomBarTop: bottomTop,
    leftPanelRight: leftRight,
    rightPanelLeft: rightLeft,
    padding: 14,
  });
}

function drawSafeFrame(safeRect, showFrame) {
  const group = $('#safeFrameGroup');
  if (!group) return;
  if (!showFrame) {
    group.setAttribute('hidden', '');
    return;
  }
  const frame = computeSafeFrameRect({ viewportWidth: innerWidth, viewportHeight: innerHeight, safeRect });
  if (!frame.visible) {
    group.setAttribute('hidden', '');
    return;
  }
  group.removeAttribute('hidden');
  const box = $('#safeFrameBox');
  box.setAttribute('x', String(frame.left));
  box.setAttribute('y', String(frame.top));
  box.setAttribute('width', String(frame.width));
  box.setAttribute('height', String(frame.height));

  const c = Math.min(18, Math.round(Math.min(frame.width, frame.height) * 0.08));
  const l = frame.left, t = frame.top, r = frame.right, b = frame.bottom;
  $('#safeFrameCorners').setAttribute(
    'd',
    `M${l} ${t + c} L${l} ${t} L${l + c} ${t} `
    + `M${r - c} ${t} L${r} ${t} L${r} ${t + c} `
    + `M${r} ${b - c} L${r} ${b} L${r - c} ${b} `
    + `M${l + c} ${b} L${l} ${b} L${l} ${b - c}`,
  );

  const labelW = 92, labelH = 18;
  const lx = (l + r) / 2;
  const ly = Math.max(safeRect.top + labelH / 2 + 2, t + labelH / 2 + 6);
  const bg = $('#safeFrameLabelBg');
  bg.setAttribute('x', String(lx - labelW / 2));
  bg.setAttribute('y', String(ly - labelH / 2));
  bg.setAttribute('width', String(labelW));
  bg.setAttribute('height', String(labelH));
  const txt = $('#safeFrameLabelText');
  txt.setAttribute('x', String(lx));
  txt.setAttribute('y', String(ly));
}

function drawDimensions() {
  const values = measuredDimensions;
  const showDims = Boolean(dimensionsEnabled && dimensionBounds && values);
  const showFrame = Boolean(safeFrameEnabled || showDims);
  const overlayHidden = !showDims && !showFrame;
  dimensionOverlay.toggleAttribute('hidden', overlayHidden);
  if (overlayHidden) return;

  const safeRect = getLiveSafeViewportRect();
  drawSafeFrame(safeRect, showFrame);

  const linesGroup = $('#dimensionLinesGroup');
  linesGroup.toggleAttribute('hidden', !showDims);
  if (!showDims) return;

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
    new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(max.x, min.y, max.z),
  ];
  const left = heightCorners.sort((a, b) => project(a).x - project(b).x)[0];
  const edges = [
    ['width', t('dimWidth'), values[0], corner, new THREE.Vector3(frontX === max.x ? min.x : max.x, min.y, frontZ)],
    ['depth', t('dimDepth'), values[2], corner, new THREE.Vector3(frontX, min.y, frontZ === max.z ? min.z : max.z)],
    ['height', t('dimHeight'), values[1], left, new THREE.Vector3(left.x, max.y, left.z)],
  ];

  const placedRects = [];
  const offset = innerWidth < 600 ? 14 : 22;
  for (const [id, title, value, start, end] of edges) {
    const a = project(start), b = project(end);
    const groupEl = $('#dim-group-' + id);
    const line = $('#dimension-' + id);
    const pill = $('#dimension-bg-' + id);
    const label = $('#dimension-label-' + id);
    const inFront = [a, b].every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.z >= -1 && p.z <= 1);
    const text = `${title} ${value.toFixed(1)} cm`;
    const laidOut = inFront
      ? layoutDimensionAnnotation({ a, b, screenCenter, text, offset, safeRect, placedRects })
      : { visible: false };

    groupEl.style.display = laidOut.visible ? '' : 'none';
    if (!laidOut.visible) continue;

    const { ax, ay, bx, by, nx, ny, label: lbl } = laidOut;
    line.setAttribute(
      'd',
      `M${ax - nx * 4} ${ay - ny * 4} L${ax + nx * 4} ${ay + ny * 4} `
      + `M${ax} ${ay} L${bx} ${by} `
      + `M${bx - nx * 4} ${by - ny * 4} L${bx + nx * 4} ${by + ny * 4}`,
    );
    pill.setAttribute('x', String(lbl.left));
    pill.setAttribute('y', String(lbl.top));
    pill.setAttribute('width', String(lbl.width));
    pill.setAttribute('height', String(lbl.height));
    label.setAttribute('x', String(lbl.x));
    label.setAttribute('y', String(lbl.y));
    label.textContent = text;
  }
}

function renderScene(){if(!exportingPNG)drawDimensions();if(volumeController.shown&&!exportingPNG&&model){const visible=model.visible;model.visible=false;try{renderer.render(scene,camera)}finally{model.visible=visible};return}if(model)model.visible=true;ppViewport.render(model,partMeshes)}
let interacting=false;
function getModelOrientation(itemId){return normalizeOrientation(itemId?savedOrientations[itemId]:null)}
function canUseVolumeOnCurrent(){return supportsVolumePathTracing(current)&&Boolean(current?.file)&&isIdentityOrientation(getModelOrientation(current?.id))}
const volumeController=new VolumeController({state:()=>({file:current.file,sourceMaxCM:current.sourceMaxCM||17,partStyles:structuredClone(partStyles),camera:[camera.position.x,camera.position.y-groundTargetY,camera.position.z].map(x=>Math.round(x*1e5)/1e5),target:[controls.target.x,controls.target.y-groundTargetY,controls.target.z].map(x=>Math.round(x*1e5)/1e5),fov:camera.fov}),hasVolume:()=>hasTranslucentParts()&&canUseVolumeOnCurrent(),canPreview:()=>!busy&&!interacting&&!controls.autoRotate,status:text=>$('#renderStatus').textContent=text,changed:()=>frameDirty=true});
$('#renderQuality').value=new URLSearchParams(location.search).get('quality')==='fast'?'fast':localStorage.getItem('pp-render-quality-v2')||'volume';volumeController.enabled=$('#renderQuality').value==='volume';$('#renderQuality').onchange=()=>{volumeController.enabled=$('#renderQuality').value==='volume';localStorage.setItem('pp-render-quality-v2',$('#renderQuality').value);invalidatePreview()};
function invalidatePreview(schedule=true){frameDirty=true;volumeController.invalidate(schedule);const canVol=canUseVolumeOnCurrent();$('#renderStatus').textContent=hasTranslucentParts()?(canVol&&volumeController.enabled?t('renderStatusVolPending'):canVol?t('renderStatusFast'):t('renderStatusWebglOnly')):t('renderStatusSolid')}
let activeViewId='default';
controls.addEventListener('start',()=>{interacting=true;activeViewId='current';syncViewJumpActive();invalidatePreview(false)});controls.addEventListener('end',()=>{interacting=false;invalidatePreview()});
$('#precise').onclick=()=>invalidatePreview();
controls.addEventListener('change',()=>invalidatePreview(!interacting));

function activePantoneCode(){
  const targets=editTargets();
  const codes=new Set(targets.map(o=>partStyles[o.userData.partKey]?.pantone||'').filter(Boolean));
  return codes.size===1?[...codes][0]:'';
}
function getExportColorToken(){
  const pCode=activePantoneCode();
  if(pCode)return formatPantoneExportToken(pCode);
  const firstPantone=partMeshes[0]&&partStyles[partMeshes[0].userData.partKey]?.pantone;
  if(firstPantone&&partMeshes.every(o=>partStyles[o.userData.partKey]?.pantone===firstPantone)){
    return formatPantoneExportToken(firstPantone);
  }
  return activeColorHex.slice(1).toUpperCase();
}
function syncPantoneTag(){
  const tag=$('#activePantoneTag');
  if(!tag)return;
  const code=activePantoneCode();
  tag.hidden=!code;
  tag.textContent=code?('PANTONE '+code):'';
}

function syncColorModeInputs(skipMode=null){
  const swatch=$('#colorPreviewSwatch');
  if(swatch)swatch.style.background=activeColorHex;
  if(skipMode!=='hex'){
    const picker=$('#picker');
    if(picker)picker.value=activeColorHex;
    const hexInput=$('#hexInput');
    if(hexInput&&document.activeElement!==hexInput)hexInput.value=activeColorHex.toUpperCase();
  }
  if(skipMode!=='rgb'){
    const rgb=hexToRgb(activeColorHex);
    const rEl=$('#rgb-r'),gEl=$('#rgb-g'),bEl=$('#rgb-b');
    if(rEl&&document.activeElement!==rEl)rEl.value=String(rgb.r);
    if(gEl&&document.activeElement!==gEl)gEl.value=String(rgb.g);
    if(bEl&&document.activeElement!==bEl)bEl.value=String(rgb.b);
  }
  if(skipMode!=='cmyk'){
    const cmyk=hexToCmyk(activeColorHex);
    const cEl=$('#cmyk-c'),mEl=$('#cmyk-m'),yEl=$('#cmyk-y'),kEl=$('#cmyk-k');
    if(cEl&&document.activeElement!==cEl)cEl.value=String(cmyk.c);
    if(mEl&&document.activeElement!==mEl)mEl.value=String(cmyk.m);
    if(yEl&&document.activeElement!==yEl)yEl.value=String(cmyk.y);
    if(kEl&&document.activeElement!==kEl)kEl.value=String(cmyk.k);
  }
  syncPantoneTag();
}

function setColorMode(mode){
  if(!COLOR_INPUT_MODES.includes(mode))return;
  activeColorMode=mode;
  for(const btn of document.querySelectorAll('[data-color-mode]')){
    const active=btn.dataset.colorMode===mode;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-selected',String(active));
  }
  for(const m of COLOR_INPUT_MODES){
    const pane=$('#colorMode-'+m);
    if(pane)pane.hidden=m!==mode;
  }
  if(mode!=='pantone'){
    const sug=$('#pantoneSuggestions');
    if(sug)sug.hidden=true;
  }
  // Pure UI sync on mode switch: never mutates partStyles or clears Pantone tag.
  syncColorModeInputs();
}
for(const btn of document.querySelectorAll('[data-color-mode]')){
  btn.addEventListener('click',()=>setColorMode(btn.dataset.colorMode));
}
setColorMode('pantone');

function syncFinishUI(){
 const activeFinish=finishFromRoughness(vals.roughness);
 const finishes=new Set(editTargets().map(o=>finishFromRoughness(partStyles[o.userData.partKey]?.roughness??vals.roughness)));
 const mixedFinish=finishes.size>1;
 for(const p of SURFACE_FINISH_PRESETS){
  const btn=$('#finish-'+p.id);
  if(!btn)continue;
  const active=!mixedFinish&&p.id===activeFinish;
  btn.classList.toggle('active',active);
  btn.setAttribute('aria-pressed',String(active));
 }
 const hint=$('#finishHint');
 const keys=FINISH_LABEL_KEYS[activeFinish]||FINISH_LABEL_KEYS.fine_matte;
 if(hint)hint.textContent=mixedFinish?t('finishMixedHint'):t(keys.hint);
}
for(const btn of document.querySelectorAll('[data-finish]')){
 btn.addEventListener('click',()=>{
  const preset=getSurfaceFinishPreset(btn.dataset.finish);
  vals.roughness=preset.roughness;
  apply({roughness:preset.roughness,finish:preset.id});
 });
}

function apply(patch=null,skipColorSyncMode=null){
 const hasWrite=Boolean(patch&&typeof patch==='object'&&Object.keys(patch).length);
 if(hasWrite){
  if('color' in patch)activeColorHex=normalizeHexColor(patch.color,activeColorHex);
  for(const o of editTargets()){
   const prev=partStyles[o.userData.partKey]||{};
   const next={...prev};
   if('color' in patch)next.color=normalizeHexColor(patch.color,prev.color||DEFAULT_FALLBACK_COLOR);
   if('pantone' in patch)next.pantone=patch.pantone||'';
   if('category' in patch)next.category=patch.category;
   if('roughness' in patch){
    next.roughness=patch.roughness;
    next.finish='finish' in patch?patch.finish:finishFromRoughness(patch.roughness);
   }else if('finish' in patch){
    next.finish=patch.finish;
   }
   if('transmission' in patch)next.transmission=patch.transmission;
   partStyles[o.userData.partKey]=next;
  }
  persistParts();refreshPartMaterials();
 }
 syncColorModeInputs(skipColorSyncMode);
 for(const[id]of defs){$('#'+id).value=vals[id];$('#out-'+id).value=String(vals[id])}
 const types=new Set(editTargets().map(o=>partStyles[o.userData.partKey]?.category).filter(Boolean));const mixed=types.size>1;const transparent=types.has('transparent');$('#transmission').disabled=!transparent;$('#out-transmission').disabled=!transparent;$('#transmission').closest('.row').classList.toggle('disabled',!transparent);$('#transmission').title=transparent?t('transmissionTipActive'):t('transmissionTipSolid');$('#milkPreset').disabled=!transparent;
 const partLabel=activePart==='all'?t('wholeProduct'):($('#partSelect').selectedOptions?.[0]?.textContent||t('wholeProduct'));
 $('#materialType').textContent=partLabel+' · '+(mixed?t('mixedMaterial'):transparent?t('translucentPP'):t('solidPP'));
 for(const category of ['solid','transparent']){$('#material-'+category).classList.toggle('active',!mixed&&category===editingCategory);$('#material-'+category).setAttribute('aria-pressed',String(category===editingCategory))}
 syncFinishUI();
 if(hasWrite)invalidatePreview();if(!hasTranslucentParts())$('#renderStatus').textContent=t('renderStatusSolid');
}

for(const[id,labelKey,max]of defs){const row=document.createElement('div');row.className='row';row.innerHTML=`<label for="${id}"><span data-i18n="${labelKey}">${t(labelKey)}</span><span class="value-field"><input type="number" id="out-${id}" aria-label="${t(labelKey)}" min="0" max="${max}" step="0.1" value="${vals[id]}"><span>%</span></span></label><input type="range" id="${id}" min="0" max="${max}" step="0.1" value="${vals[id]}">`;$('#sliders').append(row);
 const number=$('#out-'+id),range=$('#'+id);function update(raw){if(raw==='')return;const n=Number(raw);if(!Number.isFinite(n))return;vals[id]=Math.min(max,Math.max(0,n));if(id==='roughness'){apply({roughness:vals.roughness,finish:finishFromRoughness(vals.roughness)})}else if(id==='transmission'){apply({transmission:vals.transmission})}}
 range.oninput=e=>update(e.target.value);number.oninput=e=>update(e.target.value);number.onfocus=()=>number.select();number.onblur=()=>{number.value=String(vals[id])};number.onkeydown=e=>{if(e.key==='Enter'){number.blur();e.preventDefault()}};
}

function setColor(hex,pantoneEntry=null,skipMode=null){const exactHex=normalizeHexColor(hex,activeColorHex);activeColorHex=exactHex;apply({color:exactHex,pantone:pantoneEntry?pantoneEntry.shortCode:''},skipMode)}
$('#picker').oninput=e=>{setColor(e.target.value,null);$('#hexStatus').textContent=t('hexInputHint');$('#hexStatus').classList.remove('is-error')};
$('#hexInput').oninput=e=>{
  const raw=e.target.value.trim();
  const hexStatus=$('#hexStatus');
  if(/^#?[0-9a-f]{6}$/i.test(raw)){
    const parsed=parseHexInput(raw);
    if(parsed){setColor(parsed,null,'hex');$('#picker').value=parsed;hexStatus.textContent=t('hexInputHint');hexStatus.classList.remove('is-error')}
  }
};
function commitHexInput(){
  const hexInput=$('#hexInput');
  const hexStatus=$('#hexStatus');
  const parsed=parseHexInput(hexInput.value);
  if(!parsed){
    hexStatus.textContent=t('hexInvalid');
    hexStatus.classList.add('is-error');
    hexInput.value=activeColorHex.toUpperCase();
    return;
  }
  hexStatus.textContent=t('hexInputHint');
  hexStatus.classList.remove('is-error');
  hexInput.value=parsed.toUpperCase();
  setColor(parsed,null);
}
$('#hexInput').onchange=commitHexInput;
$('#hexInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitHexInput()}};

function applyCmykInputs(){
  const c=clampInt($('#cmyk-c').value,0,100,0);
  const m=clampInt($('#cmyk-m').value,0,100,0);
  const y=clampInt($('#cmyk-y').value,0,100,0);
  const k=clampInt($('#cmyk-k').value,0,100,0);
  setColor(cmykToHex({c,m,y,k}),null,'cmyk');
}
for(const ch of ['c','m','y','k']){
  const el=$('#cmyk-'+ch);
  el.oninput=applyCmykInputs;
  el.onblur=()=>syncColorModeInputs();
}

function applyRgbInputs(){
  const r=clampInt($('#rgb-r').value,0,255,0);
  const g=clampInt($('#rgb-g').value,0,255,0);
  const b=clampInt($('#rgb-b').value,0,255,0);
  setColor(rgbToHex({r,g,b}),null,'rgb');
}
for(const ch of ['r','g','b']){
  const el=$('#rgb-'+ch);
  el.oninput=applyRgbInputs;
  el.onblur=()=>syncColorModeInputs();
}

$('#milkPreset').onclick=()=>{$('#renderQuality').value='volume';volumeController.enabled=true;localStorage.setItem('pp-render-quality-v2','volume');activeColorHex='#ffffff';vals.transmission=58;vals.roughness=42;apply({color:'#ffffff',pantone:'',transmission:58,roughness:42,finish:'fine_matte'})};

function setPantoneMessage(text,isError=false){
  const el=$('#pantoneStatus');
  if(!el)return;
  el.textContent=text;
  el.classList.toggle('is-error',isError);
}
function applyPantoneEntry(entry){
  if(!entry)return;
  setColor(entry.hex,entry);
  $('#pantoneInput').value=entry.rawCode;
  $('#pantoneSuggestions').hidden=true;
  setPantoneMessage(t('pantoneApplied',{code:entry.code,name:entry.name,hex:entry.hex.toUpperCase()}),false);
}
function handlePantoneSubmit(rawValue){
  const query=String(rawValue??$('#pantoneInput').value).trim();
  if(!query){
    setPantoneMessage(t('pantoneEmptyError'),true);
    return;
  }
  const match=lookupPantone(query);
  if(!match){
    setPantoneMessage(t('pantoneNotFound',{query}),true);
    return;
  }
  applyPantoneEntry(match);
}
function renderPantoneSuggestions(query){
  const box=$('#pantoneSuggestions');
  const trimmed=String(query||'').trim();
  if(!trimmed){box.hidden=true;box.replaceChildren();return}
  const matches=searchPantone(trimmed,6);
  box.replaceChildren();
  if(!matches.length){box.hidden=true;return}
  for(const entry of matches){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='pantone-option';
    btn.innerHTML=`<i class="pantone-swatch" style="background:${entry.hex}"></i><span class="pantone-code">${entry.rawCode}</span><span class="pantone-name">${entry.name}</span>`;
    btn.onclick=()=>applyPantoneEntry(entry);
    box.append(btn);
  }
  box.hidden=false;
}
$('#pantoneInput').oninput=e=>renderPantoneSuggestions(e.target.value);
$('#pantoneInput').onkeydown=e=>{
  if(e.key==='Enter'){e.preventDefault();handlePantoneSubmit()}
  else if(e.key==='Escape'){$('#pantoneSuggestions').hidden=true}
};
$('#applyPantone').onclick=()=>handlePantoneSubmit();
let colors;try{colors=JSON.parse(localStorage.getItem('pp-colors'))}catch{}if(!Array.isArray(colors))colors=['#ffffff','#a8dd66','#51c9d4','#bc7995','#dca16c','#ab6bd6','#91c8d8','#e4a7bb','#b5c8a1','#d4c4e5','#f4f0e8'];colors=colors.filter(c=>/^#[0-9a-f]{6}$/i.test(c));colors=[...new Set(colors)];function palette(){$('#palette').replaceChildren();for(const hex of colors){const b=document.createElement('button');b.style.background=hex;b.title=hex;b.setAttribute('aria-label',hex);b.onclick=()=>setColor(hex);$('#palette').append(b)}}palette();$('#addColor').onclick=()=>{const hex=activeColorHex;if(!colors.includes(hex))colors.push(hex);try{localStorage.setItem('pp-colors',JSON.stringify(colors))}catch{}palette()};
$('#deleteColor').onclick=()=>{const hex=activeColorHex.toLowerCase();colors=colors.filter(c=>c.toLowerCase()!==hex);localStorage.setItem('pp-colors',JSON.stringify(colors));palette()};
const catalog=[];
const libraryState={connected:false,mode:'none',name:'',detail:'',icon:'📁'};
let exportConfig;try{exportConfig=normalizeExportConfig(JSON.parse(localStorage.getItem('pp-export-settings-v1')||'{}'))}catch{exportConfig=normalizeExportConfig()}
function persistExportConfig(){try{localStorage.setItem('pp-export-settings-v1',JSON.stringify(exportConfig))}catch{}}
function renderBatchQueue(){
  const listEl=$('#batchQueue');
  const summaryEl=$('#batchQueueSummary');
  const clearBtn=$('#clearBatchQueue');
  if(!listEl||!summaryEl)return;
  const queued=catalog.filter(i=>selected.has(i.id));
  const viewCount=exportConfig.views.length;
  const fmt=exportConfig.format.toUpperCase();
  if(clearBtn)clearBtn.hidden=queued.length===0;
  listEl.replaceChildren();
  if(!queued.length){
    summaryEl.textContent=libraryState.mode==='library'
      ?t('queuePromptLibrary')
      :(current?t('queuePromptSingle',{views:viewCount,fmt}):t('queuePromptEmpty'));
    const empty=document.createElement('div');
    empty.className='batch-queue-empty';
    empty.textContent=libraryState.mode==='library'?t('queueEmptyLibraryHint'):t('queueEmptyDemoHint');
    listEl.append(empty);
    return;
  }
  summaryEl.textContent=t('queueSummary',{models:queued.length,views:viewCount,total:queued.length*viewCount,fmt});
  for(const item of queued){
    const row=document.createElement('div');
    row.className='batch-queue-item';
    const name=document.createElement('span');
    name.className='batch-queue-name';
    name.textContent=getDisplayModelName(item);
    name.title=item.relativePath||item.name;
    const badge=document.createElement('span');
    badge.className='format-badge';
    badge.textContent=formatDisplayName(item.format);
    const remove=document.createElement('button');
    remove.type='button';
    remove.className='batch-queue-remove';
    remove.textContent='×';
    remove.title=t('removeQueueItem');
    remove.setAttribute('aria-label',t('removeQueueItem')+' '+item.name);
    remove.onclick=()=>{selected.delete(item.id);renderList();updateBatchButtonLabel()};
    row.append(name,badge,remove);
    listEl.append(row);
  }
}
$('#clearBatchQueue').onclick=()=>{selected.clear();renderList();updateBatchButtonLabel()};
function updateBatchButtonLabel(){
  const btn=$('#batch');
  if(!btn)return;
  const fmt=exportConfig.format.toUpperCase();
  const viewCount=exportConfig.views.length;
  const badge=$('#exportBadge');
  if(badge){badge.hidden=selected.size===0;badge.textContent=String(selected.size)}
  btn.title=t('batchBtnTitle',{fmt,views:viewCount});
  if(selected.size>0){
    btn.innerHTML=`${t('batchExportBtn')} <span id="selectedCount">${selected.size}</span>`;
  }else if(libraryState.mode!=='library'&&current){
    btn.innerHTML=`${t('multiViewZipBtn')} <span id="selectedCount" hidden>1</span>`;
  }else{
    btn.innerHTML=`${t('batchExportBtn')} <span id="selectedCount">0</span>`;
  }
  renderBatchQueue();
}
function syncExportUI(){
  const isPng=exportConfig.format==='png';
  $('#exportFormat').value=exportConfig.format;
  const isPresetSize=EXPORT_RESOLUTION_PRESETS.includes(exportConfig.size);
  $('#exportResolution').value=isPresetSize?String(exportConfig.size):'custom';
  $('#exportCustomSizeRow').hidden=isPresetSize;
  $('#exportCustomSize').value=String(exportConfig.size);
  $('#exportBgColor').value=exportConfig.bgColor;
  $('#exportBgHex').textContent=exportConfig.bgColor.toUpperCase();
  const qualityPct=Math.round(exportConfig.quality*100);
  $('#exportQuality').value=String(qualityPct);
  $('#out-exportQuality').value=String(qualityPct);
  $('#exportJpgOptions').classList.toggle('disabled',isPng);
  $('#exportBgColor').disabled=isPng;
  $('#exportBgWhite').disabled=isPng;
  $('#exportQuality').disabled=isPng;
  $('#out-exportQuality').disabled=isPng;
  $('#viewPresetSummary').textContent=t('viewsCount',{count:exportConfig.views.length});
  const batchVol=$('#batchUseVolume');
  if(batchVol)batchVol.checked=Boolean(exportConfig.batchUseVolume);
  $('#shot').textContent=isPng?t('exportCurrentPng'):t('exportCurrentJpg');
  $('#shot').title=isPng?t('exportCurrentPngTitle'):t('exportCurrentJpgTitle');
  updateBatchButtonLabel();
}
function jumpToViewPreset(preset){
  if(busy||!current)return;
  controls.autoRotate=false;$('#rotate').classList.remove('on');
  const cam=resolveViewCamera(preset,current,viewState(),groundTargetY);
  applyCameraView(cam);
  activeViewId=preset.id;
  syncViewJumpActive();
  invalidatePreview();
}
function syncViewJumpActive(){
  for(const btn of document.querySelectorAll('#viewJumpGrid button')){
    btn.classList.toggle('active',btn.dataset.viewId===activeViewId);
  }
}
function renderViewJumpButtons(){
  const grid=$('#viewJumpGrid');
  if(!grid)return;
  grid.replaceChildren();
  for(const preset of STANDARD_VIEW_PRESETS){
    if(preset.id==='current')continue;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='small';
    btn.dataset.viewId=preset.id;
    btn.textContent=getViewLabel(preset);
    btn.onclick=()=>jumpToViewPreset(preset);
    grid.append(btn);
  }
  syncViewJumpActive();
}
function renderViewPresets(){
  const container=$('#viewPresets');
  container.replaceChildren();
  const checkedSet=new Set(exportConfig.views);
  for(const preset of STANDARD_VIEW_PRESETS){
    const labelText=getViewLabel(preset);
    const item=document.createElement('div');
    item.className='view-preset-item';
    const label=document.createElement('label');
    const cb=document.createElement('input');
    cb.type='checkbox';
    cb.value=preset.id;
    cb.checked=checkedSet.has(preset.id);
    cb.setAttribute('aria-label',labelText);
    cb.onchange=()=>{
      const next=new Set(exportConfig.views);
      if(cb.checked)next.add(preset.id);
      else next.delete(preset.id);
      if(!next.size){cb.checked=true;return}
      exportConfig.views=STANDARD_VIEW_PRESETS.filter(v=>next.has(v.id)).map(v=>v.id);
      persistExportConfig();
      syncExportUI();
    };
    const text=document.createElement('span');
    text.textContent=labelText;
    label.append(cb,text);
    const preview=document.createElement('button');
    preview.type='button';
    preview.className='view-preview-btn';
    preview.textContent=t('previewBtn');
    preview.title=labelText;
    preview.setAttribute('aria-label',labelText);
    preview.onclick=()=>jumpToViewPreset(preset);
    item.append(label,preview);
    container.append(item);
  }
}
$('#exportFormat').onchange=e=>{exportConfig.format=e.target.value==='png'?'png':'jpg';persistExportConfig();syncExportUI()};
$('#exportResolution').onchange=e=>{
  if(e.target.value==='custom'){$('#exportCustomSizeRow').hidden=false;$('#exportCustomSize').focus();return}
  exportConfig.size=clampExportSize(e.target.value);
  persistExportConfig();syncExportUI();
};
$('#exportCustomSize').onchange=e=>{exportConfig.size=clampExportSize(e.target.value);persistExportConfig();syncExportUI()};
$('#exportBgColor').oninput=e=>{exportConfig.bgColor=normalizeHexColor(e.target.value);persistExportConfig();syncExportUI()};
$('#exportBgWhite').onclick=()=>{exportConfig.bgColor='#ffffff';persistExportConfig();syncExportUI()};
function updateExportQuality(raw){if(raw==='')return;const n=Number(raw);if(!Number.isFinite(n))return;exportConfig.quality=clampJpgQuality(n);persistExportConfig();syncExportUI()}
$('#exportQuality').oninput=e=>updateExportQuality(e.target.value);
$('#out-exportQuality').oninput=e=>updateExportQuality(e.target.value);
$('#out-exportQuality').onblur=()=>{$('#out-exportQuality').value=String(Math.round(exportConfig.quality*100))};
$('#batchUseVolume').onchange=e=>{exportConfig.batchUseVolume=Boolean(e.target.checked);persistExportConfig()};
renderViewJumpButtons();
renderViewPresets();
syncExportUI();

const BUILTIN_MODELS=[{
  id:'builtin_demo_coffee_cup',
  name:'随行咖啡杯（示例）',
  description:'内置示例模型 · 4 部件可分色（杯身/防滑杯套/防漏杯盖/侧边把手）',
  file:'./assets/demo-coffee-cup.glb',
  format:'glb',
  category:'solid',
  source:'内置示例',
  up:'Y',
  sourceMaxCM:15.2,
  defaultCamera:[2.75,2.15,4.45],
  defaultTarget:[0,0,0],
  parts:[
    {label:'杯身',defaultColor:'#91c8d8'},
    {label:'防滑杯套',defaultColor:'#365947'},
    {label:'防漏杯盖',defaultColor:'#f4f0e8'},
    {label:'侧边把手',defaultColor:'#f4f0e8'},
  ],
}];
const localModels=await readLocalModels();
const startupMigrations=getLastMigratedModelIds();
if(migratePersistedStateMap(savedPartStyles,startupMigrations,savedAliases,localModels))persistSavedPartStyles();
if(migratePersistedStateMap(savedOrientations,startupMigrations,savedAliases,localModels)){try{localStorage.setItem('pp-model-orientation-v1',JSON.stringify(savedOrientations))}catch{}}
for(const m of localModels)recordModelAlias(m);
catalog.push(...localModels,...BUILTIN_MODELS);
const modelCache=new ModelSceneCache(3);

function applyCacheEvictions(evictedIds){
  if(!evictedIds?.length)return;
  const evicted=new Set(evictedIds);
  let changed=false;
  for(let i=catalog.length-1;i>=0;i--){
    const entry=catalog[i];
    if(!evicted.has(entry.id))continue;
    entry.persisted=false;
    entry.file=null;
    // Remove stale IndexedDB-only entries that no longer have a session File reference.
    if(!entry.fileRef&&entry.id!==current?.id){
      catalog.splice(i,1);
      selected.delete(entry.id);
      changed=true;
    }
  }
  if(changed){renderList();updateBatchButtonLabel()}
}

async function cachedModel(item,{persist=true,onStatus}={}){
  const existing=modelCache.get(item.id);
  if(existing)return existing.promise;
  const entry={result:null};
  entry.promise=(async()=>{
    let loadedBytes=null;
    const result=await loadModelScene(item,{
      readBytes:async target=>{loadedBytes=await readModelBytes(target);return loadedBytes},
      onStatus,
    });
    if(persist&&item.fileRef&&!item.persisted&&loadedBytes){
      const res=await cacheModelInLibrary(item,loadedBytes,DEFAULT_CACHE_LIMITS);
      if(res.evictedIds?.length)applyCacheEvictions(res.evictedIds);
    }
    if(supportsVolumePathTracing(item)&&!item.file){
      await ensureModelObjectURL(item);
    }
    entry.result=result;
    return result;
  })().catch(error=>{
    modelCache.delete(item.id);
    throw error;
  });
  modelCache.set(item.id,entry);
  return entry.promise;
}
function trimModelCache(){modelCache.trim(current?.id)}
function viewState(){return{position:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov,up:camera.up.toArray()}}
function applyCameraView(view){camera.position.fromArray(view.position);camera.up.fromArray(view.up||[0,1,0]);controls.target.fromArray(view.target);if(view.fov)camera.fov=view.fov;camera.updateProjectionMatrix();const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;camera.updateMatrixWorld(true);invalidatePreview(false)}
function restoreView(view){applyCameraView(view)}

function syncLibraryUI({revealSidebar=false}={}){
  const indicator=$('#libraryIndicator');
  const rail=$('#catalogRail');
  const title=$('#libraryTitle');
  if(!libraryState.connected||libraryState.mode==='none'){
    if(indicator)indicator.hidden=true;
    if(rail)rail.hidden=true;
    updateBatchButtonLabel();
    frameDirty=true;
    return;
  }
  const isLibrary=libraryState.mode==='library';
  const libLabel=t('localLibrary');
  if(indicator){
    indicator.hidden=false;
    indicator.textContent=isLibrary
      ?`${libraryState.icon} ${libLabel} (${catalog.length})`
      :`${libraryState.icon} ${libraryState.name}`;
    indicator.title=t('libraryIndicatorTitle',{detail:libraryState.detail||libraryState.name});
  }
  if(title)title.textContent=isLibrary?`${libLabel} (${catalog.length})`:libraryState.name;
  if(rail){
    if(revealSidebar)rail.hidden=false;
    else if(!isLibrary)rail.hidden=true;
  }
  updateBatchButtonLabel();
  frameDirty=true;
}
$('#libraryIndicator').onclick=()=>{
  const rail=$('#catalogRail');
  if(rail){rail.hidden=!rail.hidden;frameDirty=true}
};
$('#closeCatalogRail').onclick=()=>{
  const rail=$('#catalogRail');
  if(rail){rail.hidden=true;frameDirty=true}
};

function persistOrientations(){
  if(current)recordModelAlias(current);
  try{localStorage.setItem('pp-model-orientation-v1',JSON.stringify(savedOrientations))}catch{}
}
function syncModelSettingsUI(orientation){
  const readout=$('#orientationReadout');
  if(readout)readout.textContent=formatOrientationSummary(orientation);
  const dimReadout=$('#dimensionReadout');
  if(dimReadout){
    dimReadout.textContent=measuredDimensions
      ?t('dimReadout',{w:measuredDimensions[0].toFixed(1),d:measuredDimensions[2].toFixed(1),h:measuredDimensions[1].toFixed(1)})
      :t('noRealScale');
  }
  dimensionToggle.disabled=!measuredDimensions;
  dimensionToggle.title=measuredDimensions?t('dimensionsAndFrame'):t('noRealScale');
  if(!measuredDimensions&&dimensionsEnabled){
    dimensionsEnabled=false;
    dimensionToggle.setAttribute('aria-pressed','false');
    dimensionToggle.classList.remove('on');
  }
  dimensionToggle.textContent=t(dimensionsEnabled?'hideDimensions':'showDimensions');
  const meta=$('#modelMetaInfo');
  if(meta&&current){
    const isBuiltin=current.id.startsWith('builtin_');
    const sourceText=isBuiltin
      ?t('sourceBuiltin')
      :(current.source==='单文件打开'?(current.fileName||current.name):`${t('sourceLocalLibrary')} · ${current.relativePath||current.fileName||current.name}`);
    meta.innerHTML=`<div>${t('metaFormat')}：<strong>${formatDisplayName(current.format)}</strong> · ${t('metaParts')}：<strong>${partMeshes.length}</strong></div><div>${t('metaSource')}：<strong>${sourceText}</strong></div>`;
  }
}

function applyMountedOrientation(orientation,{persist=false,resetCamera=true}={}){
  if(!currentContentRoot)return;
  const norm=normalizeOrientation(orientation);
  if(model)scene.remove(model);
  const mounted=mountAndGroundModel(currentContentRoot,norm,{targetSpan:2.4,sourceSpanCM:currentSourceSpanCM});
  model=mounted.model;
  scene.add(model);
  dimensionBounds=mounted.bounds;
  groundTargetY=mounted.groundTargetY;
  measuredDimensions=mounted.measuredDimensions;
  if(persist&&current){
    if(isIdentityOrientation(norm))delete savedOrientations[current.id];
    else savedOrientations[current.id]=norm;
    persistOrientations();
  }
  syncModelSettingsUI(norm);
  if(resetCamera)reset();
  invalidatePreview();
}

for(const btn of document.querySelectorAll('[data-rot-axis]')){
  btn.addEventListener('click',()=>{
    if(busy||!current||!currentContentRoot)return;
    const axis=btn.dataset.rotAxis;
    const deg=Number(btn.dataset.rotDeg);
    const next=rotateOrientationByAxis(getModelOrientation(current.id),axis,deg);
    applyMountedOrientation(next,{persist:true,resetCamera:true});
  });
}
$('#resetOrientation').onclick=()=>{
  if(busy||!current||!currentContentRoot)return;
  applyMountedOrientation({quaternion:[...IDENTITY_QUATERNION]},{persist:true,resetCamera:true});
};

function reset(){
  controls.autoRotate=false;
  $('#rotate').classList.remove('on');
  const basePos=current?.defaultCamera||DEFAULT_CAMERA_POSITION;
  const baseTarget=current?.defaultTarget||DEFAULT_CAMERA_TARGET;
  camera.position.set(basePos[0],basePos[1]+groundTargetY,basePos[2]);
  camera.up.set(0,1,0);
  controls.target.set(baseTarget[0],baseTarget[1]+groundTargetY,baseTarget[2]);
  const damping=controls.enableDamping;
  controls.enableDamping=false;
  controls.update();
  controls.enableDamping=damping;
  activeViewId='default';
  syncViewJumpActive();
}

let lastLoadError='';
async function load(item,{persist=true}={}){invalidatePreview(false);lastLoadError='';const ticket=++token;$('#loading').style.display='block';$('#loading').textContent=t('loadingModel',{name:getDisplayModelName(item)});$('#shot').disabled=true;try{const loaded=await cachedModel(item,{persist,onStatus:text=>{if(ticket===token)$('#loading').textContent=text}});if(ticket!==token)return false;if(model){scene.remove(model)}current=item;currentContentRoot=loaded.scene;currentSourceSpanCM=item.sourceMaxCM??loaded.estimatedMaxCM??(item.dimensionsCM?Math.max(...item.dimensionsCM):undefined);const savedOrient=getModelOrientation(item.id);const mounted=mountAndGroundModel(currentContentRoot,savedOrient,{targetSpan:2.4,sourceSpanCM:currentSourceSpanCM});model=mounted.model;scene.add(model);dimensionBounds=mounted.bounds;groundTargetY=mounted.groundTargetY;measuredDimensions=mounted.measuredDimensions;reset();initParts();refreshPartMaterials();syncModelSettingsUI(savedOrient);trimModelCache();invalidatePreview();$('#name').textContent=getDisplayModelName(item);$('#count').textContent=(catalog.indexOf(item)+1)+' / '+catalog.length+' · '+formatDisplayName(item.format);$('#loading').style.display='none';$('#shot').disabled=false;updateBatchButtonLabel();document.querySelectorAll('.products button').forEach(b=>b.classList.toggle('active',b.dataset.id===item.id));return true}catch(e){lastLoadError=e?.message||'Error';$('#loading').textContent=t('loadFailed',{name:getDisplayModelName(item),reason:lastLoadError});console.error(e);return false}}
function renderList(){$('#products').replaceChildren();const results=matchingProducts(catalog,{query:$('#productSearch').value,filter,category:productCategory});$('#searchResult').textContent=results.length?t('catalogCount',{count:results.length}):t('catalogEmpty');for(const item of results){const row=document.createElement('div');row.className='product-row';const cb=document.createElement('input');cb.type='checkbox';cb.checked=selected.has(item.id);cb.setAttribute('aria-label',getDisplayModelName(item));cb.onchange=()=>{if(cb.checked)selected.add(item.id);else selected.delete(item.id);updateBatchButtonLabel()};const b=document.createElement('button');b.dataset.id=item.id;b.title=item.relativePath||item.name;b.classList.toggle('active',current?.id===item.id);const nameSpan=document.createElement('span');nameSpan.className='product-name';nameSpan.textContent=getDisplayModelName(item);const badge=document.createElement('span');badge.className='format-badge';badge.textContent=formatDisplayName(item.format);b.append(nameSpan,badge);b.onclick=()=>{if(!busy)load(item)};row.append(cb,b);$('#products').append(row)}}
$('#productSearch').oninput=()=>renderList();$('#productSearch').onkeydown=e=>{if(e.key==='Escape'){$('#productSearch').value='';renderList()}};
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderList();if(filter!=='all'&&productCategory(current)!==filter){const first=matchingProducts(catalog,{query:$('#productSearch').value,filter,category:productCategory})[0];if(first&&!busy)load(first)}};

function applyLocaleToUI(){
  document.documentElement.lang=i18n.locale==='en'?'en':'zh-CN';
  document.title=t('pageTitle');
  const langBtn=$('#langToggle');
  if(langBtn){langBtn.textContent=t('langSwitchLabel');langBtn.title=t('langSwitchTitle')}
  for(const el of document.querySelectorAll('[data-i18n]')){
    el.textContent=t(el.dataset.i18n);
  }
  for(const el of document.querySelectorAll('[data-i18n-placeholder]')){
    el.setAttribute('placeholder',t(el.dataset.i18nPlaceholder));
  }
  for(const el of document.querySelectorAll('[data-i18n-title]')){
    el.setAttribute('title',t(el.dataset.i18nTitle));
  }
  if(activeMenu&&MENU_CONFIG[activeMenu]){
    $('#drawerEyebrow').textContent=t(MENU_CONFIG[activeMenu].eyebrowKey);
    $('#drawerTitle').textContent=t(MENU_CONFIG[activeMenu].titleKey);
  }
  populatePartSelect();
  apply(null);
  renderViewJumpButtons();
  renderViewPresets();
  syncExportUI();
  renderList();
  syncLibraryUI();
  if(current){
    $('#name').textContent=getDisplayModelName(current);
    syncModelSettingsUI(getModelOrientation(current.id));
  }
  invalidatePreview(false);
  frameDirty=true;
}
$('#langToggle').onclick=()=>{
  i18n.toggleLocale();
  try{localStorage.setItem('polystudio-lang-v1',i18n.locale)}catch{}
  applyLocaleToUI();
};

const milkMode=new URLSearchParams(location.search).get('material')==='milk-sss';
applyLocaleToUI();
if(localModels.length){
  const stats=await getLibraryCacheStats(DEFAULT_CACHE_LIMITS);
  Object.assign(libraryState,{connected:true,mode:'library',name:t('localLibrary'),detail:`${t('localLibrary')} (${localModels.length})`,icon:'📦'});
  syncLibraryUI({revealSidebar:true});
  $('#uploadStatus').textContent=t('restoredLibraryStatus',{count:localModels.length,cached:stats.count,max:stats.maxModels});
  await load(catalog[0]);
}else if(catalog.length){
  syncLibraryUI({revealSidebar:false});
  await load(catalog[0]);
}else{
  syncLibraryUI({revealSidebar:false});
  $('#loading').style.display='none';$('#name').textContent=t('openFile');$('#shot').disabled=true;
}
if(milkMode)$('#milkPreset').click();
$('#uploadModel').onclick=()=>{$('#openFileMenu').open=false;$('#modelFile').click()};
$('#uploadFolder').onclick=()=>{$('#openFileMenu').open=false;$('#modelFolder').click()};
async function handleSelectedFiles(fileList,mode){
  if(!fileList?.length)return;
  const fileBtn=$('#uploadModel'),folderBtn=$('#uploadFolder');
  fileBtn.disabled=true;folderBtn.disabled=true;
  try{
    const category=$('#uploadCategory').value;
    const isFolder=mode==='folder';
    const isSingleFile=!isFolder&&fileList.length===1;
    const sourceLabel=isFolder?'本地库':(isSingleFile?'单文件打开':'本地库');
    const {entries,skippedSummary}=indexSelectedFiles(fileList,{category,source:sourceLabel});
    if(!entries.length){
      const msg=t('noSupportedFiles')+(skippedSummary?' · '+skippedSummary:' · '+t('supportedFormatsHint'));
      $('#uploadStatus').textContent=msg;
      $('#loading').style.display='block';$('#loading').textContent=msg;
      setTimeout(()=>{if(!busy)$('#loading').style.display='none'},3200);
      return;
    }
    if(migratePersistedStateMap(savedPartStyles,null,savedAliases,entries))persistSavedPartStyles();
    if(migratePersistedStateMap(savedOrientations,null,savedAliases,entries))persistOrientations();

    const existingById=new Map(catalog.map(item=>[item.id,item]));
    const freshEntries=[];
    const resolvedEntries=[];
    for(const entry of entries){
      const existing=existingById.get(entry.id);
      if(existing){
        existing.fileRef=entry.fileRef;
        existing.companionFiles=entry.companionFiles;
        existing.relativePath=entry.relativePath;
        existing.fileName=entry.fileName;
        existing.byteSize=entry.byteSize;
        existing.fileSignature=entry.fileSignature;
        existing.source=entry.source;
        resolvedEntries.push(existing);
      }else{
        freshEntries.push(entry);
        resolvedEntries.push(entry);
      }
    }
    if(freshEntries.length)catalog.unshift(...freshEntries);
    if(filter!=='all'&&filter!==category){
      filter='all';
      document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));
    }

    const openingSingleFile=!isFolder&&resolvedEntries.length===1;
    const alreadyLibrary=libraryState.mode==='library';
    if(openingSingleFile&&!alreadyLibrary){
      const single=resolvedEntries[0];
      Object.assign(libraryState,{
        connected:true,
        mode:'file',
        name:single.fileName||single.name,
        detail:single.fileName||single.name,
        icon:'📄',
      });
    }else{
      const firstRel=resolvedEntries[0].relativePath||'';
      const rootFolder=isFolder&&firstRel.includes('/')?firstRel.split('/')[0]:'';
      Object.assign(libraryState,{
        connected:true,
        mode:'library',
        name:t('localLibrary'),
        detail:rootFolder?`${t('localLibrary')} (${rootFolder} · ${resolvedEntries.length})`:`${t('localLibrary')} (${resolvedEntries.length})`,
        icon:'📁',
      });
    }

    renderList();
    syncLibraryUI({revealSidebar:libraryState.mode==='library'});
    const statusParts=[t('indexedStatus',{count:resolvedEntries.length})];
    if(skippedSummary)statusParts.push(skippedSummary);
    $('#uploadStatus').textContent=statusParts.join(' · ');

    if(openingSingleFile){
      const loaded=await load(resolvedEntries[0],{persist:true});
      if(loaded){
        const stats=await getLibraryCacheStats(DEFAULT_CACHE_LIMITS);
        $('#uploadStatus').textContent=t('openedSingleFileStatus',{name:resolvedEntries[0].fileName||resolvedEntries[0].name,cached:stats.count,max:stats.maxModels});
      }
    }
  }catch(error){
    $('#uploadStatus').textContent=error.message;
  }finally{
    fileBtn.disabled=false;folderBtn.disabled=false;
  }
}
$('#modelFile').onchange=async e=>{await handleSelectedFiles(e.target.files,'files');e.target.value=''};
$('#modelFolder').onchange=async e=>{await handleSelectedFiles(e.target.files,'folder');e.target.value=''};
$('#reset').onclick=reset;$('#rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('#rotate').classList.toggle('on',controls.autoRotate);invalidatePreview()};
function download(blob,name){$('#exportStatus').textContent=t('generatedPrefix');let previous=$('#exportStatus a');if(previous)URL.revokeObjectURL(previous.href);let result=document.createElement('a');result.textContent=name;result.style='color:#365b45;word-break:break-all';result.href=URL.createObjectURL(blob);result.download=name;$('#exportStatus').append(result);const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function resolveSafeExportSize(requestedSize){
  const gl=renderer.getContext();
  const maxTex=renderer.capabilities?.maxTextureSize||4096;
  const maxRb=gl?gl.getParameter(gl.MAX_RENDERBUFFER_SIZE):4096;
  const maxVp=gl?gl.getParameter(gl.MAX_VIEWPORT_DIMS):[4096,4096];
  const vpLimit=Array.isArray(maxVp)?Math.min(maxVp[0]||4096,maxVp[1]||4096):4096;
  const maxDim=Math.max(256,Math.min(4096,maxTex||4096,maxRb||4096,vpLimit));
  return clampExportSize(requestedSize,maxDim);
}
async function capture(options={}){
  const format=options.format??exportConfig.format;
  const bgColor=options.bgColor??exportConfig.bgColor;
  const size=resolveSafeExportSize(options.size??exportConfig.size);
  const quality=options.quality??exportConfig.quality;
  const useVolume=options.useVolume??true;
  invalidatePreview(false);
  if(useVolume&&volumeController.enabled&&hasTranslucentParts()&&canUseVolumeOnCurrent()){
    $('#loading').style.display='block';
    $('#loading').textContent=format==='png'?`正在计算 ${size}×${size} 无背景体积散射定格…`:`正在计算 ${size}×${size} 体积散射并合成底色…`;
    try{
      const volumeBlob=await volumeController.capture(size);
      return await compositeToExportBlob(volumeBlob,{format,bgColor,size,quality});
    }finally{$('#loading').style.display='none'}
  }
  const old=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio(),aspect=camera.aspect,background=scene.background,clearColor=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  renderer.setPixelRatio(1);renderer.setSize(size,size,false);camera.aspect=1;camera.updateProjectionMatrix();scene.background=null;renderer.setClearColor(0,0);
  const actualBuf=renderer.getDrawingBufferSize(new THREE.Vector2());
  const nativeSize=Math.max(256,Math.min(size,actualBuf.x||size,actualBuf.y||size));
  try{
    exportingPNG=true;
    renderScene();
    return await compositeToExportBlob(renderer.domElement,{format,bgColor,size:nativeSize,quality});
  }finally{
    exportingPNG=false;scene.background=background;renderer.setClearColor(clearColor,alpha);renderer.setPixelRatio(ratio);renderer.setSize(old.x,old.y,false);camera.aspect=aspect;camera.updateProjectionMatrix();frameDirty=true;
  }
}

$('#shot').onclick=async()=>{if(!model||busy)return;busy=true;const previousEnabled=controls.enabled;controls.enabled=false;document.body.classList.toggle('capturing',true);controls.autoRotate=false;$('#rotate').classList.remove('on');try{const blob=await capture({...exportConfig,useVolume:true});const filename=buildExportFilename({modelName:current.name,colorHex:getExportColorToken(),viewLabel:getViewLabel(activeViewId),format:exportConfig.format,singleShot:true});download(blob,filename);$('#flash').style.opacity='.9';setTimeout(()=>$('#flash').style.opacity='0',100)}catch(e){$('#loading').style.display='block';$('#loading').textContent=e.message}finally{busy=false;controls.enabled=previousEnabled;document.body.classList.toggle('capturing',false);invalidatePreview()}};
// ZIP with stored entries: one browser download for all selected product snapshots.
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});function crc(data){let c=0xffffffff;for(const v of data)c=crcTable[(c^v)&255]^(c>>>8);return(c^0xffffffff)>>>0}function header(size){const a=new Uint8Array(size),v=new DataView(a.buffer);return{a,v}}
function zip(files){let chunks=[],central=[],offset=0,total=0;const enc=new TextEncoder();for(const f of files){const name=enc.encode(f.name),data=f.data,c=crc(data),h=header(30);h.v.setUint32(0,0x04034b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint32(14,c,true);h.v.setUint32(18,data.length,true);h.v.setUint32(22,data.length,true);h.v.setUint16(26,name.length,true);chunks.push(h.a,name,data);const ch=header(46);ch.v.setUint32(0,0x02014b50,true);ch.v.setUint16(4,20,true);ch.v.setUint16(6,20,true);ch.v.setUint16(8,0x800,true);ch.v.setUint32(16,c,true);ch.v.setUint32(20,data.length,true);ch.v.setUint32(24,data.length,true);ch.v.setUint16(28,name.length,true);ch.v.setUint32(42,offset,true);central.push(ch.a,name);offset+=30+name.length+data.length;total+=46+name.length}const end=header(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,total,true);end.v.setUint32(16,offset,true);return new Blob([...chunks,...central,end.a],{type:'application/zip'})}
$('#batch').onclick=async()=>{if(busy)return;let list=catalog.filter(i=>selected.has(i.id));if(!list.length){if(libraryState.mode!=='library'&&current){list=[current]}else{if(libraryState.mode==='library'){$('#catalogRail').hidden=false;frameDirty=true}$('#batch').textContent=t('selectModelsFirst');setTimeout(updateBatchButtonLabel,1700);return}}const views=getSelectedViewPresets(exportConfig.views);if(!views.length){$('#batch').textContent=t('selectViewsFirst');setTimeout(updateBatchButtonLabel,1700);return}busy=true;$('#batch').disabled=true;controls.enabled=false;controls.autoRotate=false;$('#rotate').classList.remove('on');document.body.classList.toggle('capturing',true);const before=current,beforeActivePart=activePart,originalView=viewState(),originalViewId=activeViewId,files=[],usedNames=new Set(),totalShots=list.length*views.length;let doneShots=0;try{for(const item of list){if(!await load(item,{persist:false}))throw Error(t('loadFailed',{name:item.name,reason:lastLoadError||'Error'}));const colorToken=getExportColorToken();for(const preset of views){doneShots++;const cam=resolveViewCamera(preset,item,originalView,groundTargetY);applyCameraView(cam);const viewName=getViewLabel(preset);$('#loading').style.display='block';$('#loading').textContent=t('exportingProgress',{done:doneShots,total:totalShots,name:getDisplayModelName(item),view:viewName});const blob=await capture({...exportConfig,useVolume:Boolean(exportConfig.batchUseVolume)});const filename=ensureUniqueFilename(buildExportFilename({modelName:item.name,colorHex:colorToken,viewLabel:viewName,format:exportConfig.format,singleShot:false}),usedNames);files.push({name:filename,data:new Uint8Array(await blob.arrayBuffer())})}}download(zip(files),`PolyStudio_${list.length}x${views.length}_${exportConfig.format}.zip`)}catch(e){alert(e.message)}finally{if(before){await load(before,{persist:false});if(beforeActivePart&&Array.from($('#partSelect').options).some(o=>o.value===beforeActivePart)){activePart=beforeActivePart;$('#partSelect').value=beforeActivePart;syncPartControls()}restoreView(originalView);activeViewId=originalViewId;syncViewJumpActive()}busy=false;controls.enabled=true;$('#batch').disabled=false;document.body.classList.toggle('capturing',false);$('#loading').style.display='none';invalidatePreview()}};
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);invalidatePreview()});renderer.setAnimationLoop(()=>{if(!busy){controls.update();if(frameDirty||controls.autoRotate){renderScene();frameDirty=false}}});
