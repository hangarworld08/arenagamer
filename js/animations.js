/* ============================================================
   HANGAR WORLD — CAMPEONATO FC26
   js/animations.js — animações de gol, revelação de vencedor e pódio
   Sem cor de time (mantém neutro/dourado), pensado pra ficar tranquilo
   tanto no celular quanto numa TV grande.
   ============================================================ */

function animRoot(){
  let root = document.getElementById('animRoot');
  if(!root){
    root = document.createElement('div');
    root.id = 'animRoot';
    document.body.appendChild(root);
  }
  return root;
}

function playGoalFlash(playerName){
  const root = animRoot();
  const el = document.createElement('div');
  el.className = 'goal-flash';
  el.innerHTML = `
    <div class="goal-flash__burst"></div>
    <div class="goal-flash__text">
      <span class="goal-flash__label">GOOOL</span>
      <span class="goal-flash__name">${esc(playerName)}</span>
    </div>`;
  root.appendChild(el);
  requestAnimationFrame(()=> el.classList.add('is-in'));
  setTimeout(()=>{ el.classList.remove('is-in'); el.classList.add('is-out'); }, 2200);
  setTimeout(()=> el.remove(), 2800);
}

function playWinnerReveal(playerName, subtitle){
  const root = animRoot();
  const el = document.createElement('div');
  el.className = 'winner-reveal';
  el.innerHTML = `
    <div class="winner-reveal__rays"></div>
    <div class="winner-reveal__content">
      <span class="winner-reveal__eyebrow">${esc(subtitle||'Vencedor')}</span>
      <span class="winner-reveal__name">${esc(playerName)}</span>
    </div>`;
  root.appendChild(el);
  requestAnimationFrame(()=> el.classList.add('is-in'));
  setTimeout(()=>{ el.classList.remove('is-in'); el.classList.add('is-out'); }, 4200);
  setTimeout(()=> el.remove(), 4900);
}

function playPodium(champion, runnerUp, third){
  const root = animRoot();
  const el = document.createElement('div');
  el.className = 'podium-overlay';
  el.innerHTML = `
    <div class="podium-overlay__title">CAMPEÃO HANGAR WORLD</div>
    <div class="podium">
      <div class="podium__step podium__step--2">
        <div class="podium__name">${esc(runnerUp||'—')}</div>
        <div class="podium__block">2</div>
      </div>
      <div class="podium__step podium__step--1">
        <div class="podium__name podium__name--champ">${esc(champion||'—')}</div>
        <div class="podium__block">1</div>
      </div>
      <div class="podium__step podium__step--3">
        <div class="podium__name">${esc(third||'—')}</div>
        <div class="podium__block">3</div>
      </div>
    </div>
    <button class="btn btn--ghost podium-overlay__close" id="closePodiumBtn">Fechar</button>
  `;
  root.appendChild(el);
  requestAnimationFrame(()=> el.classList.add('is-in'));
  el.querySelector('#closePodiumBtn').addEventListener('click', ()=> el.remove());
}
