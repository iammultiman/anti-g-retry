# Anti-g Retry 本地安装指南

本指南将帮助你从源码构建和安装 Anti-g Retry 扩展。

## 前置要求

### 1. 安装 Bun

Anti-g Retry 使用 Bun 作为包管理器。如果还没有安装，请先安装：

**macOS/Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**或者使用 Homebrew (macOS):**
```bash
brew install bun
```

**验证安装:**
```bash
bun --version
```

### 2. 安装 VS Code 扩展打包工具 (可选)

如果需要打包为 .vsix 文件：
```bash
bun install -g @vscode/vsce
```

## 安装步骤

### 方法 1: 使用安装脚本（推荐）

```bash
cd /Users/jianye/Desktop/workspaces/paean/anti-g-retry
./install.sh
```

脚本会自动：
1. 检查 bun 是否安装
2. 安装所有依赖
3. 构建扩展
4. 打包为 .vsix 文件

### 方法 2: 手动安装

```bash
# 1. 进入项目目录
cd /Users/jianye/Desktop/workspaces/paean/anti-g-retry

# 2. 安装依赖
bun install

# 3. 构建扩展
bun run build

# 4. 打包扩展（可选）
bun run package
```

## 安装扩展到 VS Code/Cursor

### 方法 A: 从 .vsix 文件安装

1. 运行 `bun run package` 后会生成 `anti-g-retry-*.vsix` 文件
2. 在 VS Code/Cursor 中按 `Cmd+Shift+P` (macOS) 或 `Ctrl+Shift+P` (Windows/Linux)
3. 输入 `Extensions: Install from VSIX...`
4. 选择生成的 `.vsix` 文件

### 方法 B: 使用调试模式（开发用）

1. 在 VS Code/Cursor 中打开项目文件夹：
   ```bash
   code /Users/jianye/Desktop/workspaces/paean/anti-g-retry
   # 或
   cursor /Users/jianye/Desktop/workspaces/paean/anti-g-retry
   ```

2. 按 `F5` 启动调试模式
   - 这会自动编译并启动一个新的扩展开发宿主窗口
   - 在新窗口中测试扩展功能

## 使用扩展

安装完成后：

1. 点击侧边栏中的 **Anti-g Retry** 图标
2. 点击 **Start** 按钮
3. 按照 CDP 设置提示操作
4. 重启 IDE
5. 重启后再次点击 **Start**，自动重试功能即可激活

## 开发模式

如果你要修改扩展代码：

```bash
# 启动监听模式，代码更改后自动重新编译
bun run watch
```

然后在 VS Code/Cursor 中按 `F5` 启动调试模式。

## 故障排除

### bun 命令未找到

确保 bun 已正确安装并添加到 PATH：
```bash
# 检查 bun 是否在 PATH 中
which bun

# 如果未找到，可能需要重新加载 shell 配置
source ~/.bashrc  # 或 ~/.zshrc
```

### 构建失败

1. 确保所有依赖已安装：
   ```bash
   bun install
   ```

2. 清理并重新构建：
   ```bash
   rm -rf node_modules dist
   bun install
   bun run build
   ```

### vsce 命令未找到

安装 vsce：
```bash
bun install -g @vscode/vsce
```

## 项目结构

```
anti-g-retry/
├── src/              # 扩展主代码
│   ├── extension.ts  # 扩展入口
│   ├── services/     # 服务层
│   └── ui/          # UI 组件
├── webview/         # Webview 前端代码
├── resources/       # 资源文件（图标等）
├── dist/           # 构建输出目录
└── package.json    # 项目配置
```

## 相关链接

- GitHub: https://github.com/iammultiman/anti-g-retry
- Bun 文档: https://bun.sh/docs
- VS Code 扩展开发: https://code.visualstudio.com/api
