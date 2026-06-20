# PDF工具矩阵

免费在线PDF处理工具集合，支持PDF合并、压缩、转换等功能。

## 🚀 功能特性

### 核心工具（第一批）
- ✅ **PDF合并** - 将多个PDF文件合并成一个
- ✅ **PDF压缩** - 减小PDF文件大小
- ✅ **PDF转图片** - 将PDF页面转换为JPG/PNG
- ✅ **图片转PDF** - 将多张图片合并为PDF
- ✅ **提取页面** - 从PDF中提取指定页面
- ✅ **PDF旋转** - 旋转PDF页面方向

### 进阶工具（第二批）
- 🔄 PDF加水印
- 🔄 PDF加密/解密
- 🔄 PDF分割
- 🔄 PDF页码

### AI功能（第三批）
- 🔄 AI PDF摘要
- 🔄 AI PDF翻译
- 🔄 AI PDF问答

## 🛠️ 技术栈

- **前端**: HTML + CSS + JavaScript
- **后端**: Node.js + Express
- **PDF处理**: pdf-lib, pdfkit, sharp
- **文件上传**: multer
- **安全**: helmet, cors
- **性能**: compression

## 📦 安装

```bash
# 克隆项目
git clone https://github.com/yourusername/pdf-tools.git

# 进入项目目录
cd pdf-tools

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 🚀 使用

```bash
# 启动生产服务器
npm start

# 访问 http://localhost:3000
```

## 📁 项目结构

```
pdf-tools/
├── public/                 # 静态资源
│   ├── css/               # 样式文件
│   ├── js/                # JavaScript文件
│   └── images/            # 图片资源
├── src/                   # 源代码
│   ├── routes/            # 路由
│   └── utils/             # 工具函数
├── views/                 # HTML模板
├── uploads/               # 上传文件（临时）
├── temp/                  # 临时文件
├── package.json           # 项目配置
└── README.md              # 项目说明
```

## 🔧 配置

### 环境变量

创建 `.env` 文件：

```env
PORT=3000
NODE_ENV=development
```

### 文件大小限制

默认文件大小限制为100MB，可在 `src/routes/pdf.js` 中修改：

```javascript
limits: {
  fileSize: 100 * 1024 * 1024 // 100MB
}
```

## 📝 API文档

### PDF合并
```
POST /api/pdf/merge
Content-Type: multipart/form-data
Body: files[] (多个PDF文件)
```

### PDF压缩
```
POST /api/pdf/compress
Content-Type: multipart/form-data
Body: file (单个PDF文件)
```

### PDF转图片
```
POST /api/pdf/to-images
Content-Type: multipart/form-data
Body: file (PDF文件), format (jpg/png), quality (low/medium/high)
```

### 图片转PDF
```
POST /api/pdf/from-images
Content-Type: multipart/form-data
Body: files[] (多个图片文件), fitPage (boolean)
```

## 🚀 部署

### Vercel部署
```bash
# 安装Vercel CLI
npm i -g vercel

# 部署
vercel
```

### 腾讯云部署
```bash
# 构建项目
npm run build

# 上传到腾讯云
```

## 📈 性能优化

- 使用compression中间件压缩响应
- 文件处理后自动清理临时文件
- 使用CDN加速静态资源
- 支持文件分片上传

## 🔒 安全特性

- 使用helmet设置安全HTTP头
- CORS跨域保护
- 文件类型验证
- 文件大小限制
- 自动清理临时文件

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License

## 📞 联系方式

- 邮箱: your@email.com
- 网站: https://yourdomain.com
```

## 🙏 致谢

- [pdf-lib](https://github.com/Hopding/pdf-lib)
- [pdfkit](https://github.com/foliojs/pdfkit)
- [sharp](https://github.com/lovell/sharp)
- [Express](https://expressjs.com/)
