from docx import Document
from shutil import copyfile
src=r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求\租房合同需求验证问卷统计结果（原版）.docx'
out=r'G:\zu-xiao-shen-main\租房合同需求验证问卷统计结果_已填判断表.docx'
copyfile(src,out)
d=Document(out)
t=d.tables[2]
vals={1:('53/91=58.2%','支持'),2:('21/91=23.1%','支持'),3:('13/91=14.3%','支持'),4:('AI使用40/91=44.0%；满意度均值=(5×1+4×14+3×12+2×4+1×5)/40=3.25','存疑')}
for i,v in vals.items():
    t.cell(i,6).text=v[0]; t.cell(i,7).text=v[1]
t=d.tables[3]
vals={1:('64/91=70.3%（纸质或图片，按人去重）','支持'),2:('31/91=34.1%','支持'),3:('中介：16/29=55.2%；非中介：37/62=59.7%，差=-4.5个百分点','不支持'),4:('前三项为维修责任25、提前解约24、房屋损坏20；至少选中其一46/91=50.5%','支持')}
for i,v in vals.items():
    t.cell(i,6).text=v[0]; t.cell(i,7).text=v[1]
d.save(out)
print(out)
