const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const SOFFICE_PATH = process.env.LIBREOFFICE_PATH || (process.platform === 'win32'
  ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
  : '/usr/bin/libreoffice');
const QPDF_PATH = process.env.QPDF_PATH || (process.platform === 'win32'
  ? 'C:\\Program Files\\qpdf\\bin\\qpdf.exe'
  : 'qpdf');
const GS_PATH = process.env.GS_PATH || (process.platform === 'win32'
  ? 'C:\\Program Files\\gs\\gs10.02.1\\bin\\gswin64c.exe'
  : '/usr/bin/gs');
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');

function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120000, ...options }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

class PDFService {
  async mergePDFs(filePaths, outputPath, options = {}) {
    try {
      for (const filePath of filePaths) {
        const buffer = fs.readFileSync(filePath);
        const header = buffer.toString('ascii', 0, 5);
        if (!header.startsWith('%PDF')) {
          throw new Error(`文件不是有效的PDF格式: ${path.basename(filePath)}`);
        }
      }
      const args = ['--empty', '--pages', ...filePaths, '--', outputPath];
      await execCommand(QPDF_PATH, args);
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

  async compressPDF(inputPath, outputPath, quality = 'medium') {
    try {
      const qualitySettings = { 'low': '/screen', 'medium': '/ebook', 'high': '/printer' };
      const setting = qualitySettings[quality] || qualitySettings['medium'];
      const args = ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4', `-dPDFSETTINGS=${setting}`, '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${outputPath}`, inputPath];
      try {
        await execCommand(GS_PATH, args);
      } catch (gsError) {
        await execCommand(QPDF_PATH, ['--linearize', inputPath, outputPath]);
      }
      return outputPath;
    } catch (error) {
      throw new Error(`PDF压缩失败: ${error.message}`);
    }
  }

  async pdfToImages(inputPath, outputDir) {
    try {
      const prefix = path.join(outputDir, 'page');
      await execCommand('pdftoppm', ['-jpeg', '-r', '150', inputPath, prefix]);
      const files = fs.readdirSync(outputDir).filter(f => f.startsWith('page') && f.endsWith('.jpg')).sort().map(f => path.join(outputDir, f));
      return files;
    } catch (error) {
      throw new Error(`PDF转图片失败: ${error.message}`);
    }
  }

  async imagesToPDF(filePaths, outputPath) {
    try {
      const pdfDoc = await PDFDocument.create();
      for (const filePath of filePaths) {
        const imageBytes = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        let image;
        if (ext === '.jpg' || ext === '.jpeg') image = await pdfDoc.embedJpg(imageBytes);
        else if (ext === '.png') image = await pdfDoc.embedPng(imageBytes);
        else throw new Error(`不支持的图片格式: ${ext}`);
        const maxWidth = 595, maxHeight = 842;
        let width = image.width, height = image.height;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio; height *= ratio;
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

  async getPDFInfo(inputPath) {
    try {
      const pdfBytes = fs.readFileSync(inputPath);
      const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      return { pageCount: pdf.getPageCount(), title: pdf.getTitle() || '', author: pdf.getAuthor() || '' };
    } catch (error) {
      throw new Error(`获取PDF信息失败: ${error.message}`);
    }
  }

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

  async rotatePDF(inputPath, degrees, outputPath) {
    try {
      // 使用 qpdf 旋转
      const rotation = `+${degrees}`;
      const args = [inputPath, `--rotate=${rotation}:1-z`, outputPath];
      await execCommand(QPDF_PATH, args);
      return outputPath;
    } catch (error) {
      throw new Error(`旋转PDF失败: ${error.message}`);
    }
  }

  async officeToPDF(inputPath, outputPath) {
    try {
      const outDir = path.dirname(outputPath);
      await execCommand(SOFFICE_PATH, ['--headless', '--convert-to', 'pdf', '--outdir', outDir, inputPath]);
      const baseName = path.basename(inputPath, path.extname(inputPath));
      const generatedPath = path.join(outDir, baseName + '.pdf');
      if (!fs.existsSync(generatedPath)) throw new Error('LibreOffice 转换后未生成文件');
      if (generatedPath !== outputPath) fs.renameSync(generatedPath, outputPath);
      return outputPath;
    } catch (error) {
      throw new Error(`Office转PDF失败: ${error.message}`);
    }
  }

  async pdfToOffice(inputPath, outputPath, targetFormat, mode = 'editable') {
    try {
      const scriptPath = path.join(SCRIPTS_DIR, `pdf_to_${targetFormat}.py`);
      if (!fs.existsSync(scriptPath)) throw new Error(`转换脚本不存在: ${scriptPath}`);
      await execCommand('python3', [scriptPath, inputPath, outputPath]);
      if (!fs.existsSync(outputPath)) throw new Error(`PDF转${targetFormat}后未生成文件`);
      return outputPath;
    } catch (error) {
      throw new Error(`PDF转Office失败: ${error.message}`);
    }
  }
}

module.exports = new PDFService();
