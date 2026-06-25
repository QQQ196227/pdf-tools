const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// LibreOffice 路径（自动适配 Linux/Windows）
const SOFFICE_PATH = process.env.LIBREOFFICE_PATH || (process.platform === 'win32'
  ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
  : '/usr/bin/libreoffice');

// qpdf 路径
const QPDF_PATH = process.env.QPDF_PATH || (process.platform === 'win32'
  ? 'C:\\Program Files\\qpdf\\bin\\qpdf.exe'
  : 'qpdf');

// Ghostscript 路径（用于 PDF 压缩）
const GS_PATH = process.env.GS_PATH || (process.platform === 'win32'
  ? 'C:\\Program Files\\gs\\gs10.02.1\\bin\\gswin64c.exe'
  : '/usr/bin/gs');

// Python 脚本目录
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');

/**
 * 执行命令行工具
 */
function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120000, ...options }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

class PDFService {
  /**
   * 合并多个PDF文件（使用 qpdf）
   * @param {string[]} filePaths - PDF文件路径数组
   * @param {string} outputPath - 输出文件路径
   * @param {object} options - 合并选项
   */
  async mergePDFs(filePaths, outputPath, options = {}) {
    try {
      // 验证所有文件都是 PDF
      for (const filePath of filePaths) {
        const buffer = fs.readFileSync(filePath);
        const header = buffer.toString('ascii', 0, 5);
        if (!header.startsWith('%PDF')) {
          throw new Error(`文件不是有效的PDF格式: ${path.basename(filePath)}`);
        }
      }

      // 使用 qpdf 合并
      const args = ['--empty', '--pages', ...filePaths, '--', outputPath];
      await execCommand(QPDF_PATH, args);

      // 如果需要压缩，用 qpdf 的 --linearize 选项
      if (options.compressOutput) {
        const tempPath = outputPath + '.tmp';
        fs.renameSync(outputPath, tempPath);
        await execCommand(QPDF_PATH, ['--linearize', tempPath, outputPath]);
        fs.unlinkSync(tempPath);
      }

      return outputPath;
    } catch (error) {
      throw new Error(`PDF合并失败: ${error.message}`);
    }
  }

  /**
   * 压缩PDF文件（使用 Ghostscript）
   * @param {string} inputPath - 输入文件路径
   * @param {string} outputPath - 输出文件路径
   * @param {string} quality - 压缩质量 ('low', 'medium', 'high')
   */
  async compressPDF(inputPath, outputPath, quality = 'medium') {
    try {
      // 质量设置映射
      const qualitySettings = {
        'low': '/screen',      // 72 dpi - 最小文件
        'medium': '/ebook',    // 150 dpi - 平衡
        'high': '/printer',    // 300 dpi - 高质量
      };

      const setting = qualitySettings[quality] || qualitySettings['medium'];

      // 使用 Ghostscript 压缩
      const args = [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        `-dPDFSETTINGS=${setting}`,
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile=${outputPath}`,
        inputPath
      ];

      await execCommand(GS_PATH, args);

      // 如果 Ghostscript 失败或不可用，回退到 qpdf
      if (!fs.existsSync(outputPath)) {
        await execCommand(QPDF_PATH, ['--linearize', inputPath, outputPath]);
      }

      return outputPath;
    } catch (error) {
      // 如果 Ghostscript 不可用，尝试 qpdf 压缩
      try {
        await execCommand(QPDF_PATH, ['--linearize', inputPath, outputPath]);
        return outputPath;
      } catch (qpdfError) {
        throw new Error(`PDF压缩失败: ${error.message}`);
      }
    }
  }

  /**
   * PDF转图片（使用 pdftoppm）
   * @param {string} inputPath - 输入PDF路径
   * @param {string} outputDir - 输出目录
   * @returns {string[]} - 图片路径数组
   */
  async pdfToImages(inputPath, outputDir, options = {}) {
    try {
      // 前端传 jpg/png，pdftoppm 需要 jpeg/png
      const inputFormat = options.format || 'jpeg';
      const pdftoppmFormat = inputFormat === 'jpg' ? 'jpeg' : inputFormat;
      const dpi = options.dpi || 150;
      const prefix = path.join(outputDir, 'page');

      // 构建 pdftoppm 参数
      const args = [`-${pdftoppmFormat}`, '-r', String(dpi), inputPath, prefix];

      // 使用 pdftoppm 转换（poppler-utils）
      await execCommand('pdftoppm', args);

      // 获取生成的图片文件
      const ext = format === 'png' ? '.png' : '.jpg';
      const files = fs.readdirSync(outputDir)
        .filter(f => f.startsWith('page') && f.endsWith(ext))
        .sort()
        .map(f => path.join(outputDir, f));

      return files;
    } catch (error) {
      throw new Error(`PDF转图片失败: ${error.message}`);
    }
  }

  /**
   * 图片转PDF
   * @param {string[]} filePaths - 图片文件路径数组
   * @param {string} outputPath - 输出文件路径
   */
  async imagesToPDF(filePaths, outputPath) {
    try {
      const pdfDoc = await PDFDocument.create();

      for (const filePath of filePaths) {
        const imageBytes = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();

        let image;
        if (ext === '.jpg' || ext === '.jpeg') {
          image = await pdfDoc.embedJpg(imageBytes);
        } else if (ext === '.png') {
          image = await pdfDoc.embedPng(imageBytes);
        } else {
          throw new Error(`不支持的图片格式: ${ext}`);
        }

        // 按比例缩放到 A4 尺寸（595 x 842 点）
        const maxWidth = 595;
        const maxHeight = 842;
        let width = image.width;
        let height = image.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        const page = pdfDoc.addPage([width, height]);
        page.drawImage(image, { x: 0, y: 0, width, height });
      }

      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(outputPath, pdfBytes);

      return outputPath;
    } catch (error) {
      throw new Error(`图片转PDF失败: ${error.message}`);
    }
  }

  /**
   * 获取PDF信息
   */
  async getPDFInfo(inputPath) {
    try {
      const pdfBytes = fs.readFileSync(inputPath);
      const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

      return {
        pageCount: pdf.getPageCount(),
        title: pdf.getTitle() || '',
        author: pdf.getAuthor() || '',
        subject: pdf.getSubject() || '',
        creator: pdf.getCreator() || '',
        producer: pdf.getProducer() || '',
        creationDate: pdf.getCreationDate() || null,
        modificationDate: pdf.getModificationDate() || null,
      };
    } catch (error) {
      throw new Error(`获取PDF信息失败: ${error.message}`);
    }
  }

  /**
   * 提取PDF页面
   */
  async extractPages(inputPath, pages, outputPath) {
    try {
      const pdfBytes = fs.readFileSync(inputPath);
      const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const newPdf = await PDFDocument.create();

      const copiedPages = await newPdf.copyPages(pdf, pages.map(p => p - 1));
      copiedPages.forEach(page => newPdf.addPage(page));

      const newPdfBytes = await newPdf.save();
      fs.writeFileSync(outputPath, newPdfBytes);

      return outputPath;
    } catch (error) {
      throw new Error(`提取页面失败: ${error.message}`);
    }
  }

  /**
   * 旋转PDF页面
   */
  async rotatePDF(inputPath, degrees, outputPath) {
    try {
      // 使用 qpdf 旋转（更健壮）
      const rotation = `+${degrees}`;
      const args = [inputPath, `--rotate=${rotation}:1-z`, outputPath];
      await execCommand(QPDF_PATH, args);
      return outputPath;
    } catch (error) {
      throw new Error(`旋转PDF失败: ${error.message}`);
    }
  }

  /**
   * Office文件转PDF（Word/Excel/PPT → PDF）
   */
  async officeToPDF(inputPath, outputPath) {
    try {
      const outDir = path.dirname(outputPath);
      await execCommand(SOFFICE_PATH, [
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', outDir,
        inputPath
      ]);

      const baseName = path.basename(inputPath, path.extname(inputPath));
      const generatedPath = path.join(outDir, baseName + '.pdf');

      if (!fs.existsSync(generatedPath)) {
        throw new Error('LibreOffice 转换后未生成文件');
      }

      if (generatedPath !== outputPath) {
        fs.renameSync(generatedPath, outputPath);
      }

      return outputPath;
    } catch (error) {
      throw new Error(`Office转PDF失败: ${error.message}`);
    }
  }

  /**
   * PDF转Office文件（PDF → Word/Excel/PPT）
   */
  async pdfToOffice(inputPath, outputPath, targetFormat, mode = 'editable') {
    try {
      // 根据模式选择脚本
      let scriptName = `pdf_to_${targetFormat}.py`;
      if (targetFormat === 'docx' && mode === 'layout') {
        scriptName = 'pdf_to_docx_layout.py';
      }
      const scriptPath = path.join(SCRIPTS_DIR, scriptName);

      // 检查 Python 脚本是否存在
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`转换脚本不存在: ${scriptPath}`);
      }

      await execCommand('python3', [scriptPath, inputPath, outputPath]);

      if (!fs.existsSync(outputPath)) {
        throw new Error(`PDF转${targetFormat}后未生成文件`);
      }

      return outputPath;
    } catch (error) {
      throw new Error(`PDF转Office失败: ${error.message}`);
    }
  }
}

module.exports = new PDFService();
