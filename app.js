const JOBS = [
  // Swordsman family
  ['Swordsman','swordsman'],
  ['Knight','swordsman'],['Lord Knight','swordsman'],['Rune Knight','swordsman'],
  ['Crusader','swordsman'],['Paladin','swordsman'],['Royal Guard','swordsman'],

  // Mage family
  ['Mage','mage'],
  ['Wizard','mage'],['High Wizard','mage'],['Warlock','mage'],['Sage','mage'],

  // Archer family
  ['Archer','archer'],
  ['Hunter','archer'],['Sniper','archer'],['Ranger','archer'],
  ['Bard','archer'],['Clown','archer'],['Minstrel','archer'],
  ['Dancer','archer'],['Gypsy','archer'],['Wanderer','archer'],

  // Acolyte family
  ['Acolyte','acolyte'],
  ['Priest','acolyte'],['High Priest','acolyte'],['Arch Bishop','acolyte'],
  ['Monk','acolyte'],['Champion','acolyte'],['Sura','acolyte'],

  // Thief family
  ['Thief','thief'],
  ['Assassin','thief'],['Assassin Cross','thief'],['Guillotine Cross','thief'],['Rogue','thief'],

  // Merchant family
  ['Merchant','merchant'],
  ['Blacksmith','merchant'],['Whitesmith','merchant'],['Mechanic','merchant'],
  ['Alchemist','merchant'],['Creator','merchant'],['Genetic','merchant'],

  // Gunslinger family
  ['Gunslinger','gunslinger'],['Rebel','gunslinger'],['Night Watch','gunslinger'],

  // Druid family
  ['Druid','druid'],['Kanos','druid'],['Alithea','druid']
];

const RAIDS = {
  guildLeague:{title:'Guild League',groups:[['Alpha Party',8],['Beta Party',4],['Charlie Party',8],['Delta Party',8],['Echo Party',8]]},
  polarityZone:{title:'Polarity Zone',groups:[['Elite Party',10],['Sub-Party',24]]},
  guildSiege:{title:'Guild Siege',groups:[['Alpha Party',8],['Beta Party',8],['Charlie Party',8],['Delta Party',8]]}
};

const SUPABASE_URL = window.ROTW_CONFIG?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.ROTW_CONFIG?.SUPABASE_ANON_KEY || '';
const GUILD_ID = window.ROTW_CONFIG?.GUILD_ID || 'rotw-main';
const supabaseClient = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let members = [];
let assignments = {};
let editingId = null;
let currentRaid = 'guildLeague';
let selectedClass = null;
let activePickerSlot = null;
let activePickerButton = null;
let memberSort = {key:'ign',dir:'asc'};
let pendingRosterSync = null;
let currentUser = null;
let sessionToken = localStorage.getItem('gm_session_token') || '';
let remoteUpdatedAt = null;
let pollTimer = null;
let auditLogs = [];
let accounts = [];
let snapshots = [];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const iconPath = key => `resources/${key}.png`;

function cacheLocal(){
  sessionStorage.setItem('gm_members', JSON.stringify(members));
  sessionStorage.setItem('gm_assignments', JSON.stringify(assignments));
}
function clearLocalSession(){
  sessionToken='';
  currentUser=null;
  localStorage.removeItem('gm_session_token');
  sessionStorage.removeItem('gm_members');
  sessionStorage.removeItem('gm_assignments');
  members=[]; assignments={};
  renderMembers?.(); renderClassList?.(); renderRaid?.();
}

function requireSupabase(){
  if(!supabaseClient) throw new Error('Supabase is not configured. Check config.js.');
}
async function rpc(name,args={}){
  requireSupabase();
  const {data,error}=await supabaseClient.rpc(name,args);
  if(error) throw error;
  return data;
}
function authMessage(msg,isError=false){
  const el=$('#authStatus');
  el.textContent=msg||'';
  el.classList.toggle('error',!!isError);
}
function showAuth(){
  $('#authScreen').classList.remove('hidden');
  $('#appShell').classList.add('hidden');
}
function showApp(){
  $('#authScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  $('#currentUsername').textContent=currentUser?.username||'—';
  $('#currentRole').textContent=currentUser?.role==='developer'?'Developer':'Officer';
  $('#accountsNav').classList.toggle('hidden',currentUser?.role!=='developer');
}
function applyRemoteState(row){
  if(!row) return;
  members=Array.isArray(row.members)?row.members:[];
  assignments=row.assignments && typeof row.assignments==='object' && !Array.isArray(row.assignments) ? row.assignments : {};
  remoteUpdatedAt=row.updated_at||remoteUpdatedAt;
  cacheLocal();
  renderMembers();
  renderClassList();
  renderRaid();
}
async function loadSharedState(silent=false){
  if(!sessionToken) return;
  try{
    const data=await rpc('gm_get_state',{p_session_token:sessionToken,p_guild_id:GUILD_ID});
    if(data) applyRemoteState(data);
  }catch(err){
    console.error('Shared state load failed:',err);
    if(String(err.message||'').toLowerCase().includes('session')){
      await logout(false);
      authMessage('Your session expired. Please sign in again.',true);
    }else if(!silent) toast('Could not load shared guild data.');
  }
}
async function pollSharedState(){
  if(!sessionToken || document.hidden) return;
  try{
    const data=await rpc('gm_get_state',{p_session_token:sessionToken,p_guild_id:GUILD_ID});
    if(data?.updated_at && data.updated_at!==remoteUpdatedAt) applyRemoteState(data);
  }catch(err){
    console.warn('Background sync failed:',err);
  }
}
function startSharedPolling(){
  clearInterval(pollTimer);
  pollTimer=setInterval(pollSharedState,5000);
}
async function saveState(actionType='State Updated',target='',details={},makeSnapshot=false){
  cacheLocal();
  try{
    const result=await rpc('gm_save_state',{
      p_session_token:sessionToken,
      p_guild_id:GUILD_ID,
      p_members:members,
      p_assignments:assignments,
      p_action_type:actionType,
      p_target:target||'',
      p_details:details||{},
      p_make_snapshot:!!makeSnapshot
    });
    remoteUpdatedAt=result?.updated_at||new Date().toISOString();
    return true;
  }catch(err){
    console.error('Supabase save failed:',err);
    toast('Save failed. Your change remains only in this browser.');
    return false;
  }
}
async function hasAccounts(){
  return !!(await rpc('gm_has_accounts',{p_guild_id:GUILD_ID}));
}
async function bootstrapDeveloper(username,password){
  return await rpc('gm_bootstrap_developer',{p_guild_id:GUILD_ID,p_username:username,p_password:password});
}
async function login(username,password){
  const data=await rpc('gm_login',{p_guild_id:GUILD_ID,p_username:username,p_password:password});
  if(!data?.session_token) throw new Error('Login failed.');
  sessionToken=data.session_token;
  currentUser={username:data.username,role:data.role,accountId:data.account_id};
  localStorage.setItem('gm_session_token',sessionToken);
  showApp();
  await loadSharedState();
  startSharedPolling();
}
async function restoreSession(){
  if(!sessionToken) return false;
  try{
    const data=await rpc('gm_session_info',{p_session_token:sessionToken,p_guild_id:GUILD_ID});
    if(!data?.username) throw new Error('Invalid session');
    currentUser={username:data.username,role:data.role,accountId:data.account_id};
    showApp();
    await loadSharedState();
    startSharedPolling();
    return true;
  }catch(err){
    clearLocalSession();
    return false;
  }
}
async function logout(callServer=true){
  const token=sessionToken;
  clearInterval(pollTimer);
  if(callServer && token){
    try{ await rpc('gm_logout',{p_session_token:token}); }catch(_){ }
  }
  clearLocalSession();
  showAuth();
  $('#loginPassword').value='';
}
function jobInfo(name){
  const j = JOBS.find(x=>x[0]===name);
  return j ? {name:j[0],icon:j[1]} : {name,icon:'swordsman'};
}
function initials(name){ return (name||'?').trim().slice(0,2).toUpperCase(); }
function toast(msg){
  const t=$('#toast');
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(t._to);
  t._to=setTimeout(()=>t.classList.remove('show'),2200);
}

function memberSortValue(m,key){
  if(key==='level' || key==='gearScore') return Number(m[key]||0);
  return String(m[key]||'').toLocaleLowerCase();
}

function renderMembers(){
  const q=$('#memberSearch').value.trim().toLowerCase();
  const filtered=members.filter(m=>`${m.ign} ${m.job} ${m.position||''} ${m.level||''} ${m.gearScore||''}`.toLowerCase().includes(q));
  filtered.sort((a,b)=>{
    const av=memberSortValue(a,memberSort.key), bv=memberSortValue(b,memberSort.key);
    const cmp=typeof av==='number' ? av-bv : String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});
    return memberSort.dir==='asc'?cmp:-cmp;
  });
  $('#memberCount').textContent=`${members.length} member${members.length===1?'':'s'}`;
  const lastSync=members.map(m=>m.gameSyncedAt).filter(Boolean).sort().at(-1);
  const syncEl=$('#lastGameSync');
  if(syncEl) syncEl.textContent=lastSync?`Last game sync: ${new Date(lastSync).toLocaleString()}`:'No game CSV synced yet';
  $('#memberEmpty').style.display=filtered.length?'none':'block';
  $('#memberTableBody').innerHTML=filtered.map(m=>{
    const j=jobInfo(m.job);
    return `<tr>
      <td><div class="member-cell"><div class="member-avatar">${initials(m.ign)}</div><strong>${esc(m.ign)}</strong></div></td>
      <td>${esc(m.level||'—')}</td>
      <td><div class="job-cell"><img class="job-icon" src="${iconPath(j.icon)}" alt=""><span>${esc(m.job)}</span></div></td>
      <td>${esc(m.position||'—')}</td>
      <td class="gear-score-cell"><strong>${Number(m.gearScore||0).toLocaleString()}</strong></td>
      <td class="actions"><button class="action-btn" data-edit="${m.id}">Edit</button><button class="action-btn danger" data-remove="${m.id}">Remove</button></td>
    </tr>`;
  }).join('');
  $$('#memberTable thead [data-sort-key]').forEach(btn=>{
    btn.classList.toggle('active-sort',btn.dataset.sortKey===memberSort.key);
    btn.dataset.sortDir=btn.dataset.sortKey===memberSort.key?memberSort.dir:'';
  });
}

function classCount(job){
  return members.filter(m=>m.job===job).length;
}

function renderClassList(){
  const total=members.length;
  const represented=JOBS.filter(([name])=>classCount(name)>0).length;
  $('#classMemberTotal').textContent=`${total} member${total===1?'':'s'}`;
  $('#classFilledCount').textContent=represented;
  $('#classTotalCount').textContent=JOBS.length;
  $('#classRosterCount').textContent=total;

  $('#classGrid').innerHTML=JOBS.map(([name,icon])=>{
    const count=classCount(name);
    const active=selectedClass===name?' active':'';
    return `<button type="button" class="class-card${active}" data-class-name="${attr(name)}">
      <img src="${iconPath(icon)}" alt="" class="class-card-icon">
      <span class="class-card-info"><strong>${esc(name)}</strong><small>${count} member${count===1?'':'s'}</small></span>
      <span class="class-count-badge">${count}</span>
    </button>`;
  }).join('');

  renderSelectedClass();
}

function renderSelectedClass(){
  const panel=$('#classMembersPanel');
  if(!selectedClass){
    panel.innerHTML=`<div class="class-panel-empty">
      <span class="class-panel-symbol">📚</span>
      <strong>Select a class</strong>
      <p>Click any class on the left to see all members using that job.</p>
    </div>`;
    return;
  }

  const info=jobInfo(selectedClass);
  const list=members.filter(m=>m.job===selectedClass).sort((a,b)=>a.ign.localeCompare(b.ign));
  panel.innerHTML=`
    <div class="class-panel-header">
      <div class="class-panel-title">
        <img src="${iconPath(info.icon)}" alt="" class="class-panel-icon">
        <div><p class="eyebrow">Selected Class</p><h3>${esc(selectedClass)}</h3></div>
      </div>
      <span class="class-panel-count">${list.length}</span>
    </div>
    ${list.length ? `<div class="class-member-list">${list.map((m,i)=>`
      <div class="class-member-row">
        <span class="class-member-number">${i+1}</span>
        <div class="member-avatar small">${initials(m.ign)}</div>
        <div class="class-member-name"><strong>${esc(m.ign)}</strong><small>${esc(m.job)}</small></div>
        <button type="button" class="action-btn mini" data-class-edit="${m.id}">Edit</button>
      </div>`).join('')}</div>` : `<div class="class-no-members"><strong>No members yet</strong><p>No guild member is currently registered as ${esc(selectedClass)}.</p></div>`}
  `;
}

function openModal(member=null){
  editingId=member?.id||null;
  $('#modalTitle').textContent=member?'Edit Member':'Add Member';
  $('#ignInput').value=member?.ign||'';
  $('#jobSelect').value=member?.job||JOBS[0][0];
  $('#levelInput').value=member?.level||'';
  $('#positionInput').value=member?.position||'';
  $('#gearScoreInput').value=member?.gearScore||'';
  $('#memberModal').classList.remove('hidden');
  $('#memberModal').setAttribute('aria-hidden','false');
  setTimeout(()=>$('#ignInput').focus(),20);
}
function closeModal(){
  $('#memberModal').classList.add('hidden');
  $('#memberModal').setAttribute('aria-hidden','true');
  editingId=null;
}

function initJobSelect(){
  $('#jobSelect').innerHTML=JOBS.map(([name])=>`<option value="${name}">${name}</option>`).join('');
}

async function handleMemberSubmit(e){
  e.preventDefault();
  const ign=$('#ignInput').value.trim();
  const job=$('#jobSelect').value;
  const level=$('#levelInput').value.trim();
  const position=$('#positionInput').value.trim();
  const gearScore=$('#gearScoreInput').value.trim();
  if(!ign) return;
  const dupe=members.find(m=>m.ign.toLowerCase()===ign.toLowerCase() && m.id!==editingId);
  if(dupe){ toast('That IGN already exists.'); return; }
  let action, target, details, snapshot=false;
  if(editingId){
    const m=members.find(x=>x.id===editingId);
    const before={ign:m.ign,job:m.job,level:m.level||'',position:m.position||'',gearScore:m.gearScore||''};
    m.ign=ign; m.job=job; m.level=level; m.position=position; m.gearScore=gearScore;
    action='Member Updated'; target=ign; details={before,after:{ign,job,level,position,gearScore}};
  } else {
    members.push({id:crypto.randomUUID(),ign,job,level,position,gearScore});
    action='Member Added'; target=ign; details={job,level,position,gearScore};
  }
  renderMembers(); renderClassList(); renderRaid(); closeModal();
  if(await saveState(action,target,details,snapshot)) toast(action==='Member Added'?'Member added.':'Member updated.');
}

async function removeMember(id){
  const m=members.find(x=>x.id===id);
  if(!m) return;
  if(!confirm(`Remove ${m.ign} from the guild roster?`)) return;
  members=members.filter(x=>x.id!==id);
  let clearedSlots=0;
  Object.values(assignments).forEach(raid=>Object.keys(raid||{}).forEach(slot=>{
    if(raid[slot]===id){ raid[slot]=''; clearedSlots++; }
  }));
  renderMembers(); renderClassList(); renderRaid();
  if(await saveState('Member Removed',m.ign,{job:m.job,clearedRaidSlots:clearedSlots},true)) toast('Member removed.');
}

function ensureRaidStore(key){ if(!assignments[key]) assignments[key]={}; }
function assignedIdsForRaid(key){ ensureRaidStore(key); return Object.values(assignments[key]).filter(Boolean); }

function renderSlotPicker(slotKey, memberId){
  const m=members.find(x=>x.id===memberId);
  if(!m){
    return `<button type="button" class="slot-picker empty" data-slot="${attr(slotKey)}" aria-label="Choose member">
      <span class="slot-empty-icon">⌕</span>
      <span class="slot-picker-text"><strong>— Empty —</strong><small>Click to search member</small></span>
      <span class="slot-chevron">⌄</span>
    </button>`;
  }
  const j=jobInfo(m.job);
  return `<button type="button" class="slot-picker" data-slot="${attr(slotKey)}" aria-label="Change ${attr(m.ign)}">
    <img class="slot-job-icon" src="${iconPath(j.icon)}" alt="">
    <span class="slot-picker-text"><strong>${esc(m.ign)}</strong><small>${esc(m.job)}</small></span>
    <span class="slot-chevron">⌄</span>
  </button>`;
}

function renderRaid(){
  closeMemberPicker();
  const cfg=RAIDS[currentRaid];
  ensureRaidStore(currentRaid);
  $('#raidTitle').textContent=cfg.title;
  const totalTeams=cfg.groups.reduce((a,[,n])=>a+n,0);
  const capacity=totalTeams*5;
  const assigned=assignedIdsForRaid(currentRaid).length;
  $('#raidAssigned').textContent=`${assigned} assigned`;
  $('#raidCapacity').textContent=`${capacity} slots`;

  $('#partyGroups').innerHTML=cfg.groups.map(([group,count])=>{
    let teams='';
    for(let i=1;i<=count;i++){
      let slots='';
      for(let s=1;s<=5;s++){
        const slotKey=`${group}|${i}|${s}`;
        const value=assignments[currentRaid][slotKey]||'';
        slots += `<div class="member-slot"><span class="slot-number">${s}</span>${renderSlotPicker(slotKey,value)}</div>`;
      }
      teams += `<div class="team-card"><div class="team-head"><strong>Team ${i}</strong><span>5 members</span></div><div class="slot-list">${slots}</div></div>`;
    }
    return `<section class="party-section"><div class="party-section-header"><h3>${esc(group)}</h3><span>${count} team${count===1?'':'s'} · ${count*5} slots</span></div><div class="team-grid">${teams}</div></section>`;
  }).join('');
}

function getAvailableMembers(slotKey){
  ensureRaidStore(currentRaid);
  const currentId=assignments[currentRaid][slotKey]||'';
  const used = new Set(Object.entries(assignments[currentRaid])
    .filter(([key,id])=>key!==slotKey && id)
    .map(([,id])=>id));
  return members.filter(m=>m.id===currentId || !used.has(m.id));
}

function openMemberPicker(button){
  const slotKey=button.dataset.slot;
  activePickerSlot=slotKey;
  activePickerButton=button;

  const picker=$('#memberPicker');
  picker.classList.remove('hidden');
  picker.setAttribute('aria-hidden','false');
  $('#pickerSearch').value='';
  renderPickerResults();
  positionMemberPicker();
  requestAnimationFrame(()=>$('#pickerSearch').focus());
}

function positionMemberPicker(){
  if(!activePickerButton) return;
  const picker=$('#memberPicker');
  const rect=activePickerButton.getBoundingClientRect();
  const gap=6;
  const width=Math.min(Math.max(rect.width,330),420);
  picker.style.width=`${width}px`;
  picker.style.left=`${Math.min(rect.left, window.innerWidth-width-12)}px`;

  // Open upward if there is not enough room underneath.
  const estimatedHeight=Math.min(430, window.innerHeight-24);
  const topBelow=rect.bottom+gap;
  const topAbove=rect.top-estimatedHeight-gap;
  picker.style.top=`${topBelow+estimatedHeight > window.innerHeight && topAbove > 8 ? topAbove : topBelow}px`;
}

function closeMemberPicker(){
  const picker=$('#memberPicker');
  if(!picker) return;
  picker.classList.add('hidden');
  picker.setAttribute('aria-hidden','true');
  activePickerSlot=null;
  activePickerButton=null;
}

function renderPickerResults(){
  if(!activePickerSlot) return;
  const q=$('#pickerSearch').value.trim().toLowerCase();
  const available=getAvailableMembers(activePickerSlot);
  const filtered=available.filter(m=>`${m.ign} ${m.job}`.toLowerCase().includes(q));
  const currentId=assignments[currentRaid][activePickerSlot]||'';

  let html=`<button type="button" class="picker-option picker-clear ${!currentId?'selected':''}" data-member-id="">
    <span class="picker-empty-mark">×</span>
    <span><strong>Clear slot</strong><small>Leave this position empty</small></span>
  </button>`;

  if(filtered.length){
    html += filtered.map(m=>{
      const j=jobInfo(m.job);
      return `<button type="button" class="picker-option ${m.id===currentId?'selected':''}" data-member-id="${m.id}">
        <img src="${iconPath(j.icon)}" alt="" class="picker-job-icon">
        <span><strong>${esc(m.ign)}</strong><small>${esc(m.job)}</small></span>
        ${m.id===currentId?'<span class="picker-check">✓</span>':''}
      </button>`;
    }).join('');
  } else {
    html += `<div class="picker-no-results">No available member found for “${esc(q)}”.</div>`;
  }

  $('#pickerResults').innerHTML=html;
  $('#pickerAvailableCount').textContent=`${available.length} available`;
}

async function assignMemberToSlot(slotKey,newId){
  ensureRaidStore(currentRaid);
  const oldId=assignments[currentRaid][slotKey]||'';
  if(newId){
    const conflict=Object.entries(assignments[currentRaid]).find(([k,v])=>k!==slotKey && v===newId);
    if(conflict){
      const m=members.find(x=>x.id===newId);
      toast(`${m?.ign||'Member'} is already assigned in ${RAIDS[currentRaid].title}.`);
      return false;
    }
  }
  assignments[currentRaid][slotKey]=newId;
  const oldMember=members.find(x=>x.id===oldId);
  const newMember=members.find(x=>x.id===newId);
  closeMemberPicker(); renderRaid();
  await saveState('Raid Party Updated',RAIDS[currentRaid].title,{slot:slotKey,from:oldMember?.ign||'Empty',to:newMember?.ign||'Empty'});
  if(newId && newId!==oldId) toast(`${newMember?.ign||'Member'} assigned.`);
  else if(!newId && oldId) toast('Raid slot cleared.');
  return true;
}

function esc(v=''){
  return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function attr(v=''){ return esc(v); }


const JOB_EMOJI = {
  swordsman:'⚔️', mage:'🔮', archer:'🏹', acolyte:'✨', thief:'🗡️',
  merchant:'🔨', gunslinger:'🎯', druid:'🌿'
};

function dateStamp(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function downloadTextFile(filename,text,mime='text/plain;charset=utf-8'){
  const blob=new Blob([text],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function parseCsvText(text){
  const rows=[];
  let row=[], cell='', inQuotes=false;
  text=String(text||'').replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(inQuotes){
      if(ch==='"' && text[i+1]==='"'){ cell+='"'; i++; }
      else if(ch==='"') inQuotes=false;
      else cell+=ch;
    }else{
      if(ch==='"') inQuotes=true;
      else if(ch===','){ row.push(cell); cell=''; }
      else if(ch==='\n'){ row.push(cell.replace(/\r$/,'')); rows.push(row); row=[]; cell=''; }
      else cell+=ch;
    }
  }
  row.push(cell.replace(/\r$/,''));
  if(row.some(v=>v!=='')) rows.push(row);
  if(!rows.length) return [];
  const headers=rows[0].map(h=>h.trim());
  return rows.slice(1).filter(r=>r.some(v=>String(v).trim()!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}

function canonicalCsvIgn(v){
  const raw=String(v??'');
  // The game can export visually blank names using whitespace / Hangul filler characters.
  const visible=raw.replace(/[\s\u3164\uFFA0\u115F\u1160\u200B-\u200D\uFEFF]/gu,'');
  if(!visible) return '_';
  return raw.trim();
}
function exactIgnKey(v){
  const s=String(v??'').trim();
  if(!s || s==='_') return '__blank__';
  return s.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ');
}
function fuzzyIgnKey(v){
  return exactIgnKey(v)
    .replace(/[^\p{L}\p{N}]+/gu,'')
    .replace(/0/g,'o')
    .replace(/[i1l]/g,'l');
}
function levenshtein(a,b){
  a=[...a]; b=[...b];
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++) cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    for(let j=0;j<cur.length;j++) prev[j]=cur[j];
  }
  return prev[b.length];
}
function ignSimilarity(a,b){
  a=fuzzyIgnKey(a); b=fuzzyIgnKey(b);
  if(a===b) return 1;
  if(!a || !b) return 0;
  return 1-(levenshtein(a,b)/Math.max([...a].length,[...b].length));
}
function csvMemberFromRow(row,syncedAt){
  return {
    ign:canonicalCsvIgn(row['Player']),
    job:String(row['Class']||'').trim()||'Unknown',
    level:String(row['Lv.']||'').trim(),
    title:String(row['Title']||'').trim(),
    gender:String(row['Gender']||'').trim(),
    position:String(row['Position']||'').trim(),
    gearScore:String(row['Gear Score']||'').trim(),
    weekly:String(row['Weekly']||'').trim(),
    weeklyContribution:String(row['Weekly Contribution']||'').trim(),
    totalContribution:String(row['Total Contribution']||'').trim(),
    onlineStatus:String(row['Online Status']||'').trim(),
    gameSyncedAt:syncedAt
  };
}

function buildRosterSync(csvRows){
  const required=['Player','Class','Gear Score'];
  if(!csvRows.length) throw new Error('The CSV has no member rows.');
  const first=csvRows[0];
  const missing=required.filter(h=>!(h in first));
  if(missing.length) throw new Error(`This does not look like the game guild export. Missing: ${missing.join(', ')}`);

  const syncedAt=new Date().toISOString();
  const incoming=csvRows.map((row,index)=>({...csvMemberFromRow(row,syncedAt),_row:index+2}));
  const dupe=new Map();
  for(const x of incoming){
    const k=exactIgnKey(x.ign);
    if(dupe.has(k)) throw new Error(`Duplicate game IGN in CSV: ${x.ign}`);
    dupe.set(k,x);
  }

  const oldRemaining=new Set(members.map((_,i)=>i));
  const newRemaining=new Set(incoming.map((_,i)=>i));
  const pairs=[];

  // 1. Exact/NFKC match. This also treats website '_' as a blank in-game name.
  const byKey=new Map();
  members.forEach((m,i)=>{
    const k=exactIgnKey(m.ign);
    if(!byKey.has(k)) byKey.set(k,[]);
    byKey.get(k).push(i);
  });
  incoming.forEach((n,j)=>{
    const choices=(byKey.get(exactIgnKey(n.ign))||[]).filter(i=>oldRemaining.has(i));
    if(choices.length===1){
      const i=choices[0];
      pairs.push({oldIndex:i,newIndex:j,kind:'exact',similarity:1});
      oldRemaining.delete(i); newRemaining.delete(j);
    }
  });

  // 2. Conservative name-correction matching. CSV spelling wins after confirmation.
  let candidates=[];
  for(const i of oldRemaining) for(const j of newRemaining){
    const old=members[i], neu=incoming[j];
    const sim=ignSimilarity(old.ign,neu.ign);
    const sameJob=String(old.job||'').toLowerCase()===String(neu.job||'').toLowerCase();
    const samePosition=old.position && neu.position && String(old.position).toLowerCase()===String(neu.position).toLowerCase();
    let score=sim+(sameJob?0.18:0)+(samePosition?0.08:0);
    if(sim>=0.72 || (sameJob && sim>=0.55) || (sameJob && samePosition && sim>=0.42)) candidates.push({i,j,sim,score,sameJob});
  }
  candidates.sort((a,b)=>b.score-a.score);
  for(const c of candidates){
    if(!oldRemaining.has(c.i)||!newRemaining.has(c.j)) continue;
    pairs.push({oldIndex:c.i,newIndex:c.j,kind:'corrected',similarity:c.sim});
    oldRemaining.delete(c.i); newRemaining.delete(c.j);
  }

  // 3. If a class has exactly one old and one new unmatched member, treat it as a rename.
  const jobs=new Set([...oldRemaining].map(i=>members[i].job).concat([...newRemaining].map(j=>incoming[j].job)));
  for(const job of jobs){
    const oi=[...oldRemaining].filter(i=>members[i].job===job);
    const nj=[...newRemaining].filter(j=>incoming[j].job===job);
    if(oi.length===1 && nj.length===1){
      pairs.push({oldIndex:oi[0],newIndex:nj[0],kind:'corrected',similarity:ignSimilarity(members[oi[0]].ign,incoming[nj[0]].ign)});
      oldRemaining.delete(oi[0]); newRemaining.delete(nj[0]);
    }
  }

  const nextMembers=[];
  const corrections=[];
  const dataUpdates=[];
  for(const pair of pairs){
    const old=members[pair.oldIndex], neu=incoming[pair.newIndex];
    const nameChanged=String(old.ign)!==String(neu.ign);
    const changedFields=[];
    for(const key of ['job','level','position','gearScore','title','gender','weekly','weeklyContribution','totalContribution','onlineStatus']){
      if(String(old[key]??'')!==String(neu[key]??'')) changedFields.push(key);
    }
    const merged={...old,...neu,id:old.id};
    nextMembers.push(merged);
    if(nameChanged) corrections.push({id:old.id,from:old.ign,to:neu.ign,job:neu.job});
    if(changedFields.length) dataUpdates.push({ign:neu.ign,fields:changedFields});
  }

  const additions=[...newRemaining].map(j=>({...incoming[j],id:crypto.randomUUID()}));
  nextMembers.push(...additions);
  const removals=[...oldRemaining].map(i=>members[i]);

  // Follow the exact game CSV order, while keeping existing internal IDs for matched members.
  const order=new Map(incoming.map((m,i)=>[exactIgnKey(m.ign),i]));
  nextMembers.sort((a,b)=>(order.get(exactIgnKey(a.ign))??9999)-(order.get(exactIgnKey(b.ign))??9999));

  return {nextMembers,corrections,additions,removals,dataUpdates,csvCount:incoming.length,syncedAt};
}

function showRosterSyncPreview(sync){
  pendingRosterSync=sync;
  $('#syncCsvCount').textContent=sync.csvCount;
  $('#syncMatchedCount').textContent=sync.csvCount-sync.additions.length;
  $('#syncAddedCount').textContent=sync.additions.length;
  $('#syncRemovedCount').textContent=sync.removals.length;
  const changes=[];
  sync.corrections.forEach(x=>changes.push(`<div class="sync-change correction"><span>✏️ Name correction</span><strong>${esc(x.from)} → ${esc(x.to)}</strong><small>${esc(x.job)}</small></div>`));
  sync.additions.forEach(x=>changes.push(`<div class="sync-change addition"><span>➕ Add member</span><strong>${esc(x.ign)}</strong><small>${esc(x.job)} · GS ${Number(x.gearScore||0).toLocaleString()}</small></div>`));
  sync.removals.forEach(x=>changes.push(`<div class="sync-change removal"><span>➖ Remove member</span><strong>${esc(x.ign)}</strong><small>${esc(x.job)}</small></div>`));
  if(sync.dataUpdates.length) changes.push(`<div class="sync-change info"><span>🔄 Game data updates</span><strong>${sync.dataUpdates.length} matched member${sync.dataUpdates.length===1?'':'s'}</strong><small>Level / class / position / Gear Score / contribution fields will be refreshed.</small></div>`);
  $('#syncChanges').innerHTML=changes.length?changes.join(''):'<div class="sync-no-changes">Roster already matches the game CSV. Game stats will still be refreshed.</div>';
  $('#csvSyncModal').classList.remove('hidden');
  $('#csvSyncModal').setAttribute('aria-hidden','false');
}
function closeRosterSyncPreview(){
  $('#csvSyncModal').classList.add('hidden');
  $('#csvSyncModal').setAttribute('aria-hidden','true');
  pendingRosterSync=null;
  $('#gameCsvInput').value='';
}
async function confirmRosterSync(){
  if(!pendingRosterSync) return;
  const sync=pendingRosterSync;
  const removedIds=new Set(sync.removals.map(m=>m.id));
  members=sync.nextMembers;
  let clearedRaidSlots=0;
  Object.values(assignments).forEach(raid=>Object.keys(raid||{}).forEach(slot=>{
    if(removedIds.has(raid[slot])){ raid[slot]=''; clearedRaidSlots++; }
  }));
  cacheLocal(); renderMembers(); renderClassList(); renderRaid(); closeRosterSyncPreview();
  const details={
    csvMembers:sync.csvCount,
    finalMembers:members.length,
    matched:sync.csvCount-sync.additions.length,
    added:sync.additions.map(x=>x.ign),
    removed:sync.removals.map(x=>x.ign),
    nameCorrections:sync.corrections.map(x=>`${x.from} → ${x.to}`),
    gameDataUpdates:sync.dataUpdates.length,
    clearedRaidSlots
  };
  if(await saveState('Game CSV Sync','Guild Roster',details,true)) toast(`Game roster synced: ${members.length} members.`);
}
async function importGameCsvFile(file){
  try{
    const rows=parseCsvText(await file.text());
    const sync=buildRosterSync(rows);
    showRosterSyncPreview(sync);
  }catch(err){
    console.error(err);
    alert(`Could not import game CSV.\n\n${err.message||'Invalid CSV file.'}`);
    $('#gameCsvInput').value='';
  }
}

function raidReportText(markdown=true){
  const cfg=RAIDS[currentRaid];
  ensureRaidStore(currentRaid);
  const lines=[];
  lines.push(markdown?`**${cfg.title} — Raid Party**`:`${cfg.title} — Raid Party`);
  lines.push(`Assigned: ${assignedIdsForRaid(currentRaid).length}/${cfg.groups.reduce((a,[,n])=>a+n,0)*5}`);
  lines.push('');

  cfg.groups.forEach(([group,count])=>{
    lines.push(markdown?`**${group}**`:group.toUpperCase());
    for(let i=1;i<=count;i++){
      const names=[];
      for(let slot=1;slot<=5;slot++){
        const id=assignments[currentRaid][`${group}|${i}|${slot}`]||'';
        const m=members.find(x=>x.id===id);
        if(m){
          const j=jobInfo(m.job);
          names.push(`${JOB_EMOJI[j.icon]||'•'} ${m.ign} — ${m.job}`);
        }
      }
      // Keep the Discord copy concise: only include teams that currently have members.
      if(names.length) lines.push(`Team ${i}: ${names.join(' | ')}`);
    }
    if(!Array.from({length:count},(_,idx)=>idx+1).some(i=>{
      for(let slot=1;slot<=5;slot++) if(assignments[currentRaid][`${group}|${i}|${slot}`]) return true;
      return false;
    })) lines.push('No members assigned yet.');
    lines.push('');
  });
  return lines.join('\n').trim();
}

async function copyText(text){
  if(navigator.clipboard && window.isSecureContext){
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta=document.createElement('textarea');
  ta.value=text;
  ta.style.position='fixed';
  ta.style.opacity='0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok=document.execCommand('copy');
  ta.remove();
  if(!ok) throw new Error('Clipboard copy is not available.');
}

async function copyRaidForDiscord(){
  const text=raidReportText(true);
  try{
    await copyText(text);
    if(text.length>1900) toast('Copied. Long report: TXT upload is better for Discord.');
    else toast('Raid party copied for Discord.');
  } catch(err){
    console.error(err);
    alert('Clipboard copy failed. Use Download TXT instead.');
  }
}

function downloadRaidTxt(){
  const safeName=RAIDS[currentRaid].title.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'');
  downloadTextFile(`${safeName}-Raid-Party-${dateStamp()}.txt`,raidReportText(false));
  toast('Discord-friendly TXT downloaded.');
}

$('#importGameCsvBtn').addEventListener('click',()=>$('#gameCsvInput').click());
$('#gameCsvInput').addEventListener('change',e=>{
  const file=e.target.files?.[0];
  if(file) importGameCsvFile(file);
});
$('#confirmCsvSyncBtn').addEventListener('click',confirmRosterSync);
$$('[data-close-csv-sync]').forEach(x=>x.addEventListener('click',closeRosterSyncPreview));
$('#memberTable thead').addEventListener('click',e=>{
  const btn=e.target.closest('[data-sort-key]');
  if(!btn) return;
  const key=btn.dataset.sortKey;
  if(memberSort.key===key) memberSort.dir=memberSort.dir==='asc'?'desc':'asc';
  else memberSort={key,dir:key==='gearScore'?'desc':'asc'};
  renderMembers();
});

$('#copyDiscordBtn').addEventListener('click',copyRaidForDiscord);
$('#downloadRaidTxtBtn').addEventListener('click',downloadRaidTxt);

$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
  closeMemberPicker();
  $$('.nav-item').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  $$('.view').forEach(x=>x.classList.remove('active'));
  $(`#${btn.dataset.view}View`).classList.add('active');
  if(btn.dataset.view==='classes') renderClassList();
  if(btn.dataset.view==='raids') renderRaid();
  if(btn.dataset.view==='logs') loadLogs();
  if(btn.dataset.view==='accounts'){ loadAccounts(); loadSnapshots(); }
}));

$$('.raid-option').forEach(btn=>btn.addEventListener('click',()=>{
  closeMemberPicker();
  $$('.raid-option').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  currentRaid=btn.dataset.raid;
  renderRaid();
}));

$('#addMemberBtn').addEventListener('click',()=>openModal());
$('#memberSearch').addEventListener('input',renderMembers);
$('#memberForm').addEventListener('submit',handleMemberSubmit);
$('#memberTableBody').addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit]');
  const remove=e.target.closest('[data-remove]');
  if(edit) openModal(members.find(x=>x.id===edit.dataset.edit));
  if(remove) removeMember(remove.dataset.remove);
});


$('#classGrid').addEventListener('click',e=>{
  const card=e.target.closest('[data-class-name]');
  if(!card) return;
  selectedClass=card.dataset.className;
  renderClassList();
});

$('#classMembersPanel').addEventListener('click',e=>{
  const edit=e.target.closest('[data-class-edit]');
  if(edit) openModal(members.find(x=>x.id===edit.dataset.classEdit));
});

$('#partyGroups').addEventListener('click',e=>{
  const pickerBtn=e.target.closest('.slot-picker[data-slot]');
  if(!pickerBtn) return;
  if(activePickerSlot===pickerBtn.dataset.slot){ closeMemberPicker(); return; }
  openMemberPicker(pickerBtn);
});

$('#pickerSearch').addEventListener('input',renderPickerResults);
$('#pickerResults').addEventListener('click',e=>{
  const option=e.target.closest('[data-member-id]');
  if(!option || !activePickerSlot) return;
  assignMemberToSlot(activePickerSlot,option.dataset.memberId);
});

$$('[data-close-modal]').forEach(x=>x.addEventListener('click',closeModal));
document.addEventListener('click',e=>{
  const picker=$('#memberPicker');
  if(!picker.classList.contains('hidden') && !picker.contains(e.target) && !e.target.closest('.slot-picker')) closeMemberPicker();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    closeModal();
    closeMemberPicker();
    if(!$('#csvSyncModal').classList.contains('hidden')) closeRosterSyncPreview();
  }
});
window.addEventListener('resize',()=>{
  if(activePickerSlot) positionMemberPicker();
});
window.addEventListener('scroll',()=>{
  if(activePickerSlot) positionMemberPicker();
},true);

function formatLogDetails(details){
  if(!details || typeof details!=='object') return '—';
  if(details.before && details.after){
    const changed=[];
    for(const k of Object.keys(details.after)) if(String(details.before?.[k]??'')!==String(details.after?.[k]??'')) changed.push(`${k}: ${details.before?.[k]??'—'} → ${details.after[k]??'—'}`);
    return changed.join(' · ')||'No field changes';
  }
  if(Array.isArray(details.added)||Array.isArray(details.removed)){
    const bits=[];
    bits.push(`${details.csvMembers??'?'} CSV members`);
    if(details.added?.length) bits.push(`Added: ${details.added.join(', ')}`);
    if(details.removed?.length) bits.push(`Removed: ${details.removed.join(', ')}`);
    if(details.nameCorrections?.length) bits.push(`Corrected: ${details.nameCorrections.join(', ')}`);
    return bits.join(' · ');
  }
  return Object.entries(details).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):(v&&typeof v==='object'?JSON.stringify(v):v)}`).join(' · ')||'—';
}
async function loadLogs(){
  try{
    auditLogs=await rpc('gm_list_logs',{p_session_token:sessionToken,p_guild_id:GUILD_ID,p_limit:500})||[];
    const actions=[...new Set(auditLogs.map(x=>x.action_type).filter(Boolean))].sort();
    const sel=$('#logActionFilter'), current=sel.value;
    sel.innerHTML='<option value="">All actions</option>'+actions.map(x=>`<option value="${attr(x)}">${esc(x)}</option>`).join('');
    if(actions.includes(current)) sel.value=current;
    renderLogs();
  }catch(err){ console.error(err); toast('Could not load logs.'); }
}
function renderLogs(){
  const q=$('#logSearch').value.trim().toLowerCase();
  const a=$('#logActionFilter').value;
  const rows=auditLogs.filter(x=>(!a||x.action_type===a) && `${x.username} ${x.role} ${x.action_type} ${x.target} ${formatLogDetails(x.details)}`.toLowerCase().includes(q));
  $('#logsEmpty').style.display=rows.length?'none':'block';
  $('#logsTableBody').innerHTML=rows.map(x=>`<tr><td>${esc(new Date(x.created_at).toLocaleString())}</td><td><strong>${esc(x.username)}</strong></td><td><span class="role-badge ${x.role}">${esc(x.role)}</span></td><td>${esc(x.action_type)}</td><td>${esc(x.target||'—')}</td><td class="log-details">${esc(formatLogDetails(x.details))}</td></tr>`).join('');
}
async function loadAccounts(){
  if(currentUser?.role!=='developer') return;
  try{ accounts=await rpc('gm_list_accounts',{p_session_token:sessionToken,p_guild_id:GUILD_ID})||[]; renderAccounts(); }
  catch(err){ console.error(err); toast('Could not load accounts.'); }
}
function renderAccounts(){
  $('#accountsEmpty').style.display=accounts.length?'none':'block';
  $('#accountsTableBody').innerHTML=accounts.map(a=>`<tr><td><strong>${esc(a.username)}</strong></td><td><span class="role-badge ${a.role}">${esc(a.role)}</span></td><td><span class="status-badge ${a.active?'active':'disabled'}">${a.active?'Active':'Disabled'}</span></td><td>${a.last_login_at?esc(new Date(a.last_login_at).toLocaleString()):'Never'}</td><td class="actions">${a.role==='officer'?`<button class="action-btn" data-reset-account="${attr(a.id)}" data-account-name="${attr(a.username)}">Reset Password</button><button class="action-btn ${a.active?'danger':''}" data-toggle-account="${attr(a.id)}" data-account-active="${a.active?'1':'0'}">${a.active?'Disable':'Enable'}</button>`:'<span class="muted-small">Protected</span>'}</td></tr>`).join('');
}
async function loadSnapshots(){
  if(currentUser?.role!=='developer') return;
  try{ snapshots=await rpc('gm_list_snapshots',{p_session_token:sessionToken,p_guild_id:GUILD_ID,p_limit:100})||[]; renderSnapshots(); }
  catch(err){ console.error(err); toast('Could not load snapshots.'); }
}
function renderSnapshots(){
  $('#snapshotsEmpty').style.display=snapshots.length?'none':'block';
  $('#snapshotsTableBody').innerHTML=snapshots.map(s=>`<tr><td>${esc(new Date(s.created_at).toLocaleString())}</td><td>${esc(s.reason)}</td><td>${esc(s.username||'System')}</td><td>${Number(s.member_count||0).toLocaleString()}</td><td class="actions"><button class="action-btn" data-restore-snapshot="${attr(s.id)}">Restore</button></td></tr>`).join('');
}
async function restoreSnapshot(id){
  const snap=snapshots.find(x=>x.id===id);
  if(!snap) return;
  if(!confirm(`Restore the snapshot from ${new Date(snap.created_at).toLocaleString()}?\n\nThe current state will be saved as another safety snapshot first.`)) return;
  try{
    const data=await rpc('gm_restore_snapshot',{p_session_token:sessionToken,p_guild_id:GUILD_ID,p_snapshot_id:id});
    if(data?.members) applyRemoteState(data);
    toast('Safety snapshot restored.');
    await loadSnapshots(); await loadLogs();
  }catch(err){ alert(err.message||'Could not restore snapshot.'); }
}
async function createOfficer(e){
  e.preventDefault();
  const username=$('#newOfficerUsername').value.trim(), password=$('#newOfficerPassword').value;
  try{
    await rpc('gm_create_officer',{p_session_token:sessionToken,p_guild_id:GUILD_ID,p_username:username,p_password:password});
    e.target.reset(); toast(`Officer ${username} created.`); await loadAccounts(); await loadLogs();
  }catch(err){ alert(err.message||'Could not create officer.'); }
}
async function toggleAccount(id,active){
  const next=!active;
  if(!confirm(`${next?'Enable':'Disable'} this Officer account?`)) return;
  try{ await rpc('gm_set_account_active',{p_session_token:sessionToken,p_guild_id:GUILD_ID,p_account_id:id,p_active:next}); toast(`Officer ${next?'enabled':'disabled'}.`); await loadAccounts(); await loadLogs(); }
  catch(err){ alert(err.message||'Could not update account.'); }
}
async function resetAccountPassword(id,name){
  const password=prompt(`Enter a new temporary password for ${name}.\nMinimum 8 characters:`);
  if(password===null) return;
  if(password.length<8){ alert('Password must be at least 8 characters.'); return; }
  try{ await rpc('gm_reset_account_password',{p_session_token:sessionToken,p_guild_id:GUILD_ID,p_account_id:id,p_new_password:password}); toast(`Password reset for ${name}.`); await loadLogs(); }
  catch(err){ alert(err.message||'Could not reset password.'); }
}

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault(); authMessage('Signing in...');
  try{ await login($('#loginUsername').value.trim(),$('#loginPassword').value); authMessage(''); }
  catch(err){ authMessage(err.message||'Invalid username or password.',true); }
});
$('#bootstrapForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const u=$('#bootstrapUsername').value.trim(), p1=$('#bootstrapPassword').value, p2=$('#bootstrapPassword2').value;
  if(p1!==p2){ authMessage('Passwords do not match.',true); return; }
  authMessage('Creating Developer account...');
  try{ await bootstrapDeveloper(u,p1); await login(u,p1); authMessage(''); }
  catch(err){ authMessage(err.message||'Could not create Developer account.',true); }
});
$('#logoutBtn').addEventListener('click',()=>logout(true));
$('#refreshLogsBtn').addEventListener('click',loadLogs);
$('#logSearch').addEventListener('input',renderLogs);
$('#logActionFilter').addEventListener('change',renderLogs);
$('#createOfficerForm').addEventListener('submit',createOfficer);
$('#refreshAccountsBtn').addEventListener('click',loadAccounts);
$('#refreshSnapshotsBtn').addEventListener('click',loadSnapshots);
$('#snapshotsTableBody').addEventListener('click',e=>{ const b=e.target.closest('[data-restore-snapshot]'); if(b) restoreSnapshot(b.dataset.restoreSnapshot); });
$('#accountsTableBody').addEventListener('click',e=>{
  const t=e.target.closest('[data-toggle-account]');
  if(t) toggleAccount(t.dataset.toggleAccount,t.dataset.accountActive==='1');
  const r=e.target.closest('[data-reset-account]');
  if(r) resetAccountPassword(r.dataset.resetAccount,r.dataset.accountName);
});

async function initApp(){
  initJobSelect(); renderMembers(); renderClassList(); renderRaid(); showAuth();
  if(!supabaseClient){ authMessage('Supabase is not configured. Update config.js first.',true); return; }
  try{
    if(await restoreSession()) return;
    const exists=await hasAccounts();
    $('#loginMode').classList.toggle('hidden',!exists);
    $('#bootstrapMode').classList.toggle('hidden',exists);
  }catch(err){ authMessage(`Supabase setup is incomplete: ${err.message||err}`,true); }
}

initApp();
