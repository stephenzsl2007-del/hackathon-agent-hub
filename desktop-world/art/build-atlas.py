"""Read-only PNG inspection and JSON atlas assembly. Never rewrites image pixels."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets/pixel-world'
BASE = json.loads((ROOT / 'art/base-regions.json').read_text())

GROUPS = {
    'trees': {
        'file': 'growth-trees-v2.png', 'rows': [0,270,492,722,930,1124,1374],
        'items': [
            ('oak','橡树',['橡实','双叶萌芽','木质幼苗','分枝小树','圆冠成树']),
            ('birch','白桦',['种子','双叶萌芽','细干幼苗','白皮幼树','白桦成树']),
            ('pine','松树',['松籽萌动','针叶幼芽','分层幼苗','锥形幼树','层叠松冠']),
            ('cherry','樱花树',['种子','双叶萌芽','绿叶幼苗','粉色花苞','盛开樱花']),
            ('apple','苹果树',['种子','双叶萌芽','绿叶幼树','白花初开','红苹果成熟']),
            ('willow','垂柳',['根芽','窄叶嫩苗','分枝幼树','枝条下垂','垂柳成树']),
        ]},
    'shrubs': {
        'file': 'growth-shrubs-v2.png', 'rows': [0,274,520,746,961,1194,1374],
        'items': [
            ('blueberry','蓝莓',['种子萌动','双叶幼苗','分枝小灌木','开花青果','蓝莓成熟']),
            ('raspberry','覆盆子',['根芽','嫩茎长叶','多枝幼株','开花青果','红果成熟']),
            ('hydrangea','绣球',['根芽','宽叶幼苗','多层叶丛','紧密花球','蓝紫花球盛开']),
            ('fern','蕨类',['贴地卷芽','卷曲嫩叶','叶片初展','羽叶展开','完整蕨叶丛']),
            ('cattail','香蒲',['根茎萌芽','细叶幼苗','长叶成束','幼嫩绿穗','棕色花穗']),
            ('waterlily','睡莲',['水生嫩芽','单片小浮叶','多片浮叶','粉色花苞','睡莲盛开']),
        ]},
    'flowers': {
        'file': 'growth-flowers.png', 'rows': [0,328,517,748,959,1173,1374],
        'items': [
            ('sunflower','向日葵',['葵花籽','双叶幼苗','宽叶高茎','闭合花苞','金色花盘开放']),
            ('daisy','雏菊',['种子','双叶幼苗','低矮叶丛','绿色花苞','白瓣黄心花']),
            ('lavender','薰衣草',['种子','幼芽','银绿叶丛','紫色花穗初现','紫色花穗盛开']),
            ('cosmos','波斯菊',['种子','双叶幼苗','细茎叶丛','闭合粉色花苞','粉花盛开']),
            ('buttercup','毛茛',['种子','圆叶幼苗','分裂叶丛','闭合黄色花苞','黄色五瓣花']),
            ('forget-me-not','勿忘草',['种子','双叶幼苗','椭圆叶丛','蓝色花苞','蓝色小花簇']),
        ]},
    'garden': {
        'file': 'growth-garden.png', 'rows': [0,272,494,697,911,1119,1374],
        'items': [
            ('fly-agaric','红伞菇',['白色菌点','菌蕾','小红菌盖','菌盖渐展','红伞菌盖展开']),
            ('chanterelle','鸡油菌',['金黄菌点','小菌蕾','短柄小菌盖','菌盖变宽','漏斗菌盖成簇']),
            ('moss-clover','苔藓三叶草',['少量苔点','小苔斑与单株','苔片扩展','浓密绿毯','绿毯与白色草花']),
            ('pumpkin','南瓜',['瓜籽萌动','双叶幼苗','宽叶藤蔓','黄花与小青瓜','橙色南瓜成熟']),
            ('strawberry','草莓',['根芽','三出叶幼苗','多层叶丛','白花与青果','红色草莓成熟']),
            ('carrot','胡萝卜',['种子','细叶幼苗','羽状叶初长','叶冠与小根肩','成熟叶冠与根肩']),
        ]},
}

def read_alpha(file):
    return np.asarray(Image.open(ASSETS/file).convert('RGBA'))[:,:,3]

def blank_cut(counts, target, radius=38):
    lo=max(1, int(target)-radius); hi=min(len(counts)-1, int(target)+radius+1)
    candidates=np.arange(lo,hi)
    minimum=counts[candidates].min()
    if minimum:
        raise ValueError(f'No clear gutter around {target}; minimum {minimum}')
    choices=candidates[counts[candidates]==0]
    return int(choices[np.argmin(abs(choices-target))])

def build_growth(group, spec):
    a=read_alpha(spec['file']); h,w=a.shape
    # Bounds here are observations of these saved sheets, not assumed uniform grids.
    row_estimates=spec['rows']
    if row_estimates is None:
        raise ValueError('Inspect the revised shrub sheet before setting its row bounds.')
    rows=[]
    for row,(plant_id,name,labels) in enumerate(spec['items']):
        y0,y1=row_estimates[row:row+2]
        counts=(a[y0:y1]>24).sum(axis=0)
        x_estimates=spec.get('columns',[220,430,650,870])
        xs=[0]+[blank_cut(counts,x,60) for x in x_estimates]+[w]
        stages=[]
        for stage,(x0,x1) in enumerate(zip(xs,xs[1:])):
            horizontal=(a[:,x0:x1]>24).sum(axis=1)
            sy0=0 if row==0 else blank_cut(horizontal,y0,35)
            sy1=h if row==5 else blank_cut(horizontal,y1,35)
            visible=np.argwhere(a[sy0:sy1,x0:x1]>24)
            if not len(visible):raise ValueError(f'Empty sprite {plant_id} {stage}')
            by0,bx0=visible.min(axis=0); by1,bx1=visible.max(axis=0)+1
            # Tight source rectangle plus up to 2 transparent pixels, wholly inside the cell.
            rx=max(x0,x0+int(bx0)-2); ry=max(sy0,sy0+int(by0)-2)
            ex=min(x1,x0+int(bx1)+2); ey=min(sy1,sy0+int(by1)+2)
            body=np.argwhere(a[ry:ey,rx:ex]>128)
            foot_y=int(body[:,0].max())+1
            foot=body[body[:,0]>=max(0,foot_y-12)]
            anchor=[int(round(float(np.median(foot[:,1])))),foot_y]
            stages.append({'id':f'plant-{plant_id}-stage-{stage}','image':group,'rect':[rx,ry,ex-rx,ey-ry],'anchor':anchor,'kind':'plant','stage':stage,'label':labels[stage],'plant':plant_id})
        rows.append((plant_id,{'name':name,'category':group,'stages':[s['id'] for s in stages],'stageLabels':labels},stages))
    return rows

def main():
    manifest={'version':1,'title':'息屿像素美术素材','created':'2026-10-18','images':{},'sprites':{},'plants':{},'animals':[],'islands':[],
              'notes':['原始PNG保持未修改；使用实测rect，不能按均匀格子重切。','所有anchor均为相对rect左上角的像素坐标，含根部/脚底。','植物每种5个静态生长状态，对应stage 0..4；不是连续动作动画。','同一种植物的各阶段必须共享scale，不能逐帧自动fit。','锚点以底部可见主体估计，落点需在具体地图中美术调校。','水面和石头不属于苔藓/睡莲的生长过程。']}
    files={'scene':'island-scene.png','islands':'islands-atlas.png','animals':'animals-atlas.png','maturePlants':'plants-mature-atlas.png',**{g:s['file'] for g,s in GROUPS.items()}}
    for key,file in files.items():
        im=Image.open(ASSETS/file)
        manifest['images'][key]={'file':file,'width':im.width,'height':im.height,'alpha':'A' in im.getbands()}
    file_keys={v:k for k,v in files.items()}
    for group,kind in [('animals','animal'),('islands','island'),('maturePlants','mature-reference')]:
        for item in BASE[group]:
            sid=item['id'] if kind!='mature-reference' else 'mature-'+item['id']
            manifest['sprites'][sid]={**{k:v for k,v in item.items() if k not in ['id','image']},'image':file_keys[item['image']],'kind':kind}
            if group in ['animals','islands']:manifest[group].append(sid)
    for group,spec in GROUPS.items():
        for pid,plant,stages in build_growth(group,spec):
            manifest['plants'][pid]=plant
            for sprite in stages:
                sid=sprite.pop('id');manifest['sprites'][sid]=sprite
    long_island_path=ASSETS/'island-pond-long-v1.json'
    if long_island_path.exists():
        long_island=json.loads(long_island_path.read_text())
        iw,ih=long_island['imageSize']
        manifest['images']['islandLong']={'file':long_island['file'],'width':iw,'height':ih,'alpha':True}
        manifest['sprites'][long_island['artistSpriteId']]={'name':long_island['name'],'image':'islandLong','rect':long_island['sourceRect'],'anchor':long_island['anchorPixels'],'kind':'island'}
        manifest['notes'].append('樱花池塘岛已替换为横向长条版本；原图保留，见island-pond-long-v1.json。')
    for sid,s in manifest['sprites'].items():
        img=manifest['images'][s['image']];x,y,w,h=s['rect'];ax,ay=s['anchor']
        assert 0<=x<x+w<=img['width'] and 0<=y<y+h<=img['height'],sid
        assert 0<=ax<=w and 0<=ay<=h,sid
    assert len(manifest['plants'])==24
    assert all(len(p['stages'])==5 for p in manifest['plants'].values())
    (ASSETS/'atlas.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'plants':len(manifest['plants']),'growthFrames':sum(len(p['stages']) for p in manifest['plants'].values()),'animals':len(manifest['animals']),'islands':len(manifest['islands']),'totalSprites':len(manifest['sprites'])},ensure_ascii=False))

if __name__=='__main__':main()
