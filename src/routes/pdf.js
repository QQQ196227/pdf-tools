const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pdfService = require('../utils/pdfService');

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// 通用上传（支持所有类型）
const uploadAll = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'), false);
    }
  }
});

// 仅 PDF 上传
const uploadPdf = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('仅支持PDF文件'), false);
    }
  }
});

// 仅图片上传
const uploadImage = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持JPG/PNG图片'), false);
    }
  }
});

// 清理临时文件
function cleanupFiles(...paths) {
  paths.forEach(p => {
    if (Array.isArray(p)) {
      p.forEach(fp => fs.unlink(fp, () => {}));
    } else if (p) {
      fs.unlink(p, () => {});
    }
  });
}

// PDF合并
router.post('/merge', uploadPdf.array('files', 10), async (req, res) => {
  const filePaths = req.files ? req.files.map(file => file.path) : [];
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);

  try {
    if (!req.files || req.files.length < 2) {
      cleanupFiles(filePaths);
      return res.status(400).json({ error: '请至少上传2个PDF文件' });
    }

    const options = {
      addPageNumbers: req.body.addPageNumbers === 'true',
      addBookmarks: req.body.addBookmarks === 'true',
      compressOutput: req.body.compressOutput === 'true',
    };

    await pdfService.mergePDFs(filePaths, outputPath, options);

    res.download(outputPath, 'merged.pdf', (err) => {
      cleanupFiles(filePaths, outputPath);
    });
  } catch (error) {
    console.error('PDF合并错误:', error);
    cleanupFiles(filePaths, outputPath);
    res.status(500).json({ error: error.message || 'PDF合并失败' });
  }
});

// PDF压缩
router.post('/compress', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);

  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const quality = req.body.quality || 'medium';
    await pdfService.compressPDF(req.file.path, outputPath, quality);

    res.download(outputPath, 'compressed.pdf', (err) => {
      cleanupFiles(req.file.path, outputPath);
    });
  } catch (error) {
    console.error('PDF压缩错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || 'PDF压缩失败' });
  }
});

// PDF转图片
router.post('/to-images', uploadPdf.single('file'), async (req, res) => {
  const outputDir = path.join(__dirname, '../../temp', uuidv4());

  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const imagePaths = await pdfService.pdfToImages(req.file.path, outputDir);

    // 打包成 zip 下载
    const archiver = require('archiver');
    const zipPath = path.join(outputDir, 'images.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip');

    archive.pipe(output);
    imagePaths.forEach((imgPath, i) => {
      archive.file(imgPath, { name: `page_${i + 1}.jpg` });
    });
    await archive.finalize();

    output.on('close', () => {
      res.download(zipPath, 'pdf_images.zip', (err) => {
        cleanupFiles(req.file.path);
        fs.rm(outputDir, { recursive: true }, () => {});
      });
    });
  } catch (error) {
    console.error('PDF转图片错误:', error);
    cleanupFiles(req.file ? req.file.path : null);
    fs.rm(outputDir, { recursive: true }, () => {});
    res.status(500).json({ error: error.message || 'PDF转图片失败' });
  }
});

// 图片转PDF
router.post('/from-images', uploadImage.array('files', 20), async (req, res) => {
  const filePaths = req.files ? req.files.map(file => file.path) : [];
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);

  try {
    if (!req.files || req.files.length === 0) {
      cleanupFiles(filePaths);
      return res.status(400).json({ error: '请上传图片文件' });
    }

    await pdfService.imagesToPDF(filePaths, outputPath);

    res.download(outputPath, 'converted.pdf', (err) => {
      cleanupFiles(filePaths, outputPath);
    });
  } catch (error) {
    console.error('图片转PDF错误:', error);
    cleanupFiles(filePaths, outputPath);
    res.status(500).json({ error: error.message || '图片转PDF失败' });
  }
});

// 提取PDF页面
router.post('/extract', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);

  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const pagesStr = req.body.pages || '';
    const pageNumbers = [];
    const parts = pagesStr.split(',');
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let i = start; i <= end; i++) pageNumbers.push(i);
      } else {
        pageNumbers.push(Number(part.trim()));
      }
    }

    if (!pageNumbers.length || pageNumbers.some(isNaN)) {
      cleanupFiles(req.file.path);
      return res.status(400).json({ error: '请输入有效的页码，如：1,3,5-7' });
    }

    // 校验页码范围
    const { PDFDocument } = require('pdf-lib');
    const pdfBytes = fs.readFileSync(req.file.path);
    const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = pdf.getPageCount();
    const invalidPages = pageNumbers.filter(p => p < 1 || p > totalPages);
    if (invalidPages.length) {
      cleanupFiles(req.file.path);
      return res.status(400).json({ error: `页码超出范围（共${totalPages}页）：${invalidPages.join(',')}` });
    }

    await pdfService.extractPages(req.file.path, pageNumbers, outputPath);

    res.download(outputPath, 'extracted.pdf', (err) => {
      cleanupFiles(req.file.path, outputPath);
    });
  } catch (error) {
    console.error('提取页面错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || '提取页面失败' });
  }
});

// PDF旋转
router.post('/rotate', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);

  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const degrees = parseInt(req.body.degrees) || 90;
    const allowedDegrees = [90, 180, 270];
    if (!allowedDegrees.includes(degrees)) {
      cleanupFiles(req.file.path);
      return res.status(400).json({ error: '旋转角度必须是 90、180 或 270' });
    }

    await pdfService.rotatePDF(req.file.path, degrees, outputPath);

    res.download(outputPath, 'rotated.pdf', (err) => {
      cleanupFiles(req.file.path, outputPath);
    });
  } catch (error) {
    console.error('旋转PDF错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || '旋转PDF失败' });
  }
});

// Office转PDF
router.post('/office-to-pdf', uploadAll.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);

  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传Office文件' });
    }

    await pdfService.officeToPDF(req.file.path, outputPath);

    res.download(outputPath, 'converted.pdf', (err) => {
      cleanupFiles(req.file.path, outputPath);
    });
  } catch (error) {
    console.error('Office转PDF错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || 'Office转PDF失败' });
  }
});

// PDF转Word
router.post('/pdf-to-word', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.docx`);

  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const mode = req.body.mode || 'editable';
    await pdfService.pdfToOffice(req.file.path, outputPath, 'docx', mode);

    const filename = mode === 'layout' ? 'converted_layout.docx' : 'converted.docx';
    res.download(outputPath, filename, (err) => {
      cleanupFiles(req.file.path, outputPath);
    });
  } catch (error) {
    console.error('PDF转Word错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || 'PDF转Word失败' });
  }
});

// PDF转Excel
router.post('/pdf-to-excel', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.xlsx`);

  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    await pdfService.pdfToOffice(req.file.path, outputPath, 'xlsx');

    res.download(outputPath, 'converted.xlsx', (err) => {
      cleanupFiles(req.file.path, outputPath);
    });
  } catch (error) {
    console.error('PDF转Excel错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || 'PDF转Excel失败' });
  }
});

// PDF转PPT
router.post('/pdf-to-ppt', uploadPdf.single('file'), async (req, res) => {
  const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pptx`);

  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    await pdfService.pdfToOffice(req.file.path, outputPath, 'pptx');

    res.download(outputPath, 'converted.pptx', (err) => {
      cleanupFiles(req.file.path, outputPath);
    });
  } catch (error) {
    console.error('PDF转PPT错误:', error);
    cleanupFiles(req.file ? req.file.path : null, outputPath);
    res.status(500).json({ error: error.message || 'PDF转PPT失败' });
  }
});

module.exports = router;
