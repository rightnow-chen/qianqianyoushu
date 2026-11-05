from docx import Document
p=r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求\租房合同需求验证问卷统计结果（原版）.docx'; d=Document(p)
for i,t in enumerate(d.tables):
 print('T',i, len(t.rows), len(t.columns), [c.text for c in t.rows[0].cells])
