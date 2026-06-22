const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// LibreOffice 路径（自动适配 Linux/Windows）
const SOFFICE_PATH = process.env.LIBREOFFICE_PATH || (process.platform === 'win32'
  ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
  : '/usr/bin/libreoffice');
// Python 脚本目录
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');

/**
 * 用 LibreOffice 转换文件格式（Office → PDF）
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出PDF路径
 */
function libreOfficeToPDF(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const outDir = path.dirname(outputPath);

    execFile(SOFFICE_PATH, [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', outDir,
      inputPath
    ], { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`LibreOffice 转换失败: ${err.message}`));
      }
      // LibreOffice 输出文件名 = 输入文件名改扩展名为 .pdf
      const baseName = path.basename(inputPath, path.extname(inputPath));
      const generatedPath = path.join(outDir, baseName + '.pdf');

      if (!fs.existsSync(generatedPath)) {
        return reject(new Error('LibreOffice 转换后未生成文件'));
      }

      if (generatedPath !== outputPath) {
        fs.renameSync(generatedPath, outputPath);
      }
      resolve(outputPath);
    });
  });
}

/**
 * 用 Python 脚本转换 PDF → Office
 * @param {string} inputPath - 输入PDF路径
 * @param {string} outputPath - 输出文件路径
 * @param {string} format - 目标格式（'docx', 'xlsx', 'pptx'）
 */
function pdfToOfficeWithPython(inputPath, outputPath, format) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, `pdf_to_${format}.py`);

    execFile('python', [scriptPath, inputPath, outputPath], { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`PDF转${format}失败: ${stderr || err.message}`));
      }
      if (stdout.trim() !== 'OK') {
        return reject(new Error(`PDF转${format}失败: ${stdout}`));
      }
      if (!fs.existsSync(outputPath)) {
        return reject(new Error(`PDF转${format}后未生成文件`));
      }
      resolve(outputPath);
    });
  });
}

class PDFService {
  /**
   * 合并多个PDF文件
   * @param {string[]} filePaths - PDF文件路径数组
   * @param {string} outputPath - 输出文件路径
   * @param {object} options - 合并选项
   * @param {boolean} options.addPageNumbers - 是否添加页码
   * @param {boolean} options.addBookmarks - 是否添加书签
   * @param {boolean} options.compressOutput - 是否压缩输出
   */
  async mergePDFs(filePaths, outputPath, options = {}) {
    try {
      const mergedPdf = await PDFDocument.create();
      let totalPages = 0;

      // 第一遍：合并所有页面
      for (const filePath of filePaths) {
        const pdfBytes = fs.readFileSync(filePath);
        const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => {
          mergedPdf.addPage(page);
          totalPages++;
        });
      }

      // 第二遍：添加页码（如果需要）
      if (options.addPageNumbers) {
        const font = await mergedPdf.embedFont(StandardFonts.Helvetica);
        const pages = mergedPdf.getPages();
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const { width, height } = page.getSize();

          // 在页面底部中间添加页码
          const pageNumber = `${i + 1} / ${pages.length}`;
          const textWidth = font.widthOfTextAtSize(pageNumber, 12);
          page.drawText(pageNumber, {
            x: (width - textWidth) / 2,
            y: 30,
            size: 12,
            font: font,
            color: rgb(0.5, 0.5, 0.5),
          });
        }
      }

      // 保存PDF
      let pdfBytes;
      if (options.compressOutput) {
        // 压缩输出
        pdfBytes = await mergedPdf.save({
          useObjectStreams: true,
          addDefaultPage: false,
        });
      } else {
        pdfBytes = await mergedPdf.save();
      }

      fs.writeFileSync(outputPath, pdfBytes);

      return outputPath;
    } catch (error) {
      throw new Error(`PDF合并失败: ${error.message}`);
    }
  }

  /**
   * 压缩PDF文件
   * @param {string} inputPath - 输入文件路径
   * @param {string} outputPath - 输出文件路径
   * @param {string} quality - 压缩质量 ('low', 'medium', 'high')
   */
  async compressPDF(inputPath, outputPath, quality = 'medium') {
    try {
      const pdfBytes = fs.readFileSync(inputPath);
      const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

      // 根据质量级别选择压缩选项
      let saveOptions = {};

      switch (quality) {
        case 'low':
          // 最大压缩
          saveOptions = {
            useObjectStreams: true,
            addDefaultPage: false,
            objectsPerTick: 50,
          };
          break;
        case 'medium':
          // 中等压缩
          saveOptions = {
            useObjectStreams: true,
            addDefaultPage: false,
          };
          break;
        case 'high':
          // 最小压缩（保持质量）
          saveOptions = {
            useObjectStreams: false,
            addDefaultPage: false,
          };
          break;
        default:
          saveOptions = {
            useObjectStreams: true,
            addDefaultPage: false,
          };
      }

      const compressedPdfBytes = await pdf.save(saveOptions);
      fs.writeFileSync(outputPath, compressedPdfBytes);

      return outputPath;
    } catch (error) {
      throw new Error(`PDF压缩失败: ${error.message}`);
    }
  }

  /**
   * PDF转图片
   * @param {string} inputPath - 输入文件路径
   * @param {string} outputDir - 输出目录
   * @returns {string[]} - 图片路径数组
   */
  async pdfToImages(inputPath, outputDir) {
    try {
      // 这里需要使用其他库如pdf-poppler或pdf2pic
      // 为了简化，这里只是示例实现
      const pdfBytes = fs.readFileSync(inputPath);
      const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const pageCount = pdf.getPageCount();

      const imagePaths = [];

      // 注意：pdf-lib不支持直接转图片
      // 实际项目中需要使用pdf2pic或其他库
      // 这里只是返回占位信息
      for (let i = 0; i < pageCount; i++) {
        const imagePath = path.join(outputDir, `page_${i + 1}.jpg`);
        // 实际实现需要调用pdf2pic等库
        imagePaths.push(imagePath);
      }

      return imagePaths;
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

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
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
   * @param {string} inputPath - 输入文件路径
   * @returns {object} - PDF信息
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
   * @param {string} inputPath - 输入文件路径
   * @param {number[]} pages - 页码数组（从1开始）
   * @param {string} outputPath - 输出文件路径
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
   * @param {string} inputPath - 输入文件路径
   * @param {number} degrees - 旋转角度（90, 180, 270）
   * @param {string} outputPath - 输出文件路径
   */
  async rotatePDF(inputPath, degrees, outputPath) {
    try {
      const pdfBytes = fs.readFileSync(inputPath);
      const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

      const pages = pdf.getPages();
      pages.forEach(page => {
        page.setRotation({ type: 'degrees', angle: degrees });
      });

      const rotatedPdfBytes = await pdf.save();
      fs.writeFileSync(outputPath, rotatedPdfBytes);

      return outputPath;
    } catch (error) {
      throw new Error(`旋转PDF失败: ${error.message}`);
    }
  }

  /**
   * Office文件转PDF（Word/Excel/PPT → PDF）
   * @param {string} inputPath - 输入文件路径
   * @param {string} outputPath - 输出PDF路径
   */
  async officeToPDF(inputPath, outputPath) {
    try {
      await libreOfficeToPDF(inputPath, outputPath);
      return outputPath;
    } catch (error) {
      throw new Error(`Office转PDF失败: ${error.message}`);
    }
  }

  /**
   * PDF转Office文件（PDF → Word/Excel/PPT）
   * @param {string} inputPath - 输入PDF路径
   * @param {string} outputPath - 输出文件路径
   * @param {string} targetFormat - 目标格式（'docx', 'xlsx', 'pptx'）
   * @param {string} mode - 转换模式（'editable' 或 'layout'，仅 docx 有效）
   */
  async pdfToOffice(inputPath, outputPath, targetFormat, mode = 'editable') {
    try {
      // Word 支持两种模式
      if (targetFormat === 'docx' && mode === 'layout') {
        await pdfToOfficeWithPython(inputPath, outputPath, 'docx_layout');
      } else {
        await pdfToOfficeWithPython(inputPath, outputPath, targetFormat);
      }
      return outputPath;
    } catch (error) {
      throw new Error(`PDF转Office失败: ${error.message}`);
    }
  }
}

module.exports = new PDFService();
