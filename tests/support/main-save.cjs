const fs=require('node:fs');const html=fs.readFileSync('index.html','utf8');module.exports=html.slice(html.indexOf('function persistSave('),html.indexOf('function update(){'));
