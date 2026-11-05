import openpyxl, re, collections, json
p=r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求\租房合同需求验证问卷.xlsx'
ws=openpyxl.load_workbook(p,read_only=True,data_only=True).active
rows=list(ws.iter_rows(values_only=True)); data=rows[1:]
out={'n_rows':len(data),'q1':{},'q2':{},'q3':{},'q4':{},'scores':{},'sources':{}}
for r in data:
    for k,idx in [('q1',7),('q2',8),('q3',9),('q4',10),('scores',6),('sources',3)]: out[k][str(r[idx])]=out[k].get(str(r[idx]),0)+1
secs=[int(re.search(r'(\d+)',str(r[2])).group(1)) for r in data]
out['under120']=sum(s<120 for s in secs)
out['q1_no']=sum(r[7]!=1 for r in data)
out['dupe_ip']=sum(c-1 for c in collections.Counter(str(r[5]) for r in data).values() if c>1)
out['dupe_contact']=sum(c-1 for c in collections.Counter(str(r[46]) for r in data if r[46] not in (None,'')).values() if c>1)
print(json.dumps(out,ensure_ascii=True,indent=2))
for r,s in zip(data,secs):
    if s<120 or r[7]!=1: print(json.dumps({'id':r[0],'sec':s,'q1':r[7],'q2':r[8],'q3':r[9],'q4':r[10],'ip':r[5],'contact':r[46]},ensure_ascii=True))
