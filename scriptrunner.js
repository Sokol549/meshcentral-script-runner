'use strict';
const fs = require('fs'), path = require('path'), build = require('./runner-build').build;
function create(parent) {
 const server = parent.meshServer || parent.parent, obj = {};
 obj.exports = ['onWebUIStartupEnd', 'onPrepared'];
 obj.serveraction = function(cmd, client) {
  if (!client || !client.user || ![0xffffffff, -1].includes(client.user.siteadmin)) return;
  if (!cmd || cmd.pluginaction !== 'build') return;
  const reply = {action:'plugin',plugin:'scriptrunner',method:'onPrepared',request:cmd.request};
  try { if (typeof cmd.request !== 'string' || !/^[a-f0-9]{32}$/.test(cmd.request)) throw Error('Invalid request'); const files=build(cmd.script,cmd.request); reply.user=files.user.toString('base64'); reply.runner=files.runner.toString('base64'); }
  catch(e) { reply.error=e.message; }
  client.send(reply);
 };
 function routes(app) {
  if (!app || app._scriptRunnerRoutes) return false;
  app._scriptRunnerRoutes=true;
  ['scriptrunner.js','scriptrunner.css'].forEach(name=>app.get('/plugin/scriptrunner/'+name,(req,res)=>res.sendFile(path.join(__dirname,'public',name))));
  if (app._router && Array.isArray(app._router.stack)) { const stack=app._router.stack,layers=[]; for(let i=stack.length-1;i>=0;i--) if(stack[i].route && String(stack[i].route.path).startsWith('/plugin/scriptrunner/')) layers.unshift(stack.splice(i,1)[0]); stack.splice(2,0,...layers); }
  return true;
 }
 obj.hook_setupHttpHandlers=web=>routes(web && (web.app || web));
 obj.server_startup=function(){ let attempts=0; function retry(){if(!routes(server.app || (server.webserver && server.webserver.app)) && ++attempts<30)setTimeout(retry,1000);} retry(); };
 obj.onWebUIStartupEnd=function(){ if(document.getElementById('script-runner-loader'))return; var s=document.createElement('script');s.id='script-runner-loader';s.src='plugin/scriptrunner/scriptrunner.js';document.head.appendChild(s);var c=document.createElement('link');c.rel='stylesheet';c.href='plugin/scriptrunner/scriptrunner.css';document.head.appendChild(c); };
 obj.onPrepared=function(server,message){if(window.ScriptRunner)window.ScriptRunner.prepared(message||server);};
 return obj;
}
module.exports=create;
module.exports.scriptrunner=create;
