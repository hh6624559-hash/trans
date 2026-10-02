const PALETTE = ['#FF5D73','#17A398','#7C5CFC','#FFB627','#2EC4F1','#F4708A','#0FB8A8','#9B7BFF','#FFA53D','#5BD1FF'];
const CHAPTER2_DATA = [];
const CHAPTER3_DATA = [];
const CHAPTER3_WORDS = CHAPTER3_DATA;

const CHAPTER2_WORDS = CHAPTER2_DATA;

const ALL_WORDS = CHAPTER1_WORDS.concat(CHAPTER2_WORDS, CHAPTER3_WORDS);
const TARGET_PER_CHAPTER = 30; // 300 từ chia đều cho 10 chương, mỗi chương 30 từ
const N_CHAPTERS = 10;
const perNow = Math.ceil(ALL_WORDS.length / N_CHAPTERS);
const CHAPTERS = [];
for(let i=0;i<N_CHAPTERS;i++){
  CHAPTERS.push({
    id:i+1, label:'Chương '+(i+1), color:PALETTE[i%PALETTE.length],
    words:ALL_WORDS.slice(i*perNow, (i+1)*perNow), locked:false, isSummary:false
  });
}
CHAPTERS.push({
  id:N_CHAPTERS+1, label:'📚 Tổng hợp', color:'#2b1e3d',
  words:ALL_WORDS.slice(), locked:false, isSummary:true
});
const POOL = ALL_WORDS;

let testQuestions = [], idx = 0, testInProgress = false, chosenSize = 25;
let flashIdx = 0, currentChapter = null;

const quizArea = document.getElementById('quizArea');
const navGrid = document.getElementById('navGrid');
const tabStudy = document.getElementById('tabStudy');
const tabQuiz = document.getElementById('tabQuiz');
const studyWrap = document.getElementById('studyWrap');
const quizWrap = document.getElementById('quizWrap');
const startScreen = document.getElementById('startScreen');
const testScreen = document.getElementById('testScreen');
const flashcard = document.getElementById('flashcard');
const flashCount = document.getElementById('flashCount');
const totalCount = document.getElementById('totalCount');

let answers = [];

function colorFor(i){ return PALETTE[i % PALETTE.length]; }
function hexToRgba(hex, a){
  const v = hex.replace('#','');
  const r = parseInt(v.substring(0,2),16), g = parseInt(v.substring(2,4),16), b = parseInt(v.substring(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

// ---- Engine chọn câu hỏi theo từ: mỗi từ có tối đa 7 câu (variants).
// Mỗi lần từ đó xuất hiện trong bài thi, hệ thống lấy 1 câu CHƯA dùng trong "vòng" hiện tại.
// Khi cả 7 câu đã được dùng hết mới xáo trộn lại và bắt đầu vòng mới (không lặp câu vừa dùng ngay).
function loadVariantUsage(){
  return window.__USAGE || {};
}
function saveVariantUsage(store){
  window.__USAGE = store; TRS6.saveUsage(store);
}
let variantUsage = loadVariantUsage();

function pickVariantFor(wordObj){
  const variants = wordObj.variants;
  const n = variants.length;
  if(n <= 1) return variants[0];
  const key = wordObj.w;
  let entry = variantUsage[key];
  if(!entry || !Array.isArray(entry.order) || entry.order.length !== n){
    entry = { order: shuffle([...Array(n).keys()]), pos: 0 };
  }
  if(entry.pos >= entry.order.length){
    const lastUsed = entry.order[entry.order.length-1];
    let newOrder = shuffle([...Array(n).keys()]);
    if(newOrder[0] === lastUsed){
      [newOrder[0], newOrder[1]] = [newOrder[1], newOrder[0]];
    }
    entry = { order: newOrder, pos: 0 };
  }
  const variantIdx = entry.order[entry.pos];
  entry.pos += 1;
  variantUsage[key] = entry;
  saveVariantUsage(variantUsage);
  return variants[variantIdx];
}

function generateTest(size){
  const n = Math.min(size, POOL.length);
  const pickedIdx = shuffle(POOL.map((_,i)=>i)).slice(0, n);
  testQuestions = pickedIdx.map(pi=>{
    const src = POOL[pi];
    const variant = pickVariantFor(src);
    const order = shuffle(variant.opts.map((_,i)=>i));
    const newOpts = order.map(i=>variant.opts[i]);
    const newDefs = order.map(i=>(variant.defs ? variant.defs[i] : null));
    const newCorrect = order.indexOf(variant.correct);
    return { w:src.w, s:variant.s, opts:newOpts, defs:newDefs, correct:newCorrect, exp:variant.exp, emoji:variant.emoji, tip:variant.tip, trans:variant.trans, part:'Part 1' };
  });
  answers = new Array(testQuestions.length).fill(null);
  idx = 0;
}

function renderStartScreen(){
  startScreen.innerHTML = `
    <div class="startcard">
      <div class="partlabel">🎲 Random trong kho đầy đủ ${POOL.length} từ — không phân biệt chương</div>
      <div class="starticon">🎲</div>
      <h2>Bắt đầu bài kiểm tra mới</h2>
      <p>Mỗi lượt thi, câu hỏi sẽ được <b>xáo trộn ngẫu nhiên</b> — cả thứ tự câu lẫn thứ tự đáp án A/B/C/D — nên không lượt nào giống lượt nào. Trong lúc thi, bạn <b>không thể quay lại xem thẻ từ vựng</b>, đúng như một bài thi thật.</p>
      <div class="sizepick" id="sizePick">
        ${Array.from(new Set([25,50,75,100,150,200,250,300].filter(n=>n<=POOL.length).concat(POOL.length>=25?[POOL.length]:[]))).sort((a,b)=>a-b).map(n=>`<button class="sizebtn ${n===chosenSize?'active':''}" data-n="${n}">${n} câu</button>`).join('')}
      </div>
      <button class="startgo" id="startGoBtn">🚀 Bắt đầu bài kiểm tra</button>
    </div>`;
  startScreen.querySelectorAll('.sizebtn').forEach(b=>{
    b.onclick = ()=>{
      chosenSize = parseInt(b.dataset.n);
      startScreen.querySelectorAll('.sizebtn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    };
  });
  document.getElementById('startGoBtn').onclick = beginTest;
}

function beginTest(){
  generateTest(chosenSize);
  testInProgress = true;
  totalCount.textContent = testQuestions.length;
  lockStudyTab(true);
  startScreen.style.display = 'none';
  testScreen.style.display = 'block';
  renderQuiz();
}

function lockStudyTab(locked){
  tabStudy.classList.toggle('locked', locked);
}

function updateScorebar(){
  const done = answers.filter(a=>a!==null).length;
  const correct = answers.filter(a=>a===true).length;
  const wrong = answers.filter(a=>a===false).length;
  document.getElementById('doneCount').textContent = done;
  document.getElementById('correctCount').textContent = correct;
  document.getElementById('wrongCount').textContent = wrong;
}

function buildNavGrid(){
  navGrid.innerHTML = testQuestions.map((q,i)=>{
    let cls = 'navcell';
    if(i===idx) cls += ' current';
    if(answers[i]===true) cls += ' correct';
    if(answers[i]===false) cls += ' wrong';
    return `<div class="${cls}" data-i="${i}">${i+1}</div>`;
  }).join('');
  navGrid.querySelectorAll('.navcell').forEach(c=>{
    c.addEventListener('click', ()=>{ idx = parseInt(c.dataset.i); renderQuiz(); });
  });
}

function renderQuiz(){
  buildNavGrid();
  updateScorebar();
  if(idx >= testQuestions.length){ renderResults(); return; }
  const q = testQuestions[idx];
  const c = colorFor(idx);
  const already = answers[idx] !== null;
  const optsHtml = q.opts.map((o,i)=>{
    const letter = String.fromCharCode(65+i);
    return `<button class="opt" data-i="${i}"><span class="letter">${letter}</span><span>${o}</span></button>`;
  }).join('');
  quizArea.innerHTML = `
    <div class="qcard">
      <div class="qhead">
        <div class="qnum-badge" style="background:${c};">${idx+1}</div>
        <div class="qhint">Chọn từ phù hợp nhất để hoàn thành câu ${q.emoji}</div>
      </div>
      <p class="sentence">${q.s.replace('___', `<span class="blank" style="background:${hexToRgba(c,.16)}; color:${c};">＿＿＿</span>`)}</p>
      <div class="options">${optsHtml}</div>
      <div class="explain" id="explainBox"></div>
      <div class="actions">
        <button class="navbtn" id="prevBtn" ${idx===0?'disabled':''}>← Câu trước</button>
        <button class="next" id="nextBtn">Câu tiếp theo →</button>
      </div>
    </div>`;
  document.getElementById('prevBtn').onclick = ()=>{ idx = Math.max(0, idx-1); renderQuiz(); };
  if(already){
    revealAnswer(q, null, true);
  } else {
    document.querySelectorAll('.opt').forEach(btn=>{
      btn.addEventListener('click', ()=>onAnswer(parseInt(btn.dataset.i)));
    });
  }
}

function onAnswer(choice){
  const q = testQuestions[idx];
  const correct = choice === q.correct;
  answers[idx] = correct;
  revealAnswer(q, choice, false);
  buildNavGrid();
  updateScorebar();
}

const POS_LABEL = {n:'Danh từ', v:'Động từ', adj:'Tính từ', adv:'Trạng từ', a:'Tính từ'};

function buildExplainBody(q){
  const posMatch = q.exp.match(/\(([a-z]{1,4})\)/i);
  const posTag = posMatch ? POS_LABEL[posMatch[1].toLowerCase()] : null;
  const fullSentence = q.s.replace('___', `<b class="hlword">${q.opts[q.correct]}</b>`);
  // split explanation into digestible sentences
  const rawParts = q.exp.split(/(?<=[.!?])\s+(?=[A-ZĐ'"])/).map(x=>x.trim()).filter(Boolean);
  const badWords = ['không hợp','sai nghĩa','trái nghĩa','không liên quan','không phù hợp','không đi','không diễn tả','không tự nhiên','đều sai','đều không','sai vị trí','sai hoàn toàn','thiếu sắc thái','mang nghĩa ngược','nghĩa ngược','gần nghĩa nhưng'];
  const lines = rawParts.map((sent,i)=>{
    const isDistractor = badWords.some(w=>sent.toLowerCase().includes(w));
    const icon = i===0 ? '📖' : (isDistractor ? '🔍' : '✅');
    const label = i===0 ? 'Nghĩa của từ' : (isDistractor ? 'Phân biệt với đáp án khác' : 'Vì sao hợp ngữ cảnh');
    return `<div class="exp-line"><span class="exp-icon">${icon}</span><div><span class="exp-label">${label}</span><div>${sent}</div></div></div>`;
  }).join('');
  const optsMeaningHtml = (q.defs && q.opts) ? `
      <div class="optdefs-box">
        <div class="fs-label">🇻🇳 Nghĩa từng đáp án</div>
        <div class="optdefs-list">
          ${q.opts.map((o,i)=>{
            const d = q.defs[i] || {pos:'', meaning:''};
            const isCorrect = i === q.correct;
            const posStr = d.pos ? `<i>(${d.pos})</i> ` : '';
            return `<div class="optdef-row ${isCorrect?'is-correct':'is-wrong'}">
              <span class="optdef-mark">${isCorrect?'✅':'❌'}</span>
              <span class="optdef-text"><b>${o}</b> — ${posStr}${d.meaning || 'không hợp nghĩa trong câu này'}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';
  return `
    <div class="explain-body">
      <div class="full-sentence-box">
        <div class="fs-label">📝 Câu hoàn chỉnh${posTag ? ' · <span class="postag">'+posTag+'</span>' : ''}</div>
        <div class="fs-text">${fullSentence}</div>
      </div>
      <div class="exp-sections">${lines}</div>
      ${optsMeaningHtml}
      ${q.trans ? `<div class="trans-box"><div class="fs-label">🇻🇳 Dịch nghĩa cả câu</div><div class="fs-text trans-text">${q.trans}</div></div>` : ''}
      <div class="tip-box"><span class="tipicon">💡</span><span><b>Mẹo nhớ nhanh:</b> ${q.tip}</span></div>
    </div>`;
}

function revealAnswer(q, choice, isReplay){
  const buttons = document.querySelectorAll('.opt');
  buttons.forEach((b,i)=>{
    b.disabled = true;
    if(i === q.correct){
      b.classList.add('correct');
      b.insertAdjacentHTML('beforeend', '<span class="mark correct">🎉</span>');
    }
    if(!isReplay && i === choice && choice !== q.correct){
      b.classList.add('wrong');
      b.insertAdjacentHTML('beforeend', '<span class="mark wrong">💥</span>');
    }
  });
  const correctChoice = isReplay ? answers[idx] : (choice === q.correct);
  const box = document.getElementById('explainBox');
  box.classList.add('show', correctChoice ? 'right-verdict' : 'wrong-verdict');
  box.innerHTML = `
    <div class="explain-top">
      <div class="explain-emoji">${q.emoji}</div>
      <div>
        <div class="verdict">${correctChoice ? 'Chính xác, quá đỉnh!' : 'Chưa đúng — đáp án là "'+q.opts[q.correct]+'"'}</div>
        <div class="wordtag">${q.w}</div>
      </div>
    </div>
    ${buildExplainBody(q)}`;
  const nextBtn = document.getElementById('nextBtn');
  nextBtn.classList.add('show');
  nextBtn.onclick = ()=>{ idx++; renderQuiz(); };
}

function renderResults(){
  testInProgress = false;
  lockStudyTab(false);
  const correct = answers.filter(a=>a===true).length;
  const total = testQuestions.length;
  const pct = Math.round(correct/total*100);
  if(!testQuestions._saved){ testQuestions._saved = true; TRS6.saveAttempt({total, correct, words:testQuestions.map((q,i)=>({w:q.w, ok:answers[i]===true}))}); }
  let stampClass = 'low', stampText = '💪 Cần ôn thêm';
  if(pct >= 85){ stampClass=''; stampText='🏆 Xuất sắc!'; }
  else if(pct >= 65){ stampClass='mid'; stampText='🌟 Khá tốt!'; }
  const missed = testQuestions.map((q,i)=>({q,i})).filter(x=>answers[x.i]===false);
  const missedHtml = missed.length ? `
    <div class="missed-list">
      <h3>📌 Những từ cần ôn lại (${missed.length})</h3>
      ${missed.map(x=>`<div class="missed-item">${x.q.emoji} <b>${x.q.w}</b> — câu ${x.i+1}: "${x.q.s.replace('___', x.q.opts[x.q.correct])}"</div>`).join('')}
    </div>` : `<div class="batchnote">🎉 Không có từ nào cần ôn lại — quá đỉnh!</div>`;
  quizArea.innerHTML = `
    <div class="done">
      <div class="resultcard">
        <div class="qhint">KẾT QUẢ BÀI THI ĐẤU</div>
        <div class="bigscore">${correct}/${total}</div>
        <div class="pct">Tỉ lệ đúng: ${pct}%</div>
        <div class="grade-stamp ${stampClass}">${stampText}</div>
        <div class="resultbtns">
          <button class="btn-primary" id="restartBtn">🎲 Bài kiểm tra mới (ngẫu nhiên)</button>
          <button class="btn-ghost" id="reviewMissedBtn" ${missed.length? '' : 'disabled'}>📖 Ôn lại từ sai</button>
        </div>
        ${missedHtml}
        <div class="batchnote">🎉 Kho từ vựng đã đầy đủ 300/300 từ (cả 5 chương) — mỗi lượt thi mới sẽ random hoàn toàn trong toàn bộ kho từ này.</div>
      </div>
    </div>`;
  document.getElementById('restartBtn').onclick = ()=>{
    testScreen.style.display = 'none';
    startScreen.style.display = 'block';
    renderStartScreen();
  };
  if(missed.length){
    document.getElementById('reviewMissedBtn').onclick = ()=>{ idx = missed[0].i; testInProgress = true; lockStudyTab(true); renderQuiz(); };
  }
}

function renderChapterPicker(){
  const chapterPicker = document.getElementById('chapterPicker');
  chapterPicker.innerHTML = `
    <div class="studypicker-intro">10 chương đã đầy đủ (mỗi chương 30 từ) + 1 chương Tổng hợp gồm cả 300 từ — bấm vào chương bất kỳ để xem từng thẻ từ 📇</div>
    <div class="chapter-grid">
      ${CHAPTERS.map(ch=>`
        <button class="chapter-card" style="background:${ch.color};" data-id="${ch.id}">
          <div class="chapter-num">${ch.isSummary ? '📚' : ch.id}</div>
          <div class="chapter-info">
            <div class="chapter-title">${ch.label}</div>
            <div class="chapter-range">${ch.isSummary ? `${ch.words.length} từ — cả kho từ vựng` : `${ch.words.length}/${TARGET_PER_CHAPTER} từ`}</div>
          </div>
          <div class="chapter-status">📖 Học ngay</div>
        </button>`).join('')}
    </div>`;
  chapterPicker.querySelectorAll('.chapter-card').forEach(btn=>{
    btn.onclick = ()=>{
      currentChapter = CHAPTERS.find(c=>c.id===parseInt(btn.dataset.id));
      flashIdx = 0;
      document.getElementById('chapterPicker').style.display = 'none';
      document.getElementById('flashSection').style.display = 'block';
      renderFlash();
    };
  });
}

document.getElementById('backToChapters').onclick = ()=>{
  document.getElementById('flashSection').style.display = 'none';
  document.getElementById('chapterPicker').style.display = 'block';
};

function renderFlash(){
  const words = currentChapter.words;
  const w = words[flashIdx];
  const q = w.variants[0];
  const c = currentChapter.color;
  const posMatch = q.exp.match(/\(([a-z]{1,4})\)/i);
  const pos = posMatch ? posMatch[1] : '';
  const defMatch = q.exp.split('.')[0].replace(/^[a-zA-Z\- ]+\([a-z]+\)\s*=\s*/,'');
  flashcard.style.background = `linear-gradient(135deg, ${c}, ${colorFor(flashIdx+2)})`;
  flashcard.innerHTML = `
    <div class="flash-emoji">${q.emoji}</div>
    <div class="flash-pos">${pos ? pos.toUpperCase() : ''}</div>
    <div class="flash-word">${w.w}</div>
    <div class="flash-def">${defMatch}</div>
    <div class="flash-ex">${q.s.replace('___', '<b>'+q.opts[q.correct]+'</b>')}</div>`;
  flashCount.textContent = `${flashIdx+1} / ${words.length}`;
  document.getElementById('flashPrev').disabled = flashIdx===0;
  document.getElementById('flashNext').textContent = flashIdx===words.length-1 ? 'Vào thi đấu →' : 'Tiếp →';
}

document.getElementById('flashPrev').onclick = ()=>{ flashIdx=Math.max(0,flashIdx-1); renderFlash(); };
document.getElementById('flashNext').onclick = ()=>{
  if(flashIdx===currentChapter.words.length-1){ switchMode('quiz'); return; }
  flashIdx++; renderFlash();
};

function switchMode(m){
  if(m==='study' && testInProgress) return; // locked during solo test
  tabStudy.classList.toggle('active', m==='study');
  tabQuiz.classList.toggle('active', m==='quiz');
  tabMulti.classList.toggle('active', m==='multi');
  studyWrap.classList.toggle('show', m==='study');
  quizWrap.style.display = m==='quiz' ? 'block' : 'none';
  multiWrap.style.display = m==='multi' ? 'block' : 'none';
  if(m==='quiz' && testScreen.style.display==='none' && !testInProgress) renderStartScreen();
}
tabStudy.onclick = ()=>switchMode('study');
tabQuiz.onclick = ()=>switchMode('quiz');
const tabMulti = document.getElementById('tabMulti');
tabMulti.onclick = ()=>switchMode('multi');

/* ================= ĐẤU BẠN BÈ (realtime qua máy chủ) ================= */
const mpHome = document.getElementById('mpHome');
const mpLobby = document.getElementById('mpLobby');
const mpBattle = document.getElementById('mpBattle');
const multiWrap = document.getElementById('multiWrap');
const lbPanel = document.getElementById('lbPanel');
const mpQuizArea = document.getElementById('mpQuizArea');

let roomNS = null, myRoomCode = null, myName = '', isHost = false;
let mpTest = [], mpIdx = 0, mpScore = 0, mpAnswers = [];
let chatLog = [], unsubChat = null, unsubPeers = null, unsubStream = null, unsubSpeaking = null, unsubCallState = null;
let mpScreen = 'home'; // home | lobby | battle | results
let micOn = false, camOn = false, myLastRound = 0;
let remoteMediaStreams = {}; // peerId -> MediaStream hiện tại (để vẽ video khi cần)
const QCOUNT_OPTIONS = [10,15,20,25,30,40,50,75,100];
let hostQCount = Math.min(25, POOL.length);
const ROUND_OPTIONS = [1,3,5,7,10]; // số round trong 1 trận đấu, giống Best-of-N ngoài đời thật
let hostMatchRounds = 3;

function genRoomCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for(let i=0;i<4;i++) c += chars[Math.floor(Math.random()*chars.length)];
  return c;
}

function wireRoomEvents(){
  if(unsubChat) unsubChat();
  if(unsubPeers) unsubPeers();
  if(unsubStream) unsubStream();
  if(unsubSpeaking) unsubSpeaking();
  if(unsubCallState) unsubCallState();
  unsubSpeaking = roomNS.onSpeaking((peerId, on)=>{
    document.querySelectorAll(`[data-peer="${peerId}"]`).forEach(el=>el.classList.toggle('speaking', on));
  });
  unsubCallState = roomNS.onCallState((peerId, state)=>{
    document.querySelectorAll(`.callstate[data-peer-state="${peerId}"]`).forEach(el=>{
      el.classList.toggle('reconnecting', state==='reconnecting');
      el.classList.toggle('failed', false);
      el.textContent = state==='reconnecting' ? '🔄' : '';
      el.title = state==='reconnecting' ? 'Đang kết nối lại giọng nói...' : '';
    });
  });
  unsubChat = roomNS.on('chat', (msg)=>{
    if(!msg.data || msg.data.roomCode !== myRoomCode) return;
    chatLog.push({name:msg.data.name, text:msg.data.text, isMe:msg.isMe});
    if(chatLog.length>50) chatLog.shift();
    if(mpScreen==='lobby') renderLobby();
  });
  unsubPeers = roomNS.onPeers(()=>{
    if(mpScreen==='lobby') renderLobby();
    if(mpScreen==='battle') renderLeaderboard();
    checkHostStarted();
    if(roomNS) roomNS.refreshCalls();
    renderVideoPanel();
  });
  unsubStream = roomNS.onStream((peerId, stream)=>{
    if(peerId === '__local_cam_ended__'){ camOn = false; refreshMicScreen(); renderVideoPanel(); return; }
    let el = document.getElementById('voice-'+peerId);
    if(stream){
      if(!el){
        el = document.createElement('audio');
        el.id = 'voice-'+peerId; el.autoplay = true; el.playsInline = true; el.style.display = 'none';
        document.body.appendChild(el);
      }
      el.srcObject = stream;
      el.muted = false; el.volume = 1;
      attemptPlayVoiceEl(el);
      remoteMediaStreams[peerId] = stream;
    } else if(el){ el.remove(); delete remoteMediaStreams[peerId]; }
    renderVideoPanel();
  });
}

/* Cố phát 1 thẻ <audio> giọng nói; nếu trình duyệt (hay gặp trên Safari/điện
   thoại) chặn tự phát vì chưa có thao tác người dùng, thẻ này sẽ được thử
   lại ngay khi có cú chạm/click đầu tiên tiếp theo, qua unlockAllVoiceAudio(). */
function attemptPlayVoiceEl(el){
  const p = el.play();
  if(p && p.catch) p.catch(()=>{});
}
function unlockAllVoiceAudio(){
  document.querySelectorAll('audio[id^="voice-"]').forEach(el=>{
    if(el.paused) attemptPlayVoiceEl(el);
  });
}
/* Lưới an toàn chung: bất kỳ chạm/click nào trong trang cũng thử mở khóa phát
   âm thanh của tất cả các cuộc gọi thoại đang có — hữu ích trên điện thoại
   (đặc biệt iPhone) khi âm thanh người khác đến trước khi mình kịp thao tác. */
['pointerdown','touchend','click'].forEach(evt=>{
  document.addEventListener(evt, unlockAllVoiceAudio, {passive:true});
});

function removeAllVoiceAudio(){
  document.querySelectorAll('audio[id^="voice-"]').forEach(el=>el.remove());
}

function myPeersInRoom(){
  if(!roomNS || !myRoomCode) return [];
  return roomNS.peers().filter(p => p.presence && p.presence.roomCode === myRoomCode);
}

function renderMpHome(){
  mpScreen = 'home';
  myName = localStorage.getItem('trs6_name') || (window.TRS6 && TRS6.user && TRS6.user.displayName) || '';
  mpHome.innerHTML = `
    <div class="mp-card">
      <div class="starticon">🤼</div>
      <h2>Đấu bạn bè trực tiếp</h2>
      <p>Tạo phòng, gửi mã cho bạn bè (2–4 người), cùng vào và thi đấu real-time — điểm số cập nhật trực tiếp, có khung chat riêng.</p>
      <input class="nameinput" id="mpNameInput" placeholder="Nhập tên của bạn" value="${myName}" maxlength="16">
      <div class="mp-actions">
        <button class="mp-btn create" id="mpCreateBtn">➕ Tạo phòng mới</button>
        <div class="joinrow">
          <input id="mpCodeInput" placeholder="MÃ PHÒNG" maxlength="4">
          <button class="mp-btn join" id="mpJoinBtn">Vào phòng</button>
        </div>
      </div>
      <div class="mp-note">⚠️ Cả nhóm cần <b>mở cùng đường link bài này</b> và <b>online cùng lúc</b> — đây là phòng thi trực tiếp, không lưu lại lịch sử sau khi mọi người rời trang. Trong phòng chờ, bạn có thể bật mic để <b>nói chuyện 2 chiều</b> với mọi người trong phòng, dùng được trên cả điện thoại lẫn máy tính. Chỉ cần có Internet (wifi hoặc 4G/5G) là vào được, <b>không phụ thuộc khoảng cách xa gần</b> — nếu 2-3 lần thử đầu không nối trực tiếp được (do khác mạng, khác nhà mạng, tường lửa...), máy sẽ tự chuyển sang đường vòng qua máy chủ tiếp sức để đảm bảo vào được phòng. Nếu mic hoặc kết nối chập chờn lúc đầu, cứ đợi vài giây để tự kết nối lại. Mic cần trang chạy trên HTTPS và bạn đồng ý cấp quyền micro cho trình duyệt.</div>
    </div>`;
  document.getElementById('mpCreateBtn').onclick = createRoom;
  document.getElementById('mpJoinBtn').onclick = joinRoom;
}

async function createRoom(){
  const nameVal = document.getElementById('mpNameInput').value.trim();
  if(!nameVal){ alert('Bạn nhập tên trước nhé!'); return; }
  myName = nameVal; localStorage.setItem('trs6_name', myName);
  const btn = document.getElementById('mpCreateBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Đang tạo phòng...'; }
  let room = null, code = null, ok = false;
  for(let attempt=0; attempt<4 && !ok; attempt++){
    const forceRelay = attempt >= 2; // 2 lần đầu thử đường trực tiếp (nhanh); từ lần 3 ép đi qua relay để chắc chắn nối được
    if(attempt>0){ if(btn) btn.textContent = `Đang tạo phòng (thử lại lần ${attempt+1})...`; await new Promise(r=>setTimeout(r, 700*attempt)); }
    code = genRoomCode();
    room = new RoomWS();
    try{ await room.initHost(code, forceRelay); ok = true; }
    catch(e){ try{ room.destroy(); }catch(_){} }
  }
  if(btn){ btn.disabled = false; btn.textContent = '➕ Tạo phòng mới'; }
  if(!ok){
    alert('Không thể tạo phòng lúc này — có thể mạng của bạn đang chặn kết nối trực tiếp (WebRTC). Thử đổi sang mạng khác (wifi nhà, 4G) rồi thử lại nhé.');
    return;
  }
  roomNS = room;
  myRoomCode = code;
  isHost = true;
  wireRoomEvents();
  hostQCount = Math.min(25, POOL.length);
  hostMatchRounds = 3;
  const qIdx = shuffle(POOL.map((_,i)=>i)).slice(0, hostQCount);
  myLastRound = 0;
  await roomNS.presence({roomCode:myRoomCode, name:myName, role:'host', status:'lobby', qIdx, qCount:hostQCount, matchRounds:hostMatchRounds, round:0, score:0, totalScore:0, progress:0, finished:false, micOn:false, camOn:false, mediaGen:0, ts:Date.now()});
  acquireWakeLock();
  chatLog = [];
  renderLobby();
}

async function joinRoom(){
  const nameVal = document.getElementById('mpNameInput').value.trim();
  const codeVal = document.getElementById('mpCodeInput').value.trim().toUpperCase();
  if(!nameVal){ alert('Bạn nhập tên trước nhé!'); return; }
  if(!codeVal){ alert('Nhập mã phòng bạn bè gửi cho bạn nhé!'); return; }
  myName = nameVal; localStorage.setItem('trs6_name', myName);
  const btn = document.getElementById('mpJoinBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Đang vào phòng...'; }
  let room = null, ok = false, hostNotFound = false;
  for(let attempt=0; attempt<5 && !ok && !hostNotFound; attempt++){
    const forceRelay = attempt >= 2; // 2 lần đầu thử đường trực tiếp (nhanh); từ lần 3 ép đi qua relay để chắc chắn nối được dù ở xa
    if(attempt>0){ if(btn) btn.textContent = `Đang vào phòng (thử lại lần ${attempt+1})...`; await new Promise(r=>setTimeout(r, Math.min(700*attempt, 2500))); }
    room = new RoomWS();
    try{ await room.initJoin(codeVal, forceRelay); ok = true; }
    catch(e){
      try{ room.destroy(); }catch(_){}
      if(e && e.type==='peer-unavailable') hostNotFound = true; // mã phòng sai hoặc chủ phòng đã thoát — thử lại không ích gì
    }
  }
  if(hostNotFound){
    if(btn){ btn.disabled = false; btn.textContent = 'Vào phòng'; }
    alert('Không tìm thấy phòng này. Kiểm tra lại mã phòng cho đúng (không phân biệt hoa/thường), và đảm bảo chủ phòng vẫn đang mở trang — nếu chủ phòng thoát trang hoặc đổi mã, mã cũ sẽ không còn dùng được.');
    return;
  }
  if(!ok){
    if(btn){ btn.disabled = false; btn.textContent = 'Vào phòng'; }
    alert('Không vào được phòng này sau nhiều lần thử.\n\nNếu mạng của bạn đang yếu/chập chờn (vùng sóng yếu, 4G/5G không ổn định), hãy thử:\n• Đổi sang wifi nếu có, kể cả wifi yếu cũng thường ổn định hơn mạng di động ở vùng sóng yếu\n• Di chuyển ra chỗ thoáng, gần cửa sổ để bắt sóng tốt hơn\n• Tắt VPN nếu đang bật\n• Kiểm tra lại mã phòng và đảm bảo chủ phòng vẫn đang mở trang\n\nNếu vẫn không vào được, bạn vẫn có thể theo dõi kết quả qua bạn bè và dùng khung chat/nghe kể lại — mic và phòng thi cần đường truyền internet ổn định tối thiểu để hoạt động.');
    return;
  }
  if(btn){ btn.disabled = false; btn.textContent = 'Vào phòng'; }
  roomNS = room;
  myRoomCode = codeVal;
  isHost = false;
  wireRoomEvents();
  myLastRound = 0;
  await roomNS.presence({roomCode:myRoomCode, name:myName, role:'player', status:'lobby', score:0, totalScore:0, progress:0, finished:false, micOn:false, camOn:false, mediaGen:0, ts:Date.now()});
  acquireWakeLock();
  chatLog = [];
  renderLobby();
}

function renderLobby(){
  mpScreen = 'lobby';
  mpHome.style.display = 'none';
  mpLobby.style.display = 'block';
  mpBattle.style.display = 'none';
  const peers = myPeersInRoom();
  const host = peers.find(p=>p.presence.role==='host');
  const others = peers.filter(p=>!p.isMe).length;
  const curQCount = host ? (host.presence.qCount || (host.presence.qIdx||[]).length || hostQCount) : hostQCount;
  const matchRounds = host ? (host.presence.matchRounds || hostMatchRounds) : hostMatchRounds;
  const curRound = host ? (host.presence.round || 0) : 0;
  const matchStarted = curRound > 0;
  const finishedCount = peers.filter(p=>p.presence.finished).length;
  const totalCount = peers.length;
  const allFinished = totalCount > 0 && finishedCount === totalCount;
  const matchOver = matchStarted && curRound >= matchRounds && allFinished;

  const qSettingsHtml = (isHost && !matchStarted) ? `
    <div class="mp-qsettings">
      <div class="mp-qsettings-label">🎲 Số lượng câu hỏi mỗi round</div>
      <div class="qcountbtns">
        ${QCOUNT_OPTIONS.filter(n=>n<=POOL.length).map(n=>`<button class="qcbtn ${n===curQCount?'active':''}" data-n="${n}">${n}</button>`).join('')}
        ${POOL.length && !QCOUNT_OPTIONS.includes(POOL.length) ? `<button class="qcbtn ${POOL.length===curQCount?'active':''}" data-n="${POOL.length}">${POOL.length} (tối đa)</button>` : ''}
      </div>
      <button class="rerollbtn" id="mpRerollBtn">🔄 Làm mới câu hỏi (random lại bộ đề)</button>
    </div>`
    : (!matchStarted ? `<div class="mp-qsettings"><span class="qcount-readonly">🎲 Chủ phòng đã chọn <b>${curQCount}</b> câu hỏi ngẫu nhiên mỗi round.</span></div>` : '');

  const roundSettingsHtml = (!matchStarted) ? `
    <div class="mp-qsettings">
      <div class="mp-qsettings-label">🎯 Số round trong trận đấu (giống 1 trận đấu thực thụ)</div>
      ${isHost ? `
      <div class="qcountbtns">
        ${ROUND_OPTIONS.map(n=>`<button class="rcbtn qcbtn ${n===matchRounds?'active':''}" data-n="${n}">${n===1?'1 round':n+' round'}</button>`).join('')}
      </div>` : `<span class="qcount-readonly">Chủ phòng đã chọn <b>${matchRounds}</b> round cho trận này.</span>`}
    </div>` : '';

  const matchStatusHtml = matchStarted ? `
    <div class="mp-qsettings">
      <div class="mp-qsettings-label">🎯 Trận đấu — Round ${Math.min(curRound, matchRounds)}/${matchRounds}${matchOver?' — Đã kết thúc!':''}</div>
      <div class="mp-note" style="margin-top:2px; margin-bottom:10px; text-align:center;">
        ${matchOver ? '🏁 Tất cả đã hoàn thành trận đấu!' : (allFinished ? '✅ Mọi người đã xong round này!' : `⏳ ${finishedCount}/${totalCount} người đã hoàn thành round ${curRound}...`)}
      </div>
      ${buildFinalRankingHtml()}
    </div>` : '';

  let startAreaHtml;
  if(!matchStarted){
    startAreaHtml = isHost ? `<button class="mp-btn create" id="mpStartBtn" ${others<1?'disabled style="opacity:.5;"':''}>🚀 Bắt đầu trận đấu (${matchRounds} round)${others<1?' — đợi bạn bè vào':''}</button>`
             : `<div class="mp-note" style="text-align:center;">⏳ Đợi chủ phòng (${host?host.presence.name:'...'}) bấm bắt đầu...</div>`;
  } else if(matchOver){
    startAreaHtml = isHost ? `<button class="mp-btn create" id="mpStartBtn">🔄 Chơi trận đấu mới</button>`
             : `<div class="mp-note" style="text-align:center;">⏳ Đợi chủ phòng bắt đầu trận đấu mới...</div>`;
  } else if(allFinished){
    startAreaHtml = isHost ? `<button class="mp-btn create" id="mpStartBtn">▶️ Bắt đầu round ${curRound+1}/${matchRounds}</button>`
             : `<div class="mp-note" style="text-align:center;">⏳ Mọi người đã xong — đợi chủ phòng bắt đầu round tiếp theo...</div>`;
  } else {
    startAreaHtml = isHost ? `<button class="mp-btn create" id="mpStartBtn" disabled style="opacity:.5;">🔒 Chờ mọi người chơi xong round ${curRound} (${finishedCount}/${totalCount})</button>`
             : `<div class="mp-note" style="text-align:center;">⏳ Đang chờ mọi người hoàn thành round ${curRound} (${finishedCount}/${totalCount})...</div>`;
  }

  mpLobby.innerHTML = `
    <div class="roomcode-box">
      <div class="roomcode-label">MÃ PHÒNG — GỬI CHO BẠN BÈ</div>
      <div class="roomcode-value">${myRoomCode}</div>
      <div class="roomcode-hint">${peers.length} người đã vào phòng</div>
      <button class="copybtn" id="copyCodeBtn">📋 Sao chép mã</button>
    </div>
    <div class="mp-toprow">
      <button class="micbtn ${micOn?'mic-active':''}" id="mpMicBtn">${micOn ? '🔴 Tắt mic' : '🎤 Bật mic để nói chuyện'}</button>
      <button class="camtogglebtn ${camOn?'cam-active':''}" id="mpCamBtn">${camOn ? '🔴 Tắt cam' : '📷 Bật cam'}</button>
    </div>
    ${matchStatusHtml}
    ${qSettingsHtml}
    ${roundSettingsHtml}
    <div class="player-list" id="playerList"></div>
    <div class="chatbox">
      <div class="lb-title">💬 Trò chuyện</div>
      <div class="chat-messages" id="chatMessages"></div>
      <div class="chat-input-row">
        <input id="chatInput" placeholder="Nhắn gì đó..." maxlength="120">
        <button id="chatSendBtn">Gửi</button>
      </div>
    </div>
    ${startAreaHtml}
    <button class="mp-btn join" id="mpLeaveBtn" style="margin-top:10px;">← Rời phòng</button>
  `;
  renderPlayerList(peers);
  renderChatMessages();
  document.getElementById('copyCodeBtn').onclick = ()=>{
    navigator.clipboard?.writeText(myRoomCode).catch(()=>{});
    document.getElementById('copyCodeBtn').textContent = '✅ Đã chép!';
  };
  document.getElementById('chatSendBtn').onclick = sendChat;
  document.getElementById('chatInput').onkeydown = (e)=>{ if(e.key==='Enter') sendChat(); };
  document.getElementById('mpLeaveBtn').onclick = leaveRoom;
  document.getElementById('mpMicBtn').onclick = toggleMic;
  document.getElementById('mpCamBtn').onclick = toggleCam;
  if(isHost){
    const startBtn = document.getElementById('mpStartBtn');
    if(startBtn) startBtn.onclick = matchOver ? resetMatch : startBattle;
    document.querySelectorAll('.qcbtn:not(.rcbtn)').forEach(btn=>{
      btn.onclick = ()=>setQuestionCount(parseInt(btn.dataset.n));
    });
    document.querySelectorAll('.rcbtn').forEach(btn=>{
      btn.onclick = ()=>setMatchRounds(parseInt(btn.dataset.n));
    });
    const rerollBtn = document.getElementById('mpRerollBtn');
    if(rerollBtn) rerollBtn.onclick = rerollQuestions;
  }
}

async function setQuestionCount(n){
  if(!isHost || !roomNS) return;
  hostQCount = n;
  const qIdx = shuffle(POOL.map((_,i)=>i)).slice(0, n);
  await roomNS.presence({qIdx, qCount:n, ts:Date.now()});
  renderLobby();
}

async function setMatchRounds(n){
  if(!isHost || !roomNS) return;
  hostMatchRounds = n;
  await roomNS.presence({matchRounds:n, ts:Date.now()});
  renderLobby();
}

async function rerollQuestions(){
  if(!isHost || !roomNS) return;
  const btn = document.getElementById('mpRerollBtn');
  if(btn){ btn.disabled = true; btn.textContent = '🔄 Đang random lại...'; }
  const qIdx = shuffle(POOL.map((_,i)=>i)).slice(0, hostQCount);
  await roomNS.presence({qIdx, qCount:hostQCount, ts:Date.now()});
  renderLobby();
}

function refreshMicScreen(){
  if(mpScreen==='lobby') renderLobby();
  else if(mpScreen==='battle') renderLeaderboard();
}

async function toggleMic(){
  const btn = document.getElementById('mpMicBtn') || document.getElementById('mpMicBtnBattle');
  /* Bấm nút này là một thao tác chạm/click thật của người dùng — tận dụng luôn
     để "mở khóa" phát âm thanh trên điện thoại (đặc biệt iPhone Safari chặn
     tự phát audio nếu chưa có thao tác của người dùng), phòng khi audio của
     người khác đã tới trước đó nhưng chưa phát được. */
  unlockAllVoiceAudio();
  if(!micOn){
    if(btn){ btn.disabled = true; btn.textContent = '🎤 Đang bật mic...'; }
    const ok = await roomNS.enableMic();
    if(btn) btn.disabled = false;
    if(ok){
      micOn = true;
      if(roomNS) await roomNS.presence({micOn:true, mediaGen:roomNS.mediaGen, ts:Date.now()});
    } else {
      alert('Không thể dùng micro. Hãy cho phép quyền micro cho trang này trong trình duyệt (và đảm bảo trang chạy trên HTTPS) rồi thử lại nhé.');
    }
    refreshMicScreen();
  } else {
    roomNS.setMicEnabled(false);
    micOn = false;
    if(roomNS) await roomNS.presence({micOn:false, ts:Date.now()});
    refreshMicScreen();
  }
}

async function toggleCam(){
  const btn = document.getElementById('mpCamBtn') || document.getElementById('mpCamBtnBattle');
  if(!camOn){
    if(btn){ btn.disabled = true; btn.textContent = '📷 Đang bật cam...'; }
    const ok = await roomNS.enableCam();
    if(btn) btn.disabled = false;
    if(ok){
      camOn = true;
      if(roomNS) await roomNS.presence({camOn:true, mediaGen:roomNS.mediaGen, ts:Date.now()});
    } else {
      alert('Không thể dùng camera. Hãy cho phép quyền camera cho trang này trong trình duyệt (và đảm bảo trang chạy trên HTTPS) rồi thử lại nhé.');
    }
    refreshMicScreen();
    renderVideoPanel();
  } else {
    roomNS.setCamEnabled(false);
    camOn = false;
    if(roomNS) await roomNS.presence({camOn:false, ts:Date.now()});
    refreshMicScreen();
    renderVideoPanel();
  }
}

/* ---- Khung camera nổi ở góc phải màn hình: hiện video của mình + của những
   người trong phòng đang bật camera. Chỉ hiện khung khi có ít nhất 1 người
   (mình hoặc ai đó) đang bật camera, để không choán chỗ khi không ai dùng. ---- */
function ensureVideoPanelEl(){
  let panel = document.getElementById('videoPanel');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'videoPanel';
    panel.innerHTML = `
      <div class="vp-head">
        <span>📹 Camera</span>
        <button type="button" class="vp-collapse" onclick="toggleVideoPanelCollapse()" title="Thu nhỏ/mở rộng">—</button>
      </div>
      <div class="vp-grid" id="vpGrid"></div>`;
    document.body.appendChild(panel);
  }
  return panel;
}
let vpCollapsed = false;
function toggleVideoPanelCollapse(){
  vpCollapsed = !vpCollapsed;
  const panel = document.getElementById('videoPanel');
  if(panel) panel.classList.toggle('vp-collapsed', vpCollapsed);
}
function renderVideoPanel(){
  if(!roomNS){ const p = document.getElementById('videoPanel'); if(p) p.remove(); return; }
  const peersWithCam = myPeersInRoom().filter(p=>!p.isMe && p.presence && p.presence.camOn);
  if(!camOn && peersWithCam.length===0){ const p = document.getElementById('videoPanel'); if(p) p.remove(); return; }
  const panel = ensureVideoPanelEl();
  const grid = panel.querySelector('#vpGrid');
  const wantedIds = new Set();
  let tilesHtml = '';
  if(camOn){
    wantedIds.add('__me__');
    tilesHtml += `<div class="vp-tile" data-vp="__me__"><video id="vpLocalVideo" autoplay playsinline muted></video><span class="vp-label">Bạn</span></div>`;
  }
  peersWithCam.forEach(p=>{
    wantedIds.add(p.id);
    tilesHtml += `<div class="vp-tile" data-vp="${p.id}"><video id="vpVideo-${p.id}" autoplay playsinline></video><span class="vp-label">${(p.presence.name||'Bạn chơi')}</span></div>`;
  });
  grid.innerHTML = tilesHtml;
  const localVideoEl = document.getElementById('vpLocalVideo');
  if(localVideoEl && roomNS.localStream) localVideoEl.srcObject = roomNS.localStream;
  peersWithCam.forEach(p=>{
    const v = document.getElementById('vpVideo-'+p.id);
    const stream = remoteMediaStreams[p.id];
    if(v && stream) v.srcObject = stream;
  });
}

function renderPlayerList(peers){
  const list = document.getElementById('playerList');
  if(!list) return;
  list.innerHTML = peers.map(p=>`
    <div class="player-row" data-peer="${p.id}">
      <span class="player-dot"></span>
      <span class="player-name">${p.presence.name || 'Ẩn danh'}${p.isMe?' (bạn)':''}${p.presence.micOn?' <span class="player-mic" title="Đang bật mic">🎙️</span>':''}${p.presence.camOn?' <span class="player-mic" title="Đang bật camera">📷</span>':''}${!p.isMe?`<span class="callstate" data-peer-state="${p.id}"></span>`:''}</span>
      <span class="player-role">${p.presence.role==='host'?'👑 Chủ phòng':'Người chơi'}</span>
    </div>`).join('');
}

function renderChatMessages(){
  const box = document.getElementById('chatMessages');
  if(!box) return;
  box.innerHTML = chatLog.map(m=>`<div class="chat-msg ${m.isMe?'me':''}"><b>${m.name}:</b> ${m.text}</div>`).join('') || `<div class="chat-msg" style="color:var(--ink-soft);">Chưa có tin nhắn nào — chào mọi người đi!</div>`;
  box.scrollTop = box.scrollHeight;
}

async function sendChat(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text || !roomNS) return;
  input.value = '';
  try{ await roomNS.emit('chat', {roomCode:myRoomCode, name:myName, text}); }catch(e){}
}

function checkHostStarted(){
  if(mpScreen !== 'lobby' || isHost) return;
  const peers = myPeersInRoom();
  const host = peers.find(p=>p.presence.role==='host');
  if(host && host.presence.status==='playing' && Array.isArray(host.presence.qIdx) && (host.presence.round||0) !== myLastRound){
    const newRound = host.presence.round || 0;
    const isNewMatch = newRound === 1; // round 1 luôn đánh dấu điểm bắt đầu của 1 trận đấu mới
    myLastRound = newRound;
    beginBattle(host.presence.qIdx, isNewMatch);
  }
}

async function startBattle(){
  const peers = myPeersInRoom();
  const me = peers.find(p=>p.isMe);
  const curRound = (me && me.presence.round) || 0;
  const matchRounds = (me && me.presence.matchRounds) || hostMatchRounds;
  if(curRound > 0){
    if(curRound >= matchRounds) return; // trận đã xong — phải bấm "Chơi trận đấu mới"
    const allFinished = peers.length>0 && peers.every(p=>p.presence.finished);
    if(!allFinished) return; // an toàn: nút cũng đã bị khóa/ẩn ở renderLobby khi chưa đủ điều kiện
  }
  const nextRound = curRound + 1;
  myLastRound = nextRound;
  /* Random lại bộ câu hỏi cho mỗi round mới trong trận — giống 1 trận đấu thực thụ,
     mỗi round không lặp lại y hệt câu hỏi của round trước. */
  const qIdx = shuffle(POOL.map((_,i)=>i)).slice(0, hostQCount);
  const patch = {status:'playing', round:nextRound, matchRounds, qIdx, qCount:hostQCount, score:0, progress:0, finished:false, ts:Date.now()};
  if(curRound === 0) patch.totalScore = 0; // round 1 của 1 trận mới → xoá điểm tổng trận trước
  await roomNS.presence(patch);
  beginBattle(qIdx, curRound === 0);
}

async function resetMatch(){
  finishMpForMe._saved = false;
  if(!isHost || !roomNS) return;
  const qIdx = shuffle(POOL.map((_,i)=>i)).slice(0, hostQCount);
  await roomNS.presence({round:0, status:'lobby', matchRounds:hostMatchRounds, qIdx, qCount:hostQCount, score:0, totalScore:0, progress:0, finished:false, ts:Date.now()});
  myLastRound = 0;
  renderLobby();
}

function beginBattle(qIdx, isNewMatch){
  mpTest = qIdx.map(i=>{
    const src = POOL[i];
    const variant = pickVariantFor(src);
    const order = shuffle(variant.opts.map((_,k)=>k));
    return {w:src.w, s:variant.s, opts:order.map(k=>variant.opts[k]), defs:order.map(k=>(variant.defs ? variant.defs[k] : null)), correct:order.indexOf(variant.correct), exp:variant.exp, emoji:variant.emoji, tip:variant.tip, trans:variant.trans};
  });
  mpIdx = 0; mpScore = 0; mpAnswers = new Array(mpTest.length).fill(null);
  if(!isHost && roomNS){
    const patch = {score:0, progress:0, finished:false, ts:Date.now()};
    if(isNewMatch) patch.totalScore = 0; // round 1 của 1 trận mới → xoá điểm tổng trận trước
    roomNS.presence(patch);
  }
  mpScreen = 'battle';
  mpLobby.style.display = 'none';
  mpBattle.style.display = 'block';
  renderLeaderboard();
  renderMpQuestion();
}

function renderLeaderboard(){
  if(!lbPanel) return;
  const peers = myPeersInRoom();
  const sorted = peers.slice().sort((a,b)=> (b.presence.score||0) - (a.presence.score||0));
  const maxScore = Math.max(1, ...sorted.map(p=>p.presence.score||0));
  lbPanel.innerHTML = `
    <div class="mp-toprow" style="margin-bottom:12px;">
      <button class="micbtn ${micOn?'mic-active':''}" id="mpMicBtnBattle">${micOn ? '🔴 Tắt mic' : '🎤 Bật mic'}</button>
      <button class="camtogglebtn ${camOn?'cam-active':''}" id="mpCamBtnBattle">${camOn ? '🔴 Tắt cam' : '📷 Bật cam'}</button>
    </div>
    <div class="lb-title">🏆 Bảng điểm trực tiếp</div>
    ${sorted.map((p,i)=>{
      const c = colorFor(i);
      const done = p.presence.finished;
      return `<div class="lb-row" data-peer="${p.id}">
        <span class="lb-rank">${i+1}</span>
        <span class="lb-name">${p.presence.name||'?'}${p.isMe?' 🫵':''}${p.presence.micOn?' 🎙️':''}${p.presence.camOn?' 📷':''}${!p.isMe?`<span class="callstate" data-peer-state="${p.id}"></span>`:''}</span>
        <span class="lb-bar-track"><span class="lb-bar-fill" style="width:${(p.presence.score||0)/maxScore*100}%; background:${c};"></span></span>
        <span class="lb-score">${p.presence.score||0}<span style="opacity:.6; font-size:.8em;"> (tổng ${p.presence.totalScore||0})</span></span>
        <span class="lb-finished">${done?'✅':''}</span>
      </div>`;
    }).join('')}`;
  const micBtnB = document.getElementById('mpMicBtnBattle');
  if(micBtnB) micBtnB.onclick = toggleMic;
  const camBtnB = document.getElementById('mpCamBtnBattle');
  if(camBtnB) camBtnB.onclick = toggleCam;
}

function renderMpQuestion(){
  if(mpIdx >= mpTest.length){ finishMpForMe(); return; }
  const q = mpTest[mpIdx];
  const c = colorFor(mpIdx);
  const optsHtml = q.opts.map((o,i)=>{
    const letter = String.fromCharCode(65+i);
    return `<button class="opt" data-i="${i}"><span class="letter">${letter}</span><span>${o}</span></button>`;
  }).join('');
  mpQuizArea.innerHTML = `
    <div class="qcard">
      <div class="qhead">
        <div class="qnum-badge" style="background:${c};">${mpIdx+1}</div>
        <div class="qhint">Câu ${mpIdx+1}/${mpTest.length} ${q.emoji}</div>
      </div>
      <p class="sentence">${q.s.replace('___', `<span class="blank" style="background:${hexToRgba(c,.16)}; color:${c};">＿＿＿</span>`)}</p>
      <div class="options">${optsHtml}</div>
      <div class="explain" id="mpExplainBox"></div>
      <div class="actions">
        <span></span>
        <button class="next" id="mpNextBtn">Câu tiếp theo →</button>
      </div>
    </div>`;
  document.querySelectorAll('#mpQuizArea .opt').forEach(btn=>{
    btn.addEventListener('click', ()=>onMpAnswer(parseInt(btn.dataset.i)));
  });
}

async function onMpAnswer(choice){
  const q = mpTest[mpIdx];
  const correct = choice === q.correct;
  mpAnswers[mpIdx] = correct;
  if(correct) mpScore++;
  const buttons = document.querySelectorAll('#mpQuizArea .opt');
  buttons.forEach((b,i)=>{
    b.disabled = true;
    if(i === q.correct){ b.classList.add('correct'); b.insertAdjacentHTML('beforeend','<span class="mark correct">🎉</span>'); }
    if(i === choice && choice !== q.correct){ b.classList.add('wrong'); b.insertAdjacentHTML('beforeend','<span class="mark wrong">💥</span>'); }
  });
  const box = document.getElementById('mpExplainBox');
  box.classList.add('show', correct ? 'right-verdict' : 'wrong-verdict');
  box.innerHTML = `
    <div class="explain-top">
      <div class="explain-emoji">${q.emoji}</div>
      <div><div class="verdict">${correct ? 'Chính xác, quá đỉnh!' : 'Chưa đúng — đáp án là "'+q.opts[q.correct]+'"'}</div><div class="wordtag">${q.w}</div></div>
    </div>
    ${buildExplainBody(q)}`;
  document.getElementById('mpNextBtn').classList.add('show');
  document.getElementById('mpNextBtn').onclick = ()=>{ mpIdx++; renderMpQuestion(); };
  if(roomNS){
    try{ await roomNS.presence({score:mpScore, progress:mpIdx+1, ts:Date.now()}); }catch(e){}
  }
  renderLeaderboard();
}

function buildFinalRankingHtml(){
  const peers = myPeersInRoom();
  const sorted = peers.slice().sort((a,b)=> (b.presence.totalScore||0) - (a.presence.totalScore||0));
  const medals = ['🥇','🥈','🥉'];
  return `
    <div class="final-rank">
      <div class="final-rank-title">🏆 Bảng xếp hạng (điểm tổng cả trận)</div>
      ${sorted.map((p,i)=>`
        <div class="final-rank-row ${p.isMe?'me':''}">
          <span class="final-rank-medal">${medals[i] || (i+1)}</span>
          <span class="final-rank-name">${p.presence.name||'?'}${p.isMe?' (bạn)':''}</span>
          <span class="final-rank-score">${p.presence.totalScore||0}${p.presence.finished?' ✅':' ⏳'}</span>
        </div>`).join('')}
    </div>`;
}

async function finishMpForMe(){
  const peers = myPeersInRoom();
  const me = peers.find(p=>p.isMe);
  const newTotal = (me && me.presence.totalScore || 0) + mpScore;
  if(roomNS){ try{ await roomNS.presence({finished:true, totalScore:newTotal, ts:Date.now()}); }catch(e){} }
  const host = peers.find(p=>p.presence.role==='host');
  const matchRounds = (host && host.presence.matchRounds) || hostMatchRounds;
  const curRound = (host && host.presence.round) || myLastRound || 1;
  const isLastRound = curRound >= matchRounds;
  if(isLastRound && !finishMpForMe._saved){ finishMpForMe._saved = true; TRS6.saveMatch({roomCode:myRoomCode, rounds:matchRounds, players:peers.length, totalScore:newTotal}); }
  const total = mpTest.length;
  const pct = Math.round(mpScore/total*100);
  mpQuizArea.innerHTML = `
    <div class="done">
      <div class="resultcard">
        <div class="qhint">BẠN ĐÃ HOÀN THÀNH ROUND ${curRound}/${matchRounds}</div>
        <div class="bigscore">${mpScore}/${total}</div>
        <div class="pct">${pct}% chính xác round này · Điểm tổng trận: <b>${newTotal}</b></div>
        ${buildFinalRankingHtml()}
        <div class="mp-note" style="text-align:center; margin-top:12px;">${isLastRound ? '🏁 Đây là round cuối cùng của trận đấu — bấm về phòng chờ để xem kết quả chung cuộc!' : '⏳ Đợi tất cả người chơi hoàn thành round này — chủ phòng sẽ bắt đầu round tiếp theo ngay khi mọi người xong.'}</div>
        <div class="resultbtns">
          <button class="btn-ghost" id="mpBackLobbyBtn">← Về phòng chờ</button>
        </div>
      </div>
    </div>`;
  document.getElementById('mpBackLobbyBtn').onclick = backToLobbyAfterGame;
  renderLeaderboard();
}

function backToLobbyAfterGame(){
  mpScreen = 'lobby';
  mpBattle.style.display = 'none';
  renderLobby();
}

/* ---- Giữ màn hình không tự tắt khi đang trong phòng đấu bạn bè ----
   Trên điện thoại, khi màn hình tự khoá, trình duyệt thường tạm dừng hoặc
   ngắt hẳn kết nối WebRTC đang chạy — đây là nguyên nhân rất phổ biến khiến
   phòng bị "rớt" hoặc bạn bè ở xa không vào được dù mạng vẫn tốt. Wake Lock
   giữ màn hình sáng trong lúc ở trong phòng để tránh việc này. */
let wakeLock = null;
async function acquireWakeLock(){
  try{
    if('wakeLock' in navigator){
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', ()=>{ wakeLock = null; });
    }
  }catch(e){ wakeLock = null; }
}
function releaseWakeLock(){
  if(wakeLock){ try{ wakeLock.release(); }catch(e){} wakeLock = null; }
}
document.addEventListener('visibilitychange', ()=>{
  /* Wake Lock tự bị trình duyệt huỷ khi chuyển tab/app; xin cấp lại ngay khi
     người dùng quay lại trang, miễn là vẫn đang ở trong phòng. */
  if(document.visibilityState === 'visible' && roomNS && !wakeLock) acquireWakeLock();
});

async function leaveRoom(){
  if(roomNS){ try{ roomNS.destroy(); }catch(e){} }
  removeAllVoiceAudio();
  releaseWakeLock();
  const vp = document.getElementById('videoPanel'); if(vp) vp.remove();
  remoteMediaStreams = {};
  roomNS = null; myRoomCode = null; isHost = false; chatLog = [];
  micOn = false; camOn = false; myLastRound = 0;
  mpLobby.style.display = 'none';
  mpBattle.style.display = 'none';
  mpHome.style.display = 'block';
  renderMpHome();
}

renderMpHome();


renderChapterPicker();
renderStartScreen();