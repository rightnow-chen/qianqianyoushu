from docx import Document
import re
p=r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求\租房合同用户访谈记录.docx'
d=Document(p)
for para in d.paragraphs:
    t=para.text.strip()
    if t: print(t)
