#!/bin/bash

# Anti-g Retry 本地安装脚本
# 用于从源码构建和安装 VS Code/Cursor 扩展

set -e

echo "🚀 Anti-g Retry 本地安装脚本"
echo "=========================="
echo ""

# 检查 bun
if ! command -v bun &> /dev/null; then
    echo "❌ 错误: 未找到 bun"
    echo "请先安装 bun:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    echo "或者访问: https://bun.sh/"
    exit 1
fi

echo "✅ bun 版本: $(bun --version)"
echo ""

# 进入项目目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📦 安装依赖..."
bun install

echo ""
echo "🔨 构建扩展..."
bun run build

echo ""
echo "📦 打包扩展..."
if ! command -v vsce &> /dev/null; then
    echo "安装 vsce (VS Code Extension Manager)..."
    bun install -g @vscode/vsce
fi

# 创建 npm 和 node 符号链接指向 bun
mkdir -p "$HOME/.bun/bin"

# npm 符号链接
if ! command -v npm &> /dev/null; then
    echo "创建 npm 符号链接..."
    NPM_LINK="$HOME/.bun/bin/npm"
    if [ ! -f "$NPM_LINK" ]; then
        cat > "$NPM_LINK" << 'EOF'
#!/bin/bash
# npm wrapper for bun
exec bun "$@"
EOF
        chmod +x "$NPM_LINK"
    fi
fi

# node 符号链接 (vsce 需要 node)
if ! command -v node &> /dev/null; then
    echo "创建 node 符号链接..."
    NODE_LINK="$HOME/.bun/bin/node"
    if [ ! -f "$NODE_LINK" ]; then
        cat > "$NODE_LINK" << 'EOF'
#!/bin/bash
# node wrapper for bun - allows vsce to run
exec bun "$@"
EOF
        chmod +x "$NODE_LINK"
    fi
fi

export PATH="$HOME/.bun/bin:$PATH"

# 使用本地 vsce 打包 (避免 PATH 问题)
./node_modules/.bin/vsce package --no-yarn

echo ""
echo "✅ 构建完成！"
echo ""
echo "📋 下一步："
echo "1. 在 VS Code/Cursor 中按 Cmd+Shift+P (macOS) 或 Ctrl+Shift+P (Windows/Linux)"
echo "2. 输入 'Extensions: Install from VSIX...'"
echo "3. 选择文件: $(pwd)/anti-g-retry-*.vsix"
echo ""
echo "或者："
echo "1. 在 VS Code/Cursor 中打开此项目文件夹"
echo "2. 按 F5 启动调试模式（会自动安装扩展）"
echo ""
