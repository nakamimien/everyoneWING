// 起動・イベント配線・アピールメーター（目押しミニゲーム）
window.SC = window.SC || {};

// ---- グローバル一時変数 ----
SC.meter = null;   // { kind:'appeal'|'memory', pending, zones:[{key,w}], value, dir, raf }
SC.lastFx = null;  // { dmg:[審査員ごとの被ダメ], judgement } セーブ対象外・表示後nullに

SC.meterZones = function (kind) {
  const a = SC.state.audition;
  // v0.25.20: 思い出リールはゾーン方式でなくコマ送り（openMeterのmemory分岐で処理）
  // 通常: ターン開始時メンタル割合で4段階
  // v0.25.20: ゾーンは[キー,幅%]の並び順定義（動画実測: 第2段階以降はBad|Normal|Good|Perfect|GoodでGoodが2分割）
  const ratio = a.units[0].mental / a.units[0].mentalMax;
  const stages = SC.CONFIG.audition.meterStages;
  let zones = stages[stages.length - 1].zones;
  for (let i = 0; i < stages.length; i++) {
    if (ratio >= stages[i].minMental) { zones = stages[i].zones; break; }
  }
  return zones.map(function (z) { return { key: z[0], w: z[1] }; })
    .filter(function (z) { return z.w > 0; });
};

SC.openMeter = function (kind, pending) {
  // v0.25.20: 思い出リール=フィルム風コマ送り（動画19-52-07実測: Good/Badコマの帯をハイライトが移動）
  if (kind === 'memory') {
    const rate = SC.CONFIG.tension.memoryGoodRate[SC.tensionIdx()];
    if (SC.state.autoMeter) {
      SC.meterResolve(kind, pending, SC.rand() < rate ? 'memGood' : 'memBad');
      return;
    }
    const frames = [];
    for (let i = 0; i < 8; i++) frames.push(SC.rand() < rate ? 'memGood' : 'memBad');
    SC.meter = { kind: kind, pending: pending, frames: frames, idx: 0, raf: null, start: performance.now() };
    SC.renderMeter();
    document.querySelectorAll('.skill-info-pop').forEach(function (el) { el.remove(); });
    SC.meterTick();
    return;
  }
  const zones = SC.meterZones(kind);
  if (SC.state.autoMeter) {
    // 自動判定: ゾーン幅の確率でサンプリング
    let r = SC.rand() * 100, judgement = zones[zones.length - 1].key;
    for (let i = 0; i < zones.length; i++) {
      if (r < zones[i].w) { judgement = zones[i].key; break; }
      r -= zones[i].w;
    }
    SC.meterResolve(kind, pending, judgement);
    return;
  }
  SC.meter = { kind: kind, pending: pending, zones: zones, value: 0, dir: 1, raf: null, start: performance.now() };
  SC.renderMeter();
  // v0.25.12: 審査員選択（メーター出現）と同時にスキル効果ポップを消す（バーと被るとのFB）
  document.querySelectorAll('.skill-info-pop').forEach(function (el) { el.remove(); });
  SC.meterTick();
};

SC.renderMeter = function () {
  const area = document.getElementById('meter-area');
  if (!area) return;
  const m = SC.meter;
  // v0.25.20: 思い出リール（フィルム風コマ送り。動画19-52-07実測: Goodコマ=ピンク/Badコマ=青、ハイライト移動）
  if (m.kind === 'memory') {
    const cells = m.frames.map(function (f, i) {
      const good = f === 'memGood';
      return `<div class="mem-cell ${good ? 'mem-cell-good' : 'mem-cell-bad'} ${i === m.idx ? 'mem-cell-cur' : ''}" id="mem-cell-${i}">
        <img src="${SC.idolImg()}" alt="" onerror="this.remove()">
        <span class="mem-cell-label">${good ? 'Good' : 'Bad'}</span>
      </div>`;
    }).join('');
    area.innerHTML = `
    <div class="meter-overlay" data-action="meter-stop" style="cursor:pointer">
      <div class="meter-ready" style="pointer-events:none">Ready!!</div>
      <div class="mem-reel" style="pointer-events:none">${cells}</div>
      <div class="meter-hint" style="pointer-events:none">クリック / Space で停止（終端まで押さないとBad）</div>
    </div>`;
    return;
  }
  const zoneHtml = m.zones.map(function (z) {
    return `<div class="mz mz-${z.key}" style="width:${z.w}%;pointer-events:none"></div>`;
  }).join('');
  // v0.25.10: 実機化（rec3/meter13実測: 下部中央横バー・黒地白縁・左に黄スター+APPEAL白斜体ロゴ）
  // v0.25.20: v0.25.19の右端暗キャップは誤認（ピル外の背景）につき撤去（ユーザーFB）。ゾーンがバー全域を埋める
  area.innerHTML = `
  <div class="meter-overlay" data-action="meter-stop" style="cursor:pointer">
    <div class="meter-ready" style="pointer-events:none">Ready!!</div>
    <div class="meter-appeal" style="pointer-events:none">
      <span class="meter-logo"><i>&#10022;</i>${m.kind === 'memory' ? 'MEMORY' : 'APPEAL'}</span>
      <div class="meter-bar">${zoneHtml}<div class="meter-cursor" id="meter-cursor"></div></div>
    </div>
    <div class="meter-hint" style="pointer-events:none">クリック / Space で停止${m.kind === 'memory' ? '（終端まで押さないとBad）' : ''}</div>
  </div>`;
};

SC.meterTick = function () {
  const m = SC.meter;
  if (!m) return;
  const speed = SC.CONFIG.audition.meterSpeed;   // スイープ/秒（rec3実測: 1.14s/走破）
  const elapsed = (performance.now() - m.start) / 1000;
  if (m.kind === 'memory') {
    // v0.25.20: リールのコマ送り（1コマ0.18秒[推測]・終端まで押さないとBad【wiki】）
    const idx = Math.floor(elapsed / 0.18);
    if (idx >= m.frames.length) { SC.meterStop(true); return; }
    if (idx !== m.idx) {
      m.idx = idx;
      m.frames.forEach(function (f, i) {
        const el = document.getElementById('mem-cell-' + i);
        if (el) el.classList.toggle('mem-cell-cur', i === idx);
      });
    }
    m.raf = requestAnimationFrame(SC.meterTick);
    return;
  } else {
    // 単方向ループ（動画実測: カーソルは往復でなく左→右のループ）
    // v0.25.11: 実測準拠のホールド（バー出現後~0.25s静止→スイープ開始）
    const hold = SC.CONFIG.audition.meterHold || 0;
    const t = Math.max(0, elapsed - hold) * speed;
    const phase = t % 1;
    m.value = phase * 100;
  }
  const cur = document.getElementById('meter-cursor');
  if (cur) cur.style.left = m.value + '%';
  m.raf = requestAnimationFrame(SC.meterTick);
};

SC.meterStop = function (timeout) {
  const m = SC.meter;
  if (!m) return;
  cancelAnimationFrame(m.raf);
  // v0.25.3 P4: メーター停止音（タイムアウト=Badは警告音）
  if (SC.audio) SC.audio.se(timeout ? 'warning' : 'meter');
  // v0.25.22: 停止瞬間の演出（動画実測 iron_stop60b: 停止位置で星が弾ける+バーに横フラッシュ）
  if (!timeout && m.kind !== 'memory') {
    const cur = document.getElementById('meter-cursor');
    const appEl = document.getElementById('app');
    if (cur && appEl && SC.fxEmit) {
      const cr = cur.getBoundingClientRect(), ar = appEl.getBoundingClientRect();
      if (ar.width && ar.height) {
        SC.fxEmit('starburst', { n: 14,
          x: (cr.left + cr.width / 2 - ar.left) / ar.width,
          y: (cr.top + cr.height / 2 - ar.top) / ar.height });
      }
      const bar = cur.parentElement;
      if (bar) {
        const fl = document.createElement('div');
        fl.className = 'meter-stopflash';
        bar.appendChild(fl);
        setTimeout(function () { if (fl.parentNode) fl.parentNode.removeChild(fl); }, 400);
      }
    }
  }
  SC.meter = null;
  let judgement;
  if (timeout) {
    judgement = 'memBad';
  } else if (m.kind === 'memory') {
    // v0.25.20: リール=ハイライト中のコマがそのまま判定
    judgement = m.frames[m.idx] || 'memBad';
  } else {
    let pos = m.value, acc = 0;
    judgement = m.zones[m.zones.length - 1].key;
    for (let i = 0; i < m.zones.length; i++) {
      acc += m.zones[i].w;
      if (pos <= acc) { judgement = m.zones[i].key; break; }
    }
  }
  SC.meterResolve(m.kind, m.pending, judgement);
};

SC.meterResolve = function (kind, pending, judgement) {
  // v0.25 P1: resolveTurn がFXイベントを記録し、fxPlay が順次再生→完了後に render
  if (kind === 'memory') {
    SC.resolveTurn({ type: 'memory', judgement: judgement });
  } else if (pending.heal) {
    // v0.10.1: 回復カードはメーター判定付きで処理（回復量は判定に依存しない[実測]、判定は行動順に反映）
    // v0.25.36: pending.heal=true は回復札・効果札（SC.isEffectOnlyCard）共通のフラグ。アクション型 'heal' が本編の共通経路（audition.js execPlayerAction）
    SC.resolveTurn({ type: 'heal', cardPos: pending.cardPos, judgement: judgement });
  } else {
    SC.resolveTurn({ type: 'appeal', cardPos: pending.cardPos, judgeIdx: pending.judgeIdx,
      allJudges: pending.allJudges || false, judgement: judgement });
  }
  const fxEvents = SC.fxCollect();
  SC.fxPlay(fxEvents, function () {
    SC.render();
    SC.refreshDebug();
  });
};

// ---- v0.17: トーストメッセージ表示 ----
SC.toast = function (msg) {
  const d = document.createElement('div');
  d.className = 'toast-msg';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1800);
};

// ---- 起動 ----
(function () {
  // エラーの可視化（真っ白画面防止。エラー内容と復旧ボタンを表示）
  window.onerror = function (msg, src, line) {
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = `
      <main style="background:#fff;border-radius:10px;padding:20px;margin-top:20px">
        <h2 style="color:#c0392b">エラーが発生しました</h2>
        <p style="font-size:13px;color:#666">${String(msg)}<br>${String(src).split('/').pop()}:${line}</p>
        <p style="font-size:13px">下のボタンでセーブデータを消して最初からやり直せます。</p>
        <button style="padding:10px 30px;font-size:15px;cursor:pointer"
          onclick="localStorage.removeItem('${SC.SAVE_KEY}');location.reload()">セーブを消してリセット</button>
      </main>`;
  };

  // 起動時にロードアウトを復元して適用（cards.js読み込み後）
  SC.restoreLoadout();
  // v0.25.16: アイドル名の自由入力を仮データ起動時にも適用
  SC.IDOL.name = (SC.customIdolName && SC.customIdolName()) || SC.DEFAULT_IDOL_NAME || 'ゲスト';   // v0.25.31: 未入力は「ゲスト」

  // v0.25.20: セーブなし（初回 or プロデュース終了後リセット）はタイトル→編成から始める（ユーザーFB）
  // v0.25.41: 仮の新規ゲームは「未開始」印を付け、newGame 内で書かれたセーブも消す（次回起動も初回扱い＝タイトル→WINGで編成から）。
  //   旧版の不具合で保存された「未開始の仮状態」（画面=タイトル・1週目・ファン0）も初回扱いに戻す
  const loadedSave = SC.load();
  const staleFresh = loadedSave && SC.state.screen === 'title' && SC.state.week === 1 && !(SC.state.fans > 0);
  if (!loadedSave || staleFresh) {
    SC.newGame();
    SC.state._notStarted = true;
    try { localStorage.removeItem(SC.SAVE_KEY); } catch (e) {}
    SC._freshBoot = true;
  }
  // ロード後（または newGame 後）にホーム遷移すべき場合、朝コミュ未済なら morning へ
  // newGame は内部で weekStartScreen() を設定済みなので load 時のみ補正
  else if (SC.state.screen === 'home') {
    SC.state.screen = SC.weekStartScreen();
  }
  // unitSelectはセッション中の一時状態。起動時はhomeに戻す（migrate相当）
  if (SC.state.screen === 'unitSelect') {
    SC.state.screen = 'home';
  }
  // v0.25.18: 起動時はタイトル画面「誰でもW.I.N.G.」（ユーザー指定）。タップで本来の画面へ
  SC._afterTitle = (SC.state.screen === 'title') ? null : SC.state.screen;
  SC.state.screen = 'title';

  SC.refreshDebug = function () {
    const p = document.getElementById('debug-panel');
    if (!p.classList.contains('hidden')) SC.renderDebug();
  };

  // v0.19.1: キャプチャフェーズで委譲することで modal-box の stopPropagation を回避
  // v0.25.3 P4: オプションのスライダー/チェック（input委譲。renderせず即時反映=スライダー操作を邪魔しない）
  document.body.addEventListener('input', function (ev) {
    const el = ev.target.closest('[data-opt]');
    if (!el) return;
    const k = el.dataset.opt;
    // v0.25.29: ホームの⚙オプションのチート設定（演出カット/タイマー/全習得）。クリック委譲でなくinputで処理＝再描画でチェックが切れない
    if (k === 'commsOff' || k === 'showTimer' || k === 'cheatAllPanels' || k === 'cheatHighTension') {
      SC.applyOptionCheat(k, el.checked);
      if (k !== 'commsOff') SC.render();   // タイマー/ハイテンション=ヘッダ再描画 / 全習得=checked+disabled表示に更新（commsOffは表示変化なし）
      return;
    }
    // v0.25.44: 思い出Lv固定（select）。ヘッダの思い出Lv表示を更新
    if (k === 'cheatMemLv') {
      SC.applyOptionMemLv(el.value);
      SC.render();
      return;
    }
    if (!SC.audio) return;
    // v0.25.41: シミュの音量ポップオーバー（.sim-vol-wrap）のスライダーも同じ data-opt。数値表示（隣の .sim-vol-num）だけ即時更新する（render しない）
    if ((k === 'seVol' || k === 'bgmVol') && el.nextElementSibling && el.nextElementSibling.classList.contains('sim-vol-num')) el.nextElementSibling.textContent = el.value;
    if (k === 'seVol') SC.audio.setConfig({ seVol: Number(el.value) / 100 });
    else if (k === 'bgmVol') SC.audio.setConfig({ bgmVol: Number(el.value) / 100 });
    else if (k === 'seOn') { SC.audio.setConfig({ seOn: el.checked }); if (el.checked) SC.audio.se('decide'); }
    else if (k === 'bgmOn') {
      SC.audio.setConfig({ bgmOn: el.checked });
      if (el.checked) SC.render(); else SC.audio.bgmStop();
    }
  });

  document.body.addEventListener('click', function (ev) {
    // v0.25.3 P4: 初回クリックでAudioContext開放（autoplay制限対応）
    if (SC.audio) SC.audio.unlock();
    // v0.25.41: シミュの音量ポップオーバーは外側クリックで閉じる（再描画しない。ポップオーバー内・音量ボタン自身のクリックは閉じない＝ボタンは下の case 'sim-vol-toggle' が開閉）
    if (SC._simVolOpen && ev.target.closest && !ev.target.closest('.sim-vol-wrap')) SC.simVolClose();
    // v0.25.24: 朝コミュ入りワイプ（CSS駆動・fxキュー外）はクリックで即スキップ。
    //   pointer-events:noneで下のボタンへクリックは元々素通りするので、ここではstopPropagation/returnせず
    //   ワイプを即座に消すだけ（同じクリックで下の選択肢も選べる＝「Morning→クリックで会話開始」）
    const mw = document.querySelector('.morning-wipe:not(.mw-skip)');
    if (mw) mw.classList.add('mw-skip');
    // v0.25.47: 本編右上の「ホーム」はメーター表示中・演出再生中でも受け付ける（ユーザー指定「いつでもホームに戻れる」）。
    //   進行中の状態を保存して再読込＝トップ画面（WING で続きから。シミュの sim-back-title と同じ戻り方）。
    //   未開始（起動直後の仮状態）・エンディング後・タイトル表示中は SC.save 側が書かない（v0.25.41 の「仮状態を保存」不具合は再発しない）
    if (ev.target.closest && ev.target.closest('[data-action="wing-home"]')) {
      ev.stopPropagation();
      SC.save();
      location.reload();
      return;
    }
    // v0.14.1: メーター表示中は画面全体のどこをクリックしても停止（誤操作防止）
    if (SC.meter) {
      ev.stopPropagation();
      SC.meterStop(false);
      return;
    }
    // v0.25 P1: 演出再生中はクリック=現在の演出をスキップ（他の入力はロック）
    //   v0.25.40: シミュの「リセット」ボタンだけは演出中でも受け付ける（演出を即中断して TURN1 へ戻す。下の case 'sim-play-reset'）
    if (SC.fxPlaying) {
      const simReset = SC.state && SC.state.simMode && ev.target.closest && ev.target.closest('[data-action="sim-play-reset"]');
      if (!simReset) {
        ev.stopPropagation();
        SC.fxSkip();
        return;
      }
    }

    // v0.24.2: ドラッグパン直後の合成クリックを1回だけ抑止（タップ=クリックは通す）
    if (SC._suppressClick) { SC._suppressClick = false; return; }

    const btn = ev.target.closest('[data-action]');
    // v0.25.29: シミュ中、上部画面(#app)内で手札・思い出ゲージ・審査員カード・data-action要素以外をクリック→札・審査員を未選択に戻す
    //   （下部の入力パネル=#global-log は #app の外なので解除しない。本編は対象外）
    if (!btn) {
      if (SC.state && SC.state.simMode && ev.target.closest('#app') &&
          !ev.target.closest('.skill-orb, .mem-gauge-v16b, .judge-card-v16b, .sim-passive-box, .sim-vol-wrap')) {   // v0.25.41: 音量ポップオーバー内のクリックでも選択を解除しない
        if (SC.simClearSelection()) { SC.render(); SC.refreshDebug(); }
      }
      return;
    }
    // v0.19.1: overlay自身のクリックのみclose扱い（modal-box内の余白クリックがoverlayまで遡って誤閉じするのを防止）
    if (btn.classList.contains('modal-overlay') && ev.target !== btn) return;
    const action = btn.dataset.action;
    const st = SC.state;

    // v0.25.3 P4: 操作SE（決定系=decide／その他ボタン=tap。メーター音はmeterStop側）
    if (SC.audio) {
      const decideActs = { 'unit-select-decide': 1, 'setup-start': 1, 'schedule-decide': 1,
        'result-ok': 1, 'season-ok': 1, 'morning-promise-ok': 1, 'panel-buy': 1, 'go-final-audition': 1 };
      SC.audio.se(decideActs[action] ? 'decide' : 'tap');
    }

    switch (action) {
      // ---- 画面遷移 ----
      // v0.25.18: タイトル画面タップ→本来の画面へ
      // v0.25.20: セーブなし起動時はタイトル→編成（ユーザーFB: いきなりプロデュース画面はおかしい）
      case 'title-start': {
        if (SC._freshBoot) {
          SC._freshBoot = false;
          st.setupDraft = { mode: st.mode !== undefined ? st.mode : 1, items: [], from: 'title' };
          st.screen = 'unitSelect';
        } else {
          st.screen = (SC._afterTitle && SC._afterTitle !== 'title') ? SC._afterTitle : SC.weekStartScreen();
        }
        SC._afterTitle = null;
        break;
      }
      // v0.25.28: タイトル「シミュレーション」→計算機モードへ（本編セーブには一切書かない）
      case 'title-sim': {
        SC._omakaseOpen = false;
        SC.simEnter();
        SC.resizeStage();   // 下パネルを広く取るため再計算
        break;
      }
      case 'sim-back-title': location.reload(); return;   // 本編状態はlocalStorageに残っているので再読込でタイトルへ
      // v0.25.41: シミュ右上の音量ボタン（開閉）／ミュート切替（SE・BGM とも。ロジックは sim_ui.js）。スライダーは上の input 委譲（本編オプションと共通の data-opt）
      case 'sim-vol-toggle': SC._simVolOpen = !SC._simVolOpen; break;
      case 'sim-vol-mute': SC.simVolMute(); break;
      // v0.25.34: 上部の「クリア」は撤去。編成クリア（編成・EX・Pスキル枠・保有/発動中パッシブ）／プレイのリセット（オーデ開始時の状態へ）
      //   v0.25.35: 「パッシブクリア」（sim-clear-passive）も撤去＝保有パッシブの「全解除」と同じ効果のため
      case 'sim-clear-loadout': SC.simClearLoadout(); break;
      // v0.25.39: 編成欄の「⇅」=隣り合うサポート枠（0〜3 / guest）の中身を入れ替え（data-a / data-b。ロジックは sim.js の SC.simSwapSlots）。本編の編成画面には付けない
      case 'sim-swap': SC.simAbortFx(); SC.simSwapSlots(btn.dataset.a, btn.dataset.b); break;
      // v0.25.40: 演出中でも即 TURN1 へ（演出の残り・カットイン・弾・数字を消してから組み直す）。ランダム発動中のパッシブも「なし」に（SC.simPlayReset）
      case 'sim-play-reset': SC.simAbortFx(); SC.simPlayReset(); break;
      // v0.25.34: セーブ（10スロット。ロジックは sim.js）。上書き・削除は confirm
      case 'sim-slot-save': {
        const si = Number(btn.dataset.slot);
        if (SC.simSlots()[si] && !confirm('スロット' + (si + 1) + 'に上書き保存しますか？')) break;
        SC.simSaveSlot(si);
        break;
      }
      case 'sim-slot-load': SC.simLoadSlot(Number(btn.dataset.slot)); break;
      case 'sim-slot-del': {
        const si2 = Number(btn.dataset.slot);
        if (SC.simSlots()[si2] && confirm('スロット' + (si2 + 1) + 'を削除しますか？')) SC.simDeleteSlot(si2);
        break;
      }
      case 'sim-select': {   // ダメージ表の行（セル含む）クリック→上部の予測表示札を切替
        SC.simSetSelected(btn.dataset.sel === 'memory' ? 'memory' : Number(btn.dataset.sel));
        break;
      }
      // v0.25.30: 保有パッシブのランダム発動（本編の SC.firePassives を現在のシミュ状態で1回走らせる）／全解除
      case 'sim-rand-passive': SC.simRandomPassives(); break;   // 左下の「発動中のパッシブ」枠のボタン（保有パッシブだけを本編の firePassives で抽選）
      case 'sim-own-all': SC.simOwnAll(); break;
      case 'sim-own-none': SC.simOwnNone(); break;
      case 'go-schedule':        st.screen = 'schedule'; break;
      case 'go-audition-select':
        // v0.16a: auditionSelectはschedule+auditionタブに解決
        st.scheduleTab = 'audition';
        st.screen = 'schedule';
        break;
      case 'go-review':
        // v0.16c: 振り返り画面に入るたびにズームをリセット → auto-fitが再計算される
        st.reviewZoom = null;
        st.screen = 'review';
        break;
      case 'back-home':
        st.pendingPanel = null;
        // v0.25.12: 本戦中も通常ホームへ（finalsHome画面は廃止・ホームが本戦表示を持つ）
        st.screen = 'home';
        break;

      // ---- v0.16a: タブ切替 ----
      case 'sch-tab-lesson':
        st.scheduleTab = 'lesson';
        SC.render();
        return;
      case 'sch-tab-audition':
        st.scheduleTab = 'audition';
        SC.render();
        return;

      // ---- v0.16a: オーディションカルーセル ----
      case 'aud-tab-prev':
        if ((st.audTabIdx || 0) > 0) st.audTabIdx = (st.audTabIdx || 0) - 1;
        SC.render();
        return;
      case 'aud-tab-next': {
        const audList = SC.AUDITIONS.filter(function (d) { return d.season === SC.seasonIndex(); });
        if ((st.audTabIdx || 0) < audList.length - 1) st.audTabIdx = (st.audTabIdx || 0) + 1;
        SC.render();
        return;
      }
      case 'aud-tab-goto':
        st.audTabIdx = Number(btn.dataset.idx);
        SC.render();
        return;

      // ---- v0.16a: 流行ポップアップ ----
      case 'trend-pop-open':
        st.showTrendPop = true;
        SC.render();
        return;
      case 'trend-pop-close':
        st.showTrendPop = false;
        SC.render();
        return;

      // ---- v0.17: 編成確認ポップアップ ----
      case 'home-formation-pop':
        st.showFormationPop = true;
        SC.render();
        return;
      case 'formation-pop-close':
        st.showFormationPop = false;
        SC.render();
        return;

      // ---- v0.17: アイテムポップアップ ----
      case 'home-item-pop':
        st.showItemPop = true;
        SC.render();
        return;
      case 'item-pop-close':
        st.showItemPop = false;
        SC.render();
        return;

      // ---- v0.25.20: 衣装ボタン=立ち絵チェンジ（ユーザーFB: オプションから移設・未実装解消） ----
      case 'home-costume-pop': st.showCostumePop = true; break;
      case 'costume-pop-close': st.showCostumePop = false; break;

      // ---- v0.25.3 P4: ⚙オプション（音量設定ポップ） ----
      case 'home-option-open': st.showOptionsPop = true; break;
      case 'option-pop-close': st.showOptionsPop = false; break;
      // v0.25.29: ⚙オプションのステータス変更（Vo/Da/Vi/Me/SP。不正値は無視・statCapを超えたら引き上げ）
      case 'opt-stats-apply': {
        const rd = function (k) { const el = document.getElementById('opt-st-' + k); return el ? el.value : ''; };
        const done = SC.applyOptionStats({ vo: rd('vo'), da: rd('da'), vi: rd('vi'), me: rd('me'), sp: rd('sp') });
        if (SC.toast) SC.toast(done.length ? 'ステータスを反映した' : '反映できる値がありません');
        break;
      }
      case 'idol-img-reset': SC.setIdolImg(null); break;   // v0.25.12: 立ち絵を初期画像に戻す
      case 'idol-personality': SC.setIdolPersonality(btn.dataset.key); break;   // v0.25.26: 会話パターン切替
      // v0.25.13: 流行雑誌（流行1位を選択属性に変更・1回）
      // v0.25.15: 流行雑誌=使用で流行をランダム変更（1回。ユーザー指定: 属性選択でなくランダム）
      case 'trendmag-open': {
        if (st.trendMagUsed) break;
        const curTrend = (st.trend || []).join(',');
        let nextTrend = st.trend.slice();
        for (let ti = 0; ti < 10; ti++) {   // 現在と異なる並びになるまで[推測]
          nextTrend = SC.shuffle(st.trend.slice());
          if (nextTrend.join(',') !== curTrend) break;
        }
        st.trend = nextTrend;
        SC.applyTrendForWeek();
        st.trendMagUsed = true;
        SC.save();
        break;
      }
      case 'setup-back-unit': st.screen = 'unitSelect'; break;   // v0.25.14: 設定→編成へ戻る（draft保持）

      // ---- v0.25.3 P6: 発表前の審査員コミュ → ドラムロールへ ----
      case 'reveal-comm-next': {
        const aC = st.audition;
        if (!aC || !aC.finished) break;
        aC.revealCommDone = true;
        SC.render();
        return;
      }

      // ---- v0.25.3: reveal 演出（ドラムロール→1位メダル+合格帯→結果。ロール中タップ=一斉表示） ----
      case 'reveal-next': {
        const a = st.audition;
        if (!a || !a.finished) break;
        if (SC._revealTimer) { clearTimeout(SC._revealTimer); SC._revealTimer = null; }
        const totalUnits = (a.result && a.result.units) ? a.result.units.length : 1;
        const cur = (a.revealIdx !== undefined ? a.revealIdx : 0);
        if (cur < totalUnits - 1) {
          a.revealIdx = totalUnits - 1;   // 一斉表示（メダル演出へは次のクリックで）
        } else if (!a.revealFinal) {
          a.revealFinal = true;           // 1位メダル+（合格時）合格帯・紙吹雪
        } else {
          a.revealDone = true;
        }
        SC.render();
        return;
      }

      // ---- v0.17: パッシブアイコンクリック → v0.25.27: 発動中パッシブ一覧モーダルのトグルに変更 ----
      case 'passive-icon-click': {
        const a2 = st.audition;
        if (!a2) break;
        a2.showPassivePop = !a2.showPassivePop;
        if (a2.showPassivePop) a2.effectPop = null;   // v0.25.43: 中央モーダルは同時に1つ（ステータス効果／審査員の状態の詳細は閉じる）
        SC.render();
        return;
      }
      // ---- v0.25.43: 自分の順位行→ステータス効果の詳細／札を選んでいない時の審査員枠→その審査員の状態の詳細（中央モーダル。本編・シミュ共通）----
      //   開閉状態は a.effectPop = { kind:'unit' | 'judge', idx, turn }（パッシブ詳細 a.showPassivePop と同じく審査画面の状態に持つ。表示は turn が現在ターンの時だけ＝ターン進行で閉じる）。
      //   演出中・メーター表示中はこの前のクリック委譲が先に処理する（演出スキップ・メーター停止）ので、ここには来ない
      case 'unit-effect-click': {
        const a5 = st.audition;
        if (!a5) break;
        a5.showPassivePop = false;
        a5.effectPop = { kind: 'unit', idx: 0, turn: a5.turn };
        SC.render();
        return;
      }
      case 'judge-effect-click': {
        const a6 = st.audition;
        const jIdx6 = Number(btn.dataset.judge);
        // 札・思い出を選択中は従来どおり（本編=対象選択／シミュ=プレイ進行＝pick-judge）。帰宅済みの審査員は対象外
        if (!a6 || a6.selectedCard !== null || !a6.judges[jIdx6] || a6.judges[jIdx6].gone) break;
        a6.showPassivePop = false;
        a6.effectPop = { kind: 'judge', idx: jIdx6, turn: a6.turn };
        SC.render();
        return;
      }
      case 'effect-pop-close': {
        const a7 = st.audition;
        if (a7) a7.effectPop = null;
        SC.render();
        return;
      }
      case 'passive-pop-close': {
        const a3 = st.audition;
        if (a3) a3.showPassivePop = false;
        SC.render();
        return;
      }

      // ---- 週の行動 ----
      case 'rest':     SC.doAction(SC.doRest(), st.screen); break;
      // スケジュール画面の施設選択（v0.22: ダブルタップ決定対応）
      // 既に選択中の施設を再クリック → 即実行（決定ボタンと同効果）。選択状態は維持。
      case 'schedule-select': {
        const tapKey = btn.dataset.key;
        if (SC.state.scheduleSelected === tapKey) {
          // ダブルタップ: 即実行
          SC.doAction(SC.doFacility(tapKey), st.screen);
          // 選択状態はそのまま維持（翌週も同施設が選択中）
          // v0.24: doAction は render を呼ばないため、ここで明示的に更新
          SC.render();
          SC.refreshDebug();
        } else {
          // 初回タップ: 選択のみ
          SC.state.scheduleSelected = tapKey;
          SC.render();
        }
        return;
      }
      case 'facility': SC.doAction(SC.doFacility(btn.dataset.key), st.screen); break;

      // ---- 週を消費しない行動 ----
      case 'touch':    SC.doTouch(); break;

      // ---- 朝コミュ画面アクション ----
      case 'morning-choice': {
        SC.doMorningChoice(Number(btn.dataset.i));
        // 選択後は同じ morning 画面に留まって結果を表示（promiseOffer があれば表示）
        break;
      }
      // v0.25.13: 朝コミュ結果の段階遷移（react→preact(P反応)→(打診があれば)promise→reply→進行）
      case 'morning-next': {
        const mN = st.weekEvents && st.weekEvents.morning;
        if (!mN) { st.screen = 'home'; break; }
        mN.stage = 'preact';   // v0.25.13: プロデューサー側の内心反応を挟む（ユーザー指定）
        // v0.25.14: コミュ結果SE（Perfect=嬉しい/Good=普通/Normal=悲しい。ユーザー指定）
        if (SC.audio && !st.commsOff) {
          SC.audio.se(mN.kind === 'perfect' ? 'success' : (mN.kind === 'good' ? 'decide' : 'fail'));
        }
        break;
      }
      case 'morning-preact-next': {
        const mP = st.weekEvents && st.weekEvents.morning;
        if (!mP) { st.screen = 'home'; break; }
        if (st.weekEvents.promiseOffer) { mP.stage = 'promise'; }
        else { st.screen = 'home'; }
        break;
      }
      case 'morning-promise-ok': {
        SC.acceptPromise();
        const mOk = st.weekEvents && st.weekEvents.morning;
        if (mOk) { mOk.stage = 'reply'; mOk.promiseReply = 'ok'; }
        break;
      }
      case 'morning-promise-ng': {
        SC.declinePromise();
        const mNg = st.weekEvents && st.weekEvents.morning;
        if (mNg) { mNg.stage = 'reply'; mNg.promiseReply = 'ng'; }
        break;
      }
      // v0.25.5: 約束の守/破コミュ → 通常の週開始画面へ
      // v0.25.14: シーズン最終週と重なった場合は約束コミュ→シーズン結果の順（ユーザー指定）
      case 'promise-comm-ok':
        st.promiseComm = null;
        if (st.promiseCommNext) {
          st.screen = st.promiseCommNext;
          st.promiseCommNext = null;
        } else {
          st.screen = SC.weekStartScreen();
        }
        break;
      case 'morning-proceed':
        // すべて済んだ → home へ
        st.screen = 'home';
        break;

      // ---- 振り返り ----

      // v0.11: パネル選択（ボトムバーに表示）
      case 'panel-select': {
        const key = btn.dataset.key;
        const p = SC.CONFIG.panel[key];
        if (!p) break;
        st.selectedPanel = key;
        break;
      }

      // v0.11: 習得確認モーダル表示
      case 'panel-buy': {
        const key = btn.dataset.key;
        const p = SC.CONFIG.panel[key];
        if (!p) break;
        const isCheatReequip = st.cheatAllPanels && st.panelOpened.indexOf(key) >= 0 &&
          (p.type === 'live' || p.heal);
        if (!isCheatReequip && st.sp < (p.sp || 0)) break;   // v0.25.5: sp未解析raw対応
        // v0.20b: 隣接解放チェック（cheatAllPanels時はスキップ）
        if (!isCheatReequip && !st.cheatAllPanels) {
          const ownerKeys = Object.keys(SC.CONFIG.panel).filter(function (k) {
            return SC.CONFIG.panel[k].owner === p.owner;
          });
          const adj2 = SC.buildAdjacencyGraph(ownerKeys);
          if (!SC.adjacentUnlocked(key, adj2, st.panelOpened, SC.CONFIG.panel)) break;
        }
        // 確認モーダルを表示（renderReviewが読み取って描画する）
        st.showConfirmModal = key;
        break;
      }

      // v0.11: 習得確認モーダルでOK押下 → 実際の購入処理
      case 'panel-buy-confirm': {
        const key = btn.dataset.key || st.pendingPanel || st.selectedPanel;
        if (!key) break;
        const p = SC.CONFIG.panel[key];
        if (!p) break;
        const isCheatReequip = st.cheatAllPanels && st.panelOpened.indexOf(key) >= 0 &&
          (p.type === 'live' || p.heal);
        if (!isCheatReequip && st.sp < (p.sp || 0)) break;   // v0.25.5: sp未解析raw対応
        if (SC.audio) SC.audio.se('kirarin');   // v0.25.18: パネル習得はキラリン音（ユーザー指定）

        if (p.type === 'passive') {
          if (!isCheatReequip) st.sp -= p.sp;
          if (st.panelOpened.indexOf(key) < 0) st.panelOpened.push(key);
        } else if (p.type === 'stat') {
          if (!isCheatReequip) st.sp -= p.sp;
          if (st.panelOpened.indexOf(key) < 0) {
            st.panelOpened.push(key);
            if (p.attr) SC.addStat(p.attr, p.add);
            if (p.spGain) st.sp += p.spGain;
          }
        } else if (p.type === 'cap') {
          if (!isCheatReequip) st.sp -= p.sp;
          if (st.panelOpened.indexOf(key) < 0) {
            st.panelOpened.push(key);
            // v0.13a: attrs 配列対応（単属性も配列で統一）
            const capAttrs = p.attrs || (p.attr ? [p.attr] : []);
            capAttrs.forEach(function (at) { st.statCap[at] = (st.statCap[at] || SC.CONFIG.statCap) + p.add; });
          }
        } else if (p.heal && !p.effectOnly) {   // v0.25.36: 効果札（heal を持つものも）は通常のライブスキル扱い（空き枠 or 上書きモーダル）。この分岐は旧来の回復パネル専用
          if (!isCheatReequip) st.sp -= p.sp;
          if (st.panelOpened.indexOf(key) < 0) st.panelOpened.push(key);
          if (isCheatReequip) {
            st.pendingPanel = key;
            st.selectedPanel = null;
            st.showConfirmModal = null;
            break;
          } else {
            st.pendingPanel = null;
            st.selectedPanel = null;
            st.showConfirmModal = null;
            const slot = st.pSkills.findIndex(function (sk) { return sk.heal; });
            st.pSkills[slot >= 0 ? slot : 3] = SC.panelToSkill(p);
          }
        } else {
          // ライブスキル: 空き枠があれば即配置、なければ上書きモーダル
          if (!isCheatReequip) st.sp -= p.sp;
          if (st.panelOpened.indexOf(key) < 0) st.panelOpened.push(key);
          const emptySlot = st.pSkills.findIndex(function (sk) { return !sk || !sk.name; });
          if (emptySlot >= 0) {
            st.pSkills[emptySlot] = SC.panelToSkill(p);
            st.selectedPanel = null;
            st.pendingPanel = null;
            st.showConfirmModal = null;
          } else {
            // 4枠フル → 上書きモーダル（pendingPanelをセット）
            st.pendingPanel = key;
            st.selectedPanel = null;
            st.showConfirmModal = null;
            break;
          }
        }
        st.showConfirmModal = null;
        st.selectedPanel = null;
        break;
      }

      // v0.18: 振り返り表示モードトグル（リスト⇔マップ）
      case 'review-view-toggle': {
        st.reviewViewMode = (st.reviewViewMode === 'map') ? 'list' : 'map';
        break;
      }

      // v0.11: ズーム
      case 'review-zoom-in': {
        st.reviewZoom = Math.min(1.5, (st.reviewZoom || 1) + 0.1);
        break;
      }
      case 'review-zoom-out': {
        st.reviewZoom = Math.max(0.6, (st.reviewZoom || 1) - 0.1);
        break;
      }

      // v0.11: 所持スキルポップ
      case 'review-owned-skills': {
        st.showOwnedSkillsPop = true;
        break;
      }
      case 'owned-skills-close': {
        st.showOwnedSkillsPop = false;
        break;
      }

      // v0.11: モーダルを閉じる
      case 'modal-close': {
        st.pendingPanel = null;
        st.selectedPanel = null;
        st.showConfirmModal = null;
        break;
      }

      // v0.11: パッシブ削除トグル（チェックボックス変更はchangeイベントで処理）
      // v0.25.20: break→return に修正。breakだとswitch後のSC.render()がクリック処理中に走り、
      //   inputが再描画で差し替わってchangeイベントが失われる＝チェックできないバグ（ユーザーFB）
      case 'review-passive-toggle': {
        return;
      }

      case 'panel-slot': {
        // v0.20b修正: リスト直結フローは showConfirmModal のまま上書きモーダルが出るため両方参照
        const key = st.pendingPanel || st.showConfirmModal;
        if (!key) break;
        const p = SC.CONFIG.panel[key];
        // cheatAllPanels で習得済みパネルの再装備はSP0
        const isCheatReequip2 = st.cheatAllPanels && st.panelOpened.indexOf(key) >= 0;
        if (!isCheatReequip2) st.sp -= (p.sp || 0);   // v0.25.5: sp未解析rawのNaN防止
        if (st.panelOpened.indexOf(key) < 0) st.panelOpened.push(key);
        st.pSkills[Number(btn.dataset.slot)] = SC.panelToSkill(p);
        st.pendingPanel = null;
        st.showConfirmModal = null;
        break;
      }
      case 'panel-cancel': {
        st.pendingPanel = null;
        st.selectedPanel = null;
        break;
      }
      case 'panel-raw-info':
        // rawパネルの効果原文をアラート表示
        alert('パネル効果（原文）:\n' + (btn.dataset.raw || '不明'));
        break;

      // ---- オーディション ----
      case 'audition-start': SC.beginAuditionFlow(btn.dataset.id); break;
      case 'pretalk':        SC.resolvePreTalk(Number(btn.dataset.i)); break;
      case 'pretalk-go':     SC.preTalkGo(); break;   // v0.25.4: 反応フェイズ→オーディション開始
      case 'passive-remove-panel': {
        // 蜘蛛の巣パネルからパッシブを削除（パネル経由で holder を指定）
        if (!st.passiveRemoved) st.passiveRemoved = [];
        const holderId = btn.dataset.id === 'p' ? 'p' : Number(btn.dataset.id);
        if (st.passiveRemoved.indexOf(holderId) < 0 && confirm('このパッシブスキルを削除する？（元に戻せない）')) {
          st.passiveRemoved.push(holderId);
        }
        break;
      }
      case 'card-select': {
        const a = st.audition;
        if (!a || a.finished) break;
        // v0.25.28: シミュレーション中は選択のみ（メーターを開かない）。手札=山札全札なので位置=deck index
        if (st.simMode) {
          SC.simSetSelected(btn.dataset.pos === 'memory' ? 'memory' : a.hand[Number(btn.dataset.pos)]);
          break;
        }
        const pos = btn.dataset.pos === 'memory' ? 'memory' : Number(btn.dataset.pos);
        a.selectedCard = (a.selectedCard === pos) ? null : pos;
        // v0.25.21: 思い出も全体札と同じフロー（ユーザーFB）:
        //   1回クリック=選択+効果ポップ表示（selMemoryでスキル情報ポップ/予測値が出る）→審査員クリックでリール開始
        // v0.25.5: allJudges札も審査員選択フェーズを通す（単体を選択しつつ効果は全体・ユーザー実機確認）
        if (typeof pos === 'number' && a.selectedCard === pos) {
          const card = a.deck[a.hand[pos]];
          // v0.10.1: 回復カードはメーター経由に統一（対象選択なし）
          // 判定は行動順のみ反映（回復量は判定に依存しない）[実測]
          if (SC.isEffectOnlyCard(card)) {   // v0.25.36: 回復札・効果札（審査員選択なし）
            SC.render(); SC.refreshDebug();
            SC.openMeter('appeal', { cardPos: pos, heal: true });
            return;
          }
        }
        break;
      }
      case 'pick-judge': {
        if (st.simMode) {
          // v0.25.34: シミュは札/思い出を選んだ状態で審査員をクリック=1ターン進行。本編と同じ resolveTurn → fxCollect → fxPlay（アピール演出・満足度・帰宅演出）→ 完了後 render。
          //   メーターは開かない（判定は入力の判定）。進められない状態（審査終了後・思い出ゲージ未満タン等）は何もしない
          const evs = SC.simPlayTurn(Number(btn.dataset.judge));
          if (evs) SC.fxPlay(evs, function () { SC.render(); SC.refreshDebug(); });
          return;
        }
        const a = st.audition;
        if (!a || a.finished || a.selectedCard === null) break;
        // v0.25.21: 思い出も審査員選択→リール開始（全体札と同じフロー・ユーザーFB。効果は全審査員）
        if (a.selectedCard === 'memory') {
          SC.render(); SC.refreshDebug();
          SC.openMeter('memory', { judgeIdx: Number(btn.dataset.judge) });
          return;
        }
        const card = a.deck[a.hand[a.selectedCard]];
        if (SC.isEffectOnlyCard(card)) break; // 回復カード・効果札（v0.25.36）は judge 選択不要（メーターで処理済み）
        SC.render(); SC.refreshDebug();
        // v0.25.5: allJudges札は単体選択しつつ効果は全体（judgeIdxは行動演出用に保持）
        SC.openMeter('appeal', { cardPos: a.selectedCard, judgeIdx: Number(btn.dataset.judge),
          allJudges: !!card.allJudges });
        return;
      }
      case 'use-heal': {
        // v0.10.1: 廃止。回復カードは card-select → メーター のフローに統一
        // 旧ボタンが残っている場合の互換のため残存するが新UIでは非表示にする
        break;
      }
      case 'meter-stop': SC.meterStop(false); return;
      // quick-skill: v0.19でバトル内ボタン撤去（WING編対象外）。旧セーブ互換のため残存
      case 'audition-close': SC.closeAudition(); break;

      // ---- 進行 ----
      case 'result-ok': SC.nextWeek(); break;
      case 'season-ok': SC.closeSeasonResult(); break;

      // ---- 諦める（プロデュース中断） ----
      case 'give-up':
        if (confirm('プロデュースを諦めますか？（現在の状態で終了し、リザルトを表示します）')) {
          SC.setEnding('giveUp');
        }
        break;

      // ---- リセット → 編成画面 → setup 画面へ ----
      case 'new-game':
        if (confirm('セーブデータを消して最初からやり直しますか？')) {
          st.setupDraft = { mode: st.mode !== undefined ? st.mode : 1, items: [], from: 'home' };
          st.screen = 'unitSelect';
        }
        break;
      case 'new-game-force':
        // v0.25.29: リザルトの「トップへ戻る」→ 再読込（セーブは setEnding で削除済み＝起動処理でタイトル画面→WINGで編成から開始）
        location.reload();
        return;

      // ---- 編成画面アクション ----
      case 'unit-select-slot': {
        // スロットクリック → カード選択リストを開く
        if (!st.unitSelectDraft) st.unitSelectDraft = SC.loadLoadout() || { p: null, supports: [null,null,null,null], guest: null };
        st.unitSelectSlot = btn.dataset.slot; // 'p' / '0'..'3' / 'guest'
        // v0.25.20: 編成中カードがあればそのアイドルを初期選択（ユーザーFB: まず編成中のアイドルを出す）
        const dSel = st.unitSelectDraft;
        const slotKey = btn.dataset.slot;
        const curCardId = slotKey === 'p' ? dSel.p : (slotKey === 'guest' ? dSel.guest : dSel.supports[Number(slotKey)]);
        const curCard = curCardId && SC.findCard ? SC.findCard(curCardId) : null;
        st.unitSelectIdolFilter = curCard ? curCard.idolNo : '';
        st.unitSelectRarityFilter = '';
        break;
      }
      case 'unit-select-filter-idol': {
        st.unitSelectIdolFilter = btn.dataset.idol;
        break;
      }
      case 'unit-select-filter-rarity': {
        st.unitSelectRarityFilter = btn.dataset.rarity;
        break;
      }
      case 'unit-select-card': {
        // カード選択確定
        const draft = st.unitSelectDraft;
        const slot = st.unitSelectSlot;
        const selectedId = btn.dataset.id;
        // v0.25.18: URサポート1枚制限を全スロット対象に強化（従来はサポ4枠同士のみ＝ゲスト経由で抜けていた）
        //   + 同一カードの重複編成も不可（ユーザー指摘「重複不可です」）
        if (slot !== 'p') {
          const selCard2 = (SC.CARDS.cards || []).find(function (c2) { return c2.id === selectedId; });
          // 対象以外のSカードスロット（サポ4+ゲスト）の現内容
          const otherIds = draft.supports
            .filter(function (sid, si) { return sid && !(slot !== 'guest' && si === Number(slot)); })
            .concat(slot === 'guest' ? [] : (draft.guest ? [draft.guest] : []));
          if (otherIds.indexOf(selectedId) >= 0) {
            alert('同じカードは重複して編成できません');
            break;
          }
          if (selCard2 && selCard2.rarity === 'UR') {
            const urExists = otherIds.some(function (sid) {
              const c3 = (SC.CARDS.cards || []).find(function (c4) { return c4.id === sid; });
              return c3 && c3.rarity === 'UR';
            });
            if (urExists) {
              alert('URサポートカードは1枚しか編成できません（ゲスト含む）');
              break;
            }
          }
        }
        if (slot === 'p') {
          draft.p = selectedId;
        } else if (slot === 'guest') {
          draft.guest = selectedId;
        } else {
          draft.supports[Number(slot)] = selectedId;
        }
        // v0.22: 選択後も詳細表示を維持（下部エリアに表示）
        st.unitSelectDetailCard = selectedId;
        st.unitSelectSlot = null; // リストを閉じる
        break;
      }
      // v0.22: カードホバー（選択前のプレビュー）
      case 'unit-select-card-hover': {
        st.unitSelectDetailCard = btn.dataset.id;
        SC.render();
        return;
      }
      case 'unit-select-clear-slot': {
        // スロットのカードを解除してデフォルト（仮データ）に戻す
        const draft = st.unitSelectDraft || { p: null, supports: [null,null,null,null], guest: null };
        const slot = btn.dataset.slot;
        if (slot === 'p') {
          draft.p = null;
        } else if (slot === 'guest') {
          draft.guest = null;
        } else {
          draft.supports[Number(slot)] = null;
        }
        st.unitSelectDraft = draft;
        st.unitSelectSlot = null;
        break;
      }
      case 'unit-select-close-list': {
        // カードリストを閉じる（スロット選択をキャンセル）
        st.unitSelectSlot = null;
        break;
      }
      // v0.25.31: おまかせ編成=アイドル選択式（本編の編成画面・シミュ共通）。固定の恋鐘ジェラシー編成は撤去し SC.OMAKASE_LOADOUTS（config.js）に置換
      case 'omakase-open': SC._omakaseOpen = true; break;
      case 'omakase-close': SC._omakaseOpen = false; break;
      case 'omakase-pick': {
        const o = SC.OMAKASE_LOADOUTS && SC.OMAKASE_LOADOUTS[btn.dataset.no];
        SC._omakaseOpen = false;
        if (!o) break;
        if (st.simMode) { SC.simApplyOmakase(btn.dataset.no); break; }   // シミュ=入力に反映して再計算
        st.unitSelectDraft = { p: o.p, supports: o.supports.slice(), guest: o.guest };   // 本編=編成ドラフトに適用（決定ボタンで保存・適用）
        st.unitSelectSlot = null;
        break;
      }
      // v0.25.18: 「仮データで開始（編成スキップ）」は削除（ユーザー指定）
      case 'unit-select-decide': {
        // 決定: 編成を保存・適用してセットアップへ（v0.25.18: 6枠全部埋まっていないと不可）
        const decided = st.unitSelectDraft || { p: null, supports: [null,null,null,null], guest: null };
        if (!decided.p || decided.supports.some(function (s) { return !s; }) || !decided.guest) break;
        SC.saveLoadout(decided);
        SC.applyLoadout(decided);
        st.unitSelectDraft = null;
        st.unitSelectSlot = null;
        st.screen = 'setup';
        break;
      }
      case 'unit-select-cancel': {
        // キャンセル（home へ戻る）
        st.unitSelectDraft = null;
        st.unitSelectSlot = null;
        const fromEnding = st.setupDraft && st.setupDraft.from === 'ending';
        st.screen = fromEnding ? 'ending' : 'home';
        break;
      }

      // ---- プロデュース開始設定 ----
      case 'setup-mode': {
        const draft = st.setupDraft || { mode: 1, items: [], from: 'home' };
        draft.mode = Number(btn.dataset.mode);
        st.setupDraft = draft;
        break;
      }
      case 'setup-item': {
        const draft = st.setupDraft || { mode: 1, items: [], from: 'home' };
        const key = btn.dataset.key;
        const idx = draft.items.indexOf(key);
        if (idx >= 0) {
          draft.items.splice(idx, 1);  // 選択解除
        } else if (draft.items.length < 2) {
          draft.items.push(key);        // 選択（最大2個）
        }
        // 3個目クリックは無視（disabled制御はUI側でも行うが念のため）
        st.setupDraft = draft;
        break;
      }
      case 'setup-start': {
        const draft = st.setupDraft || { mode: 1, items: [], from: 'home' };
        // チート設定をoptionsとして渡す
        const opts = {
          cheatStats: draft.cheatStats || null,
          commsOff: !!draft.commsOff,
          cheatAllPanels: !!draft.cheatAllPanels,  // v0.10: 全パネル習得
          showTimer: !!draft.showTimer,            // v0.25.6: タイマー表示
          cheatMemLv: SC.normCheatMemLv(draft.cheatMemLv),   // v0.25.44: 思い出Lv固定
          cheatHighTension: !!draft.cheatHighTension        // v0.25.44: ハイテンションモード
        };
        // v0.13b: チート設定を引き継ぎ用に保存
        SC.saveCheatSettings({
          cheatStats: draft.cheatStats || null,
          commsOff: !!draft.commsOff,
          cheatAllPanels: !!draft.cheatAllPanels,
          showTimer: !!draft.showTimer,
          cheatMemLv: opts.cheatMemLv,
          cheatHighTension: opts.cheatHighTension
        });
        // 持ち込みアイテムは newGame の loadout 引数で適用（ロジック層に一本化）
        SC.resetGame(undefined, draft.mode, draft.items.slice(), opts);
        break;
      }
      case 'setup-cancel': {
        const draft = st.setupDraft || { from: 'home' };
        st.setupDraft = null;
        st.screen = draft.from === 'ending' ? 'ending' : 'home';
        break;
      }

      // ---- チート設定適用（v0.10: inputイベントで即時反映のため、このアクションは廃止済み） ----
      // 互換のため残存するが新UIではボタン非表示
      case 'cheat-stats-apply': {
        SC.applyCheatStatInputs();
        SC.render();
        SC.refreshDebug();
        return;
      }

      // ---- コンティニュー ----
      case 'continue-yes':
        if (typeof SC.useContinue === 'function') {
          SC.useContinue();
        } else {
          // フォールバック: チケット消費して同オデを再開
          if (st.continueTickets > 0 && st.lastContinueDefId) {
            st.continueTickets--;
            SC.startAudition(st.lastContinueDefId);
          }
        }
        break;
      case 'continue-no':
        if (typeof SC.declineContinue === 'function') {
          SC.declineContinue();
        } else {
          // フォールバック: エンディングへ
          SC.setEnding('seasonFail', SC.seasonIndex());
        }
        break;

      // ---- デバッグ ----
      case 'dbg-stats':
        SC.ATTRS.forEach(function (at) { SC.addStat(at, 100); });
        SC.addStat('me', 50);
        break;
      case 'dbg-fans': st.fans += 20000; break;
      case 'dbg-heal': st.stamina = SC.CONFIG.stamina.max; st.tension = 100; break;
      case 'dbg-love': SC.addLove(25); break;
      case 'dbg-sp':   st.sp += 100; break;
      case 'dbg-week':
        if (st.screen === 'home' || st.screen === 'schedule') {
          st.lastResult = { title: '（デバッグ）週スキップ', lines: [] };
          SC.afterAction(false, st.screen);
        }
        break;
      case 'dbg-newgame': {
        const seed = document.getElementById('dbg-seed').value;
        const mode = Number(document.getElementById('dbg-mode').value);
        SC.resetGame(seed, mode);
        break;
      }
      default: return;
    }

    SC.render();
    SC.refreshDebug();
  }, true); // v0.19.1: キャプチャフェーズ（modal-box の stopPropagation を回避）

  // チートステ入力値をdraftに即時反映するヘルパー
  SC.applyCheatStatInputs = function () {
    const draft = SC.state.setupDraft || { mode: 1, items: [], from: 'home' };
    const toCheatVal = function (id, minV) {
      const el = document.getElementById(id);
      if (!el || el.value === '') return null;
      const v = parseInt(el.value, 10);
      if (isNaN(v)) return null;
      return Math.max(minV || 1, Math.min(9999, v));
    };
    draft.cheatStats = {
      vo: toCheatVal('cheat-vo', 1),
      da: toCheatVal('cheat-da', 1),
      vi: toCheatVal('cheat-vi', 1),
      me: toCheatVal('cheat-me', 1),
      sp: toCheatVal('cheat-sp', 0)
    };
    const anySet = Object.values(draft.cheatStats).some(function (v) { return v !== null; });
    if (!anySet) draft.cheatStats = null;
    SC.state.setupDraft = draft;
  };

  document.body.addEventListener('change', function (ev) {
    // v0.25.28: シミュレーション入力（data-sim="stats.vo" 等のパス。クリック委譲でなくchangeで処理＝入力欄を壊さない）
    if (SC.state && SC.state.simMode && ev.target.dataset && ev.target.dataset.sim !== undefined) { SC.simOnChange(ev.target); return; }
    if (ev.target.id === 'auto-meter') { SC.state.autoMeter = ev.target.checked; SC.save(); }
    if (ev.target.id === 'dbg-event') { SC.state.eventWeek = ev.target.checked; SC.save(); SC.render(); }
    // チートUI: コミュOFF チェックボックス
    if (ev.target.id === 'cheat-comms-off') {
      const d = SC.state.setupDraft || { mode: 1, items: [], from: 'home' };
      d.commsOff = ev.target.checked;
      SC.state.setupDraft = d;
    }
    // v0.10: チートUI: 全パネル習得チェックボックス
    if (ev.target.id === 'cheat-all-panels') {
      const d = SC.state.setupDraft || { mode: 1, items: [], from: 'home' };
      d.cheatAllPanels = ev.target.checked;
      SC.state.setupDraft = d;
    }
    // v0.25.44: チートUI: 思い出Lv固定（select）・ハイテンションモード（チェックボックス）
    if (ev.target.id === 'cheat-mem-lv') {
      const d = SC.state.setupDraft || { mode: 1, items: [], from: 'home' };
      d.cheatMemLv = SC.normCheatMemLv(ev.target.value);
      SC.state.setupDraft = d;
    }
    if (ev.target.id === 'cheat-high-tension') {
      const d = SC.state.setupDraft || { mode: 1, items: [], from: 'home' };
      d.cheatHighTension = ev.target.checked;
      SC.state.setupDraft = d;
    }
    // v0.25.6: タイマー表示トグル（チートとは別枠）
    if (ev.target.id === 'opt-show-timer') {
      const d = SC.state.setupDraft || { mode: 1, items: [], from: 'home' };
      d.showTimer = ev.target.checked;
      SC.state.setupDraft = d;
    }
    // v0.10: チートステ数値input → changeで即時反映
    if (ev.target.classList && ev.target.classList.contains('cheat-input')) {
      SC.applyCheatStatInputs();
    }
    // v0.11: 振り返り画面パッシブ削除トグル
    if (ev.target.id === 'review-passive-toggle') {
      SC.state.passiveDeleteEnabled = ev.target.checked;
      SC.save();
      SC.render();
    }
    // v0.25.12: 立ち絵画像アップロード（ユーザー指定: 好きな画像でプロデュース）
    // v0.25.16: 透過PNG=内容バウンディングボックスへ自動クロップ（高さ・大きさ自動調整）+
    //   顔位置の自動推定（透過=最上部≒頭 / 写真=FaceDetector APIがあれば使用・なければそのまま）
    if (ev.target.id === 'idol-img-input' && ev.target.files && ev.target.files[0]) {
      const file = ev.target.files[0];
      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          const maxH = 900;
          const scale = Math.min(1, maxH / img.height);
          let cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          let faceY = 0;
          try {
            // 透過チェック+内容bbox（3pxステップ走査で軽量化。dataURL画像なのでcanvas汚染なし）
            const idata = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
            let minX = cv.width, minY = cv.height, maxX = 0, maxY = 0, hasAlpha = false;
            for (let y = 0; y < cv.height; y += 3) {
              for (let x = 0; x < cv.width; x += 3) {
                const aVal = idata[(y * cv.width + x) * 4 + 3];
                if (aVal < 250) hasAlpha = true;
                if (aVal > 40) {
                  if (x < minX) minX = x; if (x > maxX) maxX = x;
                  if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
              }
            }
            if (hasAlpha && maxX > minX + 20 && maxY > minY + 20) {
              const pad = Math.round((maxX - minX) * 0.03);
              const bx = Math.max(0, minX - pad), by = Math.max(0, minY - pad);
              const bw = Math.min(cv.width, maxX + pad) - bx;
              const bh = Math.min(cv.height, maxY + pad) - by;
              const cv2 = document.createElement('canvas');
              cv2.width = bw; cv2.height = bh;
              cv2.getContext('2d').drawImage(cv, bx, by, bw, bh, 0, 0, bw, bh);
              cv = cv2;
              faceY = 0;   // クロップ後は最上部≒頭
            }
          } catch (eAn) {}
          const finish = function (fy) {
            try { localStorage.setItem('sc_idol_facey', String(Math.max(0, Math.min(60, Math.round(fy))))); } catch (eF) {}
            let url = cv.toDataURL('image/png');
            if (url.length > 3500000) url = cv.toDataURL('image/jpeg', 0.85);   // 容量ガード（透過は失われる）
            SC.setIdolImg(url);
            SC.render();
          };
          // 写真（非透過）: FaceDetector APIが使える環境なら顔中心から丸抜き位置を推定
          if (typeof FaceDetector !== 'undefined') {
            try {
              new FaceDetector({ maxDetectedFaces: 1 }).detect(cv).then(function (faces) {
                if (faces && faces[0] && faces[0].boundingBox) {
                  const bb = faces[0].boundingBox;
                  finish((bb.y + bb.height / 2) / cv.height * 100 - 10);
                } else finish(faceY);
              }).catch(function () { finish(faceY); });
              return;
            } catch (eFd) {}
          }
          finish(faceY);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }
    // v0.25.16: アイドル名の自由入力
    if (ev.target.id === 'idol-name-input') {
      SC.setIdolName(ev.target.value.trim());
      SC.render();
    }
  });

  // v0.10: チートステ数値input → inputで即時反映
  document.body.addEventListener('input', function (ev) {
    if (ev.target.classList && ev.target.classList.contains('cheat-input')) {
      SC.applyCheatStatInputs();
    }
  });

  // v0.10: チートステ数値input → blurで 1〜9999 クランプ
  document.body.addEventListener('blur', function (ev) {
    if (!ev.target.classList || !ev.target.classList.contains('cheat-input')) return;
    const el = ev.target;
    if (el.value === '') return;
    const minV = el.id === 'cheat-sp' ? 0 : 1;
    const v = parseInt(el.value, 10);
    if (isNaN(v)) { el.value = ''; }
    else { el.value = Math.max(minV, Math.min(9999, v)); }
    SC.applyCheatStatInputs();
  }, true); // capture=true でblurをキャッチ

  document.addEventListener('keydown', function (ev) {
    if (ev.code === 'Space' && SC.meter) { ev.preventDefault(); SC.meterStop(false); return; }
    if (ev.key !== 'd' && ev.key !== 'D') return;
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'SELECT') return;   // v0.25.28: SELECTのタイプアヘッドでデバッグパネルが開かないように
    const p = document.getElementById('debug-panel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) SC.renderDebug();
  });

  // ---- v0.16a: 16:9固定キャンバス リサイズ計算 ----
  SC.resizeStage = function () {
    const app = document.getElementById('app');
    if (!app) return;
    const W = 1280, H = 720;
    const ww = window.innerWidth, wh = window.innerHeight;
    // ログペイン(100px) + フッター(28px) = 128px を除いた利用可能高さ
    // v0.25.28: シミュレーション中は下パネル（入力+ダメージ表）を広く取る（窓高の約42%・最低100px）
    const simOn = !!(SC.state && SC.state.simMode);
    const logMin = simOn ? Math.max(100, Math.round(wh * 0.42)) : 100;
    const availH = simOn ? Math.max(200, wh - 28 - logMin) : wh - 128;
    const scaleW = ww / W;
    const scaleH = availH / H;
    const scale = Math.min(scaleW, scaleH);
    const dispW = Math.round(W * scale);
    const dispH = Math.round(H * scale);
    const offsetX = Math.round((ww - dispW) / 2);
    app.style.width  = W + 'px';
    app.style.height = H + 'px';
    app.style.transform = 'scale(' + scale + ')';
    app.style.left   = offsetX + 'px';
    app.style.top    = '0px';
    // v0.25.5: ステージ下の余白はログペインに充てる（ステージ下端〜フッターまで拡張。最低100px）
    const logPane = document.getElementById('global-log');
    if (logPane) {
      logPane.style.top = dispH + 'px';
      logPane.style.height = 'auto';
    }
  };
  SC.resizeStage();
  window.addEventListener('resize', SC.resizeStage);

  // v0.25.13: プレイ経過タイマー（ヘッダ内・テンションの左に常設。ユーザー指定: 文字と被らない位置へ移設）
  // v0.25.20: 再描画のたびに「--:--」に戻る（クリックごとに消えて見える）FB→描画時も即時に現在値を出す
  SC.playTimerText = function () {
    const st = SC.state;
    if (!st || !st.startedAt) return '--:--';
    // v0.25.9: リザルト確定（諦める/優勝/敗退）後は endedAt で凍結表示（ユーザー指定）
    const endMs = st.endedAt || Date.now();
    const totalSec = Math.floor((endMs - st.startedAt) / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return (h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s));
  };
  setInterval(function () {
    const legacy = document.getElementById('play-timer');
    if (legacy) legacy.classList.add('hidden');   // 旧フッター/ステージ表示は廃止
    const el = document.getElementById('hdr-timer');
    if (!el) return;
    const st = SC.state;
    if (!st || !st.showTimer || !st.startedAt) return;
    el.textContent = SC.playTimerText();
  }, 1000);

  // ---- v0.16c: ドラッグパン（hex-viewport を掴んでスクロール）----
  // pointer events で実装。タッチ/マウス両対応
  (function () {
    let dragging = false;
    let lastX = 0, lastY = 0;
    let viewport = null;

    let pressed = false;       // pointerdown済み（まだドラッグ確定でない）
    let startX = 0, startY = 0;
    const DRAG_THRESHOLD = 5;  // px: これ未満の移動はクリック扱い（v0.24.2: hexタップ習得を復活）

    // pointerdown: 押下記録のみ（capture/preventDefaultしない＝クリックを殺さない）
    document.body.addEventListener('pointerdown', function (ev) {
      const vp = ev.target.closest && ev.target.closest('#review-main');
      if (!vp) return;
      if (SC.meter) return;
      if (ev.target.tagName === 'BUTTON' || ev.target.closest('button')) return;
      pressed = true;
      viewport = vp;
      startX = lastX = ev.clientX;
      startY = lastY = ev.clientY;
    });

    // pointermove: 閾値を超えたらドラッグ確定（ここで初めてcapture）
    document.body.addEventListener('pointermove', function (ev) {
      if (!pressed || !viewport) return;
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        viewport.style.cursor = 'grabbing';
        try { viewport.setPointerCapture(ev.pointerId); } catch (e) {}
      }
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      viewport.scrollLeft -= dx;
      viewport.scrollTop  -= dy;
      ev.preventDefault();
    }, { passive: false });

    // pointerup / pointercancel: 終了。ドラッグだった場合は直後のclickを1回抑止
    function endDrag(ev) {
      if (!pressed) return;
      if (dragging) SC._suppressClick = true;
      pressed = false;
      dragging = false;
      if (viewport) {
        viewport.style.cursor = 'grab';
        viewport = null;
      }
    }
    document.body.addEventListener('pointerup',     endDrag);
    document.body.addEventListener('pointercancel', endDrag);
  })();

  SC.render();
})();
