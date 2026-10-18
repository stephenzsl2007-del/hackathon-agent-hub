// Small, deterministic navigation and animation helpers. World owns all pet/save state.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function segmentClear(start,end,isAllowed,step=2) {
  const count=Math.max(1,Math.ceil(dist(start,end)/step));
  for(let i=1;i<=count;i++){const t=i/count;if(!isAllowed(start.x+(end.x-start.x)*t,start.y+(end.y-start.y)*t))return false;}
  return true;
}

export function findAnimalRoute(start,end,isAllowed,{cell=5,maxNodes=2200,bounds={x:0,y:0,width:640,height:280}}={}) {
  if(!isAllowed(end.x,end.y))return [];
  if(segmentClear(start,end,isAllowed))return [{x:end.x,y:end.y}];
  const key=(x,y)=>`${x},${y}`,cache=new Map();
  const allowed=(x,y)=>{const k=key(x,y);if(cache.has(k))return cache.get(k);const px=x*cell,py=y*cell,v=px>=bounds.x&&px<=bounds.x+bounds.width&&py>=bounds.y&&py<=bounds.y+bounds.height&&isAllowed(px,py);cache.set(k,v);return v;};
  const nearest=(point,from)=>{const gx=Math.round(point.x/cell),gy=Math.round(point.y/cell);let best=null;for(let r=0;r<4&&!best;r++)for(let y=gy-r;y<=gy+r;y++)for(let x=gx-r;x<=gx+r;x++){if(!allowed(x,y))continue;const p={x:x*cell,y:y*cell};if(!segmentClear(from?point:p,from?p:point,isAllowed))continue;const d=dist(point,p);if(!best||d<best.d)best={x,y,d};}return best;};
  const first=nearest(start,true),last=nearest(end,false);if(!first||!last)return [];
  const nodes=new Map(),open=[],closed=new Set();
  const initial={...first,g:0,h:Math.hypot(first.x-last.x,first.y-last.y),parent:null};nodes.set(key(first.x,first.y),initial);open.push(initial);
  let found=null,visited=0;
  while(open.length&&visited++<maxNodes){
    let bestIndex=0;for(let i=1;i<open.length;i++)if(open[i].g+open[i].h<open[bestIndex].g+open[bestIndex].h)bestIndex=i;
    const current=open.splice(bestIndex,1)[0],k=key(current.x,current.y);if(closed.has(k))continue;closed.add(k);
    if(current.x===last.x&&current.y===last.y){found=current;break;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const x=current.x+dx,y=current.y+dy,nk=key(x,y);if(closed.has(nk)||!allowed(x,y))continue;
      if(dx&&dy&&(!allowed(current.x+dx,current.y)||!allowed(current.x,current.y+dy)))continue;
      if(!segmentClear({x:current.x*cell,y:current.y*cell},{x:x*cell,y:y*cell},isAllowed))continue;
      const score=current.g+(dx&&dy?Math.SQRT2:1),existing=nodes.get(nk);if(existing&&existing.g<=score)continue;
      const next=existing||{x,y,h:Math.hypot(x-last.x,y-last.y)};Object.assign(next,{g:score,parent:current});nodes.set(nk,next);if(!existing)open.push(next);
    }
  }
  if(!found)return [];
  const path=[{x:end.x,y:end.y}];for(let n=found;n;n=n.parent)path.unshift({x:n.x*cell,y:n.y*cell});
  const smoothed=[];let anchor=start,index=0;
  while(index<path.length){let far=index;while(far+1<path.length&&segmentClear(anchor,path[far+1],isAllowed))far++;smoothed.push(path[far]);anchor=path[far];index=far+1;}
  return smoothed;
}

export function resetAnimalMotion(animal) {
  animal.motion={route:[],vx:0,vy:0,travel:0,gaitStartTravel:0,gaitActive:false,turnTime:0,turnTo:animal.dir||1,blocked:0};
  return animal.motion;
}

export function advanceAnimalMotion(animal,dt,isAllowed,{speed=12,stride=10}={}) {
  const m=animal.motion||resetAnimalMotion(animal);dt=clamp(dt,0,.2);
  if(!m.route.length){m.vx=m.vy=0;return {moving:false,arrived:true,distance:0};}
  while(m.route.length>1&&dist(animal,m.route[0])<2)m.route.shift();
  const target=m.route[0],dx=target.x-animal.x,dy=target.y-animal.y,d=Math.hypot(dx,dy);
  if(d<.5){m.route.shift();m.vx=m.vy=0;return {moving:false,arrived:!m.route.length,distance:0};}
  const facing=Math.abs(dx)>1.5?(dx<0?-1:1):(animal.dir||1);
  if(m.turnTime>0){m.turnTime=Math.max(0,m.turnTime-dt);m.vx=m.vy=0;if(m.turnTime===0){animal.dir=m.turnTo;m.gaitStartTravel=m.travel;}return {moving:false,turning:true,arrived:false,distance:0};}
  if(facing!==(animal.dir||1)){m.turnTo=facing;m.turnTime=.16;m.vx=m.vy=0;return {moving:false,turning:true,arrived:false,distance:0};}
  // Slow over several ground pixels, so a genuine gait settles before changing to idle.
  // The 0.35 inset keeps the final arrival tolerance from cutting a full-speed step short.
  const final=dist(animal,m.route.at(-1)),desired=speed*clamp((final-.35)/Math.max(2,speed*.4),0,1),currentSpeed=Math.hypot(m.vx,m.vy),blend=1-Math.exp(-dt*(desired<currentSpeed?12:7));
  m.vx+=(dx/d*desired-m.vx)*blend;m.vy+=(dy/d*desired-m.vy)*blend;
  let mx=m.vx*dt,my=m.vy*dt,step=Math.hypot(mx,my);if(step>d){mx*=d/step;my*=d/step;step=d;}
  const next={x:animal.x+mx,y:animal.y+my};
  if(!segmentClear(animal,next,isAllowed,1.5)){m.vx=m.vy=0;m.blocked++;return {moving:false,blocked:true,arrived:false,distance:0};}
  animal.x=next.x;animal.y=next.y;m.travel+=step;m.blocked=0;
  return {moving:step>.003,arrived:false,distance:step,cycle:m.travel/stride*Math.PI*2};
}

export function animationFrameAt(frames,timeMs,loop=true) {
  if(!Array.isArray(frames)||!frames.length)return null;
  const total=frames.reduce((sum,f)=>sum+f.durationMs,0);if(!(total>0))return frames[0];
  let cursor=loop?((timeMs%total)+total)%total:clamp(timeMs,0,total-.001);
  for(const frame of frames){if(cursor<frame.durationMs)return frame;cursor-=frame.durationMs;}
  return frames.at(-1);
}
