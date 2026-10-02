/* Lớp giao tiếp với backend: đăng nhập, gọi API, lưu kết quả; sau khi đăng nhập mới tải app.js */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TRS6 = window.TRS6 = { token: localStorage.getItem('trs6_token') || '', user: null };

  TRS6.call = async function(method, url, body){
    const r = await fetch(url, { method, headers: Object.assign({'Content-Type':'application/json'}, TRS6.token ? {Authorization:'Bearer '+TRS6.token} : {}), body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){
      if(r.status === 401 && !url.startsWith('/api/auth')) logout();
      throw new Error(d.error || 'Có lỗi xảy ra');
    }
    return d;
  };
  let usageTimer = null;
  TRS6.saveUsage = store => { clearTimeout(usageTimer); usageTimer = setTimeout(()=>TRS6.call('PUT','/api/usage',store).catch(()=>{}), 800); };
  TRS6.saveAttempt = data => TRS6.call('POST','/api/attempts',data).catch(()=>{});
  TRS6.saveMatch = data => TRS6.call('POST','/api/matches',data).catch(()=>{});

  function logout(){ localStorage.removeItem('trs6_token'); location.reload(); }

  /* ---- Đăng nhập / đăng ký ---- */
  let mode = 'login';
  function setMode(m){
    mode = m;
    $('authTitle').textContent = m==='login' ? '🎮 Đăng nhập' : '✨ Tạo tài khoản';
    $('authSubmit').textContent = m==='login' ? 'Đăng nhập' : 'Đăng ký';
    $('authSwitch').textContent = m==='login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập';
    $('authName').style.display = m==='login' ? 'none' : 'block';
    $('authErr').textContent = '';
  }
  async function submitAuth(){
    $('authErr').textContent = '';
    try{
      const d = await TRS6.call('POST', mode==='login' ? '/api/auth/login' : '/api/auth/register',
        { username:$('authUser').value, password:$('authPass').value, displayName:$('authName').value });
      TRS6.token = d.token; localStorage.setItem('trs6_token', d.token);
      TRS6.user = d.user; $('authOverlay').classList.remove('show');
      await start();
    }catch(e){ $('authErr').textContent = e.message; }
  }
  $('authSwitch').onclick = () => setMode(mode==='login' ? 'register' : 'login');
  $('authSubmit').onclick = submitAuth;
  ['authUser','authName','authPass'].forEach(id => $(id).addEventListener('keydown', e => { if(e.key==='Enter') submitAuth(); }));
  $('logoutBtn').onclick = logout;

  /* ---- Bảng xếp hạng & tiến độ ---- */
  $('statsBtn').onclick = async () => {
    $('statsOverlay').classList.add('show'); $('statsBody').textContent = 'Đang tải...';
    try{
      const [st, lb] = await Promise.all([TRS6.call('GET','/api/stats'), TRS6.call('GET','/api/leaderboard')]);
      const pct = st.summary.t ? Math.round(st.summary.c / st.summary.t * 100) : 0;
      $('statsBody').innerHTML = `
        <h2>📊 Tiến độ của bạn</h2>
        <div class="statgrid">
          <div class="statbox"><b>${st.summary.n}</b><span>Bài đã thi</span></div>
          <div class="statbox"><b>${st.summary.c}</b><span>Câu đúng</span></div>
          <div class="statbox"><b>${pct}%</b><span>Chính xác</span></div>
        </div>
        <h3>📌 Từ hay sai nhất</h3>
        <ul class="statlist">${st.weak.length ? st.weak.map(w=>`<li><b>${esc(w.word)}</b><span class="muted">sai ${w.wrong} lần</span></li>`).join('') : '<li class="muted">Chưa có dữ liệu</li>'}</ul>
        <h3>🕒 Lịch sử thi gần đây</h3>
        <ul class="statlist">${st.history.length ? st.history.map(h=>`<li><span>${esc(h.created_at)}</span><b>${h.correct}/${h.total}</b></li>`).join('') : '<li class="muted">Chưa có bài thi nào</li>'}</ul>
        <h3>🤼 Trận đấu bạn bè</h3>
        <ul class="statlist">${st.matches.length ? st.matches.map(m=>`<li><span>Phòng ${esc(m.room_code)} · ${m.players} người · ${m.rounds} round</span><b>${m.total_score} điểm</b></li>`).join('') : '<li class="muted">Chưa có trận nào</li>'}</ul>
        <h3>🏆 Bảng xếp hạng (cần ≥ 20 câu)</h3>
        <ul class="statlist">${lb.length ? lb.map((r,i)=>`<li><span>${i+1}. ${esc(r.name)}</span><b>${r.correct} đúng · ${r.pct}%</b></li>`).join('') : '<li class="muted">Chưa có ai lên bảng</li>'}</ul>`;
    }catch(e){ $('statsBody').textContent = e.message; }
  };
  $('statsClose').onclick = () => $('statsOverlay').classList.remove('show');

  /* ---- Khởi động ---- */
  async function start(){
    $('userName').textContent = TRS6.user.displayName + (TRS6.user.role==='admin' ? ' (admin)' : '');
    $('userbar').classList.add('show');
    const [words, usage] = await Promise.all([TRS6.call('GET','/api/words'), TRS6.call('GET','/api/usage')]);
    window.CHAPTER1_WORDS = words;   // app.js đọc dữ liệu từ biến này (nay đến từ database)
    window.__USAGE = usage;
    const s = document.createElement('script'); s.src = '/js/app.js'; document.body.appendChild(s);
  }
  (async function boot(){
    if(TRS6.token){
      try{ TRS6.user = (await TRS6.call('GET','/api/me')).user; return await start(); }catch(e){}
    }
    $('authOverlay').classList.add('show');
  })();
})();
