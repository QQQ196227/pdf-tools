#!/bin/bash

# PDF工具矩阵部署脚本

echo "🚀 开始部署PDF工具矩阵..."

# 检查是否安装了Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI未安装"
    echo "📦 正在安装Vercel CLI..."
    npm install -g vercel
fi

# 检查是否登录了Vercel
if ! vercel whoami &> /dev/null; then
    echo "🔐 请先登录Vercel..."
    vercel login
fi

# 安装依赖
echo "📦 安装依赖..."
npm install

# 构建项目（如果需要）
echo "🔨 构建项目..."
# npm run build  # 如果有构建步骤

# 部署到Vercel
echo "🚀 部署到Vercel..."
vercel --prod

echo "✅ 部署完成！"
echo ""
echo "📝 后续步骤："
echo "1. 在Vercel仪表板中配置自定义域名"
echo "2. 配置环境变量（如果需要）"
echo "3. 设置Google AdSense"
echo "4. 配置Stripe支付"
echo "5. 提交sitemap到Google Search Console"
echo ""
echo "🌐 您的网站已上线！"
