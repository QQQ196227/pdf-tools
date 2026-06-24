const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pdfService = require('../utils/pdfService');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  }
});

const uploadPdf = multer({
  storage, limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('仅支持PDF文件'), false);
  }
});

const uploadAll = multer({
  storage, limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('不支持的文件类型'), false);
  }
});

const uploadImage = multer({
  storage, limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持JPG/PNG图片'), false);
  }
});

function cleanupFiles(...paths) {
  paths.forEach(p => {
    if (Array.isArray(p)) p.forEach(fp => fs.unlink(fp, () => {}));
    else if (p) fs.unlink(p, () => {});
  });
}

router.post('/merge', uploadPdf.array('files', 10), async (req, res) => {
  const filePaths = req.files ? req.files.map(f => f.path) : [];
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);
  try {
    if (!req.files || req.files.length < 2) { cleanupFiles(filePaths); return res.status(400).json({ error: '请至少上传2个PDF文件' }); }
    const options = { addPageNumbers: req.body.addPageNumbers === 'true', addBookmarks: req.body.addBookmarks === 'true', compressOutput: req.body.compressOutput === 'true' };
    await pdfService.mergePDFs(filePaths, outputPath, options);
    res.download(outputPath, 'merged.pdf', () => cleanupFiles(filePaths, outputPath));
  } catch (error) {
    console.error('PDF合并错误:', error);
    cleanupFiles(filePaths, outputPath);
    res.status(500).json({ error: error.message || 'PDF合并失败' });
  }
});

router.post('/compress', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);
  try {
    if (!req.file) return res.status(400).json({ error: '请上传PDF文件' });
    await pdfService.compressPDF(req.file.path, outputPath, req.body.quality || 'medium');
    res.download(outputPath, 'compressed.pdf', () => cleanupFiles(req.file.path, outputPath));
  } catch (error) {
    console.error('PDF压缩错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || 'PDF压缩失败' });
  }
});

router.post('/to-images', uploadPdf.single('file'), async (req, res) => {
  const outputDir = path.join(__dirname, '../../temp', uuidv4());
  try {
    if (!req.file) return res.status(400).json({ error: '请上传PDF文件' });
    fs.mkdirSync(outputDir, { recursive: true });
    const imagePaths = await pdfService.pdfToImages(req.file.path, outputDir);
    // archiver removed
    const imageNames = imagePaths.map(p => path.basename(p));
    cleanupFiles(req.file.path);
    res.json({ images: imageNames });
      res.download(zipPath, 'pdf_images.zip', () => { cleanupFiles(req.file.path); fs.rm(outputDir, { recursive: true }, () => {}); });
    });
  } catch (error) {
    console.error('PDF转图片错误:', error);
    cleanupFiles(req.file ? req.file.path : null);
    fs.rm(outputDir, { recursive: true }, () => {});
    res.status(500).json({ error: error.message || 'PDF转图片失败' });
  }
});

router.post('/from-images', uploadImage.array('files', 20), async (req, res) => {
  const filePaths = req.files ? req.files.map(f => f.path) : [];
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);
  try {
    if (!req.files || !req.files.length) { cleanupFiles(filePaths); return res.status(400).json({ error: '请上传图片文件' }); }
    await pdfService.imagesToPDF(filePaths, outputPath);
    res.download(outputPath, 'converted.pdf', () => cleanupFiles(filePaths, outputPath));
  } catch (error) {
    console.error('图片转PDF错误:', error);
    cleanupFiles(filePaths, outputPath);
    res.status(500).json({ error: error.message || '图片转PDF失败' });
  }
});

router.post('/extract', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);
  try {
    if (!req.file) return res.status(400).json({ error: '请上传PDF文件' });
    const pageNumbers = [];
    (req.body.pages || '').split(',').forEach(part => {
      if (part.includes('-')) { const [s, e] = part.split('-').map(Number); for (let i = s; i <= e; i++) pageNumbers.push(i); }
      else pageNumbers.push(Number(part.trim()));
    });
    if (!pageNumbers.length || pageNumbers.some(isNaN)) { cleanupFiles(req.file.path); return res.status(400).json({ error: '请输入有效的页码' }); }
    await pdfService.extractPages(req.file.path, pageNumbers, outputPath);
    res.download(outputPath, 'extracted.pdf', () => cleanupFiles(req.file.path, outputPath));
  } catch (error) {
    console.error('提取页面错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || '提取页面失败' });
  }
});

router.post('/rotate', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);
  try {
    if (!req.file) return res.status(400).json({ error: '请上传PDF文件' });
    const degrees = parseInt(req.body.degrees) || 90;
    if (![90, 180, 270].includes(degrees)) { cleanupFiles(req.file.path); return res.status(400).json({ error: '旋转角度必须是 90、180 或 270' }); }
    await pdfService.rotatePDF(req.file.path, degrees, outputPath);
    res.download(outputPath, 'rotated.pdf', () => cleanupFiles(req.file.path, outputPath));
  } catch (error) {
    console.error('旋转PDF错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || '旋转PDF失败' });
  }
});

router.post('/office-to-pdf', uploadAll.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);
  try {
    if (!req.file) return res.status(400).json({ error: '请上传Office文件' });
    await pdfService.officeToPDF(req.file.path, outputPath);
    res.download(outputPath, 'converted.pdf', () => cleanupFiles(req.file.path, outputPath));
  } catch (error) {
    console.error('Office转PDF错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || 'Office转PDF失败' });
  }
});

router.post('/pdf-to-word', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.docx`);
  try {
    if (!req.file) return res.status(400).json({ error: '请上传PDF文件' });
    await pdfService.pdfToOffice(req.file.path, outputPath, 'docx', req.body.mode || 'editable');
    res.download(outputPath, req.body.mode === 'layout' ? 'converted_layout.docx' : 'converted.docx', () => cleanupFiles(req.file.path, outputPath));
  } catch (error) {
    console.error('PDF转Word错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || 'PDF转Word失败' });
  }
});

router.post('/pdf-to-excel', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.xlsx`);
  try {
    if (!req.file) return res.status(400).json({ error: '请上传PDF文件' });
    await pdfService.pdfToOffice(req.file.path, outputPath, 'xlsx');
    res.download(outputPath, 'converted.xlsx', () => cleanupFiles(req.file.path, outputPath));
  } catch (error) {
    console.error('PDF转Excel错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || 'PDF转Excel失败' });
  }
});

router.post('/pdf-to-ppt', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pptx`);
  try {
    if (!req.file) return res.status(400).json({ error: '请上传PDF文件' });
    await pdfService.pdfToOffice(req.file.path, outputPath, 'pptx');
    res.download(outputPath, 'converted.pptx', () => cleanupFiles(req.file.path, outputPath));
  } catch (error) {
    console.error('PDF转PPT错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || 'PDF转PPT失败' });
  }
});

module.exports = router;
