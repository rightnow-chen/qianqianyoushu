import openpyxl,re,collections
p=r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求\租房合同需求验证问卷.xlsx'
ws=openpyxl.load_workbook(p,read_only=True,data_only=True).active
rows=list(ws.iter_rows(values_only=True)); headers=rows[0]; data=rows[1:]
valid=[]
for r in data:
    if r[7]==1 and int(re.search(r'(\d+)',str(r[2])).group(1))>=120: valid.append(r)
print('N',len(valid))
for i in range(7,len(headers)): print(i,headers[i])
def c(i): return sum(1 for r in valid if r[i] in (1,True,'1'))
def m(a,b):
    out={}
    for i in range(a,b+1): out[str(headers[i])]=c(i)
    return out
print('Q5',m(11,16)); print('Q6_seen',c(17)); print('Q8',m(24,29))
print('Q9_loss>=2000',sum(1 for r in valid if r[30] in (3,4)))
print('Q10_modify',sum(1 for r in valid if r[31] in (1,2)))
print('Q11',m(33,37)); print('Q12',collections.Counter(str(r[38]) for r in valid))
a=[r[38] for r in valid if r[36]==1 and isinstance(r[38],(int,float))]
print('AI_Q12',len(a),sum(a)/len(a) if a else None)
print('Q6freq',collections.Counter(str(r[17]) for r in valid))
print('A1_any_issue',sum(1 for r in valid if any(r[i]==1 for i in range(24,29))))
print('A3_no_read_but_issue',sum(1 for r in valid if r[17]==1 and any(r[i]==1 for i in range(24,29))))
print('B1_paper_or_image',sum(1 for r in valid if r[11]==1 or r[14]==1))
print('B3_broker_issue',sum(1 for r in valid if r[10]==1 and any(r[i]==1 for i in range(24,29))))
print('B4_top3_issue_union',sum(1 for r in valid if any(r[i]==1 for i in [25,26,27])))
