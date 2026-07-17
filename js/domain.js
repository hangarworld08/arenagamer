/* ============================================================
   HANGAR WORLD — CAMPEONATO FC26
   js/domain.js — funções puras compartilhadas pelo front-end
   (público e admin), operando sobre dados já carregados do Supabase.
   ============================================================ */

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H'];
if(typeof window !== 'undefined') window.GROUP_LETTERS = GROUP_LETTERS;

const ROUND_LABELS = {
  r16: 'Oitavas de Final',
  qf: 'Quartas de Final',
  sf: 'Semifinal',
  third: 'Disputa de 3º Lugar',
  final: 'Final',
};

function esc(str){
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function getPlayerName(players, id){
  const p = players.find(pl=>pl.id===id);
  return p ? p.name : '—';
}

function computeStandings(groupLetter, players, groupMatches){
  const ids = players.filter(p=>p.group_letter===groupLetter).map(p=>p.id);
  const table = {};
  ids.forEach(id=> table[id] = {id, pts:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,played:0});

  groupMatches.filter(m=>m.group_letter===groupLetter && m.status==='done').forEach(m=>{
    const t1=table[m.p1], t2=table[m.p2];
    if(!t1||!t2) return;
    t1.gf+=m.score1; t1.ga+=m.score2; t2.gf+=m.score2; t2.ga+=m.score1;
    t1.played++; t2.played++;
    if(m.score1>m.score2){ t1.w++; t1.pts+=3; t2.l++; }
    else if(m.score1<m.score2){ t2.w++; t2.pts+=3; t1.l++; }
    else { t1.d++; t2.d++; t1.pts+=1; t2.pts+=1; }
  });
  Object.values(table).forEach(t=> t.gd = t.gf-t.ga);

  function h2h(id1,id2){
    const m = groupMatches.find(mm=>mm.group_letter===groupLetter && mm.status==='done' &&
      ((mm.p1===id1&&mm.p2===id2)||(mm.p1===id2&&mm.p2===id1)));
    if(!m) return 0;
    const s1 = m.p1===id1?m.score1:m.score2;
    const s2 = m.p1===id1?m.score2:m.score1;
    return s1-s2;
  }

  return Object.values(table).sort((a,b)=>{
    if(b.pts!==a.pts) return b.pts-a.pts;
    if(b.gd!==a.gd) return b.gd-a.gd;
    if(b.gf!==a.gf) return b.gf-a.gf;
    const h = h2h(a.id,b.id);
    if(h!==0) return -h;
    return 0;
  });
}

function groupComplete(letter, groupMatches){
  const gm = groupMatches.filter(m=>m.group_letter===letter);
  return gm.length===4 && gm.every(m=>m.status==='done');
}
function allGroupsComplete(groupMatches){
  return GROUP_LETTERS.every(letter=>groupComplete(letter, groupMatches));
}

function formatTime(iso){
  if(!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function roundLabel(round){ return ROUND_LABELS[round] || round; }

function matchLabel(m){
  return m.group_letter ? ('Grupo ' + m.group_letter) : roundLabel(m.round);
}
