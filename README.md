# Product Studio

浏览器端产品模型调色工具，支持部件调色、实色与半透明 PP、视角控制、尺寸标注及透明 PNG 导出。

## 使用

安装 Node.js 后运行 npm install，再运行 npm run dev，打开终端显示的网址。npm run build 生成静态网站。首次打开通过“上传模型”导入自己有权使用的 GLB 文件。模型保存在当前浏览器的 IndexedDB。尺寸标注需要模型带有可靠的实际尺寸比例。

## 开源范围

本仓库提供通用应用代码。发布包为空产品库，保留原 HDR 摄影棚光照和背景，保留体积散射与第三方降噪组件。GPU 体积散射需要支持 WebGPU 的浏览器。

## 许可

应用代码采用 MIT 许可。Three.js、three-gpu-pathtracer、three-mesh-bvh 和 oidn-webgpu 遵循各自发行包的许可。用户导入资源的权利由资源持有人管理。
