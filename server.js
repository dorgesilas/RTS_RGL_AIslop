'use strict';
// Minimal dependency-free local / hosted room relay for Veilwards 3D.
// The room creator's browser is the simulation host; this is not a production authoritative server.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const HOST=process.env.HOST||'0.0.0.0',PORT=Number(process.env.PORT||8787),ROOT=__dirname,rooms=new Map();
const code=()=>crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase(),token=()=>crypto.randomBytes(18).toString('hex');
function respond(res,status,data){let out=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(out)}
function message(res,type,data){if(res.writableEnded)return;res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)}
function broadcast(room,type,data){for(let m of room.members)for(let conn of m.connections)message(conn,type,data)}
function getRoom(body){let room=rooms.get(String(body.room||'').toUpperCase()),member=room?.members.find(p=>p.token===body.token);if(!room||!member)throw Error('Room expired or not authorized');return{room,member}}
function roster(room){return room.members.map(m=>({slot:m.slot,name:m.name}))}
function randomRoom(){let c;do{c=code()}while(rooms.has(c));return c}
function removeMember(room,m){room.members=room.members.filter(x=>x!==m);for(let r of m.connections){message(r,'closed',{});r.end()}m.connections.clear();if(m.slot===0){broadcast(room,'closed',{});for(let p of room.members)for(let r of p.connections)r.end();rooms.delete(room.code)}else broadcast(room,'roster',{members:roster(room)})}
function collect(req){return new Promise((resolve,reject)=>{let length=0,parts=[];req.on('data',chunk=>{length+=chunk.length;if(length>450000){reject(Error('Payload too large'));req.destroy();return}parts.push(chunk)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')||'{}'))}catch{reject(Error('Invalid JSON'))}});req.on('error',reject)})}
function within(arr,x){return arr.includes(x)}
const server=http.createServer(async(req,res)=>{try{
 let url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/healthz'){return respond(res,200,{ok:true,service:'veilwards-multiplayer',version:'4.2.1'});} 
 if(req.method==='GET'&&url.pathname==='/api/events'){
  const {room,member}=getRoom(Object.fromEntries(url.searchParams));
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(':connected\n\n');member.connections.add(res);message(res,'roster',{members:roster(room)});if(room.snapshot)message(res,'snapshot',room.snapshot);
  let ping=setInterval(()=>{if(!res.writableEnded)res.write(':ping\n\n')},12000);req.on('close',()=>{clearInterval(ping);member.connections.delete(res)});return;
 }
 if(req.method==='POST'&&url.pathname.startsWith('/api/')){
  let b=await collect(req),kind=url.pathname.split('/').pop();
  if(kind==='create'){
   let id=randomRoom(),m={slot:0,name:String(b.name||'Commander').slice(0,16),token:token(),connections:new Set()},r={code:id,members:[m],snapshot:null,created:Date.now(),updated:Date.now()};rooms.set(id,r);return respond(res,200,{room:id,token:m.token,slot:0,members:roster(r)});
  }
  if(kind==='join'){
   let r=rooms.get(String(b.room||'').toUpperCase());if(!r)throw Error('Room not found');if(r.members.length>=4)throw Error('Room full (4 players)');if(r.snapshot&&['draft','combat','shop','ended'].includes(r.snapshot.phase))throw Error('Run already started; join the next run');let sid=[0,1,2,3].find(x=>!r.members.some(m=>m.slot===x));let m={slot:sid,name:String(b.name||'Commander').slice(0,16),token:token(),connections:new Set()};r.members.push(m);broadcast(r,'roster',{members:roster(r)});return respond(res,200,{room:r.code,token:m.token,slot:sid,members:roster(r)});
  }
  if(kind==='state'){
   const {room,member}=getRoom(b);if(member.slot!==0)throw Error('Host only');if(!b.state||!Array.isArray(b.state.squads)||b.state.squads.length>32||!Array.isArray(b.state.players))throw Error('Invalid state');room.snapshot=b.state;room.updated=Date.now();for(let m of room.members)if(m.slot!==0)for(let c of m.connections)message(c,'snapshot',room.snapshot);return respond(res,200,{ok:true});
  }
  if(kind==='command'){
   const {room,member}=getRoom(b),act=b.action||{};if(member.slot===0)throw Error('Host uses local controls');if(!within(['move','hold','formation','skill','draft','purchase'],act.type))throw Error('Invalid command');
   const isPlayerAction=within(['draft','purchase'],act.type);if(!isPlayerAction&&room.snapshot?.squads?.[b.squadId]?.owner!==member.slot)throw Error('Not your unit');
   if(isPlayerAction&&(b.squadId!==-1||!room.snapshot?.players?.includes(member.slot)))throw Error('Not a room player');
   if(act.type==='draft'&&!within(['lone','hero','regiment'],act.choice))throw Error('Invalid draft choice');
   if(act.type==='purchase'&&!within(['buy','upgrade','promote','retire','ready'],act.purchase?.kind))throw Error('Invalid shop action');
   if(act.type==='skill'&&(act.which!==undefined&&(!Number.isInteger(act.which)||act.which<0||act.which>3)))throw Error('Invalid skill index');if(act.type==='move'&&(!Number.isInteger(act.x)||!Number.isInteger(act.z)||act.x<0||act.z<0||act.x>=13||act.z>=10))throw Error('Invalid tile');if(act.type==='formation'&&!within(['shield','balanced','spear'],act.key))throw Error('Invalid formation');let host=room.members.find(m=>m.slot===0);for(let c of host.connections)message(c,'command',{fromSlot:member.slot,squadId:b.squadId,action:act});return respond(res,200,{ok:true});
  }
  if(kind==='leave'){const {room,member}=getRoom(b);respond(res,200,{ok:true});removeMember(room,member);return}
  return respond(res,404,{error:'Unknown endpoint'});
 }
 if(req.method==='GET'&&within(['/','/index.html','/game3d.mjs'],url.pathname)){
  let file=path.join(ROOT,url.pathname==='/game3d.mjs'?'game3d.mjs':'index.html');let stat=fs.statSync(file);res.writeHead(200,{'Content-Type':file.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);return;
 }
 respond(res,404,{error:'Not found'});
}catch(e){if(!res.headersSent)respond(res,e.message==='Payload too large'?413:400,{error:e.message});}});
setInterval(()=>{let now=Date.now();for(let [id,room] of rooms){if(now-room.updated>1000*60*60*3){broadcast(room,'closed',{});rooms.delete(id)}}},60000).unref();
server.listen(PORT,HOST,()=>console.log(`Veilwards online playtest listening on ${HOST}:${PORT}`));
