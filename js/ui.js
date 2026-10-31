// 画面描画（screen 状態に応じて #app を描き替える）
window.SC = window.SC || {};

SC.render = function () {
  SC.save();
  const app = document.getElementById('app');
  // v0.21: unitSelect/setup はシンプルタイトルバー。他画面は通常ヘッダ
  const scr = SC.state.screen;
  let html;
  if (scr === 'title') {
    html = '';   // v0.25.18: タイトル画面はヘッダなしの全画面
  } else if (scr === 'unitSelect') {
    html = '<header class="topbar topbar-simple"><span class="simple-header-title">ユニット編成</span></header>';
  } else if (scr === 'setup') {
    html = '<header class="topbar topbar-simple"><span class="simple-header-title">プロデュース設定</span></header>';
  } else {
    html = SC.renderHeader();
  }
  switch (SC.state.screen) {
    case 'title':          html += SC.renderTitle(); break;
    case 'unitSelect':      html += SC.renderUnitSelect(); break;
    case 'setup':          html += SC.renderSetup(); break;
    case 'morning':        html += SC.renderMorning(); break;
    case 'promiseComm':    html += SC.renderPromiseComm(); break;
    case 'home':          html += SC.renderHome(); break;
    case 'schedule':      html += SC.renderSchedule(); break;
    case 'preTalk':       html += SC.renderPreTalk(); break;
    case 'auditionSelect': html += SC.renderAuditionSelect(); break;
    case 'review':        html += SC.renderReview(); break;
    case 'weekResult':    html += SC.renderWeekResult(); break;
    case 'seasonResult':  html += SC.renderSeasonResult(); break;
    case 'audition':      html += SC.renderAudition(); break;
    case 'simulation':    html += SC.renderSimulation(); break;   // v0.25.28: シミュレーション（sim_ui.js）
    case 'continueAsk':   html += SC.renderContinueAsk(); break;
    case 'finalsHome':    html += SC.renderFinalsHome(); break;
    case 'ending':        html += SC.renderEnding(); break;
    default:              html += '<p>不明な画面状態</p>';
  }
  // v0.25.47: 本編はタイトル以外の全画面で右上に「ホーム」（トップ画面へ。ユーザー指定「編成〜プロデュース中（オデ中含む）いつでも・位置は固定・右上」）。
  //   #app 基準の絶対配置なので画面ごとに位置が変わらない。押すとセーブして再読込＝タイトル（WING で続きから。main.js の 'wing-home'）。シミュは従来の sim-home-top
  const wingHome = scr !== 'title' && !SC.state.simMode;
  if (wingHome) html += `<button class="give-up-btn wing-home-top" data-action="wing-home" title="トップ画面へ戻る（プロデュースはWINGから続きを再開できます）">${SC.icon('home')}<span>ホーム</span></button>`;
  // v0.25.16: スキルパネルのスクロール位置を退避（innerHTML置換で失われるため。再レンダ時に復元）
  const prevVp = document.getElementById('review-main');
  if (prevVp) SC._reviewScroll = { left: prevVp.scrollLeft, top: prevVp.scrollTop };
  app.innerHTML = html;
  app.classList.toggle('sim-mode', scr === 'simulation');   // v0.25.28: シミュレーション画面の目印
  app.classList.toggle('wing-home-on', wingHome);           // v0.25.47: ヘッダ右端をホームボタンの分だけ空ける（style.css）
  // v0.25.12: 画面別BGM 10シーン体系（ユーザー指定。audio/bgm/{scene}.mp3 優先・なければ合成ループ）
  // ①unit ②-1home ②-2home_tense(本戦前) ③prepare(オデ前) ④-1audition ④-2audition_final
  // ⑤-1reveal(発表ドラムロール) ⑤-2result_pass ⑤-3result_fail ⑥grand(エンディング感動)
  if (SC.audio) {
    let bgmScene;
    const aud = SC.state.audition;
    if (scr === 'audition') {
      if (aud && aud.finished) {
        if (aud.revealDone || aud.revealFinal) {
          bgmScene = (aud.result && aud.result.passed) ? 'result_pass' : 'result_fail';
        } else {
          bgmScene = 'reveal';   // 発表前コミュ〜ドラムロール
        }
      } else {
        bgmScene = (SC.state.finalsStage === 'final') ? 'audition_final' : 'audition';
      }
    }
    else if (scr === 'preTalk') bgmScene = SC.state.finalsStage ? 'home_tense' : 'prepare';   // 本戦前コミュは②-2継続（ユーザー指定）
    else if (scr === 'review') bgmScene = 'review';
    else if (scr === 'unitSelect' || scr === 'setup' || scr === 'itemSelect' || scr === 'title' || scr === 'simulation') bgmScene = 'unit';   // v0.25.28: simulationも'unit'
    else if (scr === 'ending') bgmScene = SC.state.ending && SC.state.ending.type === 'champion' ? 'grand' : 'result_fail';
    else bgmScene = SC.state.finalsStage ? 'home_tense' : 'home';
    SC.audio.bgm(bgmScene);
  }
  // v0.25.3 P3: 画面遷移の白フェードイン（screenが変わった時のみ。演出カット時はなし）
  const prevScreen = SC._lastScreen;
  SC._lastScreen = scr;
  // v0.25.12: 画面が切り替わったらcanvasパーティクルを全消去（紙吹雪の画面跨ぎ残留対策・ユーザーFB）
  if (prevScreen !== undefined && prevScreen !== scr && SC._pt) SC._pt.parts = [];
  if (prevScreen !== undefined && prevScreen !== scr && !SC.state.commsOff) {
    const fadeEl = document.createElement('div');
    // v0.25.10: オーディション突入時はNow Loading画面（rec3/load01実測: 黒地+右下白文字+羽根）
    fadeEl.className = (scr === 'audition') ? 'screen-fade-live' : 'screen-fade';
    app.appendChild(fadeEl);
    setTimeout(function () { if (fadeEl.parentNode) fadeEl.parentNode.removeChild(fadeEl); }, scr === 'audition' ? 920 : 340);
  }
  // 振り返り画面: ハニカムキャンバス中心（v0.16c: 700,550）をビューポート中央に初期スクロール
  // v0.25.16: 初回入場時のみセンタリング。滞在中の再レンダ（パネル取得等）はスクロール位置を保持（ユーザーFB）
  if (SC.state.screen === 'review') {
    var vp = document.getElementById('review-main');
    if (vp) {
      if (prevScreen === 'review' && SC._reviewScroll) {
        vp.scrollLeft = SC._reviewScroll.left;
        vp.scrollTop = SC._reviewScroll.top;
      } else {
        var zoom = (SC.state.reviewZoom || 1);
        // キャンバスのスケール後の中心座標 = CW/2*zoom, CH/2*zoom
        vp.scrollLeft = Math.max(0, Math.round(700 * zoom - vp.clientWidth / 2));
        vp.scrollTop  = Math.max(0, Math.round(550 * zoom - vp.clientHeight / 2));
      }
    }
  }
  // v0.15a: 下部常設ログペインを毎回更新（画面に関わらず常時表示）
  if (typeof SC.refreshGlobalLog === 'function') SC.refreshGlobalLog();
};

// ---- v0.25.18: タイトル画面「誰でもW.I.N.G.」（ユーザー指定・起動時に表示） ----
// v0.25.28: 全体タップ開始をやめ、ロゴ下に2ボタン（WING=従来の開始処理そのまま / シミュレーション=計算機モード）
// v0.25.28: 立ち絵imgに idol-default クラス（デフォルト画像時のみ構図CSS）
SC.renderTitle = function () {
  return `
  <main class="title-stage">
    <div class="title-rays"></div>
    <div class="title-logo">
      <span class="tl-sub">アイドルプロデュース</span>
      <span class="tl-main">誰でも<b>W.I.N.G.</b></span>
    </div>
    <div class="title-idol">
      <img class="${SC.idolImgClass()}" src="${SC.idolImg()}" alt="" onerror="this.classList.add('hidden')">
    </div>
    <div class="title-btns">
      <button class="title-btn title-btn-wing" data-action="title-start">WING</button>
      <button class="title-btn title-btn-sim" data-action="title-sim">シミュレーション</button>
    </div>
    <div class="title-note">非公式・個人用ファンメイド</div>
  </main>`;
};

// ---- v0.25.12: 立ち絵画像ヘルパ（ユーザーアップロード画像があれば優先。localStorage保存） ----
// v0.25.28: デフォルト立ち絵=ikutaharuki.png（全身・透過）／背景=haikei.jpg／丸アイコン用の顔切り抜き=ikutaharuki_face.png
//   （顔画像は tools/ffmpeg.exe -i app/img/ikutaharuki.png -vf "crop=1000:1000:925:50,scale=512:512" で生成）
SC.IDOL_IMG_DEFAULT = 'img/ikutaharuki.png';
SC.IDOL_FACE_DEFAULT = 'img/ikutaharuki_face.png';
SC.SCENE_BG_DEFAULT = 'img/haikei.jpg';
SC._idolImgCache = undefined;
SC.idolImg = function () {
  if (SC._idolImgCache !== undefined) return SC._idolImgCache;
  try {
    SC._idolImgCache = localStorage.getItem('sc_idol_img') || SC.IDOL_IMG_DEFAULT;
  } catch (e) { SC._idolImgCache = SC.IDOL_IMG_DEFAULT; }
  return SC._idolImgCache;
};
// v0.25.28: ユーザーがアップロードした画像が無い（=デフォルト画像）か。デフォルト時だけ構図CSS(.idol-default)を当てる
SC.idolIsDefault = function () { return SC.idolImg() === SC.IDOL_IMG_DEFAULT; };
SC.idolImgClass = function () { return SC.idolIsDefault() ? 'idol-default' : ''; };
// v0.25.28: 丸アイコン用の画像（ユーザー画像があればそれ／無ければ顔切り抜き）とobject-position・class
SC.idolFaceImg = function () { return SC.idolIsDefault() ? SC.IDOL_FACE_DEFAULT : SC.idolImg(); };
SC.idolFaceObjPos = function () { return SC.idolIsDefault() ? '50% 50%' : '50% ' + SC.idolFacePos() + '%'; };
SC.idolFaceClass = function () { return SC.idolIsDefault() ? 'idol-face-default' : ''; };
SC.setIdolImg = function (dataUrl) {
  try {
    if (dataUrl) localStorage.setItem('sc_idol_img', dataUrl);
    else { localStorage.removeItem('sc_idol_img'); localStorage.removeItem('sc_idol_facey'); }
  } catch (e) { alert('画像の保存に失敗（容量オーバーの可能性）。より小さい画像で試してください'); }
  SC._idolImgCache = undefined;
};
// v0.25.16: 顔位置（丸抜きアイコンのobject-position縦%。アップロード時に自動推定）
SC.idolFacePos = function () {
  try { return Number(localStorage.getItem('sc_idol_facey') || 0); } catch (e) { return 0; }
};
// v0.25.16: アイドル名の自由入力（ユーザー指定。ブラウザ内保存）。v0.25.31: 未入力なら「ゲスト」（SC.DEFAULT_IDOL_NAME）
SC.customIdolName = function () {
  try { return localStorage.getItem('sc_idol_name') || null; } catch (e) { return null; }
};
SC.setIdolName = function (name) {
  try {
    if (name) localStorage.setItem('sc_idol_name', name);
    else localStorage.removeItem('sc_idol_name');
  } catch (e) {}
  SC.IDOL.name = name || SC.DEFAULT_IDOL_NAME || 'ゲスト';   // v0.25.31: 空にしたら「ゲスト」（判定用の realName は不変）
};

// ---- ヘッダー（原作準拠 v0.15b: 3列グリッド） ----
SC.renderHeader = function () {
  const st = SC.state;
  const season = SC.seasonIndex();
  const goal = SC.CONFIG.seasonFanGoals[season];
  const fansLeft = Math.max(0, goal - st.fans);
  const staminaPct = Math.round(st.stamina / SC.CONFIG.stamina.max * 100);
  const stColor = staminaPct > 50 ? 'ok' : (staminaPct > 25 ? 'warn' : 'danger');
  const face = SC.tensionFace();
  const memLv = SC.memoryLv();
  const memFixed = !!SC.normCheatMemLv(st.cheatMemLv);   // v0.25.44: チートの思い出Lv固定中は NEXT を出さない
  const nextLvNeed = !memFixed && memLv < 6 && SC.CONFIG.memoryLvTable[memLv + 1] !== undefined
    ? SC.CONFIG.memoryLvTable[memLv + 1] - st.love : null;

  let screenLabel = 'プロデュース';
  let centerHtml;
  if (st.finalsStage && st.screen !== 'seasonResult') {
    const fLabel = st.finalsStage === 'semi' ? '準決勝' : '決勝';
    screenLabel = 'W.I.N.G.本戦';
    centerHtml = `<div class="hdr-center-main">${fLabel}</div>
      <div class="hdr-stat-row">${SC.renderStatChips()}</div>`;
  } else {
    const weeksLeft = SC.weeksLeftInSeason();
    const modeLabel = ['ビギナー', 'ミドル', 'マスター'][st.mode];
    // v0.25.10 rec3/home1実測: ピンクリボン「シーズンN」+白パネル「📅残り[大数字]週」（数字オレンジ）
    centerHtml = `
      <div class="hdr-season-row">
        <span class="hdr-season-label">シーズン${season + 1}</span>
        <span class="hdr-weeks-panel"><span class="hdr-cal-ic">${SC.icon('calendar')}</span><span class="hdr-weeks-pre">残り</span><span class="hdr-weeks-num">${weeksLeft}</span><span class="hdr-weeks-label">週</span></span>
      </div>
      <div class="hdr-stat-row">${SC.renderStatChips()}</div>
      <div class="hdr-mode-row sub">通算${st.week}/${SC.CONFIG.TOTAL_WEEKS}週 ${modeLabel}</div>`;
  }

  if (st.simMode) screenLabel = 'シミュレーション';   // v0.25.28
  const goalLabel = st.finalsStage ? '' :
    (fansLeft > 0 ? `あと <b class="fans-left">${SC.fmt(fansLeft)}</b>人` : '<span class="clear-badge">CLEAR!</span>');

  // v0.25.29: シミュ中は右上に「ホーム」ボタン（既存の諦めるボタン風・押すとトップ画面へ=再読込。下パネルの「タイトルへ戻る」も残す）
  const simHomeBtn = st.simMode
    ? `<button class="give-up-btn sim-home-top" data-action="sim-back-title" title="トップ画面へ戻る">${SC.icon('home')}<span>ホーム</span></button>` : '';
  // v0.25.41: シミュは「ホーム」の隣に音量ボタン（クリックでSE/BGMスライダー＋ミュートのポップオーバー。sim_ui.js SC.simVolHtml。本編には出さない）
  const simVolBtn = (st.simMode && SC.simVolHtml) ? SC.simVolHtml() : '';
  // v0.25.42: 本編のヘッダーにも同じ音量ボタン（ユーザー常設指示「シミュ向けの表示改善は本編にも反映」。部品・設定値・反映経路はシミュと同じ SC.simVolHtml / SC.audio.setConfig / main.js の委譲）。
  //   本編は右側（ファン数・体力・テンション）が詰まっているので、左の空き（画面ラベル・アイドル名の右）に置く（.vol-hdr-left）。シミュは従来どおり右上（ホームの隣）
  const wingVolBtn = (!st.simMode && SC.simVolHtml) ? SC.simVolHtml('vol-hdr-left') : '';
  return `
  <header class="topbar topbar-3col">
    ${simHomeBtn}${simVolBtn}
    <div class="hdr-left">
      <span class="hdr-screen-label">${screenLabel}</span>
      <span class="hdr-idol-name">${SC.IDOL.name}</span>
      ${wingVolBtn}
    </div>
    <div class="hdr-center">${centerHtml}</div>
    <div class="hdr-right">
      <div class="hdr-rank-fan">
        <span class="rank-badge"><i>${SC.icon('crown')}</i>${SC.rankOf(st.fans)}</span>
        ${st.finalsStage
          ? `<span class="fan-count hdr-fan-count">ファン ${SC.fmt(st.fans)}人</span>`
          : `<span class="fan-count hdr-fan-count" title="現在ファン ${SC.fmt(st.fans)}人">ファン人数 ${goalLabel}</span>`}
      </div>
      <div class="stamina-row hdr-stamina">
        <span class="mini-label">体力</span>
        <div class="stamina-bar"><div class="stamina-fill ${stColor}" style="width:${staminaPct}%"></div></div>
        <span class="mini-num">${st.stamina}</span>
      </div>
      <div class="hdr-subinfo">
        ${st.showTimer && st.startedAt ? `<span class="hdr-timer" id="hdr-timer">${SC.playTimerText ? SC.playTimerText() : '--:--'}</span>` : ''}
        <span class="tension tension-${face.key}">テンション:${face.label}</span>
        <span class="love">思い出Lv${memLv}${memFixed ? ' <span class="sub">(固定)</span>' : ''}${nextLvNeed !== null ? ` <span class="sub">(NEXTまであと${nextLvNeed})</span>` : ''}</span>
      </div>
    </div>
  </header>`;
};

// ---- ステータスチップ（ヘッダー中央列に挿入するヘルパー v0.15b） ----
SC.renderStatChips = function () {
  const st = SC.state;
  return `<span class="chip chip-vo">Vo <b class="srank">${SC.statRank(st.stats.vo)}</b>${st.stats.vo}</span>
    <span class="chip chip-da">Da <b class="srank">${SC.statRank(st.stats.da)}</b>${st.stats.da}</span>
    <span class="chip chip-vi">Vi <b class="srank">${SC.statRank(st.stats.vi)}</b>${st.stats.vi}</span>
    <span class="chip chip-me">Me <b class="srank">${SC.statRank(st.mental)}</b>${st.mental}</span>
    <span class="chip chip-sp">SP ${st.sp}</span>`;
};

// ---- 朝コミュ画面（強制カットイン。選択→結果→約束オファー→プロデュースへ） ----
// ---- v0.25.11: 約束の守/破コミュ（rec4実測: セリフ→テンション絵文字→緑バナー「約束を守った！」+親愛度+10） ----
// v0.25.28: 背景=SC.SCENE_BG_DEFAULT（haikei.jpg）、立ち絵imgに idol-default クラス（デフォルト画像時のみ構図CSS）
SC.renderPromiseComm = function () {
  const kept = SC.state.promiseComm === 'kept';
  // v0.25.27: 会話パターン（性格）で差し替え可能（未対応だったユーザーFBを反映）
  const pr = SC.personalityText().promiseResult;
  const line = kept ? pr.kept : pr.broken;
  // 演出シーケンス（rec4実測順・CSS delayで自動進行）: セリフ即時 → テンション絵文字(0.7s) → バナー(1.3s) → 親愛度(1.8s)
  const fx = SC.state.commsOff ? '' : (kept
    ? `<div class="tension-fx tf-up" style="animation-delay:.7s;opacity:0"><span class="tf-emoji">&#128522;</span><span class="tf-arrow">&#11014;</span>テンション</div>
       <div class="promise-banner"><i>${SC.icon('clover')}</i><span>約束を守った！</span><i>${SC.icon('clover')}</i></div>
       <div class="comm-fx-pop fx-pop-love" style="animation-delay:1.8s">&#128151; 親愛度 +${SC.CONFIG.promise.love}</div>`
    : `<div class="tension-fx tf-down" style="animation-delay:.7s;opacity:0"><span class="tf-emoji">&#128542;</span><span class="tf-arrow">&#11015;</span>テンション</div>
       <div class="promise-banner promise-banner-broken"><span>約束を破った……</span></div>`);
  return `
  <main class="morning-panel-v17 comm-stage" data-action="promise-comm-ok" style="cursor:pointer">
    <img class="scene-bg" src="${SC.SCENE_BG_DEFAULT}" alt="" onerror="this.remove()">
    <div class="comm-idol-area">
      <img class="${SC.idolImgClass()}" src="${SC.idolImg()}" alt="${SC.IDOL.name}" onerror="this.classList.add('hidden')">
    </div>
    ${fx}
    <div class="comm-talkbox">
      <div class="comm-talk-name">&#10022; ${SC.IDOL.name}</div>
      <div class="comm-talk-text">${line}</div>
    </div>
    <div class="reveal-hint" style="color:rgba(120,100,110,.65);left:0;right:0;text-align:center">タップで進む</div>
  </main>`;
};

// v0.25.28: 背景=SC.SCENE_BG_DEFAULT（haikei.jpg）、立ち絵imgに idol-default クラス（デフォルト画像時のみ構図CSS）
SC.renderMorning = function () {
  const st = SC.state;
  const ev = st.weekEvents || {};
  const m = ev.morning;

  // 朝コミュが存在しない週は即 home へ（念のため）
  if (!m) {
    st.screen = 'home';
    return SC.renderHome();
  }

  let html = '';

  // v0.25.17: 朝コミュ入りの遷移演出／v0.25.22: 実機3段階化（動画22-29-08実測:
  //   ①白地+「Morning」タイポ → ②淡ストライプ+虹色円形エンブレム（翼モチーフ・オリジナル画） → ③虹の斜め帯ワイプで抜け）
  // 週初回のみ・セッション変数管理（セーブ影響なし）・CSSアニメで自動進行
  let morningWipe = '';
  if (SC._morningWipeWeek !== st.week && !st.commsOff) {
    SC._morningWipeWeek = st.week;
    morningWipe = `<div class="morning-wipe">
      <span class="mw-text">Morning</span>
      <span class="mw-ring"></span>
      <svg class="mw-emblem" viewBox="0 0 120 120" aria-hidden="true">
        <defs><linearGradient id="mwEmbG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f6a8cc"/><stop offset=".5" stop-color="#c0a8f2"/><stop offset="1" stop-color="#9fd4f2"/>
        </linearGradient></defs>
        <path d="M60 88 Q34 78 26 50 Q42 58 51 53 Q36 44 34 26 Q50 36 57 33 Q50 22 53 10 Q64 24 61 44 Z" fill="url(#mwEmbG)" opacity=".92"/>
        <path d="M62 88 Q86 78 94 52 Q79 59 71 54 Q84 45 86 29 Q72 38 66 35 Q71 26 69 16 Q59 28 61 46 Z" fill="url(#mwEmbG)" opacity=".7"/>
        <circle cx="60" cy="97" r="4.5" fill="#f6a8cc" opacity=".85"/>
      </svg>
      <span class="mw-spark mw-spark1">&#10022;</span>
      <span class="mw-spark mw-spark2">&#10022;</span>
      <span class="mw-band"></span>
    </div>`;
  }

  // v0.25.6: 選択肢の仮置き文言セット（オリジナル文・kindsのシャッフル位置に対応。textSetはrollMorningで決定）
  const MORNING_TEXTS = [
    { perfect: 'よく頑張ってるな。無理はするなよ', good: '今日も一緒に頑張ろう', none: '早く支度してくれ' },
    { perfect: '昨日のレッスン、良くなってたぞ', good: '朝ごはんはちゃんと食べたか？', none: '時間がない、急ごう' },
    { perfect: '何か困ってることはないか？', good: '今日の予定を確認しようか', none: 'あとで話がある' },
  ];
  const mTexts = MORNING_TEXTS[m.textSet || 0];

  // 選択フェイズ（v0.25.2: 実機構図＝中央立ち絵・選択肢は左/中上/右の吹き出し・下部会話枠。crops/morning1.jpg実測）
  if (!m.done) {
    const posCls = ['cb-left cb-pink', 'cb-top cb-green', 'cb-right cb-orange'];
    // v0.25.13: 秘密のメモ帳所持時は選択肢の結果バッジを表示（スクショ222825実測: ✓Perfect桃/✓Good橙/✓Normal青）
    const hasMemo = (st.loadout || []).indexOf('memo') >= 0;
    const QB = { perfect: ['perfect', 'Perfect'], good: ['good', 'Good'], none: ['normal', 'Normal'] };
    const bubbles = m.choices.map(function (kind, i) {
      const qb = hasMemo && QB[kind]
        ? `<i class="cb-quality cbq-${QB[kind][0]}">&#10003; ${QB[kind][1]}</i>` : '';
      return `<button class="comm-bubble ${posCls[i]}" data-action="morning-choice" data-i="${i}">${qb}<span>${mTexts[kind] || '……'}</span><i class="cb-check">&#10003;</i></button>`;
    }).join('');
    html = `
    <main class="morning-panel-v17 comm-stage">
      <img class="scene-bg" src="${SC.SCENE_BG_DEFAULT}" alt="" onerror="this.remove()">
      <div class="comm-idol-area">
        <img class="${SC.idolImgClass()}" src="${SC.idolImg()}" alt="${SC.IDOL.name}" onerror="this.classList.add('hidden')">
      </div>
      ${bubbles}
      <div class="comm-talkbox">
        <div class="comm-talk-name">&#10022; プロデューサー</div>
        <div class="comm-talk-text">なんて声をかける？</div>
      </div>
      ${morningWipe}
    </main>`;
    return html;
  }

  // 結果フェイズ（v0.25.4: コミュ構図のまま=立ち絵+アイドルの反応セリフ+テンション/思い出Lv演出+約束オファー）
  // 反応セリフはオリジナル文（原作セリフは使わない）。v0.25.26: 会話パターン（性格）で差し替え可能
  const reactLines = SC.personalityText().react;
  const reactLine = reactLines[m.kind] || reactLines.normal;

  // v0.25.14: 結果演出（親愛度/テンション/思い出Lv）はプロデューサー反応（preact）でまとめて表示（ユーザー指定）
  let fxPops = '';

  // v0.25.6: 結果フェイズを段階制に（react=反応 → promise=約束打診 → reply=約束返答）
  // 順序修正: 約束受諾後に朝コミュ反応が再表示される問題の根治（ユーザー指摘）
  const stage = m.stage || 'react';
  let promiseBubbles = '';
  let talkName = SC.IDOL.name;
  let talkText = '';
  let tapAction = '';   // 画面タップの遷移先

  if (stage === 'react') {
    // v0.25.15: 判定・効果はここでは出さない（ネタバレになる・ユーザー指摘）→ P反応（preact）でまとめて表示
    talkText = reactLine;
    tapAction = 'morning-next';   // → プロデューサー反応（preact）へ
  } else if (stage === 'preact') {
    // v0.25.13: プロデューサー側の内心反応（ユーザー指定・動画22-29-08実測の流れ）
    // v0.25.14: 結果演出（ランクリボン+親愛度/テンション/思い出Lv）をここでまとめて表示（ユーザー指定）
    const pLines = {
      perfect: '（よし、楽しく話せたな）',
      good: '（まぁ、普通に話せたかな）',
      normal: '（うっ……しまった。別のことを言えば良かったな……）',
    };
    const commRank = { perfect: 'Perfect', good: 'Good', normal: 'Normal' }[m.kind] || 'Normal';
    if (!SC.state.commsOff) {
      fxPops = `<div class="comm-rank-ribbon crr-${commRank.toLowerCase()}">${commRank}コミュニケーション</div>`;
      if (m.kind === 'perfect') fxPops += '<div class="tension-fx tf-up" style="animation-delay:.35s;opacity:0"><span class="tf-emoji">😊</span><span class="tf-arrow">⬆</span>テンション</div>';
      if (m.kind === 'perfect' || m.kind === 'good') {
        const lv = m.kind === 'perfect' ? SC.CONFIG.morning.lovePerfect : SC.CONFIG.morning.loveGood;
        fxPops += '<div class="comm-fx-pop fx-pop-love" style="animation-delay:.6s">親愛度 +' + lv + '</div>';
      }
      if (ev.memLvUp) {
        fxPops += '<div class="comm-fx-pop fx-pop-memlv" style="animation-delay:.9s;opacity:0">思い出レベルアップ！ Lv' + ev.memLvUp + '</div>';
        ev.memLvUp = null;   // 表示後クリア（loveBurstと同パターン）
      }
    }
    talkName = 'プロデューサー';
    talkText = pLines[m.kind] || pLines.normal;
    tapAction = 'morning-preact-next';   // オファーあれば打診へ・なければ進行
  } else if (stage === 'promise' && ev.promiseOffer) {
    fxPops = '';   // 打診画面では朝コミュの演出ポップは出さない
    const f = ev.promiseOffer.facility;
    const label = SC.promiseFacilityLabel(f);
    const weekLabel = ev.promiseOffer.weekLabel || '来週';
    // rec4実測: 「二週間後にビジュアルレッスンお願いできませんか？」→「いいよ」吹き出し
    talkText = (f === 'rest'
      ? `${weekLabel}、お休みをもらえませんか？`
      : `${weekLabel}に<b>${label}</b>お願いできませんか？`) + `<br>
      <span class="sub">守れば親愛度+${SC.CONFIG.promise.love}／断るとテンション-5</span>`;
    promiseBubbles = `
      <button class="comm-bubble cb-left cb-green" data-action="morning-promise-ok"><span>いいよ</span><i class="cb-check">&#10003;</i></button>
      <button class="comm-bubble cb-right cb-orange" data-action="morning-promise-ng"><span>ごめん、今回は難しい</span><i class="cb-check">&#10003;</i></button>`;
  } else {
    // reply: 約束の返答（守/破の結果はここでは出ない＝約束週の終了後にpromiseCommで出る）
    // v0.25.26: 会話パターン（性格）で差し替え可能
    fxPops = '';
    const pr = SC.personalityText().promiseReply;
    talkText = m.promiseReply === 'ok' ? pr.ok : pr.ng;
    tapAction = 'morning-proceed';
  }

  html = `
  <main class="morning-panel-v17 comm-stage" ${tapAction ? `data-action="${tapAction}" style="cursor:pointer"` : ''}>
    <img class="scene-bg" src="${SC.SCENE_BG_DEFAULT}" alt="" onerror="this.remove()">
    <div class="comm-idol-area">
      <img class="${SC.idolImgClass()}" src="${SC.idolImg()}" alt="${SC.IDOL.name}" onerror="this.classList.add('hidden')">
    </div>
    ${fxPops}
    ${promiseBubbles}
    <div class="comm-talkbox">
      <div class="comm-talk-name">&#10022; ${talkName}</div>
      <div class="comm-talk-text">${talkText}</div>
    </div>
    ${tapAction ? '<div class="reveal-hint" style="color:rgba(120,100,110,.65);left:0;right:0;text-align:center">タップで進む</div>' : ''}
  </main>`;
  return html;
};

// ---- 編成画面（unitSelect） ----
SC.renderUnitSelect = function () {
  const st = SC.state;
  // 現在の draft（未変更なら保存済みロードアウトを読み込む）
  const draft = st.unitSelectDraft || SC.loadLoadout() || { p: null, supports: [null,null,null,null], guest: null };
  // stateに書き戻す（フィルタ状態維持のため）
  if (!st.unitSelectDraft) st.unitSelectDraft = draft;

  // 選択済みカードIDセット（重複選択禁止チェック用）
  const usedIds = new Set();
  if (draft.p) usedIds.add(draft.p);
  (draft.supports || []).forEach(function (id) { if (id) usedIds.add(id); });
  if (draft.guest) usedIds.add(draft.guest);

  // スロット情報の定義
  const slots = [
    { key: 'p',     label: 'Pアイドル',  cardType: 'P' },
    { key: '0',     label: 'サポートA',  cardType: 'S' },
    { key: '1',     label: 'サポートB',  cardType: 'S' },
    { key: '2',     label: 'サポートC',  cardType: 'S' },
    { key: '3',     label: 'サポートD',  cardType: 'S' },
    { key: 'guest', label: 'ゲスト',     cardType: 'S' }
  ];

  // 各スロットのカードID取得
  const getSlotCardId = function (key) {
    if (key === 'p') return draft.p;
    if (key === 'guest') return draft.guest;
    return draft.supports[Number(key)] || null;
  };

  // カード情報の簡易表示文字列
  const cardChip = function (cardId, slotKey) {
    if (!cardId) {
      return `<span class="us-slot-empty">（仮データ）</span>`;
    }
    const c = SC.findCard ? SC.findCard(cardId) : null;
    if (!c) return `<span class="us-slot-empty">（不明）</span>`;
    const stats = SC.cardStats ? SC.cardStats(c) : null;
    // Pカードは stats=null のため、pCardInitial で推定ステを表示する [仮データ]
    let statsStr;
    if (stats) {
      statsStr = `Vo${stats.vo}/Da${stats.da}/Vi${stats.vi}/Me${stats.me}`;
    } else if (c.type === 'P') {
      statsStr = '初期ステ50（固定）';
    } else {
      statsStr = '-';
    }
    const rarityClass = { SSR: 'rarity-ssr', SR: 'rarity-sr', R: 'rarity-r', UR: 'rarity-ur' }[c.rarity] || '';
    return `<span class="us-card-chip">
      <span class="us-card-rarity ${rarityClass}">${c.rarity}</span>
      <span class="us-card-name">${c.name}</span>
      <span class="sub">（${c.idolName}）${statsStr}</span>
    </span>`;
  };

  // 6スロット表示
  const slotsHtml = slots.map(function (slot) {
    const cardId = getSlotCardId(slot.key);
    const isOpen = st.unitSelectSlot === slot.key;
    const clearBtn = cardId
      ? `<button class="text-btn us-clear-btn" data-action="unit-select-clear-slot" data-slot="${slot.key}">解除</button>`
      : '';
    return `<div class="us-slot ${isOpen ? 'us-slot-open' : ''}">
      <div class="us-slot-label">${slot.label}</div>
      <div class="us-slot-card" data-action="unit-select-slot" data-slot="${slot.key}">
        ${cardChip(cardId, slot.key)}
        <span class="us-slot-hint">▼ 変更</span>
      </div>
      ${clearBtn}
    </div>`;
  }).join('');

  // カード選択リスト（スロット選択中のみ表示）
  let listHtml = '';
  if (st.unitSelectSlot !== null && st.unitSelectSlot !== undefined) {
    const activeSlot = slots.find(function (s) { return s.key === st.unitSelectSlot; });
    const cardType = activeSlot ? activeSlot.cardType : 'S';
    const idolFilter = st.unitSelectIdolFilter || '';
    const rarityFilter = st.unitSelectRarityFilter || '';

    // アイドルセレクトボックス
    let idolOpts = '<option value="">アイドルを選んでください</option>';
    if (SC.CARDS && SC.CARDS.idols) {
      Object.values(SC.CARDS.idols).forEach(function (idol) {
        const sel = idolFilter === idol.no ? 'selected' : '';
        idolOpts += `<option value="${idol.no}" ${sel}>${idol.name}</option>`;
      });
    }

    // レアリティフィルタボタン
    const rarities = ['SSR', 'SR', 'R', 'UR'];
    const rarityBtns = rarities.map(function (r) {
      const sel = rarityFilter === r;
      return `<button class="us-rarity-btn ${sel ? 'us-rarity-sel' : ''}" data-action="unit-select-filter-rarity" data-rarity="${sel ? '' : r}">${r}</button>`;
    }).join('');

    // カードリスト描画（フィルタなしは全件描画を避けるため「アイドルを選んでください」）
    let cardsHtml = '';
    if (!SC.CARDS) {
      cardsHtml = '<p class="us-list-hint">カードデータ読み込み中…</p>';
    } else if (!idolFilter) {
      cardsHtml = '<p class="us-list-hint">アイドルを選んでカードを絞り込んでください</p>';
    } else {
      const filtered = SC.CARDS.cards.filter(function (c) {
        if (c.type !== cardType) return false;
        if (c.idolNo !== idolFilter) return false;
        if (rarityFilter && c.rarity !== rarityFilter) return false;
        return true;
      });
      if (filtered.length === 0) {
        cardsHtml = '<p class="us-list-hint">該当するカードがありません</p>';
      } else {
        cardsHtml = filtered.map(function (c) {
          const stats = SC.cardStats ? SC.cardStats(c) : null;
          // Pカードは stats=null → pCardInitial で推定ステを表示 [仮データ]
          let statsStr;
          if (stats) {
            statsStr = `Vo${stats.vo} Da${stats.da} Vi${stats.vi} Me${stats.me}`;
          } else if (c.type === 'P') {
            statsStr = '初期ステ50（固定）';
          } else {
            statsStr = '-';
          }
          const used = usedIds.has(c.id) && getSlotCardId(st.unitSelectSlot) !== c.id;
          const rarityClass = { SSR: 'rarity-ssr', SR: 'rarity-sr', R: 'rarity-r', UR: 'rarity-ur' }[c.rarity] || '';
          return `<button class="us-card-row ${used ? 'us-card-used' : ''}" data-action="unit-select-card" data-id="${c.id}" ${used ? 'disabled' : ''}>
            <span class="us-card-rarity ${rarityClass}">${c.rarity}</span>
            <span class="us-card-name">${c.name}</span>
            <span class="us-card-stats sub">${statsStr}</span>
          </button>`;
        }).join('');
      }
    }

    listHtml = `
    <div class="us-list-panel">
      <div class="us-list-head">
        <span class="us-list-title">${activeSlot ? activeSlot.label : ''}のカードを選択</span>
        <button class="text-btn" data-action="unit-select-close-list">✕ 閉じる</button>
      </div>
      <div class="us-filters">
        <select id="us-idol-sel" onchange="SC.state.unitSelectIdolFilter=this.value;SC.render()">
          ${idolOpts}
        </select>
        <div class="us-rarity-row">${rarityBtns}</div>
      </div>
      <div class="us-card-list">${cardsHtml}</div>
    </div>`;
  }

  // v0.22: カード詳細エリア（選択中または直前に選択したカードの詳細を下部に表示）
  let cardDetailHtml = '';
  {
    const detailId = st.unitSelectDetailCard;
    const dc = detailId && SC.findCard ? SC.findCard(detailId) : null;
    if (dc) {
      const rarityClass = { SSR: 'rarity-ssr', SR: 'rarity-sr', R: 'rarity-r', UR: 'rarity-ur' }[dc.rarity] || '';
      // ライブスキル（Sカード）
      let lsHtml = '';
      if (dc.liveSkill) {
        const ls = dc.liveSkill;
        lsHtml = `<div class="cd-row"><b>ライブスキル:</b> ${ls.name} — ${ls.effect || ''}</div>`;
      }
      // Pカードのパネル概要
      let panelHtml = '';
      if (dc.type === 'P' && dc.panels && dc.panels.length > 0) {
        const livePanels = dc.panels.filter(function (p) { return p.isLiveSkill; });
        const capPanels = dc.panels.filter(function (p) { return p.effect && p.effect.kind === 'cap'; });
        const items = [];
        if (livePanels.length > 0) {
          items.push('ライブスキル×' + livePanels.length + '（' + livePanels.map(function (p) { return p.name; }).join('、') + '）');
        }
        if (capPanels.length > 0) {
          items.push('上限UP×' + capPanels.length);
        }
        items.push('パネル全' + dc.panels.length + '枚');
        panelHtml = `<div class="cd-row sub">${items.join(' / ')}</div>`;
      }
      // サポートスキル一覧（Sカード）
      let ssHtml = '';
      if (dc.supportSkills && dc.supportSkills.length > 0) {
        ssHtml = '<div class="cd-row"><b>サポスキ:</b> ' +
          dc.supportSkills.map(function (s) { return s.name; }).join(' / ') + '</div>';
      }
      cardDetailHtml = `
      <div class="us-card-detail">
        <div class="cd-head">
          <span class="us-card-rarity ${rarityClass}">${dc.rarity}</span>
          <span class="cd-name">${dc.name}</span>
          <span class="sub">（${dc.idolName}）</span>
        </div>
        ${lsHtml}${panelHtml}${ssHtml}
      </div>`;
    }
  }

  return `
  <main class="panel us-panel">
    <!-- v0.25.46: おまかせ編成は見出し「編成」のすぐ隣（ユーザー指定: 下の決定ボタン横だと分かりにくい。シミュの編成見出しと同じ配置） -->
    <h2 class="us-title">編成<button class="main-btn small us-random-btn us-omakase-head" data-action="omakase-open" title="アイドルを選んで、そのアイドルの強編成（P・サポ4・ゲスト）を入れる">${SC.icon('sparkle')}<span>おまかせ編成</span></button></h2>
    <div class="us-slots">${slotsHtml}</div>
    ${listHtml}
    <!-- v0.25.16: アイドルカスタマイズ（画像+名前。ユーザー指定: 編成画面の下に目立つように） -->
    <div class="us-custom-block">
      <b class="us-custom-title">&#127912; アイドルのカスタマイズ</b>
      <div class="us-custom-row">
        <label>立ち絵画像</label>
        <input type="file" id="idol-img-input" accept="image/*">
        <img class="us-custom-thumb" src="${SC.idolImg()}" alt="" onerror="this.style.display='none'">
        <button class="text-btn" data-action="idol-img-reset">初期に戻す</button>
      </div>
      <div class="us-custom-row">
        <label>アイドル名</label>
        <input type="text" id="idol-name-input" maxlength="16" value="${SC.customIdolName() || ''}" placeholder="未入力なら「ゲスト」">
      </div>
      <div class="us-custom-row">
        <label>会話パターン</label>
        ${[['cute', 'かわいい系'], ['cool', 'クール系'], ['genki', '元気系']].map(function (pv) {
          const sel = SC.idolPersonality() === pv[0];
          return `<button class="personality-btn ${sel ? 'personality-selected' : ''}" data-action="idol-personality" data-key="${pv[0]}">${pv[1]}</button>`;
        }).join('')}
      </div>
      <p class="sub">背景は<b>透過PNG推奨</b>（写真背景の自動合成は非対応）。画像の透過は<a href="https://www.remove.bg/ja/upload" target="_blank" rel="noopener">こちらから</a>。透過PNGは余白の自動クロップ+顔位置の自動調整あり。画像・名前はブラウザ内保存のみ・外部送信なし</p>
    </div>
    <div class="us-actions">
      <!-- v0.25.18: 編成が6枠揃うまで決定不可（ユーザー指定）。仮データ開始も削除 -->
      <button class="main-btn small us-decide-btn" data-action="unit-select-decide"
        ${(draft.p && draft.supports.every(function (s) { return !!s; }) && draft.guest) ? '' : 'disabled'}>決定 → 設定へ</button>
    </div>
    ${cardDetailHtml}
    <!-- v0.21: 前進フローのため戻るボタン不要（撤去） -->
    ${SC._omakaseOpen ? SC.omakasePopHtml() : ''}
  </main>`;
};

// ---- v0.25.31: おまかせ編成のアイドル選択モーダル（.modal-overlay/.modal-box 流用）。本編の編成画面とシミュで共用 ----
// SC.OMAKASE_LOADOUTS（config.js・アイドル番号→{src,p,supports[4],guest}）を番号順に並べ、フルネームと出典（src）を表示。
// 押すと data-action="omakase-pick" data-no=番号（main.js が本編=編成ドラフトに適用 / シミュ=入力に反映）
SC.omakasePopHtml = function () {
  const o = SC.OMAKASE_LOADOUTS || {};
  const nm = function (no) { return (SC.CARDS && SC.CARDS.idols && SC.CARDS.idols[no]) ? SC.CARDS.idols[no].name : no; };
  const btns = Object.keys(o).sort().map(function (no) {
    // v0.25.32: 名前だけ表示（ユーザー指定: 出典「8.5th 1位」等は出さない。出典はデータ側の src に保持）
    return '<button class="omakase-btn" data-action="omakase-pick" data-no="' + no + '"><b>' + nm(no) + '</b></button>';
  }).join('');
  return '<div class="modal-overlay" data-action="omakase-close">' +
    '<div class="modal-box omakase-box" onclick="event.stopPropagation()">' +
      '<div class="modal-title">おまかせ編成（アイドルを選択）</div>' +
      '<div class="omakase-grid">' + btns + '</div>' +
      '<button class="modal-cancel" style="margin-top:10px" data-action="omakase-close">閉じる</button>' +
    '</div></div>';
};

// v0.25.44: 思い出Lv固定の選択肢（''=通常 / 1〜5。P-URは6も）。プロデュース設定画面と⚙オプションで共用
SC.cheatMemLvOptionsHtml = function (cur) {
  const sel = Math.min(SC.normCheatMemLv(cur) || 0, SC.cheatMemLvMax()) || null;   // 6を選んだ後にP-UR以外へ変えた場合は Lv5 表示（SC.memoryLv と同じ丸め）
  let html = `<option value="" ${sel ? '' : 'selected'}>通常（親愛度で上がる）</option>`;
  for (let lv = 1; lv <= SC.cheatMemLvMax(); lv++) html += `<option value="${lv}" ${sel === lv ? 'selected' : ''}>Lv${lv}</option>`;
  return html;
};

// ---- プロデュース開始設定画面 ----
SC.renderSetup = function () {
  const draft = SC.state.setupDraft || { mode: 1, items: [], from: 'home' };
  // v0.13b: 前回のチート設定を復元（v0.25.44: この画面に入って最初の描画で1回だけ。
  //   従来は「draftにチート設定が無ければ毎回」で、全部OFFにすると次の描画で保存値に戻っていた）
  if (!draft.cheatRestored) {
    draft.cheatRestored = true;
    const saved = SC.loadCheatSettings ? SC.loadCheatSettings() : null;
    if (saved) {
      if (saved.cheatStats && !draft.cheatStats) draft.cheatStats = saved.cheatStats;
      if (saved.commsOff && !draft.commsOff) draft.commsOff = saved.commsOff;
      if (saved.cheatAllPanels && !draft.cheatAllPanels) draft.cheatAllPanels = saved.cheatAllPanels;
      if (saved.showTimer && !draft.showTimer) draft.showTimer = saved.showTimer;   // v0.25.6
      if (saved.cheatMemLv && !draft.cheatMemLv) draft.cheatMemLv = SC.normCheatMemLv(saved.cheatMemLv);   // v0.25.44
      if (saved.cheatHighTension && !draft.cheatHighTension) draft.cheatHighTension = true;              // v0.25.44
    }
    SC.state.setupDraft = draft;
  }
  const modeLabels = ['ビギナー', 'ミドル', 'マスター'];
  const modeBtns = modeLabels.map(function (label, i) {
    const sel = draft.mode === i;
    return `<button class="mode-btn ${sel ? 'mode-selected' : ''}" data-action="setup-mode" data-mode="${i}">${label}</button>`;
  }).join('');

  // v0.17: アイテム持込画面（実機寄せレイアウト）
  const itemSlots = [0, 1].map(function (i) {
    const key = draft.items[i];
    const item = key ? SC.CONFIG.produceItems.find(function (p) { return p.key === key; }) : null;
    if (item) {
      return `<div class="item-slot filled">${item.name}</div>`;
    }
    return `<div class="item-slot">${i === 0 ? 'アイテム1' : 'アイテム2'}</div>`;
  }).join('');

  const itemGridBtns = SC.CONFIG.produceItems.map(function (item) {
    const sel = draft.items.indexOf(item.key) >= 0;
    const disabled = !sel && draft.items.length >= 2;
    return `<button class="item-setup-grid-btn ${sel ? 'selected' : ''}" data-action="setup-item" data-key="${item.key}"
      ${disabled ? 'disabled' : ''}>
      <div>${item.name}</div>
      <div class="item-count">${item.desc}</div>
    </button>`;
  }).join('');

  // v0.25.6: タイマー表示（チートとは別枠のオプション）
  const timerHtml = `
  <div class="setup-section">
    <h3>タイマー表示</h3>
    <label class="cheat-toggle">
      <input type="checkbox" id="opt-show-timer" ${draft.showTimer ? 'checked' : ''}>
      プレイ経過時間を画面右上に常時表示する
    </label>
  </div>`;

  // チート設定UI
  const cheat = draft.cheatStats || {};
  const cheatHtml = `
  <details class="setup-cheat">
    <summary>⚙ プロデュース設定（チート）</summary>
    <div class="setup-section">
      <h3>チート: 初期ステータス自由設定</h3>
      <div class="cheat-stats-row">
        <label>Vo <input class="cheat-input" type="number" min="1" max="9999" placeholder="50" id="cheat-vo" value="${cheat.vo || ''}"></label>
        <label>Da <input class="cheat-input" type="number" min="1" max="9999" placeholder="50" id="cheat-da" value="${cheat.da || ''}"></label>
        <label>Vi <input class="cheat-input" type="number" min="1" max="9999" placeholder="50" id="cheat-vi" value="${cheat.vi || ''}"></label>
        <label>Me <input class="cheat-input" type="number" min="1" max="9999" placeholder="50" id="cheat-me" value="${cheat.me || ''}"></label>
        <label>SP <input class="cheat-input" type="number" min="0" max="9999" placeholder="0" id="cheat-sp" value="${cheat.sp || ''}"></label>
      </div>
    </div>
    <div class="setup-section">
      <h3>思い出レベル</h3>
      <label class="cheat-toggle">
        思い出Lv <select id="cheat-mem-lv">${SC.cheatMemLvOptionsHtml(draft.cheatMemLv)}</select>
      </label>
    </div>
    <!-- v0.25.45: チェックボックス系は下にまとめる（ユーザー指定） -->
    <div class="setup-section setup-cheat-checks">
      <label class="cheat-toggle">
        <input type="checkbox" id="cheat-comms-off" ${draft.commsOff ? 'checked' : ''}>
        演出カット（コミュ・オデ前会話・結果発表・アピール演出等を全てスキップして即時反映）
      </label>
      <label class="cheat-toggle">
        <input type="checkbox" id="cheat-all-panels" ${draft.cheatAllPanels ? 'checked' : ''}>
        スキルパネル全習得済みで開始（rawパネル除く。ライブスキル枠は4枠制限維持）
      </label>
      <label class="cheat-toggle">
        <input type="checkbox" id="cheat-high-tension" ${draft.cheatHighTension ? 'checked' : ''}>
        ハイテンションモード（常にハイテンション。トラブル・約束を破る等のテンションダウンの効果を受けない）
      </label>
    </div>
  </details>`;

  return `
  <main class="panel">
    <h2>プロデュース設定</h2>
    <div class="setup-section">
      <h3>モード選択</h3>
      <div class="mode-row">${modeBtns}</div>
    </div>
    <!-- v0.17: アイテム持込画面（実機寄せ） -->
    <div class="setup-section">
      <div class="item-setup-breadcrumb">プロデュース選択 &gt; ユニット編成 &gt; アイテム選択</div>
      <div class="item-setup-layout">
        <div class="item-setup-left">
          <div class="item-bag-icon">📦</div>
          ${itemSlots}
        </div>
        <div class="item-setup-right">
          ${itemGridBtns}
        </div>
      </div>
      <div class="item-setup-footer">
        <span class="item-stamina-label">アイテムを2つまで持っていくことができます</span>
      </div>
    </div>
    ${timerHtml}
    ${cheatHtml}
    <button class="main-btn" data-action="setup-start">プロデュース開始！</button>
    <!-- v0.25.17: スクロールパネル内で矢印が浮いて見づらいFB → パネル左下のテキストボタンに（編成draftは保持される） -->
    <div class="setup-back-row">
      <button class="text-btn" data-action="setup-back-unit">&#8592; 編成に戻る</button>
    </div>
  </main>`;
};

// ---- コンティニュー確認画面 ----
SC.renderContinueAsk = function () {
  const st = SC.state;
  const tickets = st.continueTickets !== undefined ? st.continueTickets : 0;
  return `
  <main class="panel result-panel">
    <h2>敗退……</h2>
    <p>コンティニューチケットを使って再挑戦する？</p>
    <p>所持: <b>${tickets}</b>枚</p>
    <div class="act-row" style="justify-content:center;margin-top:16px;gap:14px">
      <button class="main-btn small c-audition" style="background:linear-gradient(135deg,#8e6ae8,#6a5acd)"
        data-action="continue-yes" ${tickets <= 0 ? 'disabled' : ''}>使う（再挑戦）</button>
      <button class="main-btn small" data-action="continue-no">使わない（プロデュース終了）</button>
    </div>
  </main>`;
};

// ---- 流行表示 ----
SC.renderTrend = function () {
  const marks = ['①', '②', '③'];
  const badges = SC.CONFIG.audition.trendBadge;
  return `
  <div class="trend-box"><h3>今週の流行</h3>
    ${SC.state.trend.map(function (attr, i) {
      return `<div class="trend-row"><span>${marks[i]}</span>
        <span class="chip chip-${attr}">${SC.ATTR_LABEL[attr]}</span>
        <span class="trend-mult">${badges[i]}</span></div>`;
    }).join('')}
  </div>`;
};

// ---- ホーム（v0.16a: 原作準拠レイアウト） ----
// v0.25.18: 週送りバナーは削除（ユーザーFB: 毎週出て鬱陶しい。ヘッダーの残り週表示で足りる）

// v0.25.28: 背景=SC.SCENE_BG_DEFAULT（haikei.jpg）、立ち絵imgに idol-default クラス（デフォルト画像時のみ構図CSS）
SC.renderHome = function () {
  const st = SC.state;
  const ev = st.weekEvents || {};
  let notices = '';

  // v0.25.5: 約束破りはnoticeでなく専用コミュ画面（promiseComm）で表示するため撤去
  if (ev.loveBurst) {
    notices += `<div class="notice good">💖 親愛度急上昇！ +100</div>`;
    ev.loveBurst = false;
  }
  if (ev.supportEvent) {
    // v0.25.22: 実機風バッジ付きバナー（v1955実測: 紫グラデ帯に白文字「サポート★イベント」+イベント名）
    notices += `<div class="supev-banner">
      <span class="supev-badge">&#10022; サポート&#9733;イベント &#10022;</span>
      <span class="supev-msg">${ev.supportEvent.msg}</span>
    </div>`;
    ev.supportEvent = null;
  }
  // v0.25.4: 思い出Lvアップ演出（ホーム到達時に発生していたら表示→クリア）
  if (ev.memLvUp && !SC.state.commsOff) {
    notices += `<div class="memlv-banner">💗 思い出レベルアップ！ Lv${ev.memLvUp}</div>`;
    ev.memLvUp = null;
  }
  // v0.25.11: 約束表示は目標週のみ（rec4実測: 事前の週にはアイコン・表示なし）
  if (st.promise && st.week === st.promise.targetWeek) {
    const label = SC.promiseFacilityLabel(st.promise.facility);
    notices += `<div class="notice promise"><span class="notice-clover">${SC.icon('clover')}</span> 今週の約束：<b>${label}</b></div>`;
  }

  // アイドル立ち絵（v0.25.4: ふれあい時は吹き出しセリフ+効果チップ）
  const touched = st.touchedWeek === st.week;
  const tb = ev.touchBubble;
  // v0.25.12: ホーム来訪ごとの吹き出し（ユーザー指定: 思い出Lv3未満3種/3以上3種・本戦前は特別・タッチで切替）
  // v0.25.26: 会話パターン（性格）で差し替え可能
  const IDLE_LINES_LOW = SC.personalityText().idleLow;
  const IDLE_LINES_HIGH = SC.personalityText().idleHigh;
  let idleLine;
  if (st.finalsStage === 'final') {
    idleLine = '決勝……。ここまで来たら、てっぺんを獲りましょうっ！';
  } else if (st.finalsStage === 'semi') {
    idleLine = '……いよいよ準決勝ですね。大丈夫、私、やれます';
  } else {
    SC._homeVisits = (SC._homeVisits || 0) + (SC._lastScreen !== 'home' ? 1 : 0);
    const lines = SC.memoryLv() >= 3 ? IDLE_LINES_HIGH : IDLE_LINES_LOW;
    idleLine = lines[(st.week + (SC._homeVisits || 0)) % lines.length];
  }
  const speech = (touched && tb)
    ? `<div class="idol-speech">${tb.line}<span class="idol-speech-fx">${tb.effect}</span></div>`
    : `<div class="idol-speech idol-speech-idle ${st.finalsStage ? 'idol-speech-finals' : ''}">${idleLine}</div>`;
  // v0.25.6: 吹き出しはoverflow:hiddenのステージ外（home-panel直下）に置く＝右端で見切れない
  const idolStage = `
  <div class="home-idol-stage" ${touched ? '' : 'data-action="touch"'}>
    <div class="idol-balloon">${SC.IDOL.name}</div>
    <img class="${SC.idolImgClass()}" src="${SC.idolImg()}" alt="${SC.IDOL.name}" onerror="this.classList.add('hidden')">
    <div class="idol-silhouette">👩</div>
    ${touched ? '' : '<div class="idol-touch-hint">タッチしてふれあう</div>'}
    <!-- v0.25.29: デフォルト画像時だけ有効なふれあい当たり判定（立ち絵の胴体〜顔の中央420px）。CSSで他は pointer-events:none -->
    <div class="idol-touch-hit"></div>
  </div>`;

  // 流行ポップアップ（state.showTrendPop が true のとき表示）
  let trendPop = '';
  if (st.showTrendPop) {
    const marks = ['①', '②', '③'];
    const badges = SC.CONFIG.audition.trendBadge;
    trendPop = `
    <div class="modal-overlay" data-action="trend-pop-close">
      <div class="modal-box trend-pop-box" onclick="event.stopPropagation()">
        <div class="modal-title">今週の流行</div>
        ${st.trend.map(function (attr, i) {
          return `<div class="trend-row"><span>${marks[i]}</span>
            <span class="chip chip-${attr}">${SC.ATTR_LABEL[attr]}</span>
            <span class="trend-mult">${badges[i]}</span></div>`;
        }).join('')}
        <button class="modal-cancel" style="margin-top:10px" data-action="trend-pop-close">閉じる</button>
      </div>
    </div>`;
  }

  // v0.25.3 P4: ⚙オプションポップ（音量設定。st.showOptionsPop で表示）
  let optionPop = '';
  if (st.showOptionsPop && SC.audio) {
    const ac = SC.audio.config;
    optionPop = `
    <div class="modal-overlay" data-action="option-pop-close">
      <div class="modal-box option-pop-box" onclick="event.stopPropagation()">
        <div class="modal-title">⚙ オプション</div>
        <div class="option-row">
          <label><input type="checkbox" data-opt="seOn" ${ac.seOn ? 'checked' : ''}> 効果音（SE）</label>
          <input type="range" data-opt="seVol" min="0" max="100" value="${Math.round(ac.seVol * 100)}">
        </div>
        <div class="option-row">
          <label><input type="checkbox" data-opt="bgmOn" ${ac.bgmOn ? 'checked' : ''}> BGM</label>
          <input type="range" data-opt="bgmVol" min="0" max="100" value="${Math.round(ac.bgmVol * 100)}">
        </div>
        <!-- v0.25.29: チート設定（プロデュース設定画面と同じ内容をプレイ中にも切替。ユーザー指定・文言固定） -->
        <div class="option-sec-title">チート設定</div>
        <div class="option-row option-row-chk">
          <label>思い出Lv <select data-opt="cheatMemLv">${SC.cheatMemLvOptionsHtml(st.cheatMemLv)}</select></label>
        </div>
        <div class="option-row option-row-chk">
          <label><input type="checkbox" data-opt="commsOff" ${st.commsOff ? 'checked' : ''}> 演出カット（コミュ・オデ前会話・結果発表・アピール演出等をスキップ）</label>
        </div>
        <div class="option-row option-row-chk">
          <label><input type="checkbox" data-opt="showTimer" ${st.showTimer ? 'checked' : ''}> プレイ経過時間を画面右上に表示</label>
        </div>
        <div class="option-row option-row-chk">
          <label><input type="checkbox" data-opt="cheatAllPanels" ${st.cheatAllPanels ? 'checked disabled' : ''}> スキルパネル全習得</label>
          <span class="sub option-note">（ONにすると元に戻せません）</span>
        </div>
        <div class="option-row option-row-chk">
          <label><input type="checkbox" data-opt="cheatHighTension" ${st.cheatHighTension ? 'checked' : ''}> ハイテンションモード（常にハイテンション・テンションダウンの効果なし）</label>
        </div>
        <div class="option-sec-sub">ステータス変更</div>
        <div class="option-stats-row">
          <label>Vo <input type="number" class="option-stat-in" id="opt-st-vo" min="1" max="9999" value="${st.stats.vo}"></label>
          <label>Da <input type="number" class="option-stat-in" id="opt-st-da" min="1" max="9999" value="${st.stats.da}"></label>
          <label>Vi <input type="number" class="option-stat-in" id="opt-st-vi" min="1" max="9999" value="${st.stats.vi}"></label>
          <label>Me <input type="number" class="option-stat-in" id="opt-st-me" min="1" max="9999" value="${st.mental}"></label>
          <label>SP <input type="number" class="option-stat-in" id="opt-st-sp" min="0" max="9999" value="${st.sp}"></label>
          <button class="main-btn small option-stat-apply" data-action="opt-stats-apply">反映</button>
        </div>
        <button class="modal-cancel" style="margin-top:10px" data-action="option-pop-close">閉じる</button>
      </div>
    </div>`;
  }

  // v0.25.20: 衣装ポップ（立ち絵チェンジ。ユーザーFB: オプションでなく衣装アイコンから）
  let costumePop = '';
  if (st.showCostumePop) {
    costumePop = `
    <div class="modal-overlay" data-action="costume-pop-close">
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="modal-title">&#128087; 衣装（立ち絵チェンジ）</div>
        <div class="option-row" style="flex-direction:column;align-items:flex-start;gap:6px">
          <label style="font-weight:bold">立ち絵画像（好きな画像をアップロードしてプロデュース）</label>
          <input type="file" id="idol-img-input" accept="image/*">
          <div style="display:flex;gap:8px;align-items:center">
            <img src="${SC.idolImg()}" alt="" style="height:60px;border-radius:6px;background:#f5eef5" onerror="this.style.display='none'">
            <button class="modal-cancel" style="margin:0;font-size:12px" data-action="idol-img-reset">初期画像に戻す</button>
          </div>
          <p class="sub" style="margin:0">縦長の全身/バストアップ画像推奨（透過PNGだと綺麗）。画像の透過は<a href="https://www.remove.bg/ja/upload" target="_blank" rel="noopener">こちらから</a>。ブラウザ内保存のみ・外部送信なし</p>
        </div>
        <button class="modal-cancel" style="margin-top:10px" data-action="costume-pop-close">閉じる</button>
      </div>
    </div>`;
  }

  // v0.17: 流行ウィジェット（常時表示）
  const attrColorChip = { vo: '#e94e6f', da: '#3aa0e8', vi: '#eeb420' };
  const trendBadges = SC.CONFIG.audition.trendBadge;
  const trendMarks = ['①', '②', '③'];
  const trendWidgetRows = (st.trend || []).map(function (attr, i) {
    const color = attrColorChip[attr] || '#aaa';
    const badge = trendBadges[i] || '';
    return `<div class="trend-widget-row">
      <span class="trend-widget-mark">${trendMarks[i] || ''}</span>
      <span class="trend-widget-rank" style="color:${color};font-weight:bold">${SC.ATTR_LABEL[attr] || attr}</span>
      <span class="trend-widget-badge">${badge}</span>
    </div>`;
  }).join('');
  const trendWidget = `
  <div class="home-trend-widget">
    <div class="trend-widget-title">流行</div>
    ${trendWidgetRows}
  </div>`;

  // v0.17: 編成確認ポップアップ
  let formationPop = '';
  if (st.showFormationPop) {
    const supLabels = ['サポA', 'サポB', 'サポC', 'サポD'];
    const idolRow = `<div class="formation-row">
      <span class="formation-label">P</span>
      <span class="formation-name">${SC.IDOL.name}（${SC.IDOL.rarity || 'SSR'}）</span>
    </div>`;
    const supRows = SC.SUPPORTS.map(function (s, i) {
      return `<div class="formation-row">
        <span class="formation-label">${supLabels[i] || ('サポ' + i)}</span>
        <span class="formation-name">${s.name}</span>
        <span class="formation-stat">Sk:${s.skill ? s.skill.name : '—'}</span>
      </div>`;
    }).join('');
    const guestRow = SC.GUEST ? `<div class="formation-row">
      <span class="formation-label">ゲスト</span>
      <span class="formation-name">${SC.GUEST.name}</span>
    </div>` : '';
    formationPop = `
    <div class="modal-overlay" data-action="formation-pop-close">
      <div class="modal-box" onclick="event.stopPropagation()" style="min-width:400px">
        <div class="modal-title">現在の編成</div>
        ${idolRow}${supRows}${guestRow}
        <button class="modal-cancel" style="margin-top:10px" data-action="formation-pop-close">閉じる</button>
      </div>
    </div>`;
  }

  // v0.17: アイテムポップアップ
  let itemPop = '';
  if (st.showItemPop) {
    const loadout = st.loadout || [];
    let itemListHtml = '';
    if (loadout.length === 0) {
      itemListHtml = '<p style="color:#aaa;font-size:13px">なし</p>';
    } else {
      itemListHtml = loadout.map(function (key) {
        const item = SC.CONFIG.produceItems.find(function (p) { return p.key === key; });
        // v0.25.13: 流行雑誌=使用ボタン付き（1回・流行1位を選択属性に変更。ユーザー指定）
        let useBtn = '';
        if (key === 'trendMag') {
          useBtn = st.trendMagUsed
            ? '<span class="sub">使用済み</span>'
            : '<button class="main-btn small" style="margin:0;font-size:12px;padding:4px 12px" data-action="trendmag-open">使用する</button>';
        }
        return `<div class="formation-row">
          <span class="formation-name">${item ? item.name : key}</span>
          <span class="formation-stat">${item ? item.desc : ''}</span>
          ${useBtn}
        </div>`;
      }).join('');
    }
    itemPop = `
    <div class="modal-overlay" data-action="item-pop-close">
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="modal-title">持込アイテム</div>
        ${itemListHtml}
        <button class="modal-cancel" style="margin-top:10px" data-action="item-pop-close">閉じる</button>
      </div>
    </div>`;
  }

  return `
  <main class="home-panel-v16b">
    <img class="scene-bg" src="${SC.SCENE_BG_DEFAULT}" alt="" onerror="this.remove()">
    ${trendPop}
    ${optionPop}
    ${costumePop}
    ${formationPop}
    ${itemPop}
    ${notices}
    <!-- v0.17: 左上縦アイコン列 -->
    <div class="home-left-icons">
      <button class="home-icon-btn" data-action="home-formation-pop" title="編成確認">
        👥<span class="icon-label">編成</span>
      </button>
      <button class="home-icon-btn" data-action="home-costume-pop" title="衣装変更（立ち絵チェンジ）">
        👗<span class="icon-label">衣装</span>
      </button>
      <button class="home-icon-btn" data-action="home-item-pop" title="アイテム確認">
        📦<span class="icon-label">アイテム</span>
      </button>
    </div>
    <!-- v0.17: 右側流行ウィジェット（常時表示） -->
    <!-- 右上: 諦める・オプション -->
    <div class="home-top-right-btns">
      <button class="give-up-btn" data-action="give-up" title="プロデュースを諦める">${SC.icon("flag")}<span>諦める</span></button>
      <button class="home-icon-btn" data-action="home-option-open" title="オプション" style="width:36px;height:36px;font-size:16px">${SC.icon("gear")}</button>
    </div>
    <!-- 中央: アイドル立ち絵（大）。吹き出しはoverflow外（見切れ防止） -->
    <div class="home-idol-area-v16b">
      ${idolStage}
    </div>
    ${speech}
    <!-- 左下: プロデュース + 休む（v0.25.10 rec3/home1実測: スケジュール帳+Excellent!!金リボン・休む=白+マグカップ） -->
    <!-- v0.25.12: 本戦（準決勝/決勝前）はW.I.N.G.挑戦ボタンに置き換え（ユーザー指定: 本戦前もホーム経由） -->
    <div class="home-main-btns">
      ${st.finalsStage ? `
      <button class="home-btn-produce-big home-btn-wing" data-action="audition-start" data-id="${st.finalsStage}">
        <span class="produce-sched">${SC.icon2('micstage')}</span>
        <span>W.I.N.G. ${st.finalsStage === 'semi' ? '準決勝' : '決勝'}へ</span>
      </button>` : `
      <button class="home-btn-produce-big" data-action="go-schedule">
        <span class="produce-sched">${SC.icon2('schedbook')}</span>
        ${SC.tensionFace().key === 'red' ? '<span class="produce-exc">Excellent!!</span>' : ''}
        <span>プロデュース</span>
      </button>
      <button class="home-btn-rest-big" data-action="rest">
        ${st.promise && st.promise.facility === 'rest' && st.week === st.promise.targetWeek ? '<span class="rest-promise-clover">' + SC.icon('clover') + '</span>' : ''}
        <span class="rest-cup">${SC.icon2('coffeecup')}</span>
        <span>休む</span>
      </button>`}
    </div>
    <!-- 右下: 振り返り + 流行確認（v0.25.7: 実機準拠=流行は右下タブレット・クリックで拡大ポップ） -->
    <div class="home-sub-btns">
      <button class="home-btn-review-sm" data-action="go-review">振り返り</button>
      <button class="home-trend-tablet" data-action="trend-pop-open" title="流行確認">
        <span class="trend-tablet-label">流行確認</span>
        ${(st.trend || []).map(function (attr, i) {
          const medal = ['🥇', '🥈', '🥉'][i] || '';
          return `<span class="trend-tablet-row tt-${attr}">${medal} ${SC.ATTR_LABEL[attr] || attr}</span>`;
        }).join('')}
      </button>
    </div>
  </main>`;
};

// ---- 直近結果ボックス（v0.15a: 画面下部の常設固定ペイン #global-log へ移動） ----
// home/schedule 側には挿入しない（上部スロット廃止でレイアウトシフト根絶）。
// 実際の描画は SC.refreshGlobalLog() が担当（SC.render()末尾で呼ぶ）。
SC.renderLastActionBox = function () {
  return ''; // v0.15a: 上部スロット撤去。下部固定ペインに移動済み
};

// ---- 下部ログペイン更新（render直後に呼ぶ。DOMが存在しない場合は無視） ----
SC.refreshGlobalLog = function () {
  const pane = document.getElementById('global-log');
  if (!pane) return;
  // v0.25.28: シミュレーション中はログの代わりに入力パネル+ダメージ表（sim_ui.js）を描く
  if (SC.state && SC.state.simMode && SC.simMountPanel) {
    pane.className = 'global-log-pane sim-pane';
    SC.simMountPanel(pane);
    if (SC.simOneShotKick) SC.simOneShotKick();   // v0.25.30: 1〆シミュレーション（入力が変わった時だけ再計算）
    if (SC.sim230Kick) SC.sim230Kick();           // v0.25.37: 230万周回の1〆数（1〆の計算が終わってから。入力キーが変わった時だけ再計算）
    return;
  }
  const pop = SC.state ? SC.state.lastActionPopup : null;
  if (!pop) {
    pane.innerHTML = '<div class="glp-empty">（実行結果がここに表示されます）</div>';
    pane.className = 'global-log-pane';
    return;
  }
  const okCls = pop.ok === false ? 'glp-bad' : 'glp-ok';
  const lines = (pop.lines || []).map(function (l) { return `<div class="glp-line">${l}</div>`; }).join('');
  pane.innerHTML = `<div class="glp-title">${pop.title || '結果'}</div>${lines}`;
  pane.className = 'global-log-pane ' + okCls;
};

// ---- スケジュール（v0.16a: レッスンタブ+オーディションタブ統合） ----
SC.renderSchedule = function () {
  const st = SC.state;
  const tab = st.scheduleTab || 'lesson';

  // --- レッスンタブコンテンツ ---
  let mainContent = '';
  if (tab === 'lesson') {
    const facilityKeys = Object.keys(SC.CONFIG.facilities);
    const selectedKey = st.scheduleSelected || facilityKeys[0];
    const F = SC.CONFIG.facilities[selectedKey];
    const pv = SC.facilityPreview(selectedKey);
    const lv = st.facilityLv[selectedKey];
    const kind = F.kind === 'lesson' ? 'lesson' : F.kind;
    const trouble = Math.round(SC.troubleRate(kind) * 100);
    const cost = SC.CONFIG.stamina.cost[kind];

    const members = (st.placement[selectedKey] || []).map(function (idx) {
      const name = idx === -1 ? SC.GUEST.name : SC.SUPPORTS[idx].name;
      const kz = idx === -1 ? st.guestKizuna : st.kizuna[idx];
      const ex = (st.excellentFlags[selectedKey] || []).indexOf(idx) >= 0;
      return `<span class="sch-member ${ex ? 'excellent' : ''}">${name}<span class="sub">絆${kz}</span>${ex ? '<b>EX!</b>' : ''}</span>`;
    }).join('') || '<span class="sub">サポート不在</span>';

    const gains = [`${SC.ATTR_LABEL[F.attr]}+${pv.stat}`];
    if (pv.me) gains.push(`Me+${pv.me}`);
    if (pv.sp) gains.push(`SP+${pv.sp}`);
    gains.push(`ファン+${SC.fmt(pv.fan)}`);

    const facilityBtns = Object.keys(SC.CONFIG.facilities).map(function (key) {
      const fac = SC.CONFIG.facilities[key];
      const facLv = st.facilityLv[key];
      // v0.25.11: 約束クローバーは目標週のみ表示（rec4実測: 緑の四つ葉バッジ・カード左上）
      const isPromise = st.promise && st.promise.facility === key && st.week === st.promise.targetWeek;
      const isSel = key === selectedKey;
      // v0.25.5: 滞在中のサポート/ゲストをアイコンで表示（ユーザー指定）
      const stayIcons = (st.placement[key] || []).map(function (idx) {
        const isGuest = idx === -1;
        const nm = isGuest ? (SC.GUEST ? SC.GUEST.name : 'G') : (SC.SUPPORTS[idx] ? SC.SUPPORTS[idx].name : '?');
        const ex = (st.excellentFlags[key] || []).indexOf(idx) >= 0;
        return `<span class="sch-stay-icon ${isGuest ? 'sch-stay-guest' : ''} ${ex ? 'sch-stay-ex' : ''}" title="${nm}${isGuest ? '（ゲスト）' : ''}${ex ? '・Excellent!' : ''}">${nm.charAt(0)}</span>`;
      }).join('');
      return `<button class="sch-fac-btn c-${fac.attr} ${isSel ? 'sch-fac-sel' : ''} ${isPromise ? 'sch-fac-promise' : ''}"
        data-action="schedule-select" data-key="${key}">
        <span class="sch-fac-lv">Lv${facLv}</span>
        <span class="sch-fac-name">${fac.label}</span>
        ${stayIcons ? `<span class="sch-stay-row">${stayIcons}</span>` : ''}
        ${isPromise ? '<span class="sch-promise-mark">' + SC.icon('clover') + '</span>' : ''}
      </button>`;
    }).join('');

    // v0.25.22: 直前行動の上昇分を緑吹き出しで表示（動画実測video1: +29/+5/+126がステ行に残る）
    const g = (st.lastGains && st.lastGains.week === st.week - 1) ? st.lastGains : null;
    const gb = function (k) {
      if (!g || !g[k]) return '';
      const v = g[k];
      return `<i class="gain-bub ${v < 0 ? 'gain-neg' : ''}">${v > 0 ? '+' : ''}${SC.fmt(v)}</i>`;
    };
    const statRow = `<div class="sch-stat-row">
      <span class="chip chip-vo">Vo ${st.stats.vo}${gb('vo')}</span>
      <span class="chip chip-da">Da ${st.stats.da}${gb('da')}</span>
      <span class="chip chip-vi">Vi ${st.stats.vi}${gb('vi')}</span>
      <span class="chip chip-me">Me ${st.mental}${gb('me')}</span>
      <span class="chip chip-sp">SP ${st.sp}${gb('sp')}</span>
      <span class="sch-fans">&#128101; ${SC.fmt(st.fans)}${gb('fans')}</span>
    </div>`;

    // v0.25.7: 施設別の抽象シーン（実機=施設の写真プレビュー。イラストは絵文字+CSSで抽象表現・オリジナル）
    const sceneMap = {
      lessonVo: { icon: '🎤', props: '🎼🎹', grad: 'linear-gradient(165deg,#5a2436,#8a3450 55%,#c05070)' },
      lessonDa: { icon: '🩰', props: '🪩🎧', grad: 'linear-gradient(165deg,#1e3a5a,#2a5a8a 55%,#4090c8)' },
      lessonVi: { icon: '💄', props: '👗🪞', grad: 'linear-gradient(165deg,#6a4a14,#9a7020 55%,#d0a030)' },
      radio:    { icon: '📻', props: '🎙🎚', grad: 'linear-gradient(165deg,#3a2a4a,#5a4070 55%,#8060a0)' },
      talk:     { icon: '🎙', props: '💬🪑', grad: 'linear-gradient(165deg,#1e4a3a,#2a6a50 55%,#40a078)' },
      magazine: { icon: '📸', props: '☂️💡', grad: 'linear-gradient(165deg,#4a3a2a,#6a5540 55%,#98805c)' },
    };
    const scene = sceneMap[selectedKey] || sceneMap[F.kind] || sceneMap.lessonVo;

    // v0.25.17: レッスン風景にSDキャラ（動画19-55-34実測: 施設内にP+同席サポのミニキャラが立つ）
    // P=中央（顔アイコンあれば丸抜き）+同席サポ/ゲスト=シルエット
    const sceneChars = (function () {
      const seats = st.placement[selectedKey] || [];
      // v0.25.22: SDアイドル自作SVG（ポーズ交互）
      const sups = seats.map(function (idx, si) {
        const nm = idx === -1 ? (SC.GUEST ? SC.GUEST.name : 'G') : (SC.SUPPORTS[idx] ? SC.SUPPORTS[idx].name : '?');
        return `<span class="sm" title="${nm}${idx === -1 ? '（ゲスト）' : ''}">${SC.icon2(si % 2 ? 'sdidolA' : 'sdidolB')}</span>`;
      });
      const half = Math.ceil(sups.length / 2);
      return `<div class="stage-members sch-scene-members">
        ${sups.slice(0, half).join('')}
        <span class="sm sm-c" title="${SC.IDOL.name}">${SC.icon2('sdidolA')}</span>
        ${sups.slice(half).join('')}
      </div>`;
    })();

    mainContent = `
    <div class="sch-main">
      <div class="sch-preview c-${F.attr}">
        <div class="sch-scene" style="background:${scene.grad}">
          <span class="sch-scene-spot"></span>
          <span class="sch-scene-props">${scene.props}</span>
          <span class="sch-scene-icon">${scene.icon}</span>
          ${sceneChars}
        </div>
        <div class="sch-preview-name">${F.label} <span class="fc-lv">Lv${lv}</span></div>
        <div class="sch-preview-members">${members}</div>
        <div class="sch-preview-gains">${gains.join(' / ')}</div>
        ${(function () {
          // v0.25.17: マスタリー全種の発動予測（数値は上の予測値に適用済み・ここは内訳と発生状況）
          const M = pv.mastery;
          if (!M) return '';
          const chips = [];
          const attrLab = function (attr) { return attr === 'me' ? 'Me' : SC.ATTR_LABEL[attr]; };
          const effLab = function (e) {
            return e.kind === 'sp' ? 'SP+' + e.v : e.kind === 'hp' ? '体力+' + e.v
              : e.kind === 'cap' ? SC.ATTR_LABEL[e.attr] + '上限+' + e.v : attrLab(e.attr) + '+' + e.v;
          };
          M.items.forEach(function (it) {
            if (it.kind === 'facility' || it.kind === 'perfect') return;
            chips.push(`<span class="um-chip" title="${it.supLabel}・${it.name}">🔸${effLab(it)}</span>`);
          });
          // テンションマスタリー: テンション最高時のみ発動（対象外の週は減光表示）
          const tensionMax = SC.tensionFace().key === 'red';
          M.tension.forEach(function (tm) {
            chips.push(`<span class="um-chip ${tensionMax ? '' : 'um-chip-off'}" title="${tm.supLabel}・${tm.name}（テンション最高時${tm.sure ? '確定' : '・確率'}）">😆${effLab(tm)}${tm.sure ? '' : '?'}</span>`);
          });
          // 施設/パーフェクトマスタリーの発生状況（ユーザー指定: 発生状況も記載）
          if (M.perfectN > 0) chips.push(`<span class="um-chip um-chip-ev" title="トラブルなし時、確率で大成功">👑パーフェクト×${M.perfectN}</span>`);
          if (M.facilityN > 0) chips.push(`<span class="um-chip um-chip-ev" title="トラブルなし時、確率で施設Lvアップ">⤴施設Lv×${M.facilityN}</span>`);
          if (chips.length === 0) return '';
          return '<div class="sch-preview-umastery">' + chips.join('') + '<span class="sub">マスタリー</span></div>';
        })()}
        <div class="sch-preview-cost sub">体力-${cost}</div>
      </div>
      <div class="sch-trouble-circle">
        <span class="sch-trouble-label">トラブル率</span>
        <span class="sch-trouble-val">${trouble}%</span>
      </div>
      ${statRow}
      <div class="sch-fac-row">${facilityBtns}</div>
      <div class="sch-decide-row">
        <button class="main-btn small sch-decide-btn" data-action="facility" data-key="${selectedKey}">決定</button>
      </div>
    </div>`;
  } else {
    // --- オーディションタブコンテンツ ---
    const season = SC.seasonIndex();
    const mode = st.mode;
    const list = SC.AUDITIONS.filter(function (d) { return d.season === season; });
    // カルーセル: 現在のインデックス
    const aidx = (st.audTabIdx === undefined || st.audTabIdx === null) ? 0 : st.audTabIdx;
    const def = list[aidx] || list[0];
    const totalAud = list.length;

    let audCardHtml = '<div class="aud-tab-empty">このシーズンのオーディションはありません</div>';
    if (def) {
      const av = SC.auditionAvailable(def);
      const hp = def.hp[mode];
      const dif = SC.CONFIG.auditionDifficulty[def.id] || 0;
      const rewards = [`ファン <b>+${SC.fmt(def.fans)}</b>`];
      if (def.finalsReward) rewards.push(`全ステ+${def.finalsReward.stat} / SP+${def.finalsReward.sp}`);
      else if (def.statReward) rewards.push(`Vo/Da/Vi +?（1つは2倍）`);
      const rec = SC.CONFIG.auditionRecommend && SC.CONFIG.auditionRecommend[def.id];
      const recHtml = rec
        ? `<div class="aud-tab-rec">推奨: ${Object.keys(rec).map(function (k) { return SC.ATTR_LABEL[k] + ' ' + rec[k]; }).join(' / ')}</div>`
        : '';
      // ページドット
      const dots = list.map(function (_, i) {
        return `<span class="aud-tab-dot ${i === aidx ? 'active' : ''}" data-action="aud-tab-goto" data-idx="${i}"></span>`;
      }).join('');

      const statRow2 = `<div class="sch-stat-row" style="margin-top:8px">
        <span class="chip chip-vo">Vo ${st.stats.vo}</span>
        <span class="chip chip-da">Da ${st.stats.da}</span>
        <span class="chip chip-vi">Vi ${st.stats.vi}</span>
        <span class="chip chip-me">Me ${st.mental}</span>
      </div>`;

      // v0.25.10: 実機構図（rec3/audsel1実測: 白カード+ピンク帯「オーディション」+流行チップ右／
      //   バナー+出場条件・難易度カラーティック／推奨能力値ピル／ピンク決定）
      const trendChips = (st.trend || []).map(function (attr, i) {
        const medal = ['🥇', '🥈', '🥉'][i] || '';
        return `<span class="aud-trend-chip chip-${attr}">${medal}${SC.ATTR_LABEL[attr] || attr}.</span>`;
      }).join('');
      // 難易度=カラーティックバー（実測: 青→紫→ピンクの縦棒列・約20目盛）
      const difTicks = (function () {
        const n = 20, filled = Math.max(1, Math.min(n, dif));
        let t = '';
        for (let i = 0; i < n; i++) {
          t += i < filled ? `<i class="on" style="background:hsl(${200 + i * 8},85%,60%)"></i>` : '<i></i>';
        }
        return t;
      })();
      // 推奨能力値ピル（実測: 属性チップ+数値・データなしは「---」）
      const recRow = `<div class="aud-real-rec">
        <span class="aud-real-rec-label">推奨能力値</span>
        ${['vo', 'da', 'vi'].map(function (k) {
          const v = rec && rec[k];
          return `<span class="chip chip-${k}">${SC.ATTR_LABEL[k]}</span><b class="aud-rec-val">${v ? SC.fmt(v) : '---'}</b>`;
        }).join('')}
      </div>`;

      audCardHtml = `
      <div class="aud-real-panel">
        <div class="aud-real-head">
          <span class="aud-real-head-icon">&#127908;</span>
          <span class="aud-real-head-title">オーディション</span>
          <span class="aud-real-head-trend"><span class="aud-trend-label">流行</span>${trendChips}</span>
        </div>
        <div class="aud-tab-carousel">
          <button class="aud-tab-nav aud-tab-prev" data-action="aud-tab-prev" ${aidx <= 0 ? 'disabled' : ''}>&#9664;</button>
          <div class="aud-tab-card aud-real-card ${av.ok ? '' : 'locked'}">
            <div class="aud-real-top">
              <div class="aud-real-banner">
                ${SC.audBannerSvg ? SC.audBannerSvg(def.id) : ''}
                <img src="img/auditions/${def.id}.png" alt="" onerror="this.remove()">
                <span class="aud-real-banner-name">${def.limited ? '⏰ ' : ''}${def.name}</span>
              </div>
              <div class="aud-real-cond">
                <div class="aud-real-cond-label">出場条件</div>
                <div class="aud-real-cond-val">${av.ok ? 'なし（出場可能）' : av.reason}</div>
                <div class="aud-real-dif"><span>難易度: ${dif}</span><span class="aud-dif-ticks">${difTicks}</span></div>
              </div>
            </div>
            ${recRow}
            <div class="aud-tab-info">
              <div>報酬: ${rewards.join(' ／ ')}</div>
              <div class="sub">審査員体力${hp === null ? '—' : SC.fmt(hp)} / ${def.way}way / ライバル${def.rivals.length}組</div>
            </div>
            ${av.ok
              ? `<button class="aud-tab-start-btn aud-real-decide" data-action="audition-start" data-id="${def.id}">決定</button>`
              : `<div class="lock-reason">🔒 ${av.reason}</div>`}
          </div>
          <button class="aud-tab-nav aud-tab-next" data-action="aud-tab-next" ${aidx >= totalAud - 1 ? 'disabled' : ''}>&#9654;</button>
        </div>
        <div class="aud-tab-dots">${dots}</div>
        ${statRow2}
      </div>`;
    }

    mainContent = `<div class="sch-main">${audCardHtml}</div>`;
  }

  return `
  <main class="panel sch-panel">
    <div class="sch-layout">
      <!-- 左縦タブ -->
      <div class="sch-tabs">
        <div class="sch-tab ${tab === 'lesson' ? 'sch-tab-active' : 'sch-tab-inactive'}" data-action="sch-tab-lesson">
          <span class="sch-tab-icon">&#127925;</span>
          <span>レッスン&amp;お仕事</span>
        </div>
        <div class="sch-tab ${tab === 'audition' ? 'sch-tab-active' : 'sch-tab-inactive'}" data-action="sch-tab-audition">
          <span class="sch-tab-icon">&#127942;</span>
          <span>オーディション</span>
        </div>
      </div>
      <!-- メインコンテンツ（タブで切替） -->
      ${mainContent}
    </div>
    <!-- v0.20c: 左下固定戻るボタン（実機準拠） -->
    <button class="back-arrow-btn" data-action="back-home" title="戻る">&#8592;</button>
  </main>`;
};

// ---- オデ前会話（動画実測: 選択肢式。正解でテンションUP） ----
// v0.25.28: 立ち絵imgに idol-default クラス（デフォルト画像時のみ構図CSS）
SC.renderPreTalk = function () {
  const p = SC.state.preTalk;
  if (!p) return '<p>エラー：会話状態なし</p>';
  const def = SC.AUDITIONS.find(function (d) { return d.id === p.defId; });

  // v0.25.12: 本戦（準決勝/決勝）用コミュ＝選択肢なし・テンション変動なし（ユーザー指定）
  if (p.finals) {
    const isFinal = p.defId === 'final';
    const line = isFinal
      ? '……ここが、最後のステージですね。プロデューサーさん、私……てっぺん、獲ってきます！'
      : '準決勝……。ここで勝てば、決勝、ですね。……深呼吸、しました。もう大丈夫です';
    return `
    <main class="comm-stage comm-stage-backstage" data-action="pretalk-go" style="cursor:pointer">
      <img class="scene-bg" src="img/bg/backstage.png" alt="" onerror="this.remove()">
      <div class="comm-scene-label">W.I.N.G. ${isFinal ? '決勝' : '準決勝'} 本番前</div>
      <div class="comm-idol-area">
        <img class="${SC.idolImgClass()}" src="${SC.idolImg()}" alt="${SC.IDOL.name}" onerror="this.classList.add('hidden')">
      </div>
      <div class="comm-talkbox">
        <div class="comm-talk-name">&#10022; ${SC.IDOL.name}</div>
        <div class="comm-talk-text">${line}</div>
      </div>
      <div class="reveal-hint" style="color:rgba(255,255,255,.75);left:0;right:0;text-align:center">タップでオーディションへ</div>
    </main>`;
  }

  // v0.25.6: 反応フェイズ（3種: up/flat/down。セリフとテンション演出は連動・オリジナル文）
  if (p.phase === 'result') {
    const lines = {
      up: 'うんっ……緊張がほぐれました。行ってきます！',
      flat: 'はい……いつも通りに、いきます',
      down: 'えっ……そ、そんなこと言われたら余計に緊張します……',
    };
    // v0.25.9: 実機風（f20実測: 立ち絵の右横に顔アイコン+⬆+「テンション」）
    const pops = {
      up: '<div class="tension-fx tf-up"><span class="tf-emoji">😊</span><span class="tf-arrow">⬆</span>テンション</div>',
      flat: '',
      down: '<div class="tension-fx tf-down"><span class="tf-emoji">😰</span><span class="tf-arrow">⬇</span>テンション</div>',
    };
    return `
    <main class="comm-stage comm-stage-backstage" data-action="pretalk-go" style="cursor:pointer">
      <img class="scene-bg" src="img/bg/backstage.png" alt="" onerror="this.remove()">
      <div class="comm-scene-label">${def.name} 本番前</div>
      <div class="comm-idol-area">
        <img class="${SC.idolImgClass()}" src="${SC.idolImg()}" alt="${SC.IDOL.name}" onerror="this.classList.add('hidden')">
      </div>
      ${SC.state.commsOff ? '' : (pops[p.result] || '')}
      <div class="comm-talkbox">
        <div class="comm-talk-name">&#10022; ${SC.IDOL.name}</div>
        <div class="comm-talk-text">${lines[p.result] || lines.flat}</div>
      </div>
      <div class="reveal-hint" style="color:rgba(255,255,255,.75);left:0;right:0;text-align:center">タップでオーディションへ</div>
    </main>`;
  }

  // v0.25.6: 位置固定3択（ユーザー実機確認: 上=テンションUP／左=変動なし／右=DOWN）。文言はオリジナル
  // data-i: 0=左(flat) / 1=上(up) / 2=右(down)
  // v0.25.15: 秘密のメモ帳はオデ前コミュもカンニング可（ユーザー指定: UP=Perfect/変動なし=Good/DOWN=Normal）
  const hasMemoP = (SC.state.loadout || []).indexOf('memo') >= 0;
  const pq = function (cls, label) {
    return hasMemoP ? `<i class="cb-quality cbq-${cls}">&#10003; ${label}</i>` : '';
  };
  const bubbles = `
    <button class="comm-bubble cb-left cb-pink" data-action="pretalk" data-i="0">${pq('good', 'Good')}<span>いつも通りにいこう</span><i class="cb-check">&#10003;</i></button>
    <button class="comm-bubble cb-top cb-green" data-action="pretalk" data-i="1">${pq('perfect', 'Perfect')}<span>思いきり楽しんでこい！</span><i class="cb-check">&#10003;</i></button>
    <button class="comm-bubble cb-right cb-orange" data-action="pretalk" data-i="2">${pq('normal', 'Normal')}<span>絶対に失敗するなよ</span><i class="cb-check">&#10003;</i></button>`;
  return `
  <main class="comm-stage comm-stage-backstage">
    <img class="scene-bg" src="img/bg/backstage.png" alt="" onerror="this.remove()">
    <div class="comm-scene-label">${def.name} 本番前</div>
    <div class="comm-idol-area">
      <img class="${SC.idolImgClass()}" src="${SC.idolImg()}" alt="${SC.IDOL.name}" onerror="this.classList.add('hidden')">
    </div>
    ${bubbles}
    <div class="comm-talkbox">
      <div class="comm-talk-name">&#10022; プロデューサー</div>
      <div class="comm-talk-text">本番を前に、アイドルが緊張した面持ちでこちらを見ている。なんて声をかける？</div>
    </div>
  </main>`;
};

// ---- オーディション選択 ----
SC.renderAuditionSelect = function () {
  const st = SC.state;
  const season = SC.seasonIndex();
  const mode = st.mode;
  const list = SC.AUDITIONS.filter(function (d) { return d.season === season; });

  const rows = list.map(function (def) {
    const av = SC.auditionAvailable(def);
    const hp = def.hp[mode];
    const rivalN = def.rivals.length;
    const dif = SC.CONFIG.auditionDifficulty[def.id] || 0;
    const difBar = '■'.repeat(Math.min(15, Math.ceil(dif / 2))) + '□'.repeat(Math.max(0, 15 - Math.ceil(dif / 2)));
    // 報酬表記（実機準拠: ステ報酬は「+?」表示のランダム）
    const rewards = [`ファン <b>+${SC.fmt(def.fans)}</b>`];
    if (def.finalsReward) rewards.push(`全ステ+${def.finalsReward.stat} / SP+${def.finalsReward.sp}`);
    else if (def.statReward) rewards.push(`Vo/Da/Vi +?（1つは2倍）`);
    // 推奨能力値（動画実測3件のみ。SC.CONFIG.auditionRecommend にあるオデのみ表示）
    const rec = SC.CONFIG.auditionRecommend[def.id];
    const recHtml = rec
      ? `<span class="rec-stats">推奨: ${Object.keys(rec).map(function (k) { return SC.ATTR_LABEL[k] + ' ' + rec[k]; }).join(' / ')}</span>`
      : '';
    return `
    <div class="aud-card ${av.ok ? '' : 'locked'} ${def.limited ? 'limited' : ''}">
      <div class="aud-head">${def.limited ? '⏰' : ''}${def.name}
        <div class="dif-row"><span class="sub">難易度: ${dif}</span> <span class="dif-bar">${difBar}</span></div>
      </div>
      <div class="aud-info">
        <span>報酬: ${rewards.join(' ／ ')}</span>
        ${recHtml}
        <span class="sub">審査員体力${hp === null ? '—' : SC.fmt(hp)} / Meダメ${def.dmg[mode] === null ? '—' : def.dmg[mode]} / ${def.way}way / ライバル${rivalN}組 / 2位以上合格</span>
      </div>
      ${av.ok
        ? `<button class="main-btn small" data-action="audition-start" data-id="${def.id}">挑戦する</button>`
        : `<div class="lock-reason">🔒 ${av.reason}</div>`}
    </div>`;
  }).join('');

  return `
  <main class="panel">
    <h2>オーディション <span class="sub">週を消費。合格（2位以上）でファン＋ステータス獲得</span></h2>
    <div class="aud-note">今週の流行：${st.trend.map(function (t, i) { return `${['①', '②', '③'][i]}${SC.ATTR_LABEL[t]}`; }).join(' ')}</div>
    ${rows}
    <!-- v0.20c: 左下固定戻るボタン（実機準拠） -->
    <button class="back-arrow-btn" data-action="back-home" title="戻る">&#8592;</button>
  </main>`;
};

// ---- 振り返り（蜘蛛の巣スキルパネル。中央ユニット→6方向にパネル群） ----
// ---- 実カードが選択されているかをオーナー別に判定（v0.16b: 汎用パネル汚染防止） ----
// loadoutが実カードを持つオーナー → cpパネルのみ表示
// loadoutがnullのオーナー → 全パネル（後方互換）
SC.ownerHasRealCard = function (ownerKey) {
  var lo = SC.loadLoadout ? SC.loadLoadout() : null;
  if (!lo) return false;
  if (ownerKey === 'p') return !!lo.p;
  if (ownerKey === 'guest') return !!lo.guest;
  var idx = Number(ownerKey);
  if (!isNaN(idx) && lo.supports) return !!lo.supports[idx];
  return false;
};

// v0.25.28: 丸アイコン=SC.idolFaceImg（顔切り抜き。デフォルト時は中央）
SC.renderReview = function () {
  const st = SC.state;
  const P = SC.CONFIG.panel;
  const removed = st.passiveRemoved || [];
  const passiveDeleteEnabled = st.passiveDeleteEnabled || false;

  // ---- v0.17.1: hex内1行目生成ヘルパー（属性バッジ＋種別アイコン文字） ----
  // 種別→アイコン文字対応表
  // live=アピール♪ / cap=上限⇧ / passive/buff=バフ↑ / heal/dmgCut/reactAvoid=✚ / memory=◎ / quick/interest=Q / raw/?=?
  const hexTypeIcon = function (type) {
    if (type === 'live')       return '♪';
    if (type === 'cap')        return '上限⇧';
    if (type === 'passive')    return '↑';
    if (type === 'buff')       return '↑';
    if (type === 'dmgCut')     return '✚';
    if (type === 'reactAvoid') return '↑';
    if (type === 'heal')       return '✚';
    if (type === 'memory')     return '◎';
    if (type === 'quick')      return 'Q';
    if (type === 'interest')   return 'Q';
    if (type === 'dmgUP')      return '↑';
    if (type === 'influence')  return '↑';
    if (type === 'attentionUp')return '↑';
    if (type === 'stat')       return '↑';
    return '?';
  };
  // 属性→バッジHTML（複合属性は2個並び）
  const hexAttrBadges = function (p) {
    const attrLabel = { vo: 'Vo.', da: 'Da.', vi: 'Vi.', me: 'Me.' };
    // cap/live は attrs 配列を持つ可能性あり（複合属性）
    const attrList = (p.attrs && p.attrs.length > 1) ? p.attrs : (p.attr ? [p.attr] : []);
    if (attrList.length === 0) return '';
    return attrList.map(function (a) {
      return `<span class="hex-attr-badge hx-badge-${a}">${attrLabel[a] || a}</span>`;
    }).join('');
  };
  // hex1行目HTML（バッジ+アイコン文字）
  const hexLine1 = function (p) {
    const badges = hexAttrBadges(p);
    // v0.25.35: 回復・ダメージカットはパッシブ（type:'passive'）になったが、六角セルのアイコンは従来どおり ✚（回避は ↑）
    // v0.25.36: 効果札（非アピールのライブスキル）は「効」（主効果が回復のものは従来の回復表示 ✚）
    const icon = p.effectOnly ? (p.heal ? '✚' : '効')
      : ((p.type === 'passive' && (p._healPct !== undefined || p._cutPct !== undefined)) ? '✚' : hexTypeIcon(p.type));
    return badges + `<span class="hex-type-icon">${icon}</span>`;
  };

  // ---- パネル1個を六角セルとしてレンダリング（position:absolute 用。styleは呼び出し側が付与）----
  const renderPanel = function (key, extraStyle) {
    const p = P[key];
    // パネル定義なし → プレースホルダー（座標を埋めて穴あき防止）
    if (!p) {
      return `<div class="hex-cell hex-locked hx-etc" style="${extraStyle || ''}" title="未定義">
        <span class="hex-inner-top">—</span><span class="hex-sp"></span></div>`;
    }
    const opened = st.panelOpened.indexOf(key) >= 0;
    // v0.20b: 隣接解放ルール。cheatAllPanels時は全部解放扱い
    const adj = ownerAdjGraphs[p.owner] || {};
    const adjOk = st.cheatAllPanels || SC.adjacentUnlocked(key, adj, st.panelOpened, P);
    const reqOk = adjOk && (!p.req || st.panelOpened.indexOf(p.req) >= 0);

    // type:'raw' パネル（v0.25.5: 効果未解釈でも習得可能に＝alert廃止・通常のタップ→詳細→習得フロー。
    //   効果は掛からないが隣接解放が進む。ユーザー指摘: 取得できないパネルがあると先へ進めない）
    if (p.type === 'raw') {
      const rawOpened = st.panelOpened.indexOf(key) >= 0;
      const cls = 'hex-cell hex-raw hx-etc' + (rawOpened ? ' hex-opened' : (reqOk ? '' : ' hex-locked'));
      const titleText = (p.raw || p.name || '効果不明').replace(/"/g, '&quot;');
      return `<div class="${cls}" style="${extraStyle || ''}" data-action="panel-select" data-key="${key}" title="${titleText}">
        <span class="hex-inner-top">${hexAttrBadges(p)}<span class="hex-type-icon">?</span></span>
        <span class="hex-sp">SP:${p.sp || '?'}</span></div>`;
    }

    // v0.19: quick/interest はWING編対象外（ユーザー確認2026-07-04）→ 習得不可グレー表示
    if (p.type === 'quick' || p.type === 'interest') {
      const cls2 = 'hex-cell hex-raw hex-locked hx-etc';
      const titleText = (p.name || '(WING編対象外)').replace(/"/g, '&quot;');
      return `<div class="${cls2}" style="${extraStyle || ''}" title="${titleText}（WING編では使用不可）">
        <span class="hex-inner-top">${hexAttrBadges(p)}<span class="hex-type-icon">Q</span></span>
        <span class="hex-sp">WING不可</span></div>`;
    }

    const canBuy = !opened && reqOk && st.sp >= p.sp;
    const canSelect = !opened && reqOk;

    // パッシブパネルの削除済み判定
    const isPassive = p.type === 'passive';
    const isRemoved = isPassive && removed.indexOf(p.holder) >= 0;

    // cheatAllPanels 時: 習得済みの live/heal パネルは「装備する（SP0）」
    const isCheatReequipPanel = st.cheatAllPanels && opened && (p.type === 'live' || p.heal);

    // 金枠判定（ライブスキル・アピール倍率2.5以上）
    const isGold = p.type === 'live' && p.mult >= 2.5;

    let cls = 'hex-cell';
    if (isRemoved) cls += ' hex-passive-removed';
    else if (opened && !isCheatReequipPanel) cls += ' hex-done';
    else if (!reqOk) cls += ' hex-locked';
    else if (canBuy) cls += ' hex-can';
    if (isGold) cls += ' hex-gold';

    const attrCls = p.attr ? 'hx-' + p.attr : (isPassive ? 'hx-etc' : 'hx-etc');
    cls += ' ' + attrCls;

    let actions = '';
    if (isCheatReequipPanel) {
      actions = `data-action="panel-select" data-key="${key}"`;
    } else if (canSelect) {
      actions = `data-action="panel-select" data-key="${key}"`;
    } else if (opened && isPassive && !isRemoved && passiveDeleteEnabled) {
      actions = `data-action="passive-remove-panel" data-key="${key}" data-id="${p.holder}"`;
    }

    // v0.17.1/v0.20b: spLabel（hex2行目）
    let spLabel = '';
    if (isRemoved) spLabel = '削除済';
    else if (isCheatReequipPanel) spLabel = '装備SP0';
    else if (opened) spLabel = '習得済';
    else if (!adjOk) spLabel = '🔒隣接未開放';
    else if (!reqOk) spLabel = '🔒';
    else spLabel = `SP:${p.sp}`;

    // v0.17.1: titleにフル名を入れる（ホバーで確認可能）
    const adjHint = (!opened && !adjOk) ? '（隣接パネルを先に習得）' : '';
    const titleText = `${p.name}${p.req ? '（要: ' + P[p.req].name + '）' : ''}（SP:${p.sp}）${adjHint}`;

    return `
    <div class="${cls}" style="${extraStyle || ''}" ${actions}
         title="${titleText.replace(/"/g, '&quot;')}">
      <span class="hex-inner-top">${isRemoved ? '<span class="hex-type-icon">✗</span>' : hexLine1(p)}</span>
      <span class="hex-sp">${spLabel}</span>
    </div>`;
  };

  // ---- owner 別パネルグループ ----
  // v0.16b: 実カードスロットはcp_パネルのみ表示（汎用パネル汚染を排除）
  // 仮データスロット（カードIDがnull）は従来通り全パネル表示（後方互換）
  const ownerGroups = { p: [], 0: [], 1: [], 2: [], 3: [], guest: [] };
  Object.keys(P).forEach(function (key) {
    const o = P[key].owner;
    if (o !== undefined && ownerGroups[o] !== undefined) {
      if (SC.ownerHasRealCard(o)) {
        // 実カードスロット: cp_パネルのみ
        if (key.indexOf('cp_') === 0) ownerGroups[o].push(key);
      } else {
        // 仮データスロット: 全パネル（従来通り）
        ownerGroups[o].push(key);
      }
    }
  });

  // v0.20b: owner別の隣接グラフを事前構築（ownerGroups確定後）
  const ownerAdjGraphs = {};
  ['p', 0, 1, 2, 3, 'guest'].forEach(function (owner) {
    const keys = ownerGroups[owner] || [];
    ownerAdjGraphs[owner] = SC.buildAdjacencyGraph(keys);
  });

  // ---- ユニット名 ----
  const unitNames = {
    p: SC.IDOL.name,
    0: SC.SUPPORTS[0] ? SC.SUPPORTS[0].name : 'サポA',
    1: SC.SUPPORTS[1] ? SC.SUPPORTS[1].name : 'サポB',
    2: SC.SUPPORTS[2] ? SC.SUPPORTS[2].name : 'サポC',
    3: SC.SUPPORTS[3] ? SC.SUPPORTS[3].name : 'サポD',
    guest: SC.GUEST ? SC.GUEST.name : 'ゲスト'
  };

  // ====== absolute 座標ハニカム（v0.16c: 密集レイアウト・⑪実機準拠） ======
  // キャンバスサイズ（全6クラスタが1画面に一望できるよう縮小）
  const CW = 1400, CH = 1100;
  // 中心座標
  const CX = CW / 2, CY = CH / 2;
  // 顔チップ: P=中心大(半径26px), 周囲サポ/ゲスト=正六角形頂点(半径18px, 配置半径36px)
  const FACE_R_P = 26;     // Pチップ半径
  const FACE_R   = 18;     // サポ/ゲストチップ半径
  const FACE_RING = 42;    // 周囲顔チップ配置半径
  // hex サイズ（フラットトップ・⑪比率: hex幅≒ステージ幅/14 → 1280/14≒91 → 描画密度合わせて54px）
  const HW = 54, HH = 48;
  // v0.13b改: クラスタ中心距離を動的化（最大パネル数からリング数を算出）
  // リング0=1, リング1=7, リング2=19, リング3=37... (3k²-3k+1)
  // パネル数nが何リング必要か: リングk以下の総数は 3k²+3k+1
  const maxPanelCount = Math.max.apply(null, Object.keys(ownerGroups).map(function (ow) {
    return (ownerGroups[ow] || []).length;
  }).concat([1]));
  let maxRings = 0;
  let cumHex = 1;
  while (cumHex < maxPanelCount) { maxRings++; cumHex += 6 * maxRings; }
  // v0.18: 衝突ゼロ保証距離式（row/colを持たない汎用パネルのspiralフォールバック用に残置）
  const blockRadius = Math.round((maxRings + 0.7) * HW * 0.75);
  let CLUSTER_R = 2 * blockRadius + 16;
  const innerEdge = CLUSTER_R - blockRadius;
  if (innerEdge < FACE_RING + 40) {
    CLUSTER_R = FACE_RING + 40 + blockRadius;
  }

  // v0.24.1: 実機配置準拠の格子レイアウト定数
  // wiki表の row（SP帯=0..3、中心→外）/ col（千鳥の物理列。col2刻み=横1hex分）をそのまま使う
  const GRID_R0 = FACE_RING + 84;          // row0（SP最小帯）の中心からの距離
  const GRID_DY = HH * 0.82;               // row間ピッチ（千鳥前提。hex高HHに対し重なりなし）
  const GRID_DX = HW * 0.375;              // col1刻み=横半ピッチ（col差2=0.75HW=フラットトップ横ピッチ）
  let gridMaxRow = 0;
  Object.keys(ownerGroups).forEach(function (ow) {
    (ownerGroups[ow] || []).forEach(function (k) {
      const p = P[k];
      if (p && p.row !== undefined && p.row !== null && p.row > gridMaxRow) gridMaxRow = p.row;
    });
  });

  // 方向角: owner 順 = p(上), guest(右上), 0(右下), 2(下), 1(左下), 3(左上)
  // panel①.jpg の放射パターンに合わせて上から時計回り
  // p=上(270°), サポA=右上(330°), サポB=右下(30°), サポC=下(90°), サポD=左下(150°), guest=左上(210°)
  const ownerOrder  = ['p', 0, 1, 2, 3, 'guest'];
  const ownerAngles = [270, 330, 30, 90, 150, 210]; // 度

  // axial座標 → クラスタ相対ピクセル（フラットトップ: q=列, r=行）
  function axialToPixel(q, r) {
    const x = q * 0.75 * HW;
    const y = (r + q / 2) * HH;
    return { x: x, y: y };
  }

  // リングk のaxial座標列（標準アルゴリズム）
  function ringCoords(k) {
    if (k === 0) return [{ q: 0, r: 0 }];
    const dirs = [[0,-1],[-1,0],[-1,1],[0,1],[1,0],[1,-1]];
    const coords = [];
    let q = k, r = -k; // 開始点
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < k; step++) {
        coords.push({ q: q, r: r });
        q += dirs[side][0];
        r += dirs[side][1];
      }
    }
    return coords;
  }

  // 渦巻き順のaxial座標列（中心 → リング1 → リング2 …）
  function spiralCoords(count) {
    const result = [];
    let ring = 0;
    while (result.length < count) {
      const rc = ringCoords(ring);
      for (let i = 0; i < rc.length && result.length < count; i++) {
        result.push(rc[i]);
      }
      ring++;
    }
    return result;
  }

  // ---- 絶対配置で全要素を生成 ----
  let canvasHTML = '';

  ownerOrder.forEach(function (owner, di) {
    const angleRad = ownerAngles[di] * Math.PI / 180;
    const keys = ownerGroups[owner] || [];
    if (keys.length === 0) return;

    const ux = Math.cos(angleRad), uy = Math.sin(angleRad);    // 放射方向（中心→外）
    const tx = -Math.sin(angleRad), ty = Math.cos(angleRad);   // 接線方向

    // v0.24.1: 実機配置準拠 — wiki表の row/col を持つパネルは格子配置（実カードは全てこちら）
    const gridKeys = keys.filter(function (k) {
      const p = P[k]; return p && p.row !== undefined && p.row !== null && p.col !== undefined && p.col !== null;
    });
    const freeKeys = keys.filter(function (k) { return gridKeys.indexOf(k) < 0; });

    if (gridKeys.length > 0) {
      // クラスタを接線方向でセンタリング（colの中央値基準）
      const cols = gridKeys.map(function (k) { return P[k].col; });
      const colCenter = (Math.min.apply(null, cols) + Math.max.apply(null, cols)) / 2;
      gridKeys.forEach(function (key) {
        const p = P[key];
        // v0.25.5: 符号反転＝カードMDのcol軸は実機と左右逆（ユーザー実機確認: ジェラシーのスキルは右上）
        const lx = -(p.col - colCenter) * GRID_DX;   // 接線方向オフセット
        const ly = GRID_R0 + p.row * GRID_DY;       // 放射方向（row0が中心側→外へ）
        const left = Math.round(CX + ly * ux + lx * tx - HW / 2);
        const top  = Math.round(CY + ly * uy + lx * ty - HH / 2);
        const style = `position:absolute;left:${left}px;top:${top}px;width:${HW}px;height:${HH}px;`;
        const panelHtml = renderPanel(key, style);
        canvasHTML += panelHtml.replace(/^(\s*<div )/, '$1data-owner="' + owner + '" ');
      });
    }

    // row/colなし（仮データの汎用パネル等）は従来spiral配置（格子より外側に基点）
    if (freeKeys.length > 0) {
      const spiral = spiralCoords(freeKeys.length);
      const baseR = gridKeys.length > 0 ? (GRID_R0 + (gridMaxRow + 2) * GRID_DY) : CLUSTER_R;
      const baseX = CX + baseR * ux;
      const baseY = CY + baseR * uy;
      freeKeys.forEach(function (key, idx) {
        const coord = spiral[idx];
        const px = axialToPixel(coord.q, coord.r);
        const left = Math.round(baseX + px.x - HW / 2);
        const top  = Math.round(baseY + px.y - HH / 2);
        const style = `position:absolute;left:${left}px;top:${top}px;width:${HW}px;height:${HH}px;`;
        const panelHtml = renderPanel(key, style);
        canvasHTML += panelHtml.replace(/^(\s*<div )/, '$1data-owner="' + owner + '" ');
      });
    }
  });

  // ---- 中央顔チップ（v0.16c: P=中心大、サポ/ゲスト=周囲正六角形頂点）----
  // P チップ（中心）
  const pInitial = (unitNames['p'] || '?').charAt(0);
  canvasHTML += `<div class="hc-face-center face-p hc-face-p-center" title="${unitNames['p']}"
    style="position:absolute;left:${Math.round(CX - FACE_R_P)}px;top:${Math.round(CY - FACE_R_P)}px;width:${FACE_R_P*2}px;height:${FACE_R_P*2}px;font-size:16px;">${pInitial}</div>`;
  // サポ/ゲスト チップ（周囲）
  ownerOrder.forEach(function (owner, di) {
    if (owner === 'p') return; // Pは中心に別途配置済み
    const angleRad = ownerAngles[di] * Math.PI / 180;
    const initial = (unitNames[owner] || '?').charAt(0);
    const faceCls = owner === 'guest' ? 'hc-face-center face-g' : 'hc-face-center face-s';
    const fx = Math.round(CX + FACE_RING * Math.cos(angleRad) - FACE_R);
    const fy = Math.round(CY + FACE_RING * Math.sin(angleRad) - FACE_R);
    canvasHTML += `<div class="${faceCls}" title="${unitNames[owner]}"
      style="position:absolute;left:${fx}px;top:${fy}px;width:${FACE_R*2}px;height:${FACE_R*2}px;">${initial}</div>`;
  });

  // ---- 下部バー（選択中パネル情報）----
  // v0.24.2: マップのパネルタップ → 右下に詳細＋取得ボタン（実機③の下部バー相当をボックス化）
  let bottomBar = '';
  if (st.selectedPanel && P[st.selectedPanel]) {
    const selKey = st.selectedPanel;
    const selP = P[selKey];
    const opened = st.panelOpened.indexOf(selKey) >= 0;
    const adjG = ownerAdjGraphs[selP.owner] || {};
    const adjLocked = !st.cheatAllPanels && !SC.adjacentUnlocked(selKey, adjG, st.panelOpened, P);
    const isCheatReequip = st.cheatAllPanels && opened && (selP.type === 'live' || selP.heal);
    // v0.25.5: rawパネルも習得可能に（効果は掛からないが隣接解放が進む。quick/interestはWING対象外のまま不可）
    const isRawLike = selP.quick || selP.kind === 'interest' || selP.type === 'quick' || selP.type === 'interest';
    const isRawUnknown = selP.type === 'raw';
    // v0.25.5: sp未解析のrawパネルは (p.sp||0) で判定（undefined比較で永久に買えない問題の修正）
    const canBuyNow = !isRawLike && !adjLocked && (isCheatReequip || (!opened && st.sp >= (selP.sp || 0)));
    let stateNote = '';
    if (isRawLike) stateNote = '<span class="rdb-note">未対応（WING編では使用不可）</span>';
    else if (isRawUnknown && !opened && !adjLocked) stateNote = '<span class="rdb-note">⚠ 効果未解析（習得しても効果は掛からない・隣接解放用）</span>';
    else if (selP._condUnsupported && !opened) stateNote = '<span class="rdb-note">⚠ 発動条件が特殊なため判定未対応（習得可・効果文は原文どおり）</span>';
    else if (opened && !isCheatReequip) stateNote = '<span class="rdb-note ok">習得済み ✓</span>';
    else if (adjLocked) stateNote = '<span class="rdb-note">🔒 隣接パネル未開放</span>';
    else if (!canBuyNow) stateNote = '<span class="rdb-note ng">SP不足</span>';
    bottomBar = `<div class="review-detail-box">
      <button class="rdb-close" data-action="panel-cancel">&#10005;</button>
      <div class="rdb-name">${selP.name}</div>
      <div class="rdb-effect">${SC.panelDesc(selKey)}</div>
      <div class="rdb-sp">必要 <b class="sp-badge">SP</b> ${selP.sp}${isCheatReequip ? '（装備はSP0）' : ''}</div>
      ${stateNote}
      ${canBuyNow ? `<button class="rdb-buy-btn" data-action="panel-buy" data-key="${selKey}">${isCheatReequip ? '装備する（SP0）' : '習得する'}</button>` : ''}
    </div>`;
  }

  // ---- 習得確認モーダル（panel-buy クリック後）----
  let confirmModal = '';
  if (st.showConfirmModal) {
    const key = st.showConfirmModal;
    const p = P[key];
    if (p) {
      const opened = st.panelOpened.indexOf(key) >= 0;
      const isCheatReequip = st.cheatAllPanels && opened && (p.type === 'live' || p.heal);
      const spCost = isCheatReequip ? 0 : p.sp;
      // ライブスキル4枠フルかつ空きなし → 上書きモーダル
      const emptySlot = st.pSkills.findIndex(function (sk) { return !sk || !sk.name; });
      const needOverwrite = (p.type === 'live' || p.heal) && emptySlot < 0 && st.pSkills.length >= 4;
      if ((p.type === 'live') && emptySlot < 0) {
        // 4枠上書きモーダル
        confirmModal = `<div class="modal-overlay" data-action="modal-close">
          <div class="modal-box overwrite-modal" onclick="event.stopPropagation()">
            <div class="modal-title"><span class="modal-icon">&#9888;</span> スキル上書き選択</div>
            <p class="overwrite-msg">覚えられるライブスキルは4つまでです。忘れるスキルを選択して下さい。</p>
            ${st.pSkills.map(function (sk, i) {
              return `<div class="overwrite-slot">
                <div>
                  <div class="overwrite-skill-name">${sk ? sk.name : '（空）'}</div>
                  <div class="overwrite-skill-desc">${sk ? SC.pSkillDesc(sk) : ''}</div>
                </div>
                <button class="overwrite-select-btn" data-action="panel-slot" data-slot="${i}">選択</button>
              </div>`;
            }).join('')}
            <button class="modal-cancel" data-action="modal-close">キャンセル</button>
          </div>
        </div>`;
      } else {
        // 通常習得確認モーダル
        confirmModal = `<div class="modal-overlay" data-action="modal-close">
          <div class="modal-box" onclick="event.stopPropagation()">
            <div class="modal-title"><span class="modal-icon">&#127919;</span> スキル習得確認</div>
            <hr>
            <div class="modal-question">SPを${spCost}消費してスキルを習得しますか？</div>
            <div class="modal-skill-box">
              <div class="modal-skill-name">${p.name}</div>
              <div class="modal-skill-desc">${SC.panelDesc(key)}</div>
            </div>
            <div class="modal-sp-row">
              <span class="modal-sp-label">所持スキルポイント</span>
              <span class="modal-sp-val">${st.sp}</span>
              <span class="modal-sp-arrow">&#9658;&#9658;</span>
              <span class="modal-sp-after">${st.sp - spCost}</span>
            </div>
            <div class="modal-btns">
              <button class="modal-cancel" data-action="modal-close">キャンセル</button>
              <button class="modal-ok" data-action="panel-buy-confirm" data-key="${key}">OK</button>
            </div>
          </div>
        </div>`;
      }
    }
  }

  // ---- 4枠上書き（pendingPanel かつ confirmModal がない場合）----
  let overwriteModal = '';
  if (st.pendingPanel && !st.showConfirmModal) {
    const p = P[st.pendingPanel];
    if (p) {
      overwriteModal = `<div class="modal-overlay" data-action="modal-close">
        <div class="modal-box overwrite-modal" onclick="event.stopPropagation()">
          <div class="modal-title"><span class="modal-icon">&#9888;</span> スキル上書き選択</div>
          <p class="overwrite-msg">覚えられるライブスキルは4つまでです。忘れるスキルを選択して下さい。</p>
          ${st.pSkills.map(function (sk, i) {
            return `<div class="overwrite-slot">
              <div>
                <div class="overwrite-skill-name">${sk ? sk.name : '（空）'}</div>
                <div class="overwrite-skill-desc">${sk ? SC.pSkillDesc(sk) : ''}</div>
              </div>
              <button class="overwrite-select-btn" data-action="panel-slot" data-slot="${i}">選択</button>
            </div>`;
          }).join('')}
          <button class="modal-cancel" data-action="modal-close">キャンセル</button>
        </div>
      </div>`;
    }
  }

  // ---- 所持スキルポップ ----
  let ownedSkillsPop = '';
  if (st.showOwnedSkillsPop) {
    ownedSkillsPop = `<div class="modal-overlay" data-action="owned-skills-close">
      <div class="modal-box owned-skills-modal" onclick="event.stopPropagation()">
        <div class="owned-pop-head">
          <span class="owned-face"><img class="${SC.idolFaceClass()}" src="${SC.idolFaceImg()}" alt="" style="object-position:${SC.idolFaceObjPos()}" onerror="this.style.display='none'"></span>
          <div class="owned-stats">
            <div class="owned-sp-row">SP <b>${st.sp}</b> &nbsp; <span class="owned-fans">&#128101; ${SC.fmt(st.fans)}</span> <span class="owned-rank">ランク${SC.rankOf(st.fans)}</span></div>
            <div class="owned-stat-grid">
              <span class="chip chip-vo">Vo <b class="srank">${SC.statRank(st.stats.vo)}</b> ${st.stats.vo}/${st.statCap.vo}</span>
              <span class="chip chip-da">Da <b class="srank">${SC.statRank(st.stats.da)}</b> ${st.stats.da}/${st.statCap.da}</span>
              <span class="chip chip-vi">Vi <b class="srank">${SC.statRank(st.stats.vi)}</b> ${st.stats.vi}/${st.statCap.vi}</span>
              <span class="chip chip-me">Me <b class="srank">${SC.statRank(st.mental)}</b> ${st.mental}/${st.statCap.me || 500}</span>
            </div>
          </div>
        </div>
        <div class="owned-live-title">&#10022; ライブスキル &#10022;</div>
        ${st.pSkills.map(function (sk) {
          if (!sk || !sk.name) return `<div class="owned-skill-row"><span class="owned-skill-icon chip chip-me"></span><div class="owned-skill-info"><div class="owned-skill-name">（空）</div></div></div>`;
          return `<div class="owned-skill-row">
            <span class="owned-skill-icon chip chip-${sk.attr || 'me'}"></span>
            <div class="owned-skill-info">
              <div class="owned-skill-name">${sk.name}</div>
              <div class="owned-skill-desc sub">${SC.pSkillDesc(sk)}</div>
            </div>
          </div>`;
        }).join('')}
        <button class="modal-cancel" style="margin-top:10px" data-action="owned-skills-close">閉じる</button>
      </div>
    </div>`;
  }

  // ---- v0.16c: 初期ズームauto-fit（全クラスタが一望できる倍率を自動算出）----
  // キャンバス全体のバウンディングボックスから、1280×720のビューポートに収まるfitScaleを計算
  // st.reviewZoomが未設定（初回）のみ適用。ユーザーの手動ズームは維持される
  if (!st.reviewZoom) {
    // v0.24.1: 格子配置の最遠端（row最大+1帯分の余白）を基準にfit。汎用spiralの場合は旧式
    const gridR = GRID_R0 + (gridMaxRow + 1.6) * GRID_DY;
    const contentR = Math.max(gridR, CLUSTER_R + blockRadius + 12);
    const viewW = 1180, viewH = 620;
    const fitScale = Math.min(viewW / (contentR * 2), viewH / (contentR * 2), 1.5);
    st.reviewZoom = Math.round(fitScale * 10) / 10;
    if (st.reviewZoom < 0.3) st.reviewZoom = 0.3;
  }
  const zoom = st.reviewZoom;

  // ---- v0.18: 表示モードに応じてコンテンツを切替 ----
  const viewMode = st.reviewViewMode || 'list';
  const toggleLabel = viewMode === 'list' ? 'マップ表示' : 'リスト表示';

  // リスト表示: ownerGroups を元にテーブルリストを生成
  let mainContent = '';
  if (viewMode === 'list') {
    mainContent = SC.renderReviewList(ownerGroups, unitNames, P, st, passiveDeleteEnabled, ownerAdjGraphs);
  } else {
    // マップ表示: 既存ハニカムキャンバス
    mainContent = `
      <div class="review-layout">
        <!-- 左サイドパネル -->
        <div class="review-left">
          <div class="review-idol-chip"><img class="${SC.idolFaceClass()}" src="${SC.idolFaceImg()}" alt="" style="object-position:${SC.idolFaceObjPos()}" onerror="this.replaceWith(document.createTextNode(String.fromCodePoint(0x1F469)))"></div>
          <div class="review-sp-disp">SP ${st.sp}</div>
          <button class="review-owned-btn" data-action="review-owned-skills">所持スキル</button>
          <label class="review-passive-label">
            <input type="checkbox" id="review-passive-toggle" ${passiveDeleteEnabled ? 'checked' : ''} data-action="review-passive-toggle">
            パッシブ削除を有効
          </label>
        </div>

        <!-- ハニカムメイン（absolute配置キャンバス） -->
        <div class="hex-viewport" id="review-main">
          <div class="hex-canvas" id="honeycomb-wrapper"
               style="width:${CW}px;height:${CH}px;transform:scale(${zoom});transform-origin:top left;">
            ${canvasHTML}
          </div>
        </div>

        <!-- ズームボタン -->
        <div class="review-right">
          <button class="zoom-btn" data-action="review-zoom-in">&#65291;</button>
          <button class="zoom-btn" data-action="review-zoom-out">&#65293;</button>
        </div>
      </div>
      ${bottomBar}`;
  }

  return `
  <main class="panel review-panel review-panel-v16c">
    <div class="review-topbar">
      <h2>振り返り</h2>
      <div class="review-topbar-btns">
        <button class="review-view-toggle-btn ${viewMode === 'list' ? 'active' : ''}" data-action="review-view-toggle" data-mode="list">リスト</button>
        <span class="review-view-sep">｜</span>
        <button class="review-view-toggle-btn ${viewMode === 'map' ? 'active' : ''}" data-action="review-view-toggle" data-mode="map">マップ</button>
      </div>
    </div>

    ${mainContent}
    ${confirmModal}
    ${overwriteModal}
    ${ownedSkillsPop}
    <!-- v0.20c: 左下固定戻るボタン（実機準拠） -->
    <button class="back-arrow-btn" data-action="back-home" title="戻る">&#8592;</button>
  </main>`;
};

// ---- v0.18: 振り返りリスト表示（メンバー別セクション・SP昇順） ----
// v0.25.28: 丸アイコン=SC.idolFaceImg（顔切り抜き。デフォルト時は中央）
SC.renderReviewList = function (ownerGroups, unitNames, P, st, passiveDeleteEnabled, ownerAdjGraphs) {
  const removed = st.passiveRemoved || [];
  const ownerOrder = ['p', 0, 1, 2, 3, 'guest'];

  // 種別バッジHTML
  const typeBadge = function (p) {
    const typeMap = {
      live: { label: 'アピール', cls: 'rl-badge-live' },
      cap:  { label: '上限UP',  cls: 'rl-badge-cap' },
      passive: { label: 'パッシブ', cls: 'rl-badge-passive' },
      buff:    { label: 'バフ',    cls: 'rl-badge-passive' },
      heal:    { label: '回復',    cls: 'rl-badge-heal' },
      stat:    { label: 'ステUP', cls: 'rl-badge-stat' },
      dmgCut:  { label: 'ダメ軽', cls: 'rl-badge-passive' },
      reactAvoid: { label: '回避', cls: 'rl-badge-passive' },
      memory:  { label: '思い出', cls: 'rl-badge-passive' },
      quick:   { label: 'クイック', cls: 'rl-badge-raw' },
      interest: { label: '興味', cls: 'rl-badge-raw' },
      effect:  { label: '効果',    cls: 'rl-badge-effect' },   // v0.25.36: 効果札（非アピールのライブスキル）
      raw:     { label: '未対応', cls: 'rl-badge-raw' }
    };
    // v0.25.35: 回復・ダメージカット・回避は type:'passive' になったが、リストのバッジは従来どおり 回復／ダメ軽／回避
    // v0.25.36: 効果札（effectOnly）は「効果」バッジ（主効果が回復のものは従来の「回復」）
    const t = p.effectOnly ? (p.heal ? 'heal' : 'effect')
      : p.heal && p.type !== 'heal' ? 'heal'
      : (p.type === 'passive' && p._healPct !== undefined ? 'heal'
        : (p.type === 'passive' && p._cutPct !== undefined ? 'dmgCut'
          : (p.type === 'passive' && p._avoidPct !== undefined ? 'reactAvoid' : (p.type || 'raw'))));
    const info = typeMap[t] || { label: t, cls: 'rl-badge-raw' };
    return `<span class="rl-badge ${info.cls}">${info.label}</span>`;
  };

  // 状態ラベル + 習得/装備ボタン
  const statusCell = function (key, p) {
    const opened = st.panelOpened.indexOf(key) >= 0;
    // v0.20b: 隣接解放チェック（cheatAllPanels時は全解放扱い）
    const adj = (ownerAdjGraphs && ownerAdjGraphs[p.owner]) || {};
    const adjOk = st.cheatAllPanels || SC.adjacentUnlocked(key, adj, st.panelOpened, P);
    const reqOk = adjOk && (!p.req || st.panelOpened.indexOf(p.req) >= 0);
    const isCheatReequip = st.cheatAllPanels && opened && (p.type === 'live' || p.heal);
    const isPassive = p.type === 'passive';
    const isRemoved = isPassive && removed.indexOf(p.holder) >= 0;
    const isRaw = p.type === 'raw';
    // v0.19: quick/interest はWING編対象外（ユーザー確認2026-07-04）
    const isWingUnsupported = p.type === 'quick' || p.type === 'interest';

    if (isRemoved) {
      return `<span class="rl-status rl-status-removed">削除済</span>`;
    }
    if (isWingUnsupported) {
      return `<span class="rl-status rl-status-raw" title="WING編では使用不可（ユーザー確認2026-07-04）">WING編では使用不可</span>`;
    }
    if (isRaw) {
      return `<span class="rl-status rl-status-raw">未対応</span>`;
    }
    if (isCheatReequip) {
      // v0.18: リストからは panel-buy に直接繋ぐ（ボトムバーを経由しない）
      return `<button class="rl-equip-btn" data-action="panel-buy" data-key="${key}">装備SP0</button>`;
    }
    if (opened) {
      return `<span class="rl-status rl-status-done">習得済&#10003;</span>`;
    }
    if (!adjOk) {
      return `<span class="rl-status rl-status-locked rl-status-adj-locked" title="隣接するパネルを先に習得してください">&#128274; 隣接未開放</span>`;
    }
    if (!reqOk) {
      return `<span class="rl-status rl-status-locked">&#128274; 条件未達</span>`;
    }
    if (st.sp >= p.sp) {
      // v0.18: リストからは panel-buy に直接繋ぐ（ボトムバーを経由しない）
      return `<button class="rl-buy-btn" data-action="panel-buy" data-key="${key}">習得する</button>`;
    }
    return `<span class="rl-status rl-status-nsp">習得可（SP不足）</span>`;
  };

  let html = `
  <div class="review-list-wrap">
    <!-- 左サイドパネル（リスト時） -->
    <div class="review-left">
      <div class="review-idol-chip"><img class="${SC.idolFaceClass()}" src="${SC.idolFaceImg()}" alt="" style="object-position:${SC.idolFaceObjPos()}" onerror="this.replaceWith(document.createTextNode(String.fromCodePoint(0x1F469)))"></div>
      <div class="review-sp-disp">SP ${st.sp}</div>
      <button class="review-owned-btn" data-action="review-owned-skills">所持スキル</button>
      <label class="review-passive-label">
        <input type="checkbox" id="review-passive-toggle" ${passiveDeleteEnabled ? 'checked' : ''} data-action="review-passive-toggle">
        パッシブ削除を有効
      </label>
    </div>

    <!-- パネルリスト本体 -->
    <div class="review-list-main">`;

  ownerOrder.forEach(function (owner) {
    const keys = (ownerGroups[owner] || []);
    if (keys.length === 0) return;

    // SP昇順ソート（raw/quick/interestは末尾）
    const sorted = keys.slice().sort(function (a, b) {
      const pa = P[a], pb = P[b];
      if (!pa || !pb) return 0;
      const rawA = (pa.type === 'raw' || pa.type === 'quick' || pa.type === 'interest') ? 1 : 0;
      const rawB = (pb.type === 'raw' || pb.type === 'quick' || pb.type === 'interest') ? 1 : 0;
      if (rawA !== rawB) return rawA - rawB;
      return (pa.sp || 0) - (pb.sp || 0);
    });

    html += `<div class="rl-section">
      <div class="rl-section-head">${unitNames[owner] || owner}</div>
      <table class="rl-table">
        <thead><tr>
          <th class="rl-th-name">スキル名</th>
          <th class="rl-th-type">種別</th>
          <th class="rl-th-sp">SP</th>
          <th class="rl-th-detail">条件/確率/最大</th>
          <th class="rl-th-status">状態・操作</th>
        </tr></thead>
        <tbody>`;

    sorted.forEach(function (key) {
      const p = P[key];
      if (!p) return;
      const opened = st.panelOpened.indexOf(key) >= 0;
      const isCheatReequip = st.cheatAllPanels && opened && (p.type === 'live' || p.heal);
      // v0.19: quick/interestはWING編対象外（ユーザー確認2026-07-04）
      const isRaw = p.type === 'raw';
      const isWingUnsupported = p.type === 'quick' || p.type === 'interest';
      const isRemoved = (p.type === 'passive') && (removed.indexOf(p.holder) >= 0);

      // 行のCSSクラス
      let rowCls = 'rl-row';
      if (isRemoved) rowCls += ' rl-row-removed';
      else if (isCheatReequip) rowCls += ' rl-row-cheat';
      else if (opened) rowCls += ' rl-row-done';
      else if (isRaw || isWingUnsupported) rowCls += ' rl-row-raw';

      // 条件/確率/最大
      let detailStr = '';
      if (p._rawCond) detailStr += `<span class="rl-cond">条件:${p._rawCond}</span>`;
      if (p._rawProb) detailStr += `<span class="rl-cond">確率:${p._rawProb}</span>`;
      if (p._rawMax)  detailStr += `<span class="rl-cond">最大:${p._rawMax}</span>`;

      // スキル説明（フル名+効果）
      const descText = SC.panelDesc(key);

      html += `<tr class="${rowCls}" data-key="${key}" title="${(p.name || '').replace(/"/g, '&quot;')}">
          <td class="rl-td-name">
            <span class="rl-skill-name">${p.name || '(不明)'}</span>
            <span class="rl-skill-desc sub">${descText}</span>
          </td>
          <td class="rl-td-type">${typeBadge(p)}</td>
          <td class="rl-td-sp">${(isRaw || isWingUnsupported) ? '-' : (p.sp != null ? p.sp : '?')}</td>
          <td class="rl-td-detail">${detailStr || '—'}</td>
          <td class="rl-td-status">${statusCell(key, p)}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
  });

  html += `</div><!-- /review-list-main --></div><!-- /review-list-wrap -->`;
  return html;
};

// ---- 週結果・シーズン結果 ----
SC.renderWeekResult = function () {
  const r = SC.state.lastResult || { title: '結果', lines: [] };
  // v0.25.3: レッスン大成功（PERFECT）は金フラッシュ+金枠（演出カット時はフラッシュなし）
  const goldFx = (r.perfect && !SC.state.commsOff) ? '<div class="result-gold-flash"></div>' : '';
  return `
  <main class="panel result-panel ${r.ok === false ? 'result-bad' : ''} ${r.perfect ? 'result-perfect' : ''}">
    ${goldFx}
    <h2>${r.title}</h2>
    ${r.lines.map(function (l) { return `<p>${l}</p>`; }).join('')}
    <button class="main-btn" data-action="result-ok">次の週へ</button>
  </main>`;
};

SC.renderSeasonResult = function () {
  const r = SC.state.seasonResult || { title: '', lines: [] };
  const pending = r.pendingResult
    ? `<div class="pending-result"><h3>${r.pendingResult.title}</h3>${r.pendingResult.lines.map(function (l) { return `<p>${l}</p>`; }).join('')}</div><hr>`
    : '';
  return `
  <main class="panel result-panel season-clear">
    ${pending}
    <h2>${r.title}</h2>
    ${r.lines.map(function (l) { return `<p>${l}</p>`; }).join('')}
    <button class="main-btn" data-action="season-ok">${r.toFinals ? 'W.I.N.G.本戦へ！' : '次のシーズンへ'}</button>
  </main>`;
};

// ---- 本戦ホーム ----
SC.renderFinalsHome = function () {
  const st = SC.state;
  const stage = st.finalsStage;
  const label = stage === 'semi' ? '準決勝' : '決勝';
  const defId = stage;
  const r = st.lastResult;
  const tickets = st.continueTickets !== undefined ? st.continueTickets : 0;
  return `
  <main class="panel finals-panel">
    <!-- v0.21: ホームと同様に右上に諦めるボタン -->
    <div class="home-top-right-btns">
      <button class="give-up-btn" data-action="give-up" title="プロデュースを諦める">${SC.icon("flag")}<span>諦める</span></button>
    </div>
    <h2>W.I.N.G. ${label}</h2>
    ${r ? r.lines.map(function (l) { return `<p>${l}</p>`; }).join('') : ''}
    <p><b>1位のみ</b>が${stage === 'semi' ? '決勝へ進める' : '優勝となる'}。敗退した時点でプロデュース終了。</p>
    <p class="sub">コンティニューチケット: <b>${tickets}</b>枚</p>
    ${SC.renderTrend()}
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:14px">
      <button class="main-btn" style="margin:0" data-action="audition-start" data-id="${defId}">${label}に挑む！</button>
      <button class="act-btn c-review" style="font-size:14px;padding:10px 20px" data-action="go-review">振り返り</button>
    </div>
  </main>`;
};

// ---- 行動順サフィックス（1st/2nd/3rd/4th...）----
SC.orderSuffix = function (n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// ---- オーディション（バトル画面） ----
// v0.25.28: 丸アイコン=SC.idolFaceImg（顔切り抜き。デフォルト時は中央）
SC.renderAudition = function () {
  const a = SC.state.audition;
  if (!a) return '<p>エラー：オーディション状態なし</p>';
  // v0.17: finished 時は 審査員コミュ → reveal 演出 → 結果画面の順で遷移（commsOff 時はスキップ）
  // v0.25.34: シミュは審査終了（全員帰宅・自ユニット脱落）でも結果発表画面には遷移せず、上部に「審査終了」の帯を出して画面を残す
  if (a.finished && !SC.state.simMode) {
    if (SC.state.commsOff || a.revealDone) return SC.renderAuditionResult();
    if (!a.revealCommDone) return SC.renderRevealComm();   // v0.25.3 P6: 発表前の審査員コミュ（r1実測の流れ）
    return SC.renderAuditionReveal();
  }

  const player = a.units[0];
  const selCard = a.selectedCard !== null && a.selectedCard !== 'memory'
    ? a.deck[a.hand[a.selectedCard]] : null;
  const selMemory = a.selectedCard === 'memory';
  // v0.25.11: スキル選択時の効果表示（ユーザー指定: 1クリック目=選択で効果を確認→2クリック目=審査員で発動）
  let skillInfoHtml = '';
  if (selCard) {
    const attrsLbl = (selCard.attrs && selCard.attrs.length ? selCard.attrs : [selCard.attr])
      .map(function (at) { return SC.ATTR_LABEL[at] || at; }).join('&');
    const eff = selCard.effectRaw
      || (selCard.heal ? 'メンタル回復' : `${attrsLbl}${selCard.mult}倍アピール${selCard.allJudges ? '（全体）' : ''}`);
    const ownerName = selCard.owner === 'p' ? SC.IDOL.name
      : (SC.SUPPORTS[selCard.owner] ? SC.SUPPORTS[selCard.owner].name : 'サポート');
    // v0.25.29: サポ札は持ち主のアイドル名（短縮名）を添える
    const ownerWho = SC.supportOwnerShortName(selCard.owner);
    skillInfoHtml = `<div class="skill-info-pop"><b>${selCard.name}</b><span class="sip-eff">${eff}</span><span class="sip-owner">${ownerWho ? `<i class="sip-who">${ownerWho}</i>` : ''}${ownerName}</span></div>`;
  } else if (selMemory) {
    const memLvSel = SC.memoryLv();
    skillInfoHtml = `<div class="skill-info-pop"><b>思い出アピール Lv${memLvSel}</b><span class="sip-eff">全審査員へ思い出アピール（基礎倍率×${SC.CONFIG.audition.memoryMult[memLvSel] || 0}）</span></div>`;
  }
  const nextBoost = SC.CONFIG.audition.judge.reactEvery - (a.turn % SC.CONFIG.audition.judge.reactEvery);
  const isBoostTurn = a.turn % SC.CONFIG.audition.judge.reactEvery === 0;

  // 行動順プレビュー（ロジック層の {units:{key:n}, judges:{attr:n}} をフラットなキーに変換）
  const orderMap = {};
  const ord = SC.turnOrderPreview();
  Object.keys(ord.units).forEach(function (k) { orderMap[k] = ord.units[k]; });
  Object.keys(ord.judges).forEach(function (k) { orderMap['judge_' + k] = ord.judges[k]; });

  // ダメージFX: SC.lastFx から読み取り
  const fx = SC.lastFx || null;
  let judgementPopHtml = '';
  if (fx && fx.judgement) {
    const jText = { perfect: 'Perfect!!', good: 'Good!', normal: 'Normal', bad: 'Bad...', memGood: 'Good!', memBad: 'Bad...' }[fx.judgement] || fx.judgement;
    // v0.25.11: 判定文字リッチ化（rec3実測: 箱なし大型イタリック文字。1文字ずつポップ）
    const jChars = String(jText).split('').map(function (ch, ci) {
      return `<span class="jp-ch" style="animation-delay:${ci * 45}ms">${ch}</span>`;
    }).join('');
    judgementPopHtml = `<div class="judgement-pop judgement-${fx.judgement.toLowerCase()}">${jChars}</div>`;
  }

  // --- 審査員列 ---
  const judgeCards = a.judges.map(function (j, idx) {
    const rank = SC.trendRank(j.attr);
    const badge = SC.CONFIG.audition.trendBadge[rank];
    const badgeHtml = `<span class="trend-badge tb-${rank}">流行${rank + 1}位${badge ? ' ' + badge : ''}</span>`;
    // 行動順バッジ（動画実測: 1st〜9thの審査員込み通し番号）
    const orderNum = orderMap['judge_' + j.attr];
    const orderBadge = orderNum ? `<span class="order-badge">${SC.orderSuffix(orderNum)}</span>` : '';
    if (j.gone) {
      const nameOf = function (key) {
        const u = a.units.find(function (x) { return x.key === key; });
        return u ? u.name : '—';
      };
      return `
      <div class="judge-card judge-gone">
        <div class="judge-name">${j.name} ${badgeHtml}</div>
        <div class="judge-star">TA→${nameOf(j.taTo)} / LA→${nameOf(j.laTo)}</div>
        <div class="judge-gone-label">満足して退場</div>
      </div>`;
    }
    // v0.19: 蓄積式ゲージ（gained/need）・0→MAX方向のfill
    const pct = Math.max(0, Math.min(100, Math.round(j.gained / j.need * 100)));
    const simOn = !!SC.state.simMode;   // v0.25.28: シミュレーション中は審査員クリック不可（メーターを開かない）
    const targetable = !simOn && ((selCard && !SC.isEffectOnlyCard(selCard)) || selMemory);   // v0.25.5: allJudges札も対象選択／v0.25.21: 思い出も審査員選択／v0.25.36: 回復札・効果札は審査員選択なし
    const excellent = selCard && SC.skillHasAttr(selCard, j.attr);   // v0.25.7: 複合属性対応
    let predict = '';
    let simExtra = '';
    if (selCard && !SC.isEffectOnlyCard(selCard)) predict = `Perfect時 ${SC.fmt(SC.appealPredict(selCard, j.attr, 1.5, j))}`;   // v0.25.18: PLUS/LINK追加効果込み（ユーザー指定）
    if (selMemory) predict = `Perfect時 ${SC.fmt(SC.memoryPredict(j, 1.5))}`;   // v0.25.37: 思い出の付随効果/LINK効果の追加アピール込み
    if (simOn) {   // v0.25.28: 判定入力の係数・「{判定}時」ラベル・帰宅◎（sim_ui.js。v0.25.37: 残り量表示は撤去）
      const sp = SC.simPredictLabel(selCard, selMemory, j);
      predict = sp ? sp.text : '';
      simExtra = sp ? sp.badge : '';
    }
    // ダメージ数字FX（動画実測: 審査員カード上に黄色い「+4574」）
    const dmgFx = fx && fx.dmg && fx.dmg[idx] ? `<span class="dmg-float">+${SC.fmt(fx.dmg[idx])}</span>` : '';
    return `
    <div class="judge-card judge-${j.attr} ${targetable ? 'targetable' : ''} ${excellent ? 'excellent-target' : ''}"
      ${targetable ? `data-action="pick-judge" data-judge="${idx}" style="cursor:pointer"` : ''}>
      ${orderBadge}${dmgFx}
      <div class="judge-name">${j.name} ${badgeHtml}</div>
      <div class="judge-hp-bar"><div class="judge-hp-fill" style="width:${pct}%"></div></div>
      <div class="judge-hp-num">興味値 ${SC.fmt(Math.round(j.gained))} / ${SC.fmt(j.need)}</div>
      ${predict ? `<div class="predict">${predict}${excellent ? '（Excellent!!）' : ''}</div>${simExtra}` : ''}
      ${targetable ? '<div class="appeal-hint" data-action="pick-judge" data-judge="' + idx + '">クリックでアピール</div>' : ''}
    </div>`;
  }).join('');

  // --- 順位列 ---
  const sorted = a.units.slice().sort(function (x, y) {
    return (y.stars - x.stars) || ((y.isPlayer ? 1 : 0) - (x.isPlayer ? 1 : 0)) ||
      (a.totalDealt[y.key] - a.totalDealt[x.key]);
  });
  const jLabel = { perfect: 'P', good: 'G', normal: 'N', bad: 'B', memGood: '♥', memBad: '♥' };
  // 属性色マップ（顔アイコン用）
  const attrColorMap = { vo: '#e94e6f', da: '#3aa0e8', vi: '#eeb420' };
  const rankRows = sorted.map(function (u, i) {
    const mpct = Math.round(u.mental / u.mentalMax * 100);
    const jud = u.isPlayer ? '' : `<span class="judg judg-${u.judgement}">${jLabel[u.judgement] || ''}</span>`;
    // プレイヤー行にも行動順バッジ
    const unitOrderNum = orderMap[u.key];
    const unitOrderBadge = unitOrderNum
      ? `<span class="order-badge ${u.isPlayer ? 'order-badge-me' : ''}" ${u.isPlayer ? 'title="自分の判定次第で変動（Normal仮定）"' : ''}>${SC.orderSuffix(unitOrderNum)}</span>`
      : '';
    // 顔アイコン（属性色背景の丸）
    const faceColor = u.isPlayer
      ? (attrColorMap[SC.IDOL.attr] || '#d3548e')
      : (u.attr ? (attrColorMap[u.attr] || '#aaa') : '#aaa');
    const faceIcon = `<span class="rank-face" style="background:${faceColor}">${u.name.charAt(0)}</span>`;
    return `
    <div class="rank-row ${u.isPlayer ? 'me' : ''} ${u.out ? 'out' : ''}">
      ${unitOrderBadge}<span class="rank-pos">${i + 1}位</span>${jud}
      <span class="rank-name">${u.name}${u.out ? '（脱落）' : ''}</span>
      <span class="rank-stars">★${u.stars}</span>
      <div class="mental-bar"><div class="mental-fill" style="width:${mpct}%"></div></div>
      <span class="mini-num">${u.mental}/${u.mentalMax}</span>
      ${faceIcon}
    </div>`;
  }).join('');

  // --- 手札（LINK/PLUSバッジ: 発動可能なら点灯。allJudgesバッジも表示）---
  const handCards = a.hand.map(function (deckIdx, pos) {
    const c = a.deck[deckIdx];
    const sel = a.selectedCard === pos;
    const owner = c.owner === 'p' ? 'P' : 'サポ';
    let badges = '';
    if (c.allJudges) badges += '<span class="card-badge lit">全体</span>';
    if (c.link || SC.cardHasLinkClause(c)) {   // v0.25.37: 実カードの(Link)節を持つ札にもLINKバッジ（点灯=LINK成立。PLUSと併記）
      const linkOk = SC.linkReady(c);
      const linkTip = c.plus && c.plus.unitAll ? SC.unitAllStatusText(c.plus.unitAll) : 'リンク条件';
      badges += `<span class="card-badge ${linkOk ? 'lit' : ''}" title="${linkTip}">LINK+</span>`;
    }
    if (c.plus && !c.link) {
      const plusOk = SC.plusActive(c);
      const plusTip = c.plus.unitAll ? SC.unitAllStatusText(c.plus.unitAll) : '';
      badges += `<span class="card-badge ${plusOk ? 'lit' : ''}" title="${plusTip}">PLUS</span>`;
    }
    return `
    <button class="skill-card ${c.heal ? 'c-heal' : (SC.isEffectOnlyCard(c) ? 'c-effect' : 'c-' + c.attr)} ${sel ? 'selected' : ''}" data-action="card-select" data-pos="${pos}">
      <span class="card-owner">${owner}${badges}</span>
      <span class="card-name">${c.name}</span>
      ${SC.isEffectOnlyCard(c) ? '' : `<span class="card-mult">×${c.mult}</span>`}
    </button>`;
  }).join('');

  const memLv = SC.memoryLv();
  // チャージ持ちは200%表示（1000=100%基準）。発動自体は100%から可能
  const memPct = Math.floor(player.mem / 1000 * 100);
  const memReady = memLv >= 1 && player.mem >= 1000;

  const logHtml = a.log.slice(0, 40).map(function (e) {
    return `<div class="log-line log-${e.cls}"><span class="log-turn">T${e.turn}</span> ${e.msg}</div>`;
  }).join('');

  // v0.19: クイックスキルはWING編対象外のためバトル内ボタン撤去（ユーザー確認2026-07-04）
  const quickHtml = '';

  // FX消費（表示後にnullに戻す）
  if (SC.lastFx) SC.lastFx = null;

  // v0.16b: 審査員カード（コンパクト版）
  const judgeCardsV16b = a.judges.map(function (j, idx) {
    const rank = SC.trendRank(j.attr);
    const badge = SC.CONFIG.audition.trendBadge[rank];
    const badgeHtml = `<span class="trend-badge tb-${rank}">流行${rank + 1}位${badge ? ' ' + badge : ''}</span>`;
    const orderNum = orderMap['judge_' + j.attr];
    const orderBadge = orderNum ? `<span class="order-badge">${SC.orderSuffix(orderNum)}</span>` : '';
    const dmgFx = fx && fx.dmg && fx.dmg[idx] ? `<span class="dmg-float">-${SC.fmt(fx.dmg[idx])}</span>` : '';
    // v0.25.2: 審査員アイコン（属性色チップ。img/judges/{attr}.png があれば差し替え表示）
    const faceChip = `<span class="judge-face judge-face-${j.attr}"><b>${SC.ATTR_LABEL[j.attr] || ''}</b><img src="img/judges/${j.attr}.png" alt="" style="display:none" onload="this.style.display='block'"></span>`;
    if (j.gone) {
      // v0.25.4: 帰宅済みは黒い空枠のみ（表示なし・ユーザー指定。TA/LAはログ参照）
      // v0.25.42（本体判断）: 「帰宅済」ラベルはシミュのみ。本編は v0.25.4 のユーザー明示指定（黒い空枠のみ）を優先する
      //   （ラベルは v0.25.38 でシミュに足した補助表示でユーザー指示ではない。本編へ広げるかはユーザー確認待ち）
      return `<div class="judge-card-v16b v16b-gone">${SC.state.simMode ? '<span class="sim-gone-label">帰宅済</span>' : ''}</div>`;
    }
    // v0.19: 蓄積式ゲージ（gained/need）・0→MAX方向のfill
    const pct = Math.max(0, Math.min(100, Math.round(j.gained / j.need * 100)));
    const simOn = !!SC.state.simMode;   // v0.25.28: シミュレーション中はメーターを開かない
    // v0.25.34: シミュは「札（または思い出）を選んだ状態で審査員をクリック」で1ターン進行（本編と同じ resolveTurn・演出。メーターは開かない）。
    //   回復札も可（審査員は何でもよい）。思い出はゲージ満タン＆Lv1以上の時だけ。審査終了後は不可
    const targetable = simOn ? (!a.finished && (!!selCard || (selMemory && memReady))) : ((selCard && !SC.isEffectOnlyCard(selCard)) || selMemory);   // v0.25.5: allJudges札も対象選択／v0.25.21: 思い出も審査員選択／v0.25.36: 回復札・効果札は審査員選択なし
    const excellent = selCard && SC.skillHasAttr(selCard, j.attr);   // v0.25.7: 複合属性対応
    let predict = '';
    let simExtra = '';
    if (selCard && !SC.isEffectOnlyCard(selCard)) predict = `Perfect時 ${SC.fmt(SC.appealPredict(selCard, j.attr, 1.5, j))}`;   // v0.25.18: PLUS/LINK追加効果込み（ユーザー指定）
    if (selMemory) predict = `Perfect時 ${SC.fmt(SC.memoryPredict(j, 1.5))}`;   // v0.25.37: 思い出の付随効果/LINK効果の追加アピール込み
    if (simOn) {   // v0.25.28: 判定入力の係数・「{判定}時」ラベル・帰宅◎（sim_ui.js。v0.25.37: 残り量表示は撤去）。v0.25.30: 札・思い出を選べば3審査員すべてに自動表示
      const sp = SC.simPredictLabel(selCard, selMemory, j);
      predict = sp ? sp.text : '';
      simExtra = sp ? sp.badge : '';
    }
    // v0.25.9: 実機風カード（f30実測: 属性色ベタ+人物シルエット+「Vo.」+白トラックゲージ+黒順位バッジ）
    // v0.25.43: 札・思い出を選んでいない時の審査員枠クリック＝その審査員の状態の詳細モーダル（SC.judgeEffectList / SC.effectPopHtml。本編・シミュ共通）。選択中は従来どおり（本編=対象選択／シミュ=プレイ進行）
    const judgeEffClick = (!targetable && a.selectedCard === null);
    return `<div class="judge-card-v16b jc-real judge-${j.attr} ${targetable ? 'targetable' : ''} ${judgeEffClick ? 'effect-clickable' : ''} ${excellent ? 'excellent-target' : ''}"
      ${targetable ? `data-action="pick-judge" data-judge="${idx}"` : (judgeEffClick ? `data-action="judge-effect-click" data-judge="${idx}" title="クリックで${j.name}の状態の詳細を表示"` : '')}>
      ${orderBadge}${dmgFx}
      <div class="jc-real-body">
        ${faceChip}
        <span class="jc-real-sil jc-real-sil2">${SC.icon2('judge' + j.attr) || SC.icon('judge')}</span>
        <span class="jc-real-attr">${SC.ATTR_LABEL[j.attr]}.</span>
        ${badgeHtml}
      </div>
      <div class="judge-v16b-hp jc-real-hp"><div class="judge-v16b-hp-fill jc-real-fill" style="width:${pct}%"></div></div>
      <div class="judge-v16b-num jc-real-num">興味値 ${SC.fmt(Math.round(j.gained))} / ${SC.fmt(j.need)}</div>
      ${predict ? `<div class="judge-v16b-predict">${predict}${excellent ? '<span class="jp-ex">（Excellent!!）</span>' : ''}</div>${simExtra}` : ''}
    </div>`;
  }).join('');

  // v0.25.10: 順位行（rec3実測: 固定順=自分先頭・行内に順位/判定表示なし・★+名前/バー+数値/右端シルエット）
  // v0.25.30: シミュ中はライバル（アイドルA〜E）の行を出さず自分の行だけ（その下に1〆シミュレーションパネル）
  const rankFixedOrder = a.units.filter(function (u) { return u.isPlayer; })
    .concat(SC.state.simMode ? [] : a.units.filter(function (u) { return !u.isPlayer; }));
  const simOneShotHtml = SC.state.simMode && SC.simOneShotPanelHtml ? SC.simOneShotPanelHtml() : '';
  const playerRankNum = sorted.findIndex(function (u) { return u.isPlayer; }) + 1;
  const rankRowsV16b = rankFixedOrder.map(function (u) {
    const mpct = Math.round(u.mental / u.mentalMax * 100);
    const attrColorMap2 = { vo: '#e94e6f', da: '#3aa0e8', vi: '#eeb420' };
    const faceColor = u.isPlayer
      ? (attrColorMap2[SC.IDOL.attr] || '#d3548e')
      : (u.attr ? (attrColorMap2[u.attr] || '#aaa') : '#aaa');
    const starsPad = String(u.stars).padStart(2, '0');
    // v0.25.12: 自分の行は立ち絵の顔部分を丸抜きで表示（ユーザー指定・スクショ212524）
    const rowIcon = u.isPlayer
      ? `<span class="rr-face">${SC.icon('person')}<img class="${SC.idolFaceClass()}" src="${SC.idolFaceImg()}" alt="" style="object-position:${SC.idolFaceObjPos()}" onerror="this.style.display='none'"></span>`
      : `<span class="rr-sil" style="color:${faceColor}">${SC.icon('person')}</span>`;
    // v0.25.43: 自分の行はクリックでステータス効果の詳細モーダル（ライブスキル・審査員リアクション由来のバフ/デバフ・状態効果・注目度。SC.unitEffectList / SC.effectPopHtml。本編・シミュ共通）。ライバルの行は何もしない
    const unitEffAttr = u.isPlayer ? ' data-action="unit-effect-click" title="クリックでステータス効果の詳細を表示"' : '';
    return `<div class="rank-row-v16b rr-real ${u.isPlayer ? 'me rr-clickable' : ''} ${u.out ? 'out' : ''}" data-unit-key="${u.key}"${unitEffAttr}>
      <div class="rr-main">
        <div class="rr-top"><span class="rr-star">★</span><span class="rr-starnum">${starsPad}</span>
          <span class="rr-name">${u.name}${u.out ? '（脱落）' : ''}</span></div>
        <div class="rr-bottom"><span class="rr-meicon">💗</span>
          <div class="rr-bar"><div class="rr-fill" style="width:${mpct}%"></div></div>
          <span class="rr-num">${u.mental}/${u.mentalMax}</span></div>
      </div>
      ${rowIcon}
    </div>`;
  }).join('');

  // v0.20b: 手札（コンパクト版・幅縮小・名前省略あり）
  const handCardsV16b = a.hand.map(function (deckIdx, pos) {
    const c = a.deck[deckIdx];
    const sel = a.selectedCard === pos;
    const owner = c.owner === 'p' ? 'P' : 'S';
    let badges = '';
    // v0.25.29: サポ札は持ち主の名前バッジ（白地・濃い文字）。全・LK・+ バッジと同じ orb-badges 内に並べる
    const ownerShort = SC.supportOwnerShortName(c.owner);
    if (ownerShort) badges += `<span class="card-badge name-badge">${ownerShort}</span>`;
    if (c.allJudges) badges += '<span class="card-badge lit">全</span>';
    if (c.link || SC.cardHasLinkClause(c)) {   // v0.25.37: 実カードの(Link)節を持つ札にもLINKバッジ（点灯=LINK成立。PLUSと併記）
      const linkOk2 = SC.linkReady(c);
      const linkTip2 = c.plus && c.plus.unitAll ? SC.unitAllStatusText(c.plus.unitAll) : 'リンク条件';
      badges += `<span class="card-badge ${linkOk2 ? 'lit' : ''}" title="${linkTip2}">LK</span>`;
    }
    if (c.plus && !c.link) {
      const plusOk2 = SC.plusActive(c);
      const plusTip2 = c.plus && c.plus.unitAll ? SC.unitAllStatusText(c.plus.unitAll) : '';
      badges += `<span class="card-badge ${plusOk2 ? 'lit' : ''}" title="${plusTip2}">+</span>`;
    }
    // v0.25.9: 実機風の円形手札（f24実測: 円形カード+右下属性チップ+上部LINK+バッジ）
    const shortName = c.name.length > 5 ? c.name.slice(0, 5) + '…' : c.name;
    // v0.25.36: 効果札（非アピールのライブスキル）は「効果」チップ・倍率なし（主効果が回復のものは従来の「回復」表示）
    const effCard = SC.isEffectOnlyCard(c);
    // v0.25.41: オーブの色は属性→配色クラス（SC.attrColorClass。Vo赤/Da青/Vi黄/Excellent白/複合=混合。回復=緑・効果=紫は従来どおり）。
    //   属性チップも複合なら全属性を並べる（例「VoDaVi.♪」。各属性を属性色の文字で）
    const cAttrs = (c.attrs && c.attrs.length > 1) ? c.attrs : [c.attr];
    const multiAttr = !c.heal && !effCard && cAttrs.length > 1 && cAttrs.indexOf('ex') < 0;
    const attrChipLbl = c.heal ? '回復' : (effCard ? '効果' : (multiAttr
      ? cAttrs.map(function (at) { return '<i class="ca-' + at + '">' + (SC.ATTR_LABEL[at] || '') + '</i>'; }).join('') + '.&#9834;'
      : (SC.ATTR_LABEL[c.attr] || '') + '.&#9834;'));
    const attrChipCls = c.heal ? 'oa-heal' : (effCard ? 'oa-effect' : (multiAttr ? 'oa-multi' : 'oa-' + c.attr));
    return `<button class="skill-orb ${c.heal ? 'c-heal' : (effCard ? 'c-effect' : SC.attrColorClass(cAttrs))} ${sel ? 'selected' : ''}"
      data-action="card-select" data-pos="${pos}" title="${c.name}">
      ${badges ? `<span class="orb-badges">${badges}</span>` : ''}
      <span class="orb-name">${shortName}</span>
      ${effCard ? '' : `<span class="orb-mult">×${c.mult}</span>`}
      <span class="orb-attr ${attrChipCls}">${attrChipLbl}</span>
    </button>`;
  }).join('');

  return `
  <main class="audition-panel">
    ${judgementPopHtml}
    <!-- 上段バー -->
    <div class="battle-topbar">
      ${SC.state.simMode
        ? `<div class="sim-turn-group"><div class="battle-turn-label">TURN ${a.turn}</div><button class="sim-btn sim-turn-reset" data-action="sim-play-reset" title="オーディション開始時の状態に戻す（ターン・興味値・バフ・履歴をリセット）">リセット</button></div>`
        : `<div class="battle-turn-label">TURN ${a.turn}</div>`}
      <div class="battle-boost-info">
        ${isBoostTurn ? '⚠ 強化リアクションターン！' : ''}
      </div>
      <div class="battle-auto-area">
        <!-- v0.25.10 rec3実測: 自分の現順位=金冠クレスト（Auto OFFの左） -->
        <span class="rank-crest"><i>${SC.icon('crown')}</i>${playerRankNum}位</span>
        <label class="auto-label"><input type="checkbox" id="auto-meter" ${SC.state.autoMeter ? 'checked' : ''}> メーター自動</label>
      </div>
    </div>
    ${(SC.state.simMode && a.finished) ? `<div class="sim-end-band">審査終了（${a.turn}ターン）</div>` : ''}   <!-- v0.25.34: シミュは終了しても結果発表へ遷移せず帯を出す -->
    <!-- メイン3列（審査員/中央ステージ/順位） -->
    <div class="battle-main-area">
      <div class="judge-col-v16b">${judgeCardsV16b}</div>
      <div class="battle-center-stage">
        <img class="scene-bg" src="img/bg/stage.png" alt="" onerror="this.remove()">
        <!-- v0.25.9: ステージ装飾（f30実測の雰囲気: 床+ライト+ユニットシルエット。抽象表現） -->
        <!-- v0.25.11: 回転スポットライト・床反射・ペンライト観客を追加（ライブ感の強化） -->
        <div class="stage-deco">
          <div class="stage-lights"><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="stage-spots"><i></i><i></i><i></i></div>
          <div class="stage-floor"></div>
          <!-- v0.25.22: SDアイドル自作SVG（承認済みプラン。ポーズ2種を交互配置） -->
          <div class="stage-members">
            <span class="sm">${SC.icon2('sdidolB')}</span><span class="sm">${SC.icon2('sdidolA')}</span><span class="sm sm-c">${SC.icon2('sdidolA')}</span><span class="sm">${SC.icon2('sdidolB')}</span><span class="sm">${SC.icon2('sdidolA')}</span>
          </div>
          <div class="stage-members stage-members-ref" aria-hidden="true">
            <span class="sm">${SC.icon2('sdidolB')}</span><span class="sm">${SC.icon2('sdidolA')}</span><span class="sm sm-c">${SC.icon2('sdidolA')}</span><span class="sm">${SC.icon2('sdidolB')}</span><span class="sm">${SC.icon2('sdidolA')}</span>
          </div>
          <div class="stage-penlights">${(function () {
            let pens = '';
            for (let pi = 0; pi < 26; pi++) {
              const hue = (pi * 67 + 20) % 360;
              const dl = ((pi * 43) % 20) / 20 * 1.1;
              pens += `<i style="--ph:${hue};animation-delay:-${dl.toFixed(2)}s"></i>`;
            }
            return pens;
          })()}</div>
        </div>
        <div class="battle-log-v16b">${logHtml}</div>
        <div id="meter-area"></div>
      </div>
      <div class="rank-col-v16b">${rankRowsV16b}${simOneShotHtml}</div>
    </div>
    <!-- v0.20b: パッシブ履歴アイコン列（左下常設・最大6件）。
         v0.25.27: どれをクリックしても「発動中のパッシブスキル」一覧モーダルを中央に表示するよう変更
         （ユーザー指定・実機参照: 個別クリックでなく一覧ポップ。従来の1件ずつの小ポップは廃止） -->
    ${(function () {
      // v0.25.31: シミュ中は本編のアイコン列を出さない（左下の「発動中のパッシブ」枠と重複するため）。
      //   v0.25.40: 枠の丸アイコン（passive-icon-click）で開く詳細モーダルだけは、本編と同じ位置（バトル画面直下）にここで出す（SC.simPassivePopHtml。a.showPassivePop を本編と共用）
      if (SC.state.simMode) return SC.simPassivePopHtml ? SC.simPassivePopHtml() : '';
      // v0.25.42: 本編もシミュと同じ表示にした（ユーザー指定「発動中のパッシブのみ・オンマウス詳細・アイコンの名前ルール」）。
      //   アイコン列・詳細モーダルとも「このターンに発動したパッシブ」（SC.firedPassiveDefs＝発動履歴の今ターン分。最大 SC.passiveMaxPerTurn() 個）。
      //   アイコン=丸・中の文字は持ち主の短縮名の1文字目・色は SC.attrColorClass・オンマウスで 持ち主/名前/効果/[条件][確率][最大]（title）。描画はシミュと同じ共通関数（下の SC.passiveIconHtml / SC.passivePopHtml）。
      //   旧: 履歴（最大6件・過去ターン含む・パッシブ名の頭文字＋T○○）のアイコンと、詳細モーダルは「保有している全パッシブ」（SC.activePassiveDefs）だった
      const firedDefs = SC.firedPassiveDefs();
      if (firedDefs.length === 0) return '';
      const iconsHtml = firedDefs.map(function (d) { return SC.passiveIconHtml(d); }).join('');
      const popHtml = a.showPassivePop ? SC.passivePopHtml(firedDefs) : '';
      return '<div class="passive-icons-area">' + iconsHtml + '</div>' + popHtml;
    })()}
    ${SC.auditionEffectPopHtml()}   <!-- v0.25.43: ステータス効果／審査員の状態の詳細モーダル（本編・シミュ共通。パッシブ詳細とは同時に開かない） -->
    <!-- 下段バー（スキル履歴アイコン/手札/思い出ゲージ） -->
    <div class="battle-bottom-bar">
      <!-- v0.20b: スキル履歴アイコン列（属性色丸+使用者イニシャル・直近5件） -->
      ${SC.state.simMode ? (SC.simPassiveBoxHtml ? SC.simPassiveBoxHtml() : '') : '<div class="skill-history-v20b">'}
        ${(function () {
          if (SC.state.simMode) return '';   // v0.25.31: シミュ中は旧スキル履歴欄を出さない
          const hist = a.skillHistory || [];
          if (hist.length === 0) return '<span class="skill-hist-empty">—</span>';
          return hist.map(function (e) {
            // v0.25.41: 履歴アイコンの色は属性→配色クラス（SC.attrColorClass。複合属性は記録した attrs で混合色・Excellent=白）。回復=緑・思い出=紫は従来どおり（hi-heal / hi-mem）
            const colorCls = e.attr === 'heal' ? 'hi-heal' : (e.attr === 'mem' ? 'hi-mem' : SC.attrColorClass(e.attrs || e.attr));
            const ownerNum = (e.owner !== 'p' && e.owner !== 'guest') ? Number(e.owner) : e.owner;
            const initial = e.owner === 'p' ? 'P' : (Number.isFinite(ownerNum) ? ('S' + (ownerNum + 1)) : 'G');
            const label = e.cardName || '';
            return '<span class="skill-hist-icon ' + colorCls + '" title="' + label.replace(/"/g,'&quot;') + '">' +
              initial + '</span>';
          }).join('');
        })()}
      ${SC.state.simMode ? '' : '</div>'}
      <div class="hand-cards-v16b ${SC.state.simMode ? 'sim-hand' : ''}">${handCardsV16b}</div>
      <div class="mem-gauge-v16b mem-ring ${memReady ? 'ready' : 'notready'} ${selMemory ? 'selected' : ''}"
        ${memReady ? 'data-action="card-select" data-pos="memory"' : ''}
        style="--mem-deg:${Math.min(360, Math.round(memPct * 3.6))}deg" title="思い出アピール Lv${memLv}">
        <span class="mem-ring-heart">💗</span>
        <span class="mem-ring-pct">${memPct}%</span>
        <span class="mem-ring-lv">Lv${memLv}</span>
      </div>
    </div>
    ${quickHtml}
    ${skillInfoHtml}
    <p class="audition-hint" style="position:absolute;bottom:105px;left:160px;right:300px;text-align:center;font-size:10px;color:rgba(255,255,255,.5)">${SC.state.simMode ? '札をクリックすると各審査員への予測ダメージを表示→審査員をクリックで1ターン進行（全体札・思い出・回復・効果札はどの審査員でも可）／スキル以外をクリックで選択解除／自分の行・審査員（札未選択時）クリックで効果詳細' : '①手札→②審査員クリック→③メーター目押し／自分の行・審査員（札未選択時）クリックで効果詳細'}</p>
  </main>`;
};

// ---- v0.25.42: パッシブの表示（アイコン・オンマウス詳細・詳細モーダル）。本編(renderAudition)とシミュ(sim_ui.js)が同じ関数で描く ----
// d = 表示用の定義 { name, owner, effect, cond, prob, max, buffAttrs }（本編: SC.firedPassiveDefs()／シミュ: SC.simFiredPassiveDefs() に効果文を足したもの。audition.js）
SC.escHtml = function (s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
// オンマウス詳細（title 属性）の複数行テキスト: 1行目「[持ち主] パッシブ名」／効果／[条件][確率][最大]（データにあるものだけ）
SC.passiveTipText = function (d) {
  const lines = [(d.owner ? '[' + d.owner + '] ' : '') + (d.name || 'パッシブ')];
  if (d.effect) lines.push('効果: ' + d.effect);
  if (d.cond) lines.push('[条件:' + String(d.cond).replace(/[\r\n]/g, '') + ']');
  if (d.prob) lines.push('[確率:' + d.prob + ']');
  if (d.max) lines.push('[最大:' + d.max + ']');
  return lines.join('\n');
};
// 丸アイコン1つ: 中の文字=持ち主の短縮名の1文字目（分からなければパッシブ名の1文字目）・色=バフ属性の配色クラス（SC.attrColorClass。バフ以外=グレー）。
//   クリックは本編・シミュ共通の data-action="passive-icon-click"（詳細モーダルの開閉）。cls=形クラス（本編=pi-round／シミュ=sim-pb-icon。CSSは同じ見た目）
SC.passiveIconHtml = function (d, cls) {
  const ch = String(d.owner || d.name || 'P').charAt(0);
  const tip = SC.escHtml(SC.passiveTipText(d)).replace(/\n/g, '&#10;');
  return '<button class="passive-icon-btn ' + (cls || 'pi-round') + ' ' + SC.attrColorClass(d.buffAttrs) + '" data-action="passive-icon-click" title="' + tip + '"><span>' + SC.escHtml(ch) + '</span></button>';
};
// 詳細モーダルの1行: 持ち主バッジ・パッシブ名／効果／[条件][確率][最大]。o={ row, eff }=行・効果行の差し替えクラス（シミュは文字を拡大する sim-pp-row / sim-pp-eff）
SC.passiveRowHtml = function (d, o) {
  o = o || {};
  const E = SC.escHtml;
  return '<div class="passive-pop-row' + (o.row ? ' ' + o.row : '') + '">' +
    '<div class="passive-pop-name">' + (d.owner ? '<i class="sip-who">' + E(d.owner) + '</i>' : '') + E(d.name || 'パッシブ') + '</div>' +
    '<div class="' + (o.eff || 'pp-eff') + '">効果: <b>' + E(d.effect || '—') + '</b></div>' +
    '<div class="passive-pop-conds">' +
      (d.cond ? '<span class="pp-cond">[条件:' + E(String(d.cond).replace(/[\r\n]/g, '')) + ']</span>' : '') +
      (d.prob ? '<span class="pp-cond">[確率:' + E(d.prob) + ']</span>' : '') +
      (d.max ? '<span class="pp-cond">[最大:' + E(d.max) + ']</span>' : '') +
    '</div></div>';
};
// 詳細モーダル（.modal-overlay / .modal-box 共用。外側クリック・「閉じる」＝passive-pop-close）。defs=今発動中のパッシブだけを渡す。o={ overlay, row, eff }
SC.passivePopHtml = function (defs, o) {
  o = o || {};
  const rows = defs.length ? defs.map(function (d) { return SC.passiveRowHtml(d, o); }).join('') : '<p class="passive-pop-empty">現在発動中のパッシブスキルはありません</p>';
  return '<div class="modal-overlay' + (o.overlay ? ' ' + o.overlay : '') + '" data-action="passive-pop-close">' +
    '<div class="modal-box passive-pop-box" onclick="event.stopPropagation()">' +
      '<div class="modal-title">&#10024; 発動中のパッシブスキル</div>' +
      '<div class="passive-pop-list">' + rows + '</div>' +
      '<button class="main-btn small" data-action="passive-pop-close">閉じる</button>' +
    '</div></div>';
};

// ---- v0.25.43: ステータス効果（自分の順位行クリック）／審査員の状態（札未選択で審査員枠クリック）の詳細モーダル。本編・シミュ共通の描画関数1つ ----
// 構造・見た目はパッシブ詳細モーダル（SC.passivePopHtml）と同じ（.modal-overlay / .modal-box.passive-pop-box・外側クリックか「閉じる」＝effect-pop-close）。
// list = SC.unitEffectList / SC.judgeEffectList の戻り値 [{ label, value, turnsLeft, src, tone }]（audition.js）。title=題。o={ overlay, notes }（notes=見出し下に添える文字列の配列）
//   各行: 効果名と値／「残りNターン」（このターンを含む。期限なしは「期限なし」）／由来。空なら「付与されている効果はありません」
SC.effectPopHtml = function (title, list, o) {
  o = o || {};
  const E = SC.escHtml;
  const rows = list.length ? list.map(function (e) {
    return '<div class="effect-pop-row passive-pop-row ep-' + (e.tone || 'neutral') + '">' +
      '<div class="passive-pop-name"><span class="ep-label">' + E(e.label) + '</span>' + (e.value ? '<b class="ep-value">' + E(e.value) + '</b>' : '') + '</div>' +
      '<div class="passive-pop-conds ep-sub"><span class="pp-cond ep-turns">' + ((e.turnsLeft === null || e.turnsLeft === undefined) ? '期限なし' : '残り' + e.turnsLeft + 'ターン') + '</span>' +
        (e.src ? '<span class="pp-cond ep-src">由来: ' + E(e.src) + '</span>' : '') + '</div></div>';
  }).join('') : '<p class="passive-pop-empty">付与されている効果はありません</p>';
  const notes = (o.notes || []).map(function (t) { return '<div class="ep-note">' + E(t) + '</div>'; }).join('');
  return '<div class="modal-overlay effect-pop-overlay' + (o.overlay ? ' ' + o.overlay : '') + '" data-action="effect-pop-close">' +
    '<div class="modal-box passive-pop-box effect-pop-box" onclick="event.stopPropagation()">' +
      '<div class="modal-title">' + E(title) + '</div>' + notes +
      '<div class="passive-pop-list">' + rows + '</div>' +
      '<button class="main-btn small" data-action="effect-pop-close">閉じる</button>' +
    '</div></div>';
};
// 審査画面に出す詳細モーダル（a.effectPop = { kind:'unit' | 'judge', idx, turn } が現在ターンのものの時だけ。ターン進行・組み直し（シミュの入力変更・リセット）で消える）。シミュは文字を拡大するクラスを足す
SC.auditionEffectPopHtml = function () {
  const a = SC.state && SC.state.audition;
  const p = a && a.effectPop;
  if (!a || !p || p.turn !== a.turn) return '';
  const o = SC.state.simMode ? { overlay: 'sim-pp-overlay' } : {};
  if (p.kind === 'unit') {
    const u = a.units[0];
    const m = SC.attentionMultOf(u);
    o.notes = Math.abs(m - 1) > 1e-9 ? ['現在の注目度の倍率: ×' + Number(m.toFixed(2)) + '（高いほど審査員のリアクションの対象に選ばれやすい）'] : [];
    return SC.effectPopHtml('ステータス効果', SC.unitEffectList(u), o);
  }
  if (p.kind === 'judge') {
    const j = a.judges[p.idx];
    if (!j || j.gone) return '';
    o.notes = ['興味値 ' + SC.fmt(Math.round(j.gained)) + ' / ' + SC.fmt(j.need)];
    return SC.effectPopHtml(j.name + 'の状態', SC.judgeEffectList(j), o);
  }
  return '';
};

// ---- v0.25.3 P6: 発表前の審査員コミュ（r1実測: 審査員の一言→白トランジション→発表。セリフはオリジナル文） ----
// v0.25.28: 立ち絵imgに idol-default クラス（デフォルト画像時のみ構図CSS）
SC.renderRevealComm = function () {
  const a = SC.state.audition;
  const passed = a.result && a.result.passed;
  const comment = passed
    ? '本日の審査結果を発表します。皆さん、堂々たるステージでした。'
    : '本日の審査結果を発表します。……厳しい結果になった方も、次に繋げてください。';
  return `
  <main class="comm-stage comm-stage-backstage" data-action="reveal-comm-next" style="cursor:pointer">
    <img class="scene-bg" src="img/bg/backstage.png" alt="" onerror="this.remove()">
    <div class="comm-scene-label">${a.def.name} 審査発表</div>
    <div class="comm-idol-area">
      <img class="${SC.idolImgClass()}" src="${SC.idolImg()}" alt="${SC.IDOL.name}" onerror="this.classList.add('hidden')">
    </div>
    <!-- v0.25.10 rec3/res10実測: 紫話者帯「審査員」+シルエットバッジ+送りマーク -->
    <div class="comm-talkbox comm-talkbox-judge">
      <span class="judge-sil-badge">&#128373;</span>
      <div class="comm-talk-name">審査員</div>
      <div class="comm-talk-text">${comment}</div>
      <span class="comm-next-arrow">&#10549;</span>
    </div>
    <div class="reveal-hint" style="color:rgba(255,255,255,.75);left:0;right:0;text-align:center">タップで発表へ</div>
  </main>`;
};

// ---- v0.25.10: オーディション結果発表演出（rec3実測: エントリーNo順に白行が積み上がる） ----
// v0.25.28: 丸アイコン=SC.idolFaceImg（顔切り抜き。デフォルト時は中央）
SC.renderAuditionReveal = function () {
  const a = SC.state.audition;
  const units = (a.result && a.result.units) ? a.result.units.slice() : [];
  // 動画実測(rec3/res16-24): 行はエントリーNo順（=ライバル→自分が最終No）に出現し、★値は行と同時に確定表示
  const rivals = units.filter(function (u) { return !u.isPlayer; });
  const players = units.filter(function (u) { return u.isPlayer; });
  const entryOrder = rivals.concat(players);   // 自分=最終エントリーNo（rec3実測: No.6=自分）
  const sorted = units.slice().sort(function (x, y) { return (y.stars || 0) - (x.stars || 0); });
  const revealIdx = (a.revealIdx !== undefined) ? a.revealIdx : 0;
  const shown = entryOrder.slice(0, revealIdx + 1);

  const isFinal = !!a.revealFinal;   // 最終ステージ（1位メダル+合格帯。rec3実測: リストは消えてメダル全画面）
  let entriesHtml = '';
  if (!isFinal) {
    shown.forEach(function (u, si) {
      const isPlayer = u.isPlayer;
      const isNewest = si === shown.length - 1;   // 今出た行にスライドインを付ける
      // アバター枠: 実機はシルエット（自分行のみ実アイコン+Pバッジ。img/idol.png差し替え口）
      // v0.25.16: 文字列連結に修正（v0.25.12でテンプレート記法が通常文字列に混入しsrcが壊れていた）+顔位置適用
      const avatar = isPlayer
        ? '<span class="reveal-avatar reveal-avatar-p"><img src="' + SC.idolFaceImg() + '" style="object-position:' + SC.idolFaceObjPos() + '" alt="" onerror="this.remove()"><i class="reveal-pbadge">P</i></span>'
        : '<span class="reveal-avatar">' + SC.icon('person') + '</span>';
      // ★は2桁ゼロ埋め斜体（rec3実測: ★00/★06/★69）
      const starTxt = String(u.stars || 0).padStart(2, '0');
      entriesHtml += '<div class="reveal-entry' + (isPlayer ? ' is-player' : '') + (isNewest ? ' reveal-new' : '') + '">' +
        avatar +
        '<span class="reveal-entry-mid"><span class="reveal-entry-no">エントリーNo.' + (si + 1) + '</span>' +
        '<span class="reveal-entry-name">' + (u.name || '???') + '</span></span>' +
        '<span class="reveal-star-block"><span class="reveal-star-label">獲得スター</span>' +
        '<span class="reveal-star-val"><i>★</i>' + starTxt + '</span></span>' +
        '</div>';
    });
  }

  // 最終ステージ: 1位メダル全画面（rec3実測: 金月桂樹「1位」→「オーディション合格」オレンジ帯+星紙吹雪）
  let finalHtml = '';
  if (isFinal && a.result && a.result.passed) {
    // v0.25.11: 紙吹雪をcanvasパーティクル化（DOM28個→canvas240粒・3.5秒に分散）
    if (!SC.state.commsOff && typeof document !== 'undefined') {
      setTimeout(function () { SC.fxEmit('confetti', { n: 110, stagger: 2.5 }); }, 60);   // v0.25.12: 粒数削減
    }
    const isFirst = sorted.length && sorted[0].isPlayer;
    const medalHtml = isFirst
      ? '<div class="reveal-medal-stage"><span class="reveal-medal-big">&#127807;<b>1位</b>&#127807;</span></div>'
      : '';
    finalHtml = medalHtml +
      '<div class="reveal-pass-band"><span>' + SC.finalsResultLabel(true) + '</span></div>';
  } else if (isFinal && a.result && !a.result.passed) {
    finalHtml = '<div class="reveal-pass-band reveal-fail-band"><span>' + SC.finalsResultLabel(false) + '</span></div>';
  }

  // v0.25.22: 背景のキラ粒（実機スクショ「オデ後①」照合: 暗い舞台裏にピンク/緑のキラが漂う）
  if (!SC.state.commsOff && typeof document !== 'undefined') {
    setTimeout(function () {
      if (SC.fxEmit) { SC.fxEmit('sparkle', { n: 7, hue: 320 }); SC.fxEmit('sparkle', { n: 5, hue: 140 }); }
    }, 50);
  }

  const rolling = revealIdx < entryOrder.length - 1;
  const hint = rolling ? 'タップで一斉表示' : (isFinal ? 'タップで結果へ' : 'タップで発表');

  // v0.25.2: ドラムロール式自動表示（下位から順に自動でせり上がる。クリック=一斉表示）
  if (rolling && !isFinal && typeof document !== 'undefined') {
    if (SC._revealTimer) clearTimeout(SC._revealTimer);
    SC._revealTimer = setTimeout(function () {
      SC._revealTimer = null;
      const a2 = SC.state.audition;
      if (!a2 || a2 !== a || !a2.finished || a2.revealDone) return;
      const total = (a2.result && a2.result.units) ? a2.result.units.length : 1;
      if ((a2.revealIdx || 0) < total - 1) {
        a2.revealIdx = (a2.revealIdx || 0) + 1;
        SC.render();
      }
    }, 650);
  }

  return '<div class="reveal-screen' + (isFinal ? ' reveal-is-final' : '') + '" data-action="reveal-next">' +
    '<div class="reveal-title">AUDITION RESULT</div>' +
    '<div class="reveal-entries reveal-entries-drum">' + entriesHtml + '</div>' +
    finalHtml +
    '<div class="reveal-hint">' + hint + '</div>' +
    '</div>';
};

// v0.25.27: WING本戦（準決勝/決勝）はオーディションではなく大会そのものの勝敗として文言を出し分ける（ユーザー指定）
// 準決勝勝利=W.I.N.G.決勝進出／準決勝敗退=W.I.N.G.準決勝敗退／決勝勝利=W.I.N.G.優勝／決勝敗退=W.I.N.G.決勝敗退
SC.finalsResultLabel = function (passed) {
  const stage = SC.state.finalsStage;
  if (stage === 'semi') return passed ? 'W.I.N.G.決勝進出' : 'W.I.N.G.準決勝敗退';
  if (stage === 'final') return passed ? 'W.I.N.G.優勝' : 'W.I.N.G.決勝敗退';
  return passed ? 'オーディション合格' : 'オーディション不合格……';
};

// ---- オーディション結果 ----
SC.renderAuditionResult = function () {
  const a = SC.state.audition;
  const r = a.result;
  const rows = r.units.map(function (u, i) {
    return `<div class="result-row ${u.isPlayer ? 'me' : ''}">
      <span>${i + 1}位</span><span>${u.name}${u.out ? '（脱落）' : ''}</span>
      <span>★${u.stars}</span><span class="sub">与興味 ${SC.fmt(u.total)}</span></div>`;
  }).join('');
  let headline;
  if (r.reason === 'mentalBreak') headline = `<p class="warn-text">メンタルが尽きて脱落……（${SC.finalsResultLabel(false)}）</p>`;
  else if (r.reason === 'lastStanding') headline = `<p class="rank-line rank-1">ライバル全員脱落！ ${SC.finalsResultLabel(true)}！</p>`;
  else headline = `<p class="rank-line rank-${r.rank}">${r.rank}位 — ${r.passed ? SC.finalsResultLabel(true) + '！' : SC.finalsResultLabel(false)}</p>`;
  return `
  <main class="panel result-panel">
    <h2>${a.label} 結果</h2>
    ${headline}${rows}
    ${r.rewards.length ? `<div class="fan-gain">${r.rewards.join(' ／ ')}</div>` : ''}
    <button class="main-btn" data-action="audition-close">次へ</button>
  </main>`;
};

// ---- エンディング ----
// v0.25.28: 立ち絵imgに idol-default クラス（デフォルト画像時のみ構図CSS）
SC.renderEnding = function () {
  const e = SC.state.ending;
  // v0.25.12: 優勝エンディングの豪華化（ユーザー指定: Congratulations+立ち絵+紙吹雪。諦め/敗退は従来のまま）
  if (e.type === 'champion') {
    if (!SC.state.commsOff && typeof document !== 'undefined') {
      setTimeout(function () {
        SC.fxEmit('confetti', { n: 90, stagger: 3 });
        SC.fxEmit('starburst', { n: 18, x: .5, y: .35 });
      }, 80);
    }
    return `
    <main class="ending-champion-stage">
      <div class="champ-rays"></div>
      <div class="champ-congrats">
        <span class="cg-word">Congratulations!!</span>
        <span class="cg-sub">W.I.N.G. 優勝</span>
      </div>
      <div class="champ-idol">
        <img class="${SC.idolImgClass()}" src="${SC.idolImg()}" alt="${SC.IDOL.name}" onerror="this.classList.add('hidden')">
      </div>
      <!-- v0.25.18: 王冠は削除（ユーザーFB: 立ち絵pngによって位置がズレる） -->
      <!-- v0.25.13: 結果は右パネル（背景付き）・左はクレジット（ユーザー指定: 文字が見にくい対策） -->
      <div class="champ-result-panel">
        <div class="crp-title">RESULT</div>
        ${e.lines.filter(Boolean).map(function (l) { return `<p>${l}</p>`; }).join('')}
      </div>
      <div class="champ-credits">
        <div class="cc-title">CREDITS</div>
        <p><span>企画・監修</span>中耳</p>
        <p><span>開発</span>Claude Code</p>
        <p><span>イラスト</span>かえるゑる(<a href="https://x.com/yuko_ka_eru" target="_blank" rel="noopener" class="cc-link">@yuko_ka_eru</a>)</p>
        <p><span>原作</span><a href="https://shinycolors.enza.fun" target="_blank" rel="noopener" class="cc-link">https://shinycolors.enza.fun</a></p>
        <p class="cc-note">非公式・個人用ファンメイド。<br>アイドルマスター シャイニーカラーズは<br>バンダイナムコエンターテインメントの登録商標です</p>
      </div>
      <button class="main-btn champ-btn" data-action="new-game-force">トップへ戻る</button>
    </main>`;
  }
  return `
  <main class="panel ending-panel ending-${e.type}">
    <h2>${e.title}</h2>
    ${e.lines.map(function (l) { return l ? `<p>${l}</p>` : '<hr>'; }).join('')}
    <button class="main-btn" data-action="new-game-force">トップへ戻る</button>
  </main>`;
};

// ---- デバッグパネル ----
SC.renderDebug = function () {
  const p = document.getElementById('debug-panel');
  const st = SC.state;
  p.innerHTML = `
    <strong>DEBUG</strong>
    <button data-action="dbg-stats">全ステ+100</button>
    <button data-action="dbg-fans">ファン+20000</button>
    <button data-action="dbg-heal">体力/テンション全快</button>
    <button data-action="dbg-love">親愛度+25</button>
    <button data-action="dbg-sp">SP+100</button>
    <button data-action="dbg-week">週スキップ</button>
    <label><input type="checkbox" id="dbg-event" ${st.eventWeek ? 'checked' : ''}>強化週間</label>
    <select id="dbg-mode">
      <option value="0" ${st.mode === 0 ? 'selected' : ''}>ビギナー</option>
      <option value="1" ${st.mode === 1 ? 'selected' : ''}>ミドル</option>
      <option value="2" ${st.mode === 2 ? 'selected' : ''}>マスター</option>
    </select>
    <span>seed:${st.seed}</span>
    <input id="dbg-seed" type="text" placeholder="シード" size="8">
    <button data-action="dbg-newgame">新規開始</button>
  `;
};

// ---- v0.11 ヘルパー関数 ----

// パネルの効果文を生成
// 原文効果文の整形（連続スラッシュ・改行残骸の除去のみ。v0.24.1: 原文準拠表示）
SC.cleanRawDesc = function (raw) {
  return String(raw).replace(/\/\s*\//g, '/').replace(/\s*\/\s*/g, '/').replace(/^\/+|\/+$/g, '');
};

SC.panelDesc = function (key) {
  const p = SC.CONFIG.panel[key];
  if (!p) return '';
  let base = '';
  // v0.24.1: MD原文（effectRaw）があればそのまま表示（「全観客に」等を省略しない）
  if (p.effectRaw) base = SC.cleanRawDesc(p.effectRaw);
  else if (p.type === 'stat') base = (SC.ATTR_LABEL[p.attr] || '') + (p.add > 0 ? '+' : '') + p.add + (p.spGain ? '・SP+' + p.spGain : '');
  else if (p.type === 'cap') base = (SC.ATTR_LABEL[p.attr] || '') + '上限+' + p.add;
  else if (p.type === 'passive') base = 'パッシブスキル';
  else if (p.type === 'live') base = (SC.ATTR_LABEL[p.attr] || '') + (p.mult || 1) + '倍アピール';
  else if (p.heal) base = 'メンタル' + Math.round(p.heal * 100) + '%回復';
  else if (p.type === 'raw') base = p.name || '効果不明';
  else base = p.name || '';
  // cond/prob/max が格納されていれば実機形式で追記
  let condStr = '';
  if (p._rawCond) condStr += '[条件:' + p._rawCond + ']';
  if (p._rawProb) condStr += '[確率:' + p._rawProb + ']';
  if (p._rawMax)  condStr += '[最大:' + p._rawMax + ']';
  return base + (condStr ? ' ' + condStr : '');
};

// ライブスキルの効果文を生成（v0.24.1: MD原文=effectRaw優先。「全観客に」等を省略しない）
SC.pSkillDesc = function (sk) {
  if (!sk) return '';
  if (sk.effectRaw) return SC.cleanRawDesc(sk.effectRaw);
  if (sk.heal) return 'メンタル' + Math.round(sk.heal * 100) + '%回復';
  let base = '';
  if (sk.attr && sk.mult) base = (sk.allJudges ? '全観客に' : '') + (SC.ATTR_LABEL[sk.attr] || sk.attr) + (sk.mult || 1) + '倍アピール';
  else base = sk.name || '';
  // extra: 付随バフ文字列配列（例: ['Vocal25%UP[3T]']）
  if (sk.extra && sk.extra.length) {
    base += '/' + sk.extra.join('/');
  }
  return base;
};
