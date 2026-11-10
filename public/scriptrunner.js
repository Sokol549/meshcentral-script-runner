(function () {
 'use strict';
 if (window.ScriptRunner) return;
 var pending = new Map(), batch = null;
 function token(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),function(x){return x.toString(16).padStart(2,'0');}).join('');}
 function send(script,id){return new Promise(function(resolve,reject){var timer=setTimeout(function(){pending.delete(id);reject(Error('Сервер не подготовил скрипт'));},30000);pending.set(id,{resolve:resolve,reject:reject,timer:timer});meshserver.send({action:'plugin',plugin:'scriptrunner',pluginaction:'build',request:id,script:script});});}
 function encoded(s){var b=new Uint8Array(s.length*2);for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);b[i*2]=c&255;b[i*2+1]=c>>>8;}var t='';for(var j=0;j<b.length;j++)t+=String.fromCharCode(b[j]);return btoa(t);}
 function fileBytes(value){var t=atob(value), b=new Uint8Array(t.length);for(var i=0;i<t.length;i++)b[i]=t.charCodeAt(i);return b;}
 function command(node,script,responseid){var m={action:'runcommands',nodeids:[node],type:1,runAsUser:0,cmds:'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand '+encoded(script)};if(responseid){m.reply=true;m.responseid=responseid;}meshserver.send(m);}
 function openFiles(node, onMessage, onBinary){
  var redirect, settled=false, timer;
  return new Promise(function(resolve,reject){
   function fail(s){if(settled)return;settled=true;clearTimeout(timer);try{if(redirect)redirect.Stop();}catch(e){}reject(Error(s));}
   var protocol=CreateRemoteFiles(function(raw){var m=raw;try{if(typeof m==='string')m=JSON.parse(m);}catch(e){return;}onMessage(m);},function(data){if(onBinary)onBinary(data);});
   redirect=CreateAgentRedirect(meshserver,protocol,serverPublicNamePort,authCookie,authRelayCookie,domainUrl);
   redirect.onStateChanged=function(x,state){if(state===3 && !settled){settled=true;clearTimeout(timer);resolve(redirect);}else if(state===0){if(!settled)fail('Файловый канал недоступен');else onMessage({action:'disconnected'});}};
   timer=setTimeout(function(){fail('Таймаут открытия файлового канала');},30000);
   try{redirect.Start(node);}catch(e){fail(e.message);}
  });
 }
 async function prepare(node,id,trace){
  var dir='C:/Windows/System32/config/systemprofile/AppData/Local/Temp', marker='br_prepare_'+id, redirect,resolveResult,rejectResult;
  var result=new Promise(function(resolve,reject){resolveResult=resolve;rejectResult=reject;});
  var seen=false,responseid='scriptrunner-prep-'+id,socket=meshserver.socket;
  function agentReply(event){var m;try{m=JSON.parse(event.data);}catch(e){return;}if(m.responseid!==responseid)return;var value=String(m.result||'');value=value.replace(/powershell\.exe[^\r\n]*/ig,'[команда подготовки]');trace('Ответ на команду подготовки: '+value.slice(-4000));}
  if(socket&&socket.addEventListener)socket.addEventListener('message',agentReply);
  try{redirect=await openFiles(node,function(m){if(m.action==='disconnected')return rejectResult(Error('Соединение потеряно при подготовке'));if(m.action==='ls'&&Number(m.reqid)===71&&Array.isArray(m.dir)){if(!seen){seen=true;trace('Получен список временной папки от агента.');}if(m.dir.some(function(x){return x.n===marker+'.ok';}))resolveResult();else if(m.dir.some(function(x){return x.n===marker+'.failed';}))rejectResult(Error('Не удалось подготовить защищённую папку или проверить её права'));}});}catch(e){if(socket&&socket.removeEventListener)socket.removeEventListener('message',agentReply);throw e;}
  var timer=setTimeout(function(){rejectResult(Error('Подготовка не подтверждена: '+(seen?'маркер не найден':'нет ответа на запрос списка файлов')));},60000),interval;
  try {
   var prefix=dir.replace(/\//g,'\\')+'\\'+marker;
   var script="$m='"+prefix+"';try{$root='C:\\Windows\\System32\\config\\systemprofile';$dirs=@($root,($root+'\\AppData'),($root+'\\AppData\\Local'),($root+'\\AppData\\Local\\Temp'));$work=$dirs[3]+'\\BulkScriptRunner';foreach($p in $dirs){if((Get-Item -LiteralPath $p -Force -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point'};$acl=Get-Acl -LiteralPath $p -ErrorAction Stop;$owner=(New-Object Security.Principal.NTAccount($acl.Owner)).Translate([Security.Principal.SecurityIdentifier]).Value;if($owner -notin @('S-1-5-18','S-1-5-32-544')){throw 'Untrusted owner'};foreach($a in $acl.Access){$sid=$a.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($a.AccessControlType -eq 'Allow' -and (($a.FileSystemRights.value__ -band 0x500D0156) -ne 0) -and $sid -notin @('S-1-5-18','S-1-5-32-544','S-1-3-0')){throw 'Untrusted write access'}}};New-Item -ItemType Directory -Path $work -Force -ErrorAction Stop | Out-Null;if((Get-Item -LiteralPath $work -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point'};$acl=Get-Acl -LiteralPath $work;$owner=(New-Object Security.Principal.NTAccount($acl.Owner)).Translate([Security.Principal.SecurityIdentifier]).Value;if($owner -notin @('S-1-5-18','S-1-5-32-544')){throw 'Untrusted owner'};foreach($a in $acl.Access){$sid=$a.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($a.AccessControlType -eq 'Allow' -and (($a.FileSystemRights.value__ -band 0x500D0156) -ne 0) -and $sid -notin @('S-1-5-18','S-1-5-32-544','S-1-3-0')){throw 'Untrusted write access'}};New-Item -ItemType File -Path ($m+'.ok') -ErrorAction Stop | Out-Null}catch{New-Item -ItemType File -Path ($m+'.failed') -ErrorAction SilentlyContinue | Out-Null}";
   trace('Файловый канал открыт; отправлена команда подготовки. Идентификатор: '+id);command(node,script,responseid);
   function query(){redirect.sendText(JSON.stringify({action:'ls',reqid:71,path:dir}));}
   query();interval=setInterval(query,2000);await result;
  } finally {clearTimeout(timer);clearInterval(interval);if(socket&&socket.removeEventListener)socket.removeEventListener('message',agentReply);redirect.Stop();}
 }
 async function upload(node,name,bytes){
  var redirect,resolveResult,rejectResult,offset=0;
  var result=new Promise(function(resolve,reject){resolveResult=resolve;rejectResult=reject;});
  function next(){if(offset>=bytes.length){redirect.sendText(JSON.stringify({action:'uploaddone',reqid:1}));return;}var part=bytes.slice(offset,Math.min(offset+65536,bytes.length));offset+=part.length;if(part.length&&(part[0]===0||part[0]===123)){var frame=new Uint8Array(part.length+1);frame.set(part,1);redirect.send(frame);}else redirect.send(part);}
  redirect=await openFiles(node,function(m){if(m.action==='disconnected')return rejectResult(Error('Соединение потеряно при передаче'));if(Number(m.reqid)!==1)return;if(m.action==='uploadstart'||m.action==='uploadack')next();else if(m.action==='uploaddone')resolveResult();else if(m.action==='uploaderror')rejectResult(Error('Ошибка записи файла на устройстве'));});
  var timer=setTimeout(function(){rejectResult(Error('Таймаут передачи файла'));},60000);
  try{redirect.sendText(JSON.stringify({action:'upload',reqid:1,path:'C:/Windows/System32/config/systemprofile/AppData/Local/Temp/BulkScriptRunner',name:name,size:bytes.length}));await result;}finally{clearTimeout(timer);redirect.Stop();}
 }
 async function download(node,file){
  var redirect,resolveResult,rejectResult,id=Math.floor(Math.random()*1000000000),chunks=[],size=0;
  var result=new Promise(function(resolve,reject){resolveResult=resolve;rejectResult=reject;});
  redirect=await openFiles(node,function(m){if(m.action==='disconnected')return rejectResult(Error('Соединение потеряно при чтении'));if(m.action!=='download'||String(m.id)!==String(id))return;if(m.sub==='start')redirect.sendText(JSON.stringify({action:'download',sub:'startack',id:id}));else if(m.sub==='cancel')rejectResult(Error('Файл результата недоступен'));},function(data){var b=typeof data==='string'?Uint8Array.from(data,function(c){return c.charCodeAt(0)&255;}):data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength);if(b.length<4)return rejectResult(Error('Неверный ответ агента'));size+=b.length-4;if(size>1048576)return rejectResult(Error('Журнал больше 1 МБ'));chunks.push(b.slice(4));if(b[3]&1){var all=new Uint8Array(size),pos=0;chunks.forEach(function(c){all.set(c,pos);pos+=c.length;});resolveResult(new TextDecoder('utf-8').decode(all));}else redirect.sendText(JSON.stringify({action:'download',sub:'ack',id:id}));});
  var timer=setTimeout(function(){rejectResult(Error('Таймаут чтения результата'));},30000);
  try{redirect.sendText(JSON.stringify({action:'download',sub:'start',id:id,path:file}));return await result;}finally{clearTimeout(timer);redirect.Stop();}
 }
 async function waitResult(node,id,deadline){
  var redirect,resolveResult,rejectResult,interval;
  var result=new Promise(function(resolve,reject){resolveResult=resolve;rejectResult=reject;});
  redirect=await openFiles(node,function(m){if(m.action==='disconnected')return rejectResult(Error('Результат неизвестен: связь потеряна'));if(m.action==='ls'&&Number(m.reqid)===2&&Array.isArray(m.dir)&&m.dir.some(function(x){return x.n==='br_'+id+'.result.json';}))resolveResult();});
  function query(){if(Date.now()>deadline)return rejectResult(Error('Результат неизвестен: время ожидания истекло; процесс может продолжаться'));redirect.sendText(JSON.stringify({action:'ls',reqid:2,path:'C:/Windows/System32/config/systemprofile/AppData/Local/Temp/BulkScriptRunner'}));}
  try{query();interval=setInterval(query,2000);await result;}finally{clearInterval(interval);redirect.Stop();}
  var root='C:/Windows/System32/config/systemprofile/AppData/Local/Temp/BulkScriptRunner/br_'+id,info=JSON.parse(await download(node,root+'.result.json'));
  if(info.attempt_id!==id || (info.exit_code!==null&&!Number.isInteger(info.exit_code)))throw Error('Недостоверный файл результата');
  var logs=await Promise.allSettled([download(node,root+'.stdout.log'),download(node,root+'.stderr.log')]);
  info.stdout=logs[0].status==='fulfilled'?logs[0].value:'Не удалось прочитать stdout';info.stderr=logs[1].status==='fulfilled'?logs[1].value:'Не удалось прочитать stderr';return info;
 }
 async function runNode(item,script,timeout){
  function trace(s){item.trace.push(new Date().toLocaleTimeString()+' '+s);}
  if((item.node.conn&1)===0){item.status.textContent='Offline / Skipped';trace('Устройство не подключено; запуск пропущен.');return;}
  var id=token(),sent=false;item.status.textContent='Подготовка';
  try{trace('Запрошена подготовка скрипта на сервере.');var data=await send(script,id);trace('Скрипт подготовлен сервером.');await prepare(item.node._id,id,trace);trace('Подготовка устройства подтверждена.');item.status.textContent='Передача';await upload(item.node._id,'br_'+id+'_script.ps1',fileBytes(data.user));await upload(item.node._id,'br_'+id+'_runner.ps1',fileBytes(data.runner));trace('Файлы переданы; отправляется команда запуска.');
   var runner='C:\\Windows\\System32\\config\\systemprofile\\AppData\\Local\\Temp\\BulkScriptRunner\\br_'+id+'_runner.ps1';item.status.textContent='Запуск';sent=true;command(item.node._id,"& '"+runner+"'");item.status.textContent='Выполняется';
   var res=await waitResult(item.node._id,id,Date.now()+timeout*1000);item.result=res;trace('Получен результат выполнения.');item.status.textContent=(res.exit_code===0?'Success':'Failed')+(res.cleanup_error?' (очистка не удалась)':'');
  }catch(e){trace((sent?'Результат неизвестен: ':'Скрипт не запускался: ')+e.message);item.status.textContent=(sent?'Unknown: ':'Ошибка: ')+e.message;if(sent)throw e;}
 }
 async function start(){
  if(batch)return;var ids=typeof getCheckedDevices==='function'?getCheckedDevices():[],script=document.getElementById('sr-script').value,timeout=Number(document.getElementById('sr-timeout').value);
  if(!ids.length||!script.trim()||!Number.isInteger(timeout)||timeout<1||timeout>86400){document.getElementById('sr-status').textContent='Выберите устройства, введите скрипт и таймаут.';return;}
  if(ids.length>100){document.getElementById('sr-status').textContent='Не более 100 устройств за запуск.';return;}
  var nodes=ids.map(function(id){return getNodeFromId(id);});if(nodes.some(function(n){return !n;})){document.getElementById('sr-status').textContent='Не удалось определить устройства.';return;}
  var list=document.getElementById('sr-list');list.replaceChildren();batch={stopped:false};var thisBatch=batch;
  var entries=nodes.map(function(n){var row=document.createElement('div'),name=document.createElement('span'),status=document.createElement('span'),logs=document.createElement('button');row.className='sr-row';name.textContent=n.name||n._id;status.textContent='Pending';logs.type='button';logs.textContent='Логи';var item={node:n,status:status,logs:logs,trace:[]};logs.onclick=function(){var r=item.result;document.getElementById('sr-log').value='СОБЫТИЯ\n'+(item.trace.join('\n')||'Ожидание в очереди.')+(r?'\n\nSTDOUT\n'+r.stdout+'\n\nSTDERR\n'+r.stderr+'\n\nExit code: '+r.exit_code+(r.error?'\nRunner error: '+r.error:'')+(r.cleanup_error?'\nCleanup error: '+r.cleanup_error:''):'');};row.append(name,status,logs);list.appendChild(row);return item;});
  document.getElementById('sr-run').disabled=true;document.getElementById('sr-status').textContent='Выполнение; не закрывайте окно браузера.';
  for(var i=0;i<entries.length;i++){if(thisBatch.stopped){entries[i].status.textContent='Cancelled';continue;}try{await runNode(entries[i],script,timeout);}catch(e){thisBatch.stopped=true;document.getElementById('sr-status').textContent='Очередь остановлена: результат неизвестен. Проверьте файлы C:\\Windows\\System32\\config\\systemprofile\\AppData\\Local\\Temp\\BulkScriptRunner до повтора.';}}
  if(!thisBatch.stopped)document.getElementById('sr-status').textContent='Обработка завершена.';batch=null;document.getElementById('sr-run').disabled=false;
 }
 function open(){if(document.getElementById('sr-dialog'))return;var d=document.createElement('div');d.id='sr-dialog';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.innerHTML='<div class="sr-modal"><div class="sr-header"><h2>Массовый запуск скриптов</h2><p>Windows PowerShell · MeshCentral</p></div><div class="sr-content"><section class="sr-card"><label>Скрипт PowerShell<textarea id="sr-script" rows="10" spellcheck="false"></textarea></label><label>Таймаут ожидания, сек<input type="number" id="sr-timeout" min="1" max="86400" value="120"></label><p>После завершения файлы скрипта удаляются, журналы остаются. Устройства обрабатываются последовательно.</p></section><div id="sr-list" class="sr-list"></div><textarea id="sr-log" readonly placeholder="Журнал выбранного устройства"></textarea></div><div class="sr-footer"><span id="sr-status">Выберите компьютеры в списке MeshCentral.</span><button id="sr-close" type="button">Закрыть</button><button id="sr-run" type="button" class="sr-primary">Запустить</button></div></div>';['keydown','keypress','keyup'].forEach(function(type){d.addEventListener(type,function(e){e.stopPropagation();});});document.body.appendChild(d);document.getElementById('sr-close').onclick=function(){if(!batch)d.remove();};document.getElementById('sr-run').onclick=start;}
 function inject(){var bar=document.getElementById('devListToolbar')||document.getElementById('devicesButtonBar');if(bar&&!document.getElementById('sr-open')){var b=document.createElement('input');b.type='button';b.id='sr-open';b.value='Запустить скрипт на выбранных';b.onclick=open;var z=document.getElementById('zabbix-bulk-open');if(z&&z.parentNode===bar)bar.insertBefore(b,z.nextSibling);else bar.appendChild(b);}}
 window.ScriptRunner={prepared:function(m){var p=pending.get(m.request);if(!p)return;pending.delete(m.request);clearTimeout(p.timer);if(m.error)p.reject(Error(m.error));else p.resolve(m);},inject:inject};inject();setInterval(inject,3000);
})();
