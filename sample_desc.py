import openpyxl,re,collections,json
p=r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求\租房合同需求验证问卷.xlsx'; ws=openpyxl.load_workbook(p,read_only=True,data_only=True).active
rows=list(ws.iter_rows(values_only=True))[1:]
valid=[]
for r in rows:
 s=int(re.search(r'(\d+)',str(r[2])).group(1))
 if r[7]==1 and s>=120: valid.append(r)
print('valid',len(valid))
for name,idx in [('source',3),('status',8),('citytype',9),('channel',10),('score',6)]:
 print(name,json.dumps(dict(collections.Counter(str(r[idx]) for r in valid)),ensure_ascii=True))
