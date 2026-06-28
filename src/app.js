const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const pdfRoutes = require('./routes/pdf');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(cors({
  origin: function(origin, callback) {
    callback(null, true);
  },
  methods: ['GET', 'POST'],
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));
app.use('/temp', express.static(path.join(__dirname, '../temp')));

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

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
    } catch (e) {}
  });
}
setInterval(() => {
  cleanupOldFiles(uploadDir);
  cleanupOldFiles(tempDir);
}, CLEANUP_INTERVAL);

app.use('/api/pdf', pdfRoutes);

function sendHtmlWithNonce(res, filePath) {
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('服务器错误');
    const injected = html.replace(/<script(?!\s+src=)/g, `<script nonce="${res.locals.nonce}"`);
    res.setHeader('Content-Type', 'text/html');
    res.send(injected);
  });
}

app.get('/', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/index.html'));
});

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

// 法律页面路由
app.get('/privacy', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/privacy.html'));
});

app.get('/terms', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/terms.html'));
});

app.get('/contact', (req, res) => {
  sendHtmlWithNonce(res, path.join(__dirname, '../views/contact.html'));
});

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

app.use((req, res) => {
  res.status(404).json({ error: '页面未找到' });
});

app.listen(PORT, () => {
  console.log(`PDF工具服务器运行在 http://localhost:${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
