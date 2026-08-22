# /textures — 纹理与 HDR 环境贴图目录

将 equirectangular 格式的 .hdr 环境贴图放入本目录，并命名为 `studio.hdr`
（或修改 `src/config.js` 中 `assets.envHdrUrl` 指向你的文件）。

- 加载成功：`EquirectangularReflectionMapping` 作为 PBR 光照（scene.environment）
  与可见背景（scene.background）。
- 文件缺失：自动回退 `RoomEnvironment` 程序化光照，PBR 渲染路径不变，
  随时放入 HDR 即可无缝切换。

推荐免费 HDR 源：Poly Haven (https://polyhaven.com/hdris)
