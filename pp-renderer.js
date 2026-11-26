import * as THREE from 'three';

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
 float transmission=exp(-medium.a),coverage=1.-transmission;
 float alpha=coverage+body.a*transmission;
 if(alpha<.00001){gl_FragColor=vec4(0.);return;}
 vec3 litColor=medium.rgb/max(medium.a,.00001);
 vec3 rgb=(litColor*coverage+body.rgb*body.a*transmission)/alpha;
 gl_FragColor=vec4(rgb,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.composite));
 }
 configure(material){
  material.userData.ppDensity={value:.44};
  material.onBeforeCompile=shader=>{
   shader.uniforms.ppOpaqueDepth={value:this.opaque.depthTexture};shader.uniforms.ppResolution=this.resolution;shader.uniforms.ppOpticalDensity=material.userData.ppDensity;
   shader.fragmentShader='uniform sampler2D ppOpaqueDepth;uniform vec2 ppResolution;uniform float ppOpticalDensity;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
 #ifdef PP_TRANSLUCENT
 float opaqueZ=texture2D(ppOpaqueDepth,gl_FragCoord.xy/ppResolution).r;
 if(gl_FragCoord.z>opaqueZ+.000001)discard;
 float fresnel=pow(1.-abs(dot(normal,normalize(vViewPosition))),3.);
 float weight=ppOpticalDensity*(.8+.5*fresnel);
 gl_FragColor=vec4(gl_FragColor.rgb*weight,weight);
 #endif`);
  };material.customProgramCacheKey=()=> 'pp-lit-optical-v1';
 }
 setStyle(material,style){
  const translucent=style.category==='transparent',previous=material.defines.PP_TRANSLUCENT!==undefined;
  if(previous!==translucent){if(translucent)material.defines.PP_TRANSLUCENT=1;else delete material.defines.PP_TRANSLUCENT;material.needsUpdate=true}
  material.transmission=0;material.transparent=translucent;material.opacity=translucent?.36+.62*(1-Math.pow(style.transmission/100,.7)):1;
  material.userData.ppDensity.value=.44+3.3*Math.pow(1-style.transmission/100,2.4);
  material.roughness=Math.max(translucent?.28:.02,style.roughness/100);material.depthWrite=!translucent;material.depthTest=!translucent;
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
