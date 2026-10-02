/* Phòng đấu bạn bè chạy qua máy chủ (Server-Sent Events + POST) – thay cho PeerJS/WebRTC.
   Giữ nguyên giao diện (presence / peers / on / emit ...) để phần UI trong app.js không phải đổi. */
class RoomWS{
  constructor(){
    this.myId = 'c' + Math.random().toString(36).slice(2, 10);
    this.code = null; this.es = null; this.isHost = false;
    this.myPresence = null; this.remote = {};
    this.chatHandlers = []; this.peersHandlers = [];
    this.localStream = null; this.mediaGen = 0;   // thoại/video: bản này chưa hỗ trợ
  }
  async initHost(code){ this.isHost = true; this.code = code; await TRS6.call('POST', '/api/rooms/' + code); await this._connect(); }
  async initJoin(code){ this.isHost = false; this.code = code; await TRS6.call('GET', '/api/rooms/' + code); await this._connect(); }
  _connect(){
    return new Promise((resolve, reject) => {
      const url = `/api/rooms/${this.code}/stream?clientId=${this.myId}&token=${encodeURIComponent(TRS6.token)}`;
      const es = this.es = new EventSource(url);
      let ready = false;
      const timer = setTimeout(() => { if(!ready){ es.close(); reject(new Error('timeout')); } }, 10000);
      es.addEventListener('ready', () => {
        if(ready){ if(this.myPresence) this._post('presence', {data:this.myPresence}); return; } // tự nối lại sau khi rớt mạng
        ready = true; clearTimeout(timer); resolve();
      });
      es.addEventListener('state', e => { this.remote = JSON.parse(e.data) || {}; this._firePeers(); });
      es.addEventListener('chat', e => { const data = JSON.parse(e.data); this.chatHandlers.forEach(cb => cb({data, isMe:false})); });
    });
  }
  _post(sub, body){ return TRS6.call('POST', `/api/rooms/${this.code}/${sub}`, Object.assign({clientId:this.myId}, body)).catch(()=>{}); }
  _firePeers(){ this.peersHandlers.forEach(cb => { try{ cb(); }catch(e){} }); }
  async presence(data){
    this.myPresence = Object.assign({}, this.myPresence, data);
    this._firePeers();
    await this._post('presence', {data:this.myPresence});
  }
  peers(){
    const list = [{isMe:true, id:this.myId, presence:this.myPresence}];
    Object.entries(this.remote).forEach(([id, p]) => { if(id !== this.myId) list.push({isMe:false, id, presence:p}); });
    return list;
  }
  onPeers(cb){ this.peersHandlers.push(cb); return () => { this.peersHandlers = this.peersHandlers.filter(f => f !== cb); }; }
  on(event, cb){ if(event === 'chat') this.chatHandlers.push(cb); return () => { this.chatHandlers = this.chatHandlers.filter(f => f !== cb); }; }
  async emit(event, data){
    if(event !== 'chat') return;
    this.chatHandlers.forEach(cb => cb({data, isMe:true}));
    await this._post('chat', {data});
  }
  destroy(){ if(this.es){ this.es.close(); this.es = null; } }
  // --- Phần thoại/video (chưa hỗ trợ): giữ hàm rỗng để giao diện không lỗi ---
  async enableMic(){ return false; } async enableCam(){ return false; }
  setMicEnabled(){} setCamEnabled(){} refreshCalls(){} stopMic(){} stopCam(){}
  onSpeaking(){ return () => {}; } onCallState(){ return () => {}; } onStream(){ return () => {}; }
}
