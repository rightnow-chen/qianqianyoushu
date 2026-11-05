from docx import Document
p=r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求\租房合同需求验证问卷统计结果（原版）.docx'
d=Document(p)
for para in d.paragraphs:
    if any(x in para.text for x in ['Q6','Q8','Q9','Q10','Q11','Q12']): print(para.text)
for ti,t in enumerate(d.tables):
    for row in t.rows:
        txt=' | '.join(c.text for c in row.cells)
        if any(x in txt for x in ['Q6','Q8','Q9','Q10','Q11','Q12']): print('T',ti,txt)
