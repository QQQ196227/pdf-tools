import sys
from pdf2docx import Converter

def pdf_to_docx(input_path, output_path):
    cv = Converter(input_path)
    cv.convert(
        output_path,
        # 优化排版参数
        start=0,
        end=None,
        multi_processing=False,
    )
    cv.close()
    return True

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: pdf_to_docx.py input.pdf output.docx")
        sys.exit(1)
    try:
        pdf_to_docx(sys.argv[1], sys.argv[2])
        print("OK")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
