// Optional local artist frames. No generated motion is substituted for missing states.
export function validateFrame(frame,imageWidth,imageHeight,defaultScale) {
  const rect=frame.rect,anchor=frame.anchorPx,duration=Number(frame.durationMs??120);
  if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isFinite))throw new Error('frame rect must contain four finite pixels');
  const [x,y,w,h]=rect;if(x<0||y<0||w<1||h<1||x+w>imageWidth||y+h>imageHeight)throw new Error('animation frame is outside the sheet');
  if(!Array.isArray(anchor)||anchor.length!==2||!anchor.every(Number.isFinite)||anchor[0]<0||anchor[1]<0||anchor[0]>w||anchor[1]>h)throw new Error('animation frame needs a foot anchor inside its crop');
  if(!(defaultScale>.005&&defaultScale<=2)||w*defaultScale>180||h*defaultScale>180)throw new Error('animation scale is outside the world bounds');
  if(!(duration>=40&&duration<=10000))throw new Error('animation duration is outside supported bounds');
  return {rect:[...rect],anchorPx:[...anchor],durationMs:duration};
}

export async function loadAnimalAnimationManifest(manifestUrl,{fetchImpl=globalThis.fetch,ImageClass=globalThis.Image,createCanvas=()=>document.createElement('canvas')}={}) {
  const response=await fetchImpl(manifestUrl,{cache:'no-cache'});
  if(!response.ok)return {animals:new Map(),status:'static',notes:['动画素材尚未交付，使用原静态美术。']};
  const manifest=await response.json();if(manifest.version!==1||!manifest.sheets||!manifest.animals)throw new Error('unsupported animal animation manifest');
  const base=new URL(manifestUrl,globalThis.location?.href||import.meta.url),sheets=new Map(),notes=[];
  await Promise.all(Object.entries(manifest.sheets).map(async([id,file])=>{
    try{const path=typeof file==='string'?file:file.file;if(typeof path!=='string')throw new Error(`missing animation sheet ${id}`);
      const image=new ImageClass();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error(`animation sheet failed: ${id}`));image.src=new URL(path,base).href;});sheets.set(id,image);
    }catch(error){notes.push(error.message);}
  }));
  const animals=new Map();
  for(const [species,entry] of Object.entries(manifest.animals)){
    const states=new Map(),scale=Number(entry.worldScale);
    for(const [state,clip] of Object.entries(entry.states||{})){
      try{
        if(!Array.isArray(clip.frames)||clip.frames.length<1||clip.frames.length>32)throw new Error('animation has no usable frames');
        const frames=[];
        for(const data of clip.frames){
          const image=sheets.get(data.sheet||clip.sheet||entry.sheet);if(!image)throw new Error('animation sheet was not found');
          const frame=validateFrame(data,image.naturalWidth||image.width,image.naturalHeight||image.height,scale),[x,y,w,h]=frame.rect;
          const crop=createCanvas();crop.width=w;crop.height=h;const g=crop.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=false;g.drawImage(image,x,y,w,h,0,0,w,h);
          const pixels=g.getImageData(0,0,w,h).data;let clear=0,visible=0,hash=2166136261;for(let i=3;i<pixels.length;i+=4){if(pixels[i]<20)clear++;if(pixels[i]>160)visible++;if(pixels[i]>20){for(let k=i-3;k<=i;k++)hash=Math.imul(hash^pixels[k],16777619);}}
          if(clear/(w*h)<.01||visible<12)throw new Error('animation frame lacks transparent edges or visible art');
          const dark=createCanvas();dark.width=w;dark.height=h;const dg=dark.getContext('2d');dg.drawImage(crop,0,0);dg.globalCompositeOperation='source-atop';dg.fillStyle='rgba(25,36,65,.46)';dg.fillRect(0,0,w,h);
          frames.push({...frame,crop,dark,pixelHash:hash>>>0});
        }
        const realFrameCount=new Set(frames.map(f=>f.pixelHash)).size;if(state==='walk'&&realFrameCount<2)throw new Error('walking needs distinct artist frames');
        states.set(state,{frames,loop:clip.loop!==false,durationMs:frames.reduce((sum,f)=>sum+f.durationMs,0),realFrameCount});
      }catch(error){notes.push(`${species}.${state}: ${error.message}`);}
    }
    if(states.size)animals.set(species,{states,worldScale:scale,defaultFacing:entry.defaultFacing==='left'?-1:1,strideWorld:Number(entry.strideWorld)||9});
  }
  return {animals,status:animals.size?'ready':'static',notes};
}
