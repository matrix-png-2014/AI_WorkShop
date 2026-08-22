# /models — glTF/GLB 模型目录

将商品模型文件放入本目录，并在 `public/manifests/*.json` 的 `products[].model` 字段引用文件名即可自动加载。

## 支持格式
- `.glb`（二进制，推荐）
- `.gltf` + 外部资源（.bin / .png 等，与模型同目录放置）
- Draco 压缩的 .glb/.gltf（解码器已就绪：`/draco/`，postinstall 自动拷贝）

## 说明
- 骨架阶段无需任何模型文件：商品位置会以 **GridHelper 底座 + Box3Helper 包围盒** 占位，
  并显示加载进度与「模型缺失」状态 —— 占位系统即最终未放模型时的正确表现。
- 建议模型锚点（原点）位于商品底部中心，与 manifest 中 `position` 对齐。
