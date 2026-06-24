const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

// 导入路由
const pdfRoutes = require('./routes/pdf');

const app = express();
const PORT = process.env.PORT || 3000;

// 为每个请求生成 nonce，供内联脚本使用
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// 中间件
app.use(cors({
  origin: function(origin, callback) {
    // 允许所有来源（生产环境可通过 CORS_ORIGIN 环境变量限制）
    callback(null, true);
  },
  methods: ['GET', 'POST'],
}));
app.use(helmet({
  contentSecurityPolicy: false, // 临时禁用 CSP，避免阻止字体和样式加载
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use(express.static(path.join(__dirname, '../public')));
app.use('/temp', express.static(path.join(__dirname, '../temp')));

// 创建上传目录
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 创建临时目录
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// 定时清理临时文件（每30分钟，删除1小时前的文件）
const CLEANUP_INTERVAL = 30 * 60 * 1000;
const MAX_FILE_AGE = 60 * 60 * 1000;
function cleanupOldFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > MAX_FILE_AGE) {
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    } catch (e) { /* 忽略正在使用的文件 */ }
  });
}
setInterval(() => {
  cleanupOldFiles(uploadDir);
  cleanupOldFiles(tempDir);
}, CLEANUP_INTERVAL);

// 路由
app.use('/api/pdf', pdfRoutes);

// 发送 HTML 文件并注入 nonce
function sendHtmlWithNonce(res, filePath) {
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('服务器错误');
    const injected = html.replace(/<script(?!\s+src=)/g, `<script nonce="${res.locals.nonce}"`);
    res.setHeader('Content-Type', 'text/html');
    res.send(injected);
  });
}

// 主页路由
app.get('/', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/index.html'));
});

// 工具页面路由
app.get('/merge', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/merge.html'));
});

app.get('/compress', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/compress.html'));
});

app.get('/convert', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/convert.html'));
});

app.get('/extract', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/extract.html'));
});

app.get('/rotate', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/rotate.html'));
});

app.get('/pricing', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/pricing.html'));
});

// Office转换页面路由
app.get('/office-to-pdf', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/office-to-pdf.html'));
});

app.get('/pdf-to-word', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/pdf-to-word.html'));
});

app.get('/pdf-to-excel', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/pdf-to-excel.html'));
});

app.get('/pdf-to-ppt', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/pdf-to-ppt.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '文件大小超过限制（最大100MB）' });
  }
  if (err.message === '不支持的文件类型') {
    return res.status(400).json({ error: '不支持的文件类型，仅支持 PDF、JPG、PNG、Word、Excel、PPT' });
  }
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: '页面未找到' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`PDF工具服务器运行在 http://localhost:${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
