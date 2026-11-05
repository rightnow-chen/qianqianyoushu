import os,json
folder=r'C:\Users\cxy32\Desktop\签约有数\发现需求验证需求'
print(json.dumps(os.listdir(folder),ensure_ascii=True,indent=2))
