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

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 'image/png',
      // Office MIME 类型
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/msword',         // .doc
      'application/vnd.ms-excel',   // .xls
      'application/vnd.ms-powerpoint', // .ppt
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'), false);
    }
  }
});

// PDF合并
router.post('/merge', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ error: '请至少上传2个PDF文件' });
    }

    const filePaths = req.files.map(file => file.path);
    const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);

    // 获取合并选项
    const options = {
      addPageNumbers: req.body.addPageNumbers === 'true',
      addBookmarks: req.body.addBookmarks === 'true',
      compressOutput: req.body.compressOutput === 'true',
    };

    await pdfService.mergePDFs(filePaths, outputPath, options);

    res.download(outputPath, 'merged.pdf', (err) => {
      // 清理临时文件
      filePaths.forEach(filePath => {
        fs.unlink(filePath, () => {});
      });
      fs.unlink(outputPath, () => {});
    });
  } catch (error) {
    console.error('PDF合并错误:', error);
    res.status(500).json({ error: 'PDF合并失败' });
  }
});

// PDF压缩
router.post('/compress', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);
    const quality = req.body.quality || 'medium';

    await pdfService.compressPDF(req.file.path, outputPath, quality);

    res.download(outputPath, 'compressed.pdf', (err) => {
      // 清理临时文件
      fs.unlink(req.file.path, () => {});
      fs.unlink(outputPath, () => {});
    });
  } catch (error) {
    console.error('PDF压缩错误:', error);
    res.status(500).json({ error: 'PDF压缩失败' });
  }
});

// PDF转图片
router.post('/to-images', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const outputDir = path.join(__dirname, '../../temp', uuidv4());
    fs.mkdirSync(outputDir, { recursive: true });

    const imagePaths = await pdfService.pdfToImages(req.file.path, outputDir);

    // 这里简化处理，实际应该打包成zip
    res.json({
      message: 'PDF转图片成功',
      images: imagePaths.map(p => path.basename(p))
    });

    // 清理临时文件
    setTimeout(() => {
      fs.unlink(req.file.path, () => {});
      fs.rm(outputDir, { recursive: true }, () => {});
    }, 60000);
  } catch (error) {
    console.error('PDF转图片错误:', error);
    res.status(500).json({ error: 'PDF转图片失败' });
  }
});

// 图片转PDF
router.post('/from-images', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    const filePaths = req.files.map(file => file.path);
    const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);

    await pdfService.imagesToPDF(filePaths, outputPath);

    res.download(outputPath, 'converted.pdf', (err) => {
      // 清理临时文件
      filePaths.forEach(filePath => {
        fs.unlink(filePath, () => {});
      });
      fs.unlink(outputPath, () => {});
    });
  } catch (error) {
    console.error('图片转PDF错误:', error);
    res.status(500).json({ error: '图片转PDF失败' });
  }
});

// 提取PDF页面
router.post('/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const pagesStr = req.body.pages || '';
    const pageNumbers = [];
    // 解析 "1,3,5-7" 格式
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
      return res.status(400).json({ error: '请输入有效的页码，如：1,3,5-7' });
    }

    // 校验页码范围
    const { PDFDocument } = require('pdf-lib');
    const pdfBytes = fs.readFileSync(req.file.path);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();
    const invalidPages = pageNumbers.filter(p => p < 1 || p > totalPages);
    if (invalidPages.length) {
      return res.status(400).json({ error: `页码超出范围（共${totalPages}页）：${invalidPages.join(',')}` });
    }

    const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);
    await pdfService.extractPages(req.file.path, pageNumbers, outputPath);

    res.download(outputPath, 'extracted.pdf', (err) => {
      fs.unlink(req.file.path, () => {});
      fs.unlink(outputPath, () => {});
    });
  } catch (error) {
    console.error('提取页面错误:', error);
    res.status(500).json({ error: '提取页面失败' });
  }
});

// PDF旋转
router.post('/rotate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const degrees = parseInt(req.body.degrees) || 90;
    const allowedDegrees = [90, 180, 270];
    if (!allowedDegrees.includes(degrees)) {
      return res.status(400).json({ error: '旋转角度必须是 90、180 或 270' });
    }
    const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);

    await pdfService.rotatePDF(req.file.path, degrees, outputPath);

    res.download(outputPath, 'rotated.pdf', (err) => {
      fs.unlink(req.file.path, () => {});
      fs.unlink(outputPath, () => {});
    });
  } catch (error) {
    console.error('旋转PDF错误:', error);
    res.status(500).json({ error: '旋转PDF失败' });
  }
});

// 获取PDF信息
router.post('/info', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const info = await pdfService.getPDFInfo(req.file.path);

    // 清理临时文件
    fs.unlink(req.file.path, () => {});

    res.json(info);
  } catch (error) {
    console.error('获取PDF信息错误:', error);
    res.status(500).json({ error: '获取PDF信息失败' });
  }
});

// Office转PDF（Word/Excel/PPT → PDF）
router.post('/office-to-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传Office文件' });
    }

    const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pdf`);
    await pdfService.officeToPDF(req.file.path, outputPath);

    res.download(outputPath, 'converted.pdf', (err) => {
      fs.unlink(req.file.path, () => {});
      fs.unlink(outputPath, () => {});
    });
  } catch (error) {
    console.error('Office转PDF错误:', error);
    res.status(500).json({ error: 'Office转PDF失败，请确保文件格式正确' });
  }
});

// PDF转Word
router.post('/pdf-to-word', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const mode = req.body.mode || 'editable'; // 'editable' 或 'layout'
    const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.docx`);
    await pdfService.pdfToOffice(req.file.path, outputPath, 'docx', mode);

    const filename = mode === 'layout' ? 'converted_layout.docx' : 'converted.docx';
    res.download(outputPath, filename, (err) => {
      fs.unlink(req.file.path, () => {});
      fs.unlink(outputPath, () => {});
    });
  } catch (error) {
    console.error('PDF转Word错误:', error);
    res.status(500).json({ error: 'PDF转Word失败' });
  }
});

// PDF转Excel
router.post('/pdf-to-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.xlsx`);
    await pdfService.pdfToOffice(req.file.path, outputPath, 'xlsx');

    res.download(outputPath, 'converted.xlsx', (err) => {
      fs.unlink(req.file.path, () => {});
      fs.unlink(outputPath, () => {});
    });
  } catch (error) {
    console.error('PDF转Excel错误:', error);
    res.status(500).json({ error: 'PDF转Excel失败' });
  }
});

// PDF转PPT
router.post('/pdf-to-ppt', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传PDF文件' });
    }

    const outputPath = path.join(__dirname, '../../temp', `${uuidv4()}.pptx`);
    await pdfService.pdfToOffice(req.file.path, outputPath, 'pptx');

    res.download(outputPath, 'converted.pptx', (err) => {
      fs.unlink(req.file.path, () => {});
      fs.unlink(outputPath, () => {});
    });
  } catch (error) {
    console.error('PDF转PPT错误:', error);
    res.status(500).json({ error: 'PDF转PPT失败' });
  }
});

module.exports = router;
