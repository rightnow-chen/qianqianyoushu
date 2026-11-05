from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

src=r'G:\zu-xiao-shen-main\需求分析与需求验证方法论.docx'
out=r'G:\zu-xiao-shen-main\需求分析与需求验证方法论_优化排版.docx'
d=Document(src)
s=d.sections[0]; s.top_margin=Inches(.8); s.bottom_margin=Inches(.72); s.left_margin=Inches(.9); s.right_margin=Inches(.9)
styles=d.styles
for name,size in [('Normal',10.5),('Title',26),('Heading 1',17),('Heading 2',12.5),('Heading 3',11)]:
    st=styles[name]; st.font.name='Microsoft YaHei'; st._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei'); st.font.size=Pt(size)
styles['Normal'].paragraph_format.line_spacing=1.25; styles['Normal'].paragraph_format.space_after=Pt(6)
styles['Title'].font.bold=True; styles['Title'].font.color.rgb=RGBColor.from_string('1F4E79')
styles['Heading 1'].font.bold=True; styles['Heading 1'].font.color.rgb=RGBColor.from_string('1F4E79')
styles['Heading 1'].paragraph_format.space_before=Pt(18); styles['Heading 1'].paragraph_format.space_after=Pt(7); styles['Heading 1'].paragraph_format.keep_with_next=True
styles['Heading 2'].font.bold=True; styles['Heading 2'].font.color.rgb=RGBColor.from_string('404040')
styles['Heading 2'].paragraph_format.space_before=Pt(10); styles['Heading 2'].paragraph_format.space_after=Pt(4); styles['Heading 2'].paragraph_format.keep_with_next=True

def cellshade(c, fill):
    tcPr=c._tc.get_or_add_tcPr(); shd=tcPr.find(qn('w:shd'))
    if shd is None: shd=OxmlElement('w:shd'); tcPr.append(shd)
    shd.set(qn('w:fill'),fill)
def setpad(c):
    tc=c._tc; tcPr=tc.get_or_add_tcPr(); mar=tcPr.first_child_found_in('w:tcMar')
    if mar is None: mar=OxmlElement('w:tcMar'); tcPr.append(mar)
    for side in ('top','start','bottom','end'):
        e=mar.find(qn('w:'+side))
        if e is None: e=OxmlElement('w:'+side); mar.append(e)
        e.set(qn('w:w'),'100'); e.set(qn('w:type'),'dxa')
def borders(t):
    p=t._tbl.tblPr; b=p.first_child_found_in('w:tblBorders')
    if b is None: b=OxmlElement('w:tblBorders'); p.append(b)
    for edge in ('top','left','bottom','right','insideH','insideV'):
        e=b.find(qn('w:'+edge))
        if e is None: e=OxmlElement('w:'+edge); b.append(e)
        e.set(qn('w:val'),'single'); e.set(qn('w:sz'),'4'); e.set(qn('w:color'),'D9E2F3')

paras=d.paragraphs
if paras:
    paras[0].alignment=WD_ALIGN_PARAGRAPH.CENTER
    if len(paras)>1: paras[1].alignment=WD_ALIGN_PARAGRAPH.CENTER
    # cover page: title and intro breathe separately
    paras[0].paragraph_format.space_before=Pt(35); paras[0].paragraph_format.space_after=Pt(10)
    paras[1].paragraph_format.space_after=Pt(24)
    paras[2].paragraph_format.space_after=Pt(18)
    # page breaks before major working sections
    for p in paras:
        if p.text.startswith(('五 大厂常用','八 一套可执行','九 可直接填写')):
            p.paragraph_format.page_break_before=True
        if p.style.name.startswith('Heading'):
            p.paragraph_format.keep_with_next=True

for t in d.tables:
    t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=True; borders(t)
    for ri,row in enumerate(t.rows):
        for cell in row.cells:
            setpad(cell); cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for p in cell.paragraphs:
                p.paragraph_format.space_after=Pt(2); p.paragraph_format.line_spacing=1.12
                for r in p.runs:
                    r.font.name='Microsoft YaHei'; r._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei'); r.font.size=Pt(9.2)
            cellshade(cell, '1F4E79' if ri==0 else ('F5F8FC' if ri%2==1 else 'FFFFFF'))
            if ri==0:
                for p in cell.paragraphs:
                    for r in p.runs: r.font.color.rgb=RGBColor(255,255,255); r.bold=True

# Add a compact footer with page-independent document label.
f=s.footer.paragraphs[0]; f.alignment=WD_ALIGN_PARAGRAPH.CENTER; f.text='需求分析与需求验证方法论  |  工作手册'
for r in f.runs: r.font.name='Microsoft YaHei'; r.font.size=Pt(8); r.font.color.rgb=RGBColor.from_string('888888')
d.save(out); print(out)
