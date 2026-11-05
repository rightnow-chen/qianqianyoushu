import os, openpyxl
from docx import Document
folder = r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求'
for name in os.listdir(folder):
    print(name)
    p=os.path.join(folder,name)
    if name.endswith('.xlsx'):
        wb=openpyxl.load_workbook(p,read_only=True,data_only=False)
        print('SHEETS',wb.sheetnames)
        for s in wb.sheetnames:
            ws=wb[s]
            print('SHEET',s,'DIM',ws.max_row,ws.max_column)
            for row in ws.iter_rows(min_row=1,max_row=min(ws.max_row,8),values_only=True): print(row)
    elif name.endswith('.docx'):
        d=Document(p)
        print('PARAS',len(d.paragraphs),'TABLES',len(d.tables))
        for para in d.paragraphs[:30]:
            if para.text.strip(): print(para.text)
        for ti,t in enumerate(d.tables[:5]):
            print('TABLE',ti,len(t.rows),len(t.columns))
            for row in t.rows[:5]: print([c.text for c in row.cells])
