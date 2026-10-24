# 独立维护与版本安装

本仓库由 RoyalLiang 独立维护。上游来源为 shuind/dsh-codex-harness，保留 MIT 许可证与原作者署名。原包标识 `@shuind/dsh-codex-harness` 用于兼容已有 DSH 设置、预设能力引用和浏览器模块 ID，不代表发布到原作者的 npm 账号。

## 安装与更新

```sh
dsh plugin --profile desktop add 'git+ssh://git@github.com/RoyalLiang/dsh-codex-harness.git#v0.2.23' --ignore-scripts
```

Web Profile 使用 `--profile web`。安装机需要可用的 GitHub SSH 授权。版本固定到已发布标签；更新时先查看变更说明，再将标签替换为新版本。不要使用 npm 上的 `@latest` 更新本独立版本，也不要依赖本地 `.tgz` 文件。

标签包含 `lib/` 下的预构建运行文件，安装时无需执行构建脚本。DSH 使用自己的 Node 与 pnpm 管理 Profile 依赖；桌面安装使用应用提供的插件管理入口或等价的官方 CLI。

## 开发与发布

1. 在独立分支修改源码并更新包版本；上游更新可以从 `upstream` 远程获取后按需合并。
2. 使用 Node 24 LTS 和仓库声明的 pnpm 安装开发依赖。
3. 运行 `pnpm test`、`pnpm check` 和 `pnpm build`。构建工具必须包含适合当前平台的 rolldown 原生绑定。
4. 将源码、版本说明以及本次生成的 `lib/` 一起提交。已跟踪构建文件必须与同一提交的源码对应。
5. 推送提交到本仓库，创建新的不可变 `v<version>` 标签并推送。不要覆盖已供用户安装的标签。
6. 从远程标签安装到测试 Profile，核对锁文件中的提交和运行文件，然后再升级实际 Profile。

`prepare` 安装钩子已移除，避免 Git 安装再次拉取开发依赖或在用户机器上编译。打包检查命令 `pnpm pack:check` 会先执行构建。

## 0.2.23

- 修复新版 Typert 要求的 codec `create()` 工厂，避免清单失败导致 `llm/listProviders` 定义被撤销。
- 迁移后端设置到 Config 派生表单；Web 控制器与后端共享 `codex-preset-installer` entry ID。
- 通过 `describe()` 读取设置，写回模型配置时保留 revision；请求、提示词和压缩路径继续读取实时设置。
- 新增 `scripts/verify-host-compat.mjs`，使用实际安装的宿主 ASAR 验证加载器、注册表、网关、LLM、设置表单以及插件启动。

宿主验证需在 Electron 的 Node 模式下执行，先设置 `ELECTRON_RUN_AS_NODE=1` 和 `DSH_HOST_ASAR`，再使用桌面程序运行该脚本。配置编辑器、预设注册表及非目标依赖使用隔离 fixture；该检查不会改动实际 Profile 或调用模型。

## 0.2.22

- 首个使用常规版本号的独立维护版本。
- 仓库、问题入口及首页指向 RoyalLiang/dsh-codex-harness。
- 包含 0.2.21-local.3 的 `configForms` 启动修复与此前的取消、压缩和新版宿主兼容改进。
- 增加 Git 标签直接安装所需的预构建文件，取消本地安装包路径依赖。
