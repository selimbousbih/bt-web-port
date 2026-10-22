// Expose only game routes; keep Wrangler development/admin endpoints local.
import http from 'node:http';
const allowed = req => /^\/(?:$|(?:index|game)\.html$|net\.(?:js|css)$|bt3-(?:jspi|async)\.(?:js|wasm)$|icon-\d+\.png$|manifest\.webmanifest$|disc\.iso$|disc\/index\.json$|telemetry$|net\/(?:ws|queue|stat|log)$)/.test(new URL(req.url,'http://local').pathname);
const server = http.createServer((req,res) => {
  if (!allowed(req)) { res.writeHead(404).end(); return; }
  const upstream=http.request({hostname:'127.0.0.1',port:4701,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502).end();}); req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{
  if(!allowed(req)){socket.destroy();return;}
  const upstream=http.request({hostname:'127.0.0.1',port:4701,path:req.url,headers:req.headers});
  upstream.on('upgrade',(res,peer,rest)=>{
    socket.write(`HTTP/1.1 ${res.statusCode} Switching Protocols\r\n`+Object.entries(res.headers).map(([k,v])=>`${k}: ${v}\r\n`).join('')+'\r\n');
    if(rest.length)socket.write(rest);if(head.length)peer.write(head);
    socket.pipe(peer).pipe(socket);peer.on('error',()=>socket.destroy());socket.on('error',()=>peer.destroy());
  });
  upstream.on('response',res=>{socket.end(`HTTP/1.1 ${res.statusCode} Rejected\r\nConnection: close\r\n\r\n`);res.resume();});
  upstream.on('error',()=>socket.destroy());upstream.end();
});
server.listen(4702,'127.0.0.1');
