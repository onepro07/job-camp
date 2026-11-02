import json, urllib.request, concurrent.futures as cf
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36"
C=[("cscec4b","中建四局","建筑工程"),("cscec5b","中建五局","建筑工程"),("cscec6b","中建六局","建筑工程"),
   ("cscec7b","中建七局","建筑工程"),("cscecsteel","中建钢构","建筑工程"),("ccecc","中交集团","建筑工程"),
   ("ccccl","中国交建","建筑工程"),("sinohydro","中国水电","建筑工程"),("powerchina","中国电建","建筑工程"),
   ("cr20g","中铁二十局","建筑工程"),("crecg","中国中铁股份","建筑工程"),("ztjt","中铁集团","建筑工程"),
   ("bjjg","北京建工","建筑工程"),("shjg","上海建工","建筑工程"),("gdjz","广东建工","建筑工程"),
   ("zjgg","浙江建工","建筑工程"),("cgn","中广核","能源电力"),("ctgpc","三峡集团","能源电力"),
   ("sinomach","国机集团","工业制造"),("crrc","中国中车","工业制造"),("csr","中车","工业制造"),
   ("wanda","万达","商业地产"),("sinoocean","远洋集团","房地产"),("rf","富力","房地产"),
   ("agile","雅居乐","房地产"),("seazen","新城控股","房地产"),("cifi","旭辉","房地产"),
   ("kweichow","贵州茅台","食品饮料"),("moutai","茅台","食品饮料"),("yanghe","洋河","食品饮料"),
   ("wuliangye","五粮液","食品饮料"),("luzhou","泸州老窖","食品饮料")]
API="https://{t}.zhiye.com/api/Jobad/GetJobAdPageList"
def probe(x):
    t,n,i=x
    try:
        req=urllib.request.Request(API.format(t=t),data=json.dumps({"PageIndex":1,"PageSize":1}).encode(),
            headers={"Content-Type":"application/json","User-Agent":UA,"Referer":f"https://{t}.zhiye.com/social"},method="POST")
        d=json.loads(urllib.request.urlopen(req,timeout=9).read().decode('utf-8','ignore').lstrip('\ufeff'))
        if d.get("Code")==200 and int(d.get("Count") or 0)>0: return (t,n,i,int(d.get("Count")))
    except Exception: pass
    return None
with cf.ThreadPoolExecutor(max_workers=12) as ex:
    rs=[r for r in ex.map(probe,C) if r]
seen=set(); out=[]
for t,n,i,c in sorted(rs,key=lambda x:-x[3]):
    if n in seen: continue
    seen.add(n); out.append((t,n,i,c))
print(f"{len(out)} 个命中")
for t,n,i,c in out: print(f"OK  {n:<12}{i:<8}{c:>6}  {t}.zhiye.com")
json.dump(out, open('data/probe5.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
