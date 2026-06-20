import sys
import fitz  # PyMuPDF
from docx import Document
from docx.shared import Inches, Pt
import io

def pdf_to_docx_layout(input_path, output_path):
    pdf_doc = fitz.open(input_path)
    doc = Document()

    # 设置页面边距
    for section in doc.sections:
        section.top_margin = Inches(0.5)
        section.bottom_margin = Inches(0.5)
        section.left_margin = Inches(0.5)
        section.right_margin = Inches(0.5)

    for page_num in range(len(pdf_doc)):
        page = pdf_doc[page_num]

        if page_num > 0:
            doc.add_page_break()

        # 设置页面尺寸
        rect = page.rect
        section = doc.sections[-1]
        section.page_width = Inches(rect.width / 72)
        section.page_height = Inches(rect.height / 72)

        # 渲染高清图片
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")

        # 计算显示尺寸
        available_width = section.page_width - section.left_margin - section.right_margin
        img_ratio = pix.height / pix.width
        display_width = available_width
        display_height = int(available_width * img_ratio)

        available_height = section.page_height - section.top_margin - section.bottom_margin
        if display_height > available_height:
            display_height = available_height
            display_width = int(available_height / img_ratio)

        # 嵌入图片
        img_stream = io.BytesIO(img_bytes)
        doc.add_picture(img_stream, width=display_width, height=display_height)

    pdf_doc.close()
    doc.save(output_path)
    return True

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: pdf_to_docx_layout.py input.pdf output.docx")
        sys.exit(1)
    try:
        pdf_to_docx_layout(sys.argv[1], sys.argv[2])
        print("OK")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
