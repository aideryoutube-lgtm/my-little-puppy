'use strict';
/* Private Pawtopia preview only. No third-party packages or secrets in client code. */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=__dirname;
const username=process.env.PREVIEW_USER;
const password=process.env.PREVIEW_PASSWORD;
if(!username||!password||password.length<12){console.error('PREVIEW_USER and PREVIEW_PASSWORD (12+ chars) are required');process.exit(1);}
const types={'.glb':'model/gltf-binary','.txt':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.mov':'video/quicktime','.json':'application/json','.ico':'image/x-icon','.woff2':'font/woff2','.mp3':'audio/mpeg'};
function safeEqual(a,b){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
http.createServer((req,res)=>{
 const challenge=()=>{res.writeHead(401,{'WWW-Authenticate':'Basic realm="Pawtopia 3.1 Preview", charset="UTF-8"','Cache-Control':'no-store'});res.end('Authentication required');};
 let token='';
 try{const header=req.headers.authorization||'';if(header.startsWith('Basic '))token=Buffer.from(header.slice(6),'base64').toString('utf8');}catch{}
 if(!safeEqual(token,username+':'+password))return challenge();
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
 const parts=pathname.split('/').filter(Boolean);
 if(parts.some(p=>p==='..'||p.startsWith('.'))){res.writeHead(403);return res.end();}
 const target=path.resolve(root,...parts.length?parts:['index.html']);
 if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 const ext=path.extname(target).toLowerCase();
 if(!types[ext]){res.writeHead(404);return res.end();}
 fs.stat(target,(err,st)=>{
  if(err||!st.isFile()){res.writeHead(404);return res.end();}
  const headers={'Content-Type':types[ext],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"frame-ancestors 'none'"};
  const range=req.headers.range;
  if(range&&/^(?:bytes)=\d*-\d*$/.test(range)){
   const match=/^bytes=(\d*)-(\d*)$/.exec(range);
   let start=match[1]?Number(match[1]):0,end=match[2]?Number(match[2]):st.size-1;
   if(!match[1]){const suffix=Number(match[2]);start=Math.max(0,st.size-suffix);end=st.size-1;}
   if(start>=st.size||end<start){res.writeHead(416,{'Content-Range':'bytes */'+st.size});return res.end();}
   end=Math.min(end,st.size-1);
   res.writeHead(206,{...headers,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${st.size}`,'Content-Length':end-start+1});
   if(req.method==='HEAD')return res.end();
   return fs.createReadStream(target,{start,end}).pipe(res);
  }
  res.writeHead(200,{...headers,'Accept-Ranges':'bytes','Content-Length':st.size});
  if(req.method==='HEAD')return res.end();
  fs.createReadStream(target).pipe(res);
 });
}).listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Pawtopia private preview listening'));
