# 本地优化与验证记录

记录日期：2026-10-24。版本：`@shuind/dsh-codex-harness@0.2.21-local.2`。

本版本基于 [shuind/dsh-codex-harness](https://github.com/shuind/dsh-codex-harness) 的 `0.2.21`，基线提交为 `079794c9c093b13aac30de3358a5312d4642a6ee`。感谢上游作者；保留原包名、上游归属与 MIT 许可证。本次为供 RoyalLiang 个人 fork 使用的独立优化，不代表上游正式版本，不涉及 npm 发布。

## 可移植改动

- 远程压缩增加取消检查，覆盖请求完成、响应解码和逐块输出期间的取消竞争；取消后停止发布成功摘要，避免误触发本地回退。普通远端失败仍可回退。
- 补充压缩失败、部分摘要中断、历史保留及下一次自动重试的回归测试；沿用宿主现有压缩事务实现。
- 仅保留本插件拥有的最新 32 个诊断文件；单帧最多 1 MiB 字符，诊断旁路读取最多 8 MiB。超限跳过诊断，不截断提供商响应，不清理无关文件。
- 适配 DSH NEXT `0.2.1-rc.2` 的 agent preset registry，并保留旧版文件式预设兼容；增加 registry 的可选 peer dependency。
- 仅在新版 registry 注册路径中将旧 `workflow-worker-thread` 引擎映射为宿主提供的 `workflow-ptc`，保留 spawn provider 与 workflowEngine 的隔离。
- 新版 registry 内置预设显示为只读，避免尝试修改安装包中的预设；旧版可写预设编辑流程继续兼容。

## 已完成的验证

以下结果来自优化源码在准备本提交前完成的验证；本次只复制已验证源码及新增文档，没有再次安装依赖或运行测试。

- 全套测试：15 个测试文件、152 项测试全部通过。
- 严格类型检查：`tsc -p tsconfig.json --noEmit` 返回 0。
- 后端、客户端构建成功；安装包包含 60 个文件。
- 插件安装与静态配置加载通过，配置树包含 `codex-preset-installer` 和 `codex-client`。
- 测试与构建存在非阻断提示：旧 YAML fixture 的 `!!js` 标签警告、客户端打包的 mixed exports 警告。

尚未验证重启后的真实模型调用。Codex 核验参考版本为 `0.164.0`；此记录不表示重新验证了最新版本。

## 来源

- 上游项目：https://github.com/shuind/dsh-codex-harness
- 上游基线：https://github.com/shuind/dsh-codex-harness/tree/079794c9c093b13aac30de3358a5312d4642a6ee
- Codex 0.164.0 发布参考：https://github.com/openai/codex/releases/tag/rust-v0.164.0
- Codex 0.164.0 源码参考：https://github.com/openai/codex/tree/rust-v0.164.0
