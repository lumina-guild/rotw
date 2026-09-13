const JOBS = [
  ['Lord Knight','swordsman'],['Paladin','swordsman'],['High Wizard','mage'],['Sage','mage'],
  ['Assassin Cross','thief'],['Stalker','thief'],['Sniper','archer'],['Bard','archer'],['Dancer','archer'],
  ['High Priest','acolyte'],['Champion','acolyte'],['Whitesmith','merchant'],['Alchemist','merchant'],
  ['Rebel','gunslinger'],['Night Watch','gunslinger'],['Kanos','druid'],['Alithea','druid']
];

const RAIDS = {
  guildLeague:{title:'Guild League',groups:[['Alpha Party',8],['Beta Party',4],['Charlie Party',8],['Delta Party',8],['Echo Party',8]]},
  polarityZone:{title:'Polarity Zone',groups:[['Elite Party',10],['Sub-Party',24]]},
  guildSiege:{title:'Guild Siege',groups:[['Alpha Party',8],['Beta Party',8],['Charlie Party',8],['Delta Party',8]]},
  mirrorWorld:{title:'Mirror World',groups:[['Elite Party',10],['Sub-Party A',8],['Sub-Party B',8],['Sub-Party C',8]]}
};

let members = JSON.parse(localStorage.getItem('gm_members') || '[]');
let assignments = JSON.parse(localStorage.getItem('gm_assignments') || '{}');
let editingId = null;
let currentRaid = 'guildLeague';
let selectedClass = null;
let activePickerSlot = null;
let activePickerButton = null;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const iconPath = key => `resources/${key}.png`;
const save = () => {
  localStorage.setItem('gm_members', JSON.stringify(members));
  localStorage.setItem('gm_assignments', JSON.stringify(assignments));
};

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

function renderMembers(){
  const q=$('#memberSearch').value.trim().toLowerCase();
  const filtered=members.filter(m=>`${m.ign} ${m.job}`.toLowerCase().includes(q));
  $('#memberCount').textContent=`${members.length} member${members.length===1?'':'s'}`;
  $('#memberEmpty').style.display=filtered.length?'none':'block';
  $('#memberTableBody').innerHTML=filtered.map(m=>{
    const j=jobInfo(m.job);
    return `<tr>
      <td><div class="member-cell"><div class="member-avatar">${initials(m.ign)}</div><strong>${esc(m.ign)}</strong></div></td>
      <td><div class="job-cell"><img class="job-icon" src="${iconPath(j.icon)}" alt=""><span>${esc(m.job)}</span></div></td>
      <td class="actions"><button class="action-btn" data-edit="${m.id}">Edit</button><button class="action-btn danger" data-remove="${m.id}">Remove</button></td>
    </tr>`;
  }).join('');
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

function handleMemberSubmit(e){
  e.preventDefault();
  const ign=$('#ignInput').value.trim();
  const job=$('#jobSelect').value;
  if(!ign) return;
  const dupe=members.find(m=>m.ign.toLowerCase()===ign.toLowerCase() && m.id!==editingId);
  if(dupe){ toast('That IGN already exists.'); return; }
  if(editingId){
    const m=members.find(x=>x.id===editingId);
    m.ign=ign;
    m.job=job;
    toast('Member updated.');
  } else {
    members.push({id:crypto.randomUUID(),ign,job});
    toast('Member added.');
  }
  save();
  renderMembers();
  renderClassList();
  renderRaid();
  closeModal();
}

function removeMember(id){
  const m=members.find(x=>x.id===id);
  if(!m) return;
  if(!confirm(`Remove ${m.ign} from the guild roster?`)) return;
  members=members.filter(x=>x.id!==id);
  Object.values(assignments).forEach(raid=>Object.keys(raid||{}).forEach(slot=>{
    if(raid[slot]===id) raid[slot]='';
  }));
  save();
  renderMembers();
  renderClassList();
  renderRaid();
  toast('Member removed.');
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

function assignMemberToSlot(slotKey,newId){
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
  save();
  closeMemberPicker();
  renderRaid();
  if(newId && newId!==oldId){
    const m=members.find(x=>x.id===newId);
    toast(`${m?.ign||'Member'} assigned.`);
  }
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

function exportBackup(){
  const data={
    app:'Guild Manager',
    formatVersion:1,
    exportedAt:new Date().toISOString(),
    members,
    assignments
  };
  downloadTextFile(`Guild-Manager-Backup-${dateStamp()}.json`,JSON.stringify(data,null,2),'application/json;charset=utf-8');
  toast('JSON backup downloaded.');
}

function normalizeImportedBackup(raw){
  if(!raw || typeof raw!=='object') throw new Error('Invalid backup file.');
  const incomingMembers=Array.isArray(raw.members)?raw.members:null;
  const incomingAssignments=raw.assignments && typeof raw.assignments==='object' && !Array.isArray(raw.assignments)?raw.assignments:null;
  if(!incomingMembers || !incomingAssignments) throw new Error('This JSON does not contain guild members and raid assignments.');

  const allowedJobs=new Set(JOBS.map(([name])=>name));
  const seenIgn=new Set();
  const cleanMembers=[];
  for(const item of incomingMembers){
    if(!item || typeof item!=='object') continue;
    const ign=String(item.ign||'').trim();
    const job=String(item.job||'').trim();
    if(!ign || !allowedJobs.has(job)) continue;
    const key=ign.toLowerCase();
    if(seenIgn.has(key)) throw new Error(`Duplicate IGN found in backup: ${ign}`);
    seenIgn.add(key);
    cleanMembers.push({id:String(item.id||crypto.randomUUID()),ign,job});
  }

  const validIds=new Set(cleanMembers.map(m=>m.id));
  const cleanAssignments={};
  Object.keys(RAIDS).forEach(raidKey=>{
    cleanAssignments[raidKey]={};
    const src=incomingAssignments[raidKey];
    if(!src || typeof src!=='object' || Array.isArray(src)) return;
    const used=new Set();
    for(const [slot,idValue] of Object.entries(src)){
      const id=String(idValue||'');
      if(!id || !validIds.has(id) || used.has(id)) continue;
      cleanAssignments[raidKey][String(slot)]=id;
      used.add(id);
    }
  });

  return {members:cleanMembers,assignments:cleanAssignments};
}

async function importBackupFile(file){
  try{
    const text=await file.text();
    const parsed=JSON.parse(text);
    const clean=normalizeImportedBackup(parsed);
    if(!confirm(`Import ${clean.members.length} members and replace the current guild data in this browser?`)) return;
    members=clean.members;
    assignments=clean.assignments;
    save();
    renderMembers();
    renderClassList();
    renderRaid();
    toast('JSON backup imported.');
  } catch(err){
    console.error(err);
    alert(`Could not import backup.\n\n${err.message||'Invalid JSON file.'}`);
  } finally {
    $('#backupFileInput').value='';
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

$('#exportBackupBtn').addEventListener('click',exportBackup);
$('#importBackupBtn').addEventListener('click',()=>$('#backupFileInput').click());
$('#backupFileInput').addEventListener('change',e=>{
  const file=e.target.files?.[0];
  if(file) importBackupFile(file);
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
  }
});
window.addEventListener('resize',()=>{
  if(activePickerSlot) positionMemberPicker();
});
window.addEventListener('scroll',()=>{
  if(activePickerSlot) positionMemberPicker();
},true);

initJobSelect();
renderMembers();
renderClassList();
renderRaid();
