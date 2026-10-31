// 演出FXプレイヤー（v0.25 P1: 計算と演出の分離基盤）
// - resolveTurn 等のロジックは SC.fxPush() で「発生した事実」を記録するだけ（計算は不変）
// - SC.fxPlay(events, done) がイベント列を順次再生し、完了後に done()（→render）
// - 演出カット（state.commsOff=演出カット設定）時・DOMなし環境（node/smoke）では即 done()
// - 再生中のクリックは「現在の演出をスキップして次へ」
window.SC = window.SC || {};

SC._fx = null;          // 記録バッファ（resolveTurn中のみ非null）
SC._fxMark = null;      // v0.25.42: 「札の使用宣言（Live Skill / Appeal Start!!）の直後」の挿入位置（SC.fxMark / SC.fxPushAtMark）
SC.fxPlaying = false;   // 再生中フラグ（入力ロック用）
SC._fxTimer = null;
SC._fxDone = null;
SC._fxQueue = [];

// ---- 記録側（ロジック層から呼ぶ。バッファ未初期化なら無視＝安全） ----
SC.fxBegin = function () { SC._fx = []; SC._fxMark = null; };
SC.fxPush = function (ev) { if (SC._fx) SC._fx.push(ev); };
SC.fxCollect = function () {
  const evs = SC._fx || [];
  SC._fx = null;
  SC._fxMark = null;
  return evs;
};
// v0.25.42: 札の使用宣言カットイン（Live Skill / 思い出の Appeal Start!!）を積んだ直後に呼び、その位置を覚える。
//   以後 SC.fxPushAtMark で積んだイベントは「覚えた位置」へ差し込む（連続して積むと積んだ順に並ぶ）。
//   用途: PLUS!/LINK! のカットイン。成立判定と追加効果の適用は本体アピールの後（applyExtraEffects）だが、演出は札の使用直後に出す
//   （従来は末尾＝満足バースト・帰宅・★帯の後に積まれ、その札でオーディションが終わると、終了演出の後にもう一度カットインが出た）
SC.fxMark = function () { SC._fxMark = SC._fx ? SC._fx.length : null; };
// 位置を覚えていなければ（回復札・効果札など使用宣言カットインのない行動）通常どおり末尾へ追加
SC.fxPushAtMark = function (ev) {
  if (!SC._fx) return;
  if (SC._fxMark === null || SC._fxMark > SC._fx.length) { SC._fx.push(ev); return; }
  SC._fx.splice(SC._fxMark, 0, ev);
  SC._fxMark++;
};

// ---- 再生側 ----
SC.fxPlay = function (events, done) {
  const cut = !SC.state || SC.state.commsOff;   // 演出カット設定
  const hasDom = (typeof document !== 'undefined') && document.getElementById && document.getElementById('app');
  if (cut || !hasDom || !events || events.length === 0) { if (done) done(); return; }

  // fx-layer を確保（#app 直下・最前面・クリックは透過（スキップはbody委譲で処理））
  let layer = document.getElementById('fx-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'fx-layer';
    document.getElementById('app').appendChild(layer);
  }
  layer.innerHTML = '';

  SC.fxPlaying = true;
  SC._fxQueue = events.slice();
  SC._fxDone = function () {
    SC.fxPlaying = false;
    SC._fxDone = null;
    if (layer) layer.innerHTML = '';
    if (done) done();
  };
  SC._fxNext(layer);
};

SC._fxNext = function (layer) {
  if (SC._fxTimer) { clearTimeout(SC._fxTimer); SC._fxTimer = null; }
  const ev = SC._fxQueue.shift();
  if (!ev) { if (SC._fxDone) SC._fxDone(); return; }
  const dur = SC._fxRender(layer, ev);
  // parallel: キューを止めずに次へ（float系。要素は自分の寿命で消える）
  if (ev.parallel) { SC._fxNext(layer); return; }
  SC._fxTimer = setTimeout(function () { SC._fxNext(layer); }, dur);
};

// クリックで現在の演出をスキップ（次のイベントへ即進む）
SC.fxSkip = function () {
  if (!SC.fxPlaying) return;
  const layer = document.getElementById('fx-layer');
  if (layer) layer.innerHTML = '';
  SC._fxNext(layer);
};

// ---- レンダラ（P1は汎用3種+複合。P2で原作寄せの専用演出に差し替えていく） ----
// 各要素は appendChild + 寿命付き自動remove（parallel共存のため全消ししない）
// 戻り値 = 直列時にキューを待たせる時間(ms)
SC._fxSpawn = function (layer, html, life) {
  const d = document.createElement('div');
  d.innerHTML = html;
  const el = d.firstChild;
  layer.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, life);
  return el;
};

SC._fxRender = function (layer, ev) {
  const t = ev.type;

  // v0.25.20: wait=何も描かない直列待機（parallel同時グループの区切り用。3WAY同時着弾で使用）
  if (t === 'wait') return ev.duration || 300;

  // v0.25.3 P4: FX同期SE（演出に音を合わせる。演出カット時はfxPlay自体が走らない=自動で無音）
  if (SC.audio) {
    if (t === 'banner' && ev.cls === 'judgement-perfect') SC.audio.se('perfect');
    else if (t === 'banner' && (ev.cls === 'out' || ev.cls === 'judgement-bad')) SC.audio.se('warning');
    else if (t === 'starband') SC.audio.se('star');
    else if (t === 'burst') SC.audio.se('satisfied');
    else if (t === 'memcut') SC.audio.se('appeal');
    else if (t === 'rays' && ev.cls !== 'rival') SC.audio.se('appeal');
  }

  if (t === 'flash') {
    // 全画面フラッシュ（cls: appeal=白 / memory=ピンク）+ v0.25.11: キラ粒（canvas・加算）
    const dur = ev.duration || 350;
    SC._fxSpawn(layer, `<div class="fx-flash fx-flash-${ev.cls || 'appeal'}"></div>`, dur + 100);
    SC.fxEmit('sparkle', { n: 14, hue: ev.cls === 'memory' ? 330 : 45 });   // v0.25.12: 粒数削減（うるさいとのFB）
    return dur;
  }
  if (t === 'banner') {
    // 中央帯テキスト（cls: judgement-perfect / star / satisfied / memory / passive 等）
    const dur = ev.duration || 700;
    const el = SC._fxSpawn(layer, `<div class="fx-banner fx-banner-${ev.cls || ''}">${ev.text || ''}</div>`, dur + 60);
    el.style.animationDuration = (dur / 1000) + 's';
    // v0.25.22: 判定演出を実機化（動画実測 iron_t48/19-52-07: Perfect=多色の星吹雪がテキスト周辺から放射・
    //   Good=金星の小さい弾け。旧: Perfect=花びら[誤認]）
    if (ev.cls === 'judgement-perfect') {
      SC.fxEmit('starburst', { n: 26, x: .5, y: .42,
        colors: [[320, 90, 72], [275, 85, 68], [140, 70, 70], [55, 95, 70], [0, 0, 96]] });
    } else if (ev.cls === 'judgement-good') {
      SC.fxEmit('starburst', { n: 9, x: .5, y: .42 });
    }
    return dur;
  }
  if (t === 'cutin') {
    // v0.25.9: ライブスキル/パッシブのカットイン（f30実測: 右側1/3の斜め縦帯+大きい立ち絵+ロゴ+スキル名）
    // cls: liveskill(オレンジ) / passive(ピンクストライプ) / memory(ピンク大) / support(青・立ち絵なし v0.25.17)
    const dur = ev.duration || 900;
    const idolImg = ev.cls === 'support' ? '' : `<img class="fx-cutin-idol" src="${SC.idolImg()}" alt="" onerror="this.remove()">`;
    SC._fxSpawn(layer, `<div class="fx-cutin fx-cutin-${ev.cls || 'liveskill'}">
      <div class="fx-cutin-band"></div>
      ${idolImg}
      <div class="fx-cutin-body">
        <span class="fx-cutin-logo">${ev.logo || 'Live Skill&#9834;'}</span>
        <span class="fx-cutin-name">${ev.text || ''}</span>
      </div></div>`, dur + 80);
    return dur;
  }
  if (t === 'faclv') {
    // v0.25.17: 施設Lvアップ演出（動画19-55-34実測: 「ビジュアルレッスン Lv 2」施設名+巨大数字の全画面帯）
    const dur = ev.duration || 1000;
    SC._fxSpawn(layer, `<div class="fx-faclv">
      <span class="fl-name">${ev.label || ''}</span>
      <span class="fl-lv">Lv<b>${ev.lv || ''}</b></span>
    </div>`, dur + 80);
    if (SC.audio) SC.audio.se('star');
    SC.fxEmit('sparkle', { n: 10, hue: 320 });
    return dur;
  }
  if (t === 'starband') {
    // v0.25 P2: ★獲得帯（実機実測: Top Appeal!=オレンジ / Last Appeal!=白青 / Bonus!!=青ピンク の個別帯）
    const dur = ev.duration || 750;
    SC._fxSpawn(layer, `<div class="fx-starband fx-starband-${ev.cls || 'bonus'}">
      <span class="fx-starband-label">${ev.text || ''}</span>
      <span class="fx-starband-star">&#9733;&#215;${ev.stars}</span></div>`, dur + 60);
    // v0.25.11: 星パーティクルをcanvas化（rec3/star03実測: 黄色い星が画面全体に拡散。DOM22個→canvas粒子）
    SC.fxEmit('starburst', { n: 20, x: .5, y: .4 });
    
    const meRow = document.querySelector('.rank-row-v16b.me');
    if (meRow) {
      meRow.classList.add('row-star-flash');
      setTimeout(function () { meRow.classList.remove('row-star-flash'); }, dur + 200);
    }
    return dur;
  }
  if (t === 'burst') {
    // v0.25 P2: 黄色い爆発（審査員満足の瞬間・対象位置）
    const el2 = SC._fxFindTarget(ev.target);
    let bx = 640, by = 300;
    if (el2) {
      const appRect2 = document.getElementById('app').getBoundingClientRect();
      const r2 = el2.getBoundingClientRect();
      const scale2 = appRect2.width / 1280;
      bx = (r2.left + r2.width / 2 - appRect2.left) / scale2;
      by = (r2.top + r2.height / 2 - appRect2.top) / scale2;
    }
    const dur = ev.duration || 500;
    SC._fxSpawn(layer, `<div class="fx-burst" style="left:${Math.round(bx)}px;top:${Math.round(by)}px"></div>`, dur + 80);
    // v0.25.11: 満足の瞬間に金星パーティクル（対象位置から放射・canvas）
    SC.fxEmit('starburst', { n: 12, x: bx / 1280, y: by / 720 });
    // v0.25.23: 中心に金の光芒フレア（Kenneyスプライト・未読込なら何も出ない）
    SC.fxEmit('flarepop', { n: 1, x: bx / 1280, y: by / 720, hue: 48, sat: 95, lig: 72 });
    return ev.parallel ? 0 : dur;
  }
  if (t === 'rays') {
    // v0.25 P2: アピール発動の放射光線（ピンク/白）
    const dur = ev.duration || 400;
    SC._fxSpawn(layer, `<div class="fx-rays fx-rays-${ev.cls || 'appeal'}"></div>`, dur + 60);
    return ev.parallel ? 0 : dur;
  }
  if (t === 'memcut') {
    // v0.25.10: 思い出アピールの全画面カットイン（rec3/meter18実測: 明るいステージ+カラフルレーザー交差+
    //   「Appeal / Start!!」2行ピンク斜体。旧v0.25.3の暗転82%→薄め35%に）
    const dur = ev.duration || 1100;
    const mcText = ev.text
      ? `<div class="fx-memcut-text">${ev.text}</div>`
      : '<div class="fx-memcut-text"><span class="mc-l1">Appeal</span><span class="mc-l2">Start!!</span></div>';
    SC._fxSpawn(layer, `<div class="fx-memcut">
      <div class="fx-memcut-rays"></div>
      <div class="fx-memcut-beams"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      ${mcText}
    </div>`, dur + 80);
    return dur;
  }
  if (t === 'shot') {
    // v0.25.14: 対象に向かって飛ぶ光弾（ユーザー指定: アピール/リアクションは攻撃対象へ向かう）
    // from/to: 'judge:N' | 'unit:key' | 'stage'（中央ステージ=演者位置）
    // v0.25.17: style:'notes'=音符の波（アイドルのアピール用）/ 省略=直線ビーム（審査員リアクション用）
    const srcPt = SC._fxPoint(ev.from);
    const dstPt = SC._fxPoint(ev.to);
    if (srcPt && dstPt) {
      if (ev.style === 'notes') SC.fxEmitNotes(srcPt, dstPt, { hue: ev.hue, n: ev.n });
      else SC.fxEmitStream(srcPt, dstPt, { hue: ev.hue, n: ev.n });
    }
    return ev.parallel ? 0 : (ev.duration || 320);
  }
  if (t === 'shock') {
    // v0.25.2: 審査員リアクションの着弾（1080p実測r3_5: 青白い衝撃波が対象ユニット位置に走る）
    // v0.25.21: 行内のアイドルアイコン（.rr-face/.rr-sil）を優先して重ねる（ユーザーFB「対象アイドルと重なるように」）
    const elS0 = SC._fxFindTarget(ev.target);
    const elS = elS0 ? (elS0.querySelector('.rr-face, .rr-sil') || elS0) : null;
    let sx = 640, sy = 420;
    if (elS) {
      const appRectS = document.getElementById('app').getBoundingClientRect();
      const rS = elS.getBoundingClientRect();
      const scaleS = appRectS.width / 1280;
      sx = (rS.left + rS.width / 2 - appRectS.left) / scaleS;
      sy = (rS.top + rS.height / 2 - appRectS.top) / scaleS;
    }
    // v0.25.21: 被弾SE（自機被弾はhit音。ロジック層がse:'hit'を付けて渡す）
    if (SC.audio && ev.se) SC.audio.se(ev.se);
    const dur = ev.duration || 420;
    SC._fxSpawn(layer, `<div class="fx-shock" style="left:${Math.round(sx)}px;top:${Math.round(sy)}px"><i></i><i></i><i></i></div>`, dur + 100);
    return ev.parallel ? 0 : dur;
  }
  if (t === 'whiteburst') {
    // v0.25.22: 思い出アピール発動時の白い放射バースト（動画実測19-52-07: 自機の順位行位置で巨大な白バースト）
    const elW0 = SC._fxFindTarget(ev.target);
    const elW = elW0 ? (elW0.querySelector('.rr-face, .rr-sil') || elW0) : null;
    let wx = 640, wy = 300;
    if (elW) {
      const appRectW = document.getElementById('app').getBoundingClientRect();
      const rW = elW.getBoundingClientRect();
      const scaleW = appRectW.width / 1280;
      wx = (rW.left + rW.width / 2 - appRectW.left) / scaleW;
      wy = (rW.top + rW.height / 2 - appRectW.top) / scaleW;
    }
    const durW = ev.duration || 550;
    SC._fxSpawn(layer, `<div class="fx-whiteburst" style="left:${Math.round(wx)}px;top:${Math.round(wy)}px"><i class="wb-core"></i><i class="wb-spike"></i><i class="wb-spike wb-spike2"></i></div>`, durW + 80);
    // v0.25.23: 白い光芒フレアを重ねる（Kenneyスプライト・未読込なら従来表現のみ）
    SC.fxEmit('flarepop', { n: 1, x: wx / 1280, y: wy / 720, hue: 0, sat: 0, lig: 97, size: 300 });
    return ev.parallel ? 0 : durW;
  }
  if (t === 'elclass') {
    // v0.25.2: 既存DOM要素に一時クラスを付与（審査員の口撃発光・満足帰宅スライドアウト等）
    // render前の旧DOMに直接アニメclassを付ける方式。要素が無ければ時間だけ消化
    const elC = SC._fxFindTarget(ev.target);
    const dur = ev.duration || 600;
    if (elC && ev.cls) {
      elC.classList.add(ev.cls);
      // keep: クラスを剥がさない（帰宅スライドアウト等、次のrenderまで消えたままにする用）
      if (!ev.keep) {
        setTimeout(function () { if (elC.classList) elC.classList.remove(ev.cls); }, dur + 60);
      }
    }
    return ev.parallel ? 0 : dur;
  }
  if (t === 'float') {
    // 対象要素の位置に数字フロート。target: 'judge:N' | 'unit:KEY' | セレクタ
    const el = SC._fxFindTarget(ev.target);
    let x = 640, y = 300;
    if (el) {
      const appRect = document.getElementById('app').getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const scale = appRect.width / 1280;   // stage scale補正
      x = (r.left + r.width / 2 - appRect.left) / scale;
      y = (r.top - appRect.top) / scale;
    }
    const dur = ev.duration || 550;
    SC._fxSpawn(layer, `<div class="fx-float fx-float-${ev.cls || 'dmg'}" style="left:${Math.round(x)}px;top:${Math.round(y)}px">${ev.text || ''}</div>`, dur + 300);
    return ev.parallel ? 0 : dur;
  }
  // 未知タイプは無視して即次へ
  return 0;
};

SC._fxFindTarget = function (target) {
  if (!target) return null;
  try {
    if (target.indexOf('judge:') === 0) {
      const idx = Number(target.slice(6));
      const cards = document.querySelectorAll('.judge-card, .judge-card-v16b');
      return cards[idx] || null;
    }
    if (target.indexOf('unit:') === 0) {
      const key = target.slice(5);
      return document.querySelector('[data-unit-key="' + key + '"]') ||
             document.querySelector('.rank-row.me');
    }
    return document.querySelector(target);
  } catch (e) { return null; }
};

// ==== v0.25.11 ビジュアル1便: canvasパーティクルエンジン ====
// 1枚のcanvas（#fx-canvas・#app直下・クリック透過）にrAF描画。加算合成で光を表現。
// DOM要素粒子（旧方式・上限28個）を卒業し数百粒を軽量に扱う。演出カット時はno-op。
// 論理座標: x,yは0〜1の画面比率で指定（内部でcanvas実サイズへ変換）
SC._pt = { parts: [], raf: null, lastT: 0 };
SC._PT_MAX = 1000;   // 粒子上限（性能保険）

// ==== v0.25.23 ビジュアルプラン⑨: FXスプライト（Kenney Particle Pack・CC0・app/img/fx/）====
// 白素材PNGをtint（色付け）して描画に使う。読込前・読込失敗・Node環境では
// 各レンダラが従来のベクタ描画へ自動フォールバックする（スプライトは純粋な上乗せ）。
// canvasへの外部画像描画はfile://で汚染(tainted)を起こすが、読み戻し（getImageData等）を
// 一切しないため描画には影響しない。
SC._fxSpr = {
  def: { star: 'img/fx/star.png', flare: 'img/fx/flare.png' },
  img: {}, ready: {}, loaded: false
};
SC._fxSpriteLoad = function () {
  if (SC._fxSpr.loaded) return;
  if (typeof Image === 'undefined' || typeof document === 'undefined') return;
  SC._fxSpr.loaded = true;
  Object.keys(SC._fxSpr.def).forEach(function (k) {
    const im = new Image();
    im.onload = function () { SC._fxSpr.ready[k] = true; };
    im.src = SC._fxSpr.def[k];   // 失敗時はready=falseのまま→ベクタ描画継続
    SC._fxSpr.img[k] = im;
  });
};

// tint済みスプライトのキャッシュ（128px縮小・multiplyで白グラデを保ったまま着色）
SC._fxTintCache = {};
SC._fxTint = function (name, h, s, l) {
  if (!SC._fxSpr.ready[name]) return null;
  h = Math.round(h); s = Math.round(s === undefined ? 95 : s); l = Math.round(l === undefined ? 64 : l);
  const key = name + '|' + h + '|' + s + '|' + l;
  let cv = SC._fxTintCache[key];
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.drawImage(SC._fxSpr.img[name], 0, 0, 128, 128);
  c.globalCompositeOperation = 'multiply';      // 白×色=色（明度グラデ保存）
  c.fillStyle = 'hsl(' + h + ',' + s + '%,' + l + '%)';
  c.fillRect(0, 0, 128, 128);
  c.globalCompositeOperation = 'destination-in'; // 元スプライトの透明度を復元
  c.drawImage(SC._fxSpr.img[name], 0, 0, 128, 128);
  SC._fxTintCache[key] = cv;
  return cv;
};

SC._ptCanvas = function () {
  if (SC.state && SC.state.commsOff) return null;
  if (typeof document === 'undefined') return null;
  const app = document.getElementById('app');
  if (!app) return null;
  let cv = document.getElementById('fx-canvas');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = 'fx-canvas';
    app.appendChild(cv);
  }
  const w = app.clientWidth || 1280, h = app.clientHeight || 720;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  SC._fxSpriteLoad();   // v0.25.23: 初回canvas確保時にFXスプライトを遅延読込
  return cv;
};

// kind: 'confetti'（紙吹雪・落下） / 'starburst'（金星の放射） / 'sparkle'（キラ粒・加算） / 'petals'（花びら落下）
SC.fxEmit = function (kind, opts) {
  opts = opts || {};
  const cv = SC._ptCanvas();
  if (!cv) return;
  const W = cv.width, H = cv.height;
  const n = Math.min(opts.n || 30, SC._PT_MAX - SC._pt.parts.length);
  const cx = (opts.x !== undefined ? opts.x : 0.5) * W;
  const cy = (opts.y !== undefined ? opts.y : 0.45) * H;
  const sc = H / 720;   // 粒サイズのスケール補正
  for (let i = 0; i < n; i++) {
    const p = { kind: kind, t: 0, delay: opts.stagger ? Math.random() * opts.stagger : 0 };
    if (kind === 'confetti') {
      p.x = Math.random() * W; p.y = -20 - Math.random() * H * 0.2;
      p.vx = (Math.random() - .5) * 60 * sc; p.vy = (150 + Math.random() * 170) * sc;
      p.w = (6 + Math.random() * 7) * sc; p.h = (10 + Math.random() * 6) * sc;
      p.rot = Math.random() * 6.28; p.vr = (Math.random() - .5) * 8;
      p.hue = Math.floor(Math.random() * 360); p.life = 4 + Math.random() * 2;
      p.sway = (40 + Math.random() * 60) * sc; p.phase = Math.random() * 6.28;
    } else if (kind === 'starburst') {
      const ang = Math.random() * 6.28, sp = (120 + Math.random() * 380) * sc;
      p.x = cx + (Math.random() - .5) * 40 * sc; p.y = cy + (Math.random() - .5) * 40 * sc;
      p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - 120 * sc;
      p.size = (7 + Math.random() * 13) * sc; p.rot = Math.random() * 3.14; p.vr = (Math.random() - .5) * 6;
      // v0.25.22: 多色対応（opts.colors=[[h,s,l],...]からランダム）。省略時は従来の金
      if (opts.colors) {
        const c = opts.colors[Math.floor(Math.random() * opts.colors.length)];
        p.hue = c[0]; p.sat = c[1]; p.lig = c[2];
      } else {
        p.hue = 45 + Math.random() * 14; p.sat = 95; p.lig = 64;
      }
      p.life = 0.9 + Math.random() * 0.7; p.grav = 300 * sc;
    } else if (kind === 'sparkle') {
      p.x = Math.random() * W; p.y = Math.random() * H;
      p.vx = 0; p.vy = (-14 - Math.random() * 26) * sc;
      p.size = (2 + Math.random() * 4) * sc;
      p.hue = opts.hue !== undefined ? opts.hue : 320 + Math.random() * 40;
      p.life = 0.8 + Math.random() * 1.0;
    } else if (kind === 'flarepop') {
      // v0.25.23: 中心1枚の光芒フレア（n:1で使う）。hue/sat/lig/size指定可
      p.x = cx; p.y = cy; p.vx = 0; p.vy = 0;
      p.size = (opts.size || 220) * sc;
      p.hue = opts.hue !== undefined ? opts.hue : 48;
      p.sat = opts.sat; p.lig = opts.lig;
      p.life = 0.45;
    } else if (kind === 'petals') {
      p.x = Math.random() * W; p.y = -14 - Math.random() * H * 0.2;
      p.vx = (Math.random() - .5) * 50 * sc; p.vy = (90 + Math.random() * 90) * sc;
      p.size = (6 + Math.random() * 6) * sc; p.rot = Math.random() * 6.28; p.vr = (Math.random() - .5) * 5;
      p.hue = 328 + Math.random() * 22; p.life = 2.2 + Math.random() * 1.2;
      p.sway = (50 + Math.random() * 50) * sc; p.phase = Math.random() * 6.28;
    } else {
      continue;
    }
    SC._pt.parts.push(p);
  }
  SC._ptRun();
};

SC._ptRun = function () {
  if (SC._pt.raf) return;
  SC._pt.lastT = performance.now();
  const tick = function () {
    // renderがapp.innerHTMLを書き換えcanvasが消えることがある → 毎フレーム確保し直す
    const cv = SC._ptCanvas();
    if (!cv) { SC._pt.raf = null; SC._pt.parts = []; return; }
    const ctx = cv.getContext('2d');
    const now = performance.now();
    const dt = Math.min(0.05, (now - SC._pt.lastT) / 1000);
    SC._pt.lastT = now;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const alive = [];
    for (let i = 0; i < SC._pt.parts.length; i++) {
      const p = SC._pt.parts[i];
      if (p.delay > 0) { p.delay -= dt; alive.push(p); continue; }
      p.t += dt;
      if (p.t >= p.life) continue;
      if (p.grav) p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.sway) p.x += Math.sin(p.t * 3 + p.phase) * p.sway * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.y > H + 30) continue;
      const k = p.t / p.life;
      const fade = k > .7 ? 1 - (k - .7) / .3 : 1;
      ctx.save();
      if (p.kind === 'confetti') {
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.sin(p.t * 6 + p.phase)) * .8 + .2);   // ひらひら
        ctx.fillStyle = 'hsla(' + p.hue + ',85%,62%,' + fade + ')';
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.kind === 'starburst') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        // v0.25.23: Kenneyスプライト描画（4芒星）。未読込時は従来のベクタ星
        // （当初は後光light_02も重ねたがリング模様がシャボン玉状に見えたため星のみに。スクショ目視判断）
        const sbSpr = SC._fxTint('star', p.hue, p.sat, p.lig);
        if (sbSpr) {
          const sbD = p.size * 2.8;   // スプライトは余白込み→ベクタ星より大きめに描く
          ctx.globalAlpha = fade;
          ctx.drawImage(sbSpr, -sbD / 2, -sbD / 2, sbD, sbD);
        } else {
          ctx.fillStyle = 'hsla(' + p.hue + ',' + (p.sat !== undefined ? p.sat : 95) + '%,' + (p.lig !== undefined ? p.lig : 64) + '%,' + fade + ')';
          SC._ptStar(ctx, p.size);
          ctx.fill();
        }
      } else if (p.kind === 'sparkle') {
        ctx.globalCompositeOperation = 'lighter';
        const tw = Math.abs(Math.sin(p.t * 8 + p.x));
        // v0.25.23: キラ粒もスプライト化（点滅に合わせスケール）。未読込時は従来の円
        const spSpr = SC._fxTint('star', p.hue, 90, 72);
        if (spSpr) {
          const spD = p.size * (0.6 + tw * 0.6) * 7;
          ctx.globalAlpha = fade * tw;
          ctx.drawImage(spSpr, p.x - spD / 2, p.y - spD / 2, spD, spD);
        } else {
          ctx.fillStyle = 'hsla(' + p.hue + ',90%,72%,' + (fade * tw).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + tw * 0.6), 0, 6.29); ctx.fill();
        }
      } else if (p.kind === 'flarepop') {
        // v0.25.23: 1枚の光芒フレア（拡大しながらフェード）。バースト系の芯に重ねる
        const fpSpr = SC._fxTint('flare', p.hue, p.sat, p.lig);
        if (fpSpr) {
          ctx.globalCompositeOperation = 'lighter';
          const fpK = p.t / p.life;
          const fpD = p.size * (0.5 + fpK * 1.2);
          ctx.globalAlpha = fade;
          ctx.drawImage(fpSpr, p.x - fpD / 2, p.y - fpD / 2, fpD, fpD);
        }
        // スプライト無し時は何も描かない（DOM側の.fx-burst等が既に芯を表現している）
      } else if (p.kind === 'beam') {
        // v0.25.16: 直線ビーム+波状パルス（ユーザーFB: 原作風の直線波状攻撃）
        ctx.globalCompositeOperation = 'lighter';
        // ビーム線（芯+ハロの2本・出現/消滅でフェード）
        const bAlpha = fade * (p.t < 0.08 ? p.t / 0.08 : 1);
        ctx.strokeStyle = 'hsla(' + p.hue + ',85%,68%,' + (bAlpha * .30).toFixed(3) + ')';
        ctx.lineWidth = p.size * 3.2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        ctx.strokeStyle = 'hsla(' + p.hue + ',70%,90%,' + (bAlpha * .75).toFixed(3) + ')';
        ctx.lineWidth = p.size * 1.1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        // 波状パルス（線上をsrc→dstへ等間隔で連続して走る光球）
        const bdx = p.x2 - p.x, bdy = p.y2 - p.y;
        for (let pi = 0; pi < p.pulses; pi++) {
          const ph = (p.t / p.life) * 1.6 - pi / p.pulses;   // 各パルスは位相差で追走
          if (ph < 0 || ph > 1) continue;
          const px2 = p.x + bdx * ph, py2 = p.y + bdy * ph;
          ctx.fillStyle = 'hsla(' + p.hue + ',95%,75%,' + (bAlpha * .5).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(px2, py2, p.size * 2.6, 0, 6.29); ctx.fill();
          ctx.fillStyle = 'hsla(' + p.hue + ',60%,95%,' + bAlpha.toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(px2, py2, p.size * 1.3, 0, 6.29); ctx.fill();
        }
      } else if (p.kind === 'notes') {
        // v0.25.17: 音符（Pアイドルのアピールは右のアイコン発・音符が連続して流れる）
        // v0.25.21: sin波の蛇行を廃止し対象へ一直線（ユーザーFB「真っ直ぐ飛んでほしい」）
        ctx.globalCompositeOperation = 'lighter';
        const nAlpha = fade * (p.t < 0.08 ? p.t / 0.08 : 1);
        const ndx = p.x2 - p.x, ndy = p.y2 - p.y;
        ctx.font = 'bold ' + Math.round(p.size * 6.5) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let ni = 0; ni < p.notes; ni++) {
          const ph = (p.t / p.life) * 1.5 - ni / p.notes;   // 各音符は位相差で追走
          if (ph < 0 || ph > 1) continue;
          const nx = p.x + ndx * ph, ny = p.y + ndy * ph;
          const glyph = ni % 3 === 0 ? '♫' : ni % 3 === 1 ? '♪' : '♩';   // ♫ ♪ ♩
          // 後光（にじみ）+ 音符本体
          ctx.fillStyle = 'hsla(' + p.hue + ',90%,70%,' + (nAlpha * .35).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(nx, ny, p.size * 3.4, 0, 6.29); ctx.fill();
          ctx.save();
          ctx.translate(nx, ny); ctx.rotate(Math.sin(ph * 9 + ni) * 0.35);
          ctx.fillStyle = 'hsla(' + p.hue + ',75%,88%,' + nAlpha.toFixed(3) + ')';
          ctx.fillText(glyph, 0, 0);
          ctx.restore();
        }
      } else if (p.kind === 'petals') {
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = 'hsla(' + p.hue + ',80%,80%,' + fade + ')';
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * .55, 0, 0, 6.29); ctx.fill();
      }
      ctx.restore();
      alive.push(p);
    }
    SC._pt.parts = alive;
    if (alive.length > 0) {
      SC._pt.raf = requestAnimationFrame(tick);
    } else {
      SC._pt.raf = null;
      ctx.clearRect(0, 0, W, H);
    }
  };
  SC._pt.raf = requestAnimationFrame(tick);
};

// 4芒星（キラ型）パス
SC._ptStar = function (ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * .18, -r * .18, r, 0);
  ctx.quadraticCurveTo(r * .18, r * .18, 0, r);
  ctx.quadraticCurveTo(-r * .18, r * .18, -r, 0);
  ctx.quadraticCurveTo(-r * .18, -r * .18, 0, -r);
  ctx.closePath();
};

// ==== v0.25.14: 方向付きエフェクト（対象へ飛ぶ光弾） ====
// ターゲット指定→canvas実ピクセル座標（canvasは#appと同サイズなのでapp相対pxそのまま）
SC._fxPoint = function (target) {
  const app = document.getElementById('app');
  if (!app) return null;
  const appRect = app.getBoundingClientRect();
  if (target === 'stage') {
    // 中央ステージの演者位置（センターのシルエット）
    const c = document.querySelector('.stage-members .sm-c') || document.querySelector('.battle-center-stage');
    if (c) {
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2 - appRect.left, y: r.top + r.height / 2 - appRect.top };
    }
    return { x: appRect.width * 0.5, y: appRect.height * 0.55 };
  }
  const el = SC._fxFindTarget(target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - appRect.left, y: r.top + r.height / 2 - appRect.top };
};

// src→dstへの直線ビーム+波状パルス（v0.25.16: ユーザーFB「直線かつ波状攻撃」・原作参照）
// 1本のビーム線（フェードイン/アウト）に沿ってパルス光が複数波連続で走る
SC.fxEmitStream = function (src, dst, opts) {
  opts = opts || {};
  const cv = SC._ptCanvas();
  if (!cv) return;
  const scH = cv.height / 720;
  SC._pt.parts.push({
    kind: 'beam', t: 0, delay: 0,
    x: src.x, y: src.y, x2: dst.x, y2: dst.y,
    vx: 0, vy: 0,
    size: 3 * scH,
    pulses: Math.min(opts.n ? Math.ceil(opts.n / 3) : 4, 6),   // 波の数
    hue: opts.hue !== undefined ? opts.hue : 320,
    life: 0.42,
  });
  SC._ptRun();
};

// src→dstへ音符が波状に流れる（v0.25.17: ユーザー指定「Pアイドルの攻撃は音符の波のイメージ」）
// アイドルのアピール専用。審査員リアクションは従来のfxEmitStream（レーザー）のまま
SC.fxEmitNotes = function (src, dst, opts) {
  opts = opts || {};
  const cv = SC._ptCanvas();
  if (!cv) return;
  const scH = cv.height / 720;
  SC._pt.parts.push({
    kind: 'notes', t: 0, delay: 0,
    x: src.x, y: src.y, x2: dst.x, y2: dst.y,
    vx: 0, vy: 0,
    size: 3 * scH,
    notes: Math.min(opts.n ? Math.ceil(opts.n / 2) : 5, 8),   // 音符の数
    hue: opts.hue !== undefined ? opts.hue : 320,
    life: 0.55,
  });
  SC._ptRun();
};
