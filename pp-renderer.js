import * as THREE from 'three';
import { computeSurfaceMaterialParams } from './surface-finish.js';

// Lit, order-independent translucent PP. No screen-background refraction is baked into PNGs.
export class PPViewport {
 constructor(renderer,scene,camera){
  this.renderer=renderer;this.scene=scene;this.camera=camera;
  const type=renderer.extensions?.has('EXT_color_buffer_float')===false?THREE.UnsignedByteType:THREE.HalfFloatType;
  this.opaque=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:true});this.opaque.texture.colorSpace=THREE.LinearSRGBColorSpace;this.opaque.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  this.layers=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});this.layers.texture.colorSpace=THREE.LinearSRGBColorSpace;
  this.resolution={value:new THREE.Vector2(1,1)};
  this.quadScene=new THREE.Scene();this.quadCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  this.composite=new THREE.ShaderMaterial({uniforms:{opaqueImage:{value:this.opaque.texture},layers:{value:this.layers.texture}},transparent:true,depthTest:false,depthWrite:false,vertexShader:'varying vec2 uvPP;void main(){uvPP=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
uniform sampler2D opaqueImage;uniform sampler2D layers;varying vec2 uvPP;
void main(){
 vec4 body=texture2D(opaqueImage,uvPP),medium=texture2D(layers,uvPP);
 float tau=medium.a;
 float transmission=exp(-tau),coverage=1.-transmission;
 float alpha=clamp(coverage+body.a*transmission,0.,1.);
 if(alpha<.00001){gl_FragColor=vec4(0.);return;}
 vec3 litColor=medium.rgb/max(tau,.00001);
 float depthFactor=1.-exp(-tau*.78);
 vec3 depthLit=litColor*mix(1.06,.90,depthFactor);
 vec3 rgb=(depthLit*coverage+body.rgb*body.a*transmission)/alpha;
 gl_FragColor=vec4(rgb,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.composite));
 }
 configure(material){
  material.userData.ppDensity={value:.44};
  material.userData.ppGrainStrength={value:0};
  material.userData.ppGrainFreq={value:150};
  material.userData.ppMatteScatter={value:0};
  material.onBeforeCompile=shader=>{
   shader.uniforms.ppOpaqueDepth={value:this.opaque.depthTexture};
   shader.uniforms.ppResolution=this.resolution;
   shader.uniforms.ppOpticalDensity=material.userData.ppDensity;
   shader.uniforms.ppGrainStrength=material.userData.ppGrainStrength;
   shader.uniforms.ppGrainFreq=material.userData.ppGrainFreq;
   shader.uniforms.ppMatteScatter=material.userData.ppMatteScatter;
   shader.vertexShader='varying vec3 vPPWorldPos;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
 vPPWorldPos=(modelMatrix*vec4(transformed,1.)).xyz;`);
   shader.fragmentShader=`uniform sampler2D ppOpaqueDepth;uniform vec2 ppResolution;uniform float ppOpticalDensity;uniform float ppGrainStrength;uniform float ppGrainFreq;uniform float ppMatteScatter;varying vec3 vPPWorldPos;
float ppHash3(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
vec3 ppGrainGrad(vec3 p){
 vec3 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
 float a=ppHash3(i+vec3(0.,0.,0.)),b=ppHash3(i+vec3(1.,0.,0.)),c=ppHash3(i+vec3(0.,1.,0.)),d=ppHash3(i+vec3(1.,1.,0.));
 float e=ppHash3(i+vec3(0.,0.,1.)),g=ppHash3(i+vec3(1.,0.,1.)),h=ppHash3(i+vec3(0.,1.,1.)),k=ppHash3(i+vec3(1.,1.,1.));
 float k1=b-a,k2=c-a,k3=e-a,k4=a-b-c+d,k5=a-c-e+h,k6=a-b-e+g,k7=-a+b+c-d+e-g-h+k;
 return du*vec3(k1+k4*u.y+k6*u.z+k7*u.y*u.z,k2+k5*u.z+k4*u.x+k7*u.z*u.x,k3+k6*u.x+k5*u.y+k7*u.x*u.y);
}
`+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 if(ppGrainStrength>.001){
  vec3 gW=ppGrainGrad(vPPWorldPos*ppGrainFreq)*.72+ppGrainGrad(vPPWorldPos*ppGrainFreq*2.13)*.28;
  vec3 gV=mat3(viewMatrix)*gW;
  gV-=normal*dot(gV,normal);
  normal=normalize(normal+gV*ppGrainStrength);
 }`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
 #ifdef PP_TRANSLUCENT
 float opaqueZ=texture2D(ppOpaqueDepth,gl_FragCoord.xy/ppResolution).r;
 if(gl_FragCoord.z>opaqueZ+.000001)discard;
 float ndotv=clamp(abs(dot(normalize(normal),normalize(vViewPosition))),0.,1.);
 float grazing=1.-ndotv;
 float fresnel=pow(grazing,3.);
 float pathFactor=mix(.56,2.45,pow(grazing,1.6));
 float faceScale=gl_FrontFacing?1.:.82;
 float weight=ppOpticalDensity*pathFactor*faceScale;
 vec3 bodyTint=gl_FragColor.rgb*(gl_FrontFacing?mix(1.03,.86,fresnel):.86)+diffuseColor.rgb*ppMatteScatter*(.38+.62*grazing);
 float sheenStrength=mix(.68,.16,clamp(roughnessFactor,0.,1.));
 vec3 rimHighlight=vec3(sheenStrength*fresnel)*(gl_FrontFacing?1.:.25);
 gl_FragColor=vec4(bodyTint*weight+rimHighlight*(.45+.55*weight),weight);
 #endif`);
  };material.customProgramCacheKey=()=> 'pp-lit-optical-v3';
 }
 setStyle(material,style){
  const params=computeSurfaceMaterialParams(style);
  const translucent=params.translucent,previous=material.defines.PP_TRANSLUCENT!==undefined;
  if(previous!==translucent){if(translucent)material.defines.PP_TRANSLUCENT=1;else delete material.defines.PP_TRANSLUCENT;material.needsUpdate=true}
  material.transmission=0;material.transparent=translucent;material.opacity=translucent?.36+.62*(1-Math.pow(style.transmission/100,.7)):1;
  material.userData.ppDensity.value=params.opticalDensity;
  material.userData.ppGrainStrength.value=params.grainStrength;
  material.userData.ppGrainFreq.value=params.grainFreq;
  material.userData.ppMatteScatter.value=params.matteScatterLift;
  material.roughness=params.materialRoughness;
  material.clearcoat=params.clearcoat;
  material.clearcoatRoughness=params.clearcoatRoughness;
  material.specularIntensity=params.specularIntensity;
  material.envMapIntensity=params.envMapIntensity;
  material.sheen=params.sheen;
  material.sheenRoughness=params.sheenRoughness;
  if(!material.sheenColor)material.sheenColor=new THREE.Color();
  material.sheenColor.set(style.color||'#ffffff').lerp(new THREE.Color(0xffffff),.58);
  material.depthWrite=!translucent;material.depthTest=!translucent;
  material.blending=translucent?THREE.CustomBlending:THREE.NormalBlending;material.blendEquation=THREE.AddEquation;material.blendSrc=THREE.OneFactor;material.blendDst=THREE.OneFactor;
 }
 render(model,meshes){
  const r=this.renderer,s=this.scene,c=this.camera;if(!model||!meshes.some(o=>o.material.transparent)){r.render(s,c);return}
  const state={target:r.getRenderTarget(),background:s.background,autoClear:r.autoClear,tone:r.toneMapping,color:r.getClearColor(new THREE.Color()),alpha:r.getClearAlpha(),visibility:meshes.map(o=>o.visible),modelVisible:model.visible};
  const size=r.getDrawingBufferSize(new THREE.Vector2());for(const target of [this.opaque,this.layers])if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);this.resolution.value.copy(size);
  try{
   model.visible=false;r.render(s,c);model.visible=true;s.background=null;r.toneMapping=THREE.NoToneMapping;r.setClearColor(0,0);
   r.setRenderTarget(this.opaque);r.clear();meshes.forEach((o,i)=>o.visible=state.visibility[i]&&!o.material.transparent);r.render(s,c);
   r.setRenderTarget(this.layers);r.clear();meshes.forEach((o,i)=>o.visible=state.visibility[i]&&o.material.transparent);r.render(s,c);
   r.setRenderTarget(state.target);r.toneMapping=state.tone;r.autoClear=false;r.render(this.quadScene,this.quadCamera);
  }finally{meshes.forEach((o,i)=>o.visible=state.visibility[i]);model.visible=state.modelVisible;s.background=state.background;r.setRenderTarget(state.target);r.setClearColor(state.color,state.alpha);r.toneMapping=state.tone;r.autoClear=state.autoClear}
 }
}
