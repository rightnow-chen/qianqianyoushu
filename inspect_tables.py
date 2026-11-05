from docx import Document
p=r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求\租房合同需求验证问卷统计结果（原版）.docx'
d=Document(p)
for ti in [2,3]:
    t=d.tables[ti]; print('T',ti)
    for i,row in enumerate(t.rows): print(i,[c.text for c in row.cells])
