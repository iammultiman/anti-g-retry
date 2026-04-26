# ✅ Anti-g Retry 本地安装完成

## 安装状态

✅ **依赖已安装** - 使用 bun 成功安装所有依赖  
✅ **项目已构建** - extension 和 webview 都已成功构建  
✅ **构建文件位置**:
   - `dist/extension.js` - 扩展主文件
   - `dist/webview/main.js` - Webview 前端文件
   - `dist/webview/media/styles.css` - 样式文件

## 安装扩展到 VS Code/Cursor

由于 vsce 打包工具存在路径解析问题，推荐使用以下方法安装：

### 方法 1: 使用调试模式（推荐，最简单）

1. **在 VS Code 或 Cursor 中打开项目**:
   ```bash
   code /Users/jianye/Desktop/workspaces/paean/agy-retry
   # 或
   cursor /Users/jianye/Desktop/workspaces/paean/agy-retry
   ```

2. **按 `F5` 启动调试模式**
   - 这会自动编译并启动一个新的扩展开发宿主窗口
   - 在新窗口中，扩展已经安装并可以使用

3. **在新窗口中测试扩展**:
   - 点击侧边栏的 **Anti-g Retry** 图标
   - 点击 **Start** 按钮开始使用

### 方法 2: 手动创建符号链接（开发用）

如果你想在当前的 VS Code/Cursor 实例中使用：

```bash
# 创建扩展目录（如果不存在）
mkdir -p ~/.vscode/extensions/agy-retry-0.1.2

# 复制文件
cp -r /Users/jianye/Desktop/workspaces/paean/agy-retry/* ~/.vscode/extensions/agy-retry-0.1.2/

# 或者创建符号链接（推荐，便于开发）
ln -s /Users/jianye/Desktop/workspaces/paean/agy-retry ~/.vscode/extensions/agy-retry-local
```

然后重启 VS Code/Cursor。

### 方法 3: 修复 vsce 打包问题后打包

如果需要打包为 .vsix 文件，可以尝试：

```bash
cd /Users/jianye/Desktop/workspaces/paean/agy-retry
export PATH="$HOME/.bun/bin:$PATH"

# 确保构建完成
bun run build

# 尝试使用不同的 vsce 选项
bunx vsce package --no-yarn --allow-missing-repository
```

## 使用扩展

安装完成后：

1. 点击侧边栏中的 **Anti-g Retry** 图标
2. 点击 **Start** 按钮
3. 按照 CDP 设置提示操作
4. 重启 IDE
5. 重启后再次点击 **Start**，自动重试功能即可激活

## 开发模式

如果你要继续开发扩展：

```bash
# 启动监听模式
bun run watch

# 然后在 VS Code 中按 F5 启动调试
```

## 项目信息

- **项目路径**: `/Users/jianye/Desktop/workspaces/paean/agy-retry`
- **版本**: 0.1.2
- **包管理器**: Bun 1.3.6
- **构建工具**: Webpack 5.104.1

## 下一步

推荐使用方法 1（F5 调试模式），这是最简单且最适合开发的方式。
