from docx import Document
import re
p=r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求\租房合同用户访谈记录.docx'; d=Document(p)
current=''
for para in d.paragraphs:
 t=para.text.strip()
 if t.startswith('访谈 — 用户'): current=re.search(r'用户([A-Z]+)',t).group(1); print('\n###',current)
 if '补充观察：' in t or t.startswith('现阶段') or t.startswith('租房过程中') or t.startswith('如果有个AI') or t.startswith('我有一个想法'):
  print(t)
