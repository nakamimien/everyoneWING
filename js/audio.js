// サウンドモジュール（SE合成 + ファイル差し替え + BGM + 音量設定）
// - WebAudio API 非対応環境・Node.js でも読み込みエラーにならない（全APIがno-op）
// - AudioContext はファイル読み込み時点では生成しない（初回ユーザー操作時に遅延生成）
window.SC = window.SC || {};

(function (SC) {

  // ---- 内部状態 ----
  var _ctx = null;          // AudioContext（遅延生成）
  var _unlocked = false;    // unlock() 済みフラグ
  var _seFailCache = {};    // ファイル読み込み失敗したSE名（セッション中は合成にフォールバック）
  var _seAudioCache = {};   // 読み込み成功したAudioオブジェクトのキャッシュ
  var _bgmEl = null;        // 現在再生中のBGM HTMLAudioElement
  var _bgmScene = null;     // 現在再生中のシーン名
  var _bgmFading = false;   // フェードアウト中フラグ

  // ---- 設定 ----
  // localStorage から復元（try/catch で安全に）
  // v0.25.8: 合成BGM実装に伴い bgmOn 初期値を true に（ユーザー要望）
  var _defaultConfig = { seVol: 0.5, bgmVol: 0.4, seOn: true, bgmOn: true };
  var _config = (function () {
    try {
      var saved = localStorage.getItem('sc_audio');
      if (saved) {
        var parsed = JSON.parse(saved);
        return {
          seVol:  typeof parsed.seVol  === 'number'  ? parsed.seVol  : _defaultConfig.seVol,
          bgmVol: typeof parsed.bgmVol === 'number'  ? parsed.bgmVol : _defaultConfig.bgmVol,
          seOn:   typeof parsed.seOn   === 'boolean' ? parsed.seOn   : _defaultConfig.seOn,
          bgmOn:  typeof parsed.bgmOn  === 'boolean' ? parsed.bgmOn  : _defaultConfig.bgmOn
        };
      }
    } catch (e) {}
    return { seVol: _defaultConfig.seVol, bgmVol: _defaultConfig.bgmVol,
             seOn: _defaultConfig.seOn, bgmOn: _defaultConfig.bgmOn };
  })();

  function _saveConfig() {
    try { localStorage.setItem('sc_audio', JSON.stringify(_config)); } catch (e) {}
  }

  // ---- AudioContext 取得（遅延生成） ----
  function _getCtx() {
    if (_ctx) return _ctx;
    var Ctor = (typeof AudioContext !== 'undefined') ? AudioContext
             : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext
             : null;
    if (!Ctor) return null;
    try { _ctx = new Ctor(); } catch (e) { return null; }
    return _ctx;
  }

  // ---- SE合成再生（seVol 乗算）----
  // WebAudio の GainNode は ctx.destination を直結するため、
  // seVol は各プリセットのゲイン値に直接乗算して反映する。
  function _playSynthVol(name) {
    var ctx = _getCtx();
    if (!ctx) return;
    var fn = function () { _runPreset(name, ctx, _config.seVol); };
    if (ctx.state === 'suspended') {
      ctx.resume().then(fn).catch(function () {});
    } else {
      fn();
    }
  }

  function _runPreset(name, ctx, vol) {
    var t = ctx.currentTime;
    switch (name) {

      // 軽いクリック音：高めのサイン波ポップ（40ms）
      case 'tap': {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.04);
        gain.gain.setValueAtTime(0.4 * vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.06);
        break;
      }

      // 決定音：2音上昇（ピロッ）
      case 'decide': {
        [0, 0.08].forEach(function (delay, i) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(i === 0 ? 660 : 880, t + delay);
          gain.gain.setValueAtTime(0.0, t + delay);
          gain.gain.linearRampToValueAtTime(0.5 * vol, t + delay + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(t + delay); osc.stop(t + delay + 0.15);
        });
        break;
      }

      // メーター停止音：短いティック
      case 'meter': {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, t);
        gain.gain.setValueAtTime(0.15 * vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.04);
        break;
      }

      // v0.25.13: レッスン/お仕事の成功音（明るい上昇アルペジオ・ユーザー指定「嬉しい音」）
      case 'success': {
        [523, 659, 784, 1047].forEach(function (freq, i) {
          var delay = i * 0.07;
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t + delay);
          gain.gain.setValueAtTime(0.0, t + delay);
          gain.gain.linearRampToValueAtTime(0.38 * vol, t + delay + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.28);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(t + delay); osc.stop(t + delay + 0.32);
        });
        break;
      }

      // v0.25.13: トラブル音（下降マイナー2音・ユーザー指定「悲しい音」）
      case 'fail': {
        [392, 311].forEach(function (freq, i) {
          var delay = i * 0.18;
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + delay);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.94, t + delay + 0.3);
          gain.gain.setValueAtTime(0.0, t + delay);
          gain.gain.linearRampToValueAtTime(0.4 * vol, t + delay + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.42);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(t + delay); osc.stop(t + delay + 0.48);
        });
        break;
      }

      // パーフェクト判定：明るい3和音キラッ（C5-E5-G5）
      case 'perfect': {
        [523, 659, 784].forEach(function (freq, i) {
          var delay = i * 0.04;
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + delay);
          gain.gain.setValueAtTime(0.0, t + delay);
          gain.gain.linearRampToValueAtTime(0.4 * vol, t + delay + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.3);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(t + delay); osc.stop(t + delay + 0.35);
        });
        break;
      }

      // アピール発動：シュイン系スイープアップ
      case 'appeal': {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.35 * vol, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.35);
        break;
      }

      // v0.25.18: スキルパネル取得：キラリン（高音2音+倍音のきらめき。ユーザー指定「キラリンみたいなやつ」）
      case 'kirarin': {
        [[1568, 0], [2093, 0.07], [3136, 0.07]].forEach(function (fd) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(fd[0], t + fd[1]);
          gain.gain.setValueAtTime(0.0, t + fd[1]);
          gain.gain.linearRampToValueAtTime((fd[0] > 3000 ? 0.12 : 0.3) * vol, t + fd[1] + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.001, t + fd[1] + 0.5);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(t + fd[1]); osc.stop(t + fd[1] + 0.55);
        });
        break;
      }

      // ★獲得：キラキラ高音アルペジオ（C6-E6-G6-C7）
      case 'star': {
        [1047, 1319, 1568, 2093].forEach(function (freq, i) {
          var delay = i * 0.055;
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + delay);
          gain.gain.setValueAtTime(0.0, t + delay);
          gain.gain.linearRampToValueAtTime(0.35 * vol, t + delay + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.25);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(t + delay); osc.stop(t + delay + 0.3);
        });
        break;
      }

      // 審査員満足：ファンファーレ風2和音（G4 + D5）
      case 'satisfied': {
        var oscBase = ctx.createOscillator();
        var gainBase = ctx.createGain();
        oscBase.type = 'triangle';
        oscBase.frequency.setValueAtTime(392, t);       // G4
        gainBase.gain.setValueAtTime(0.0, t);
        gainBase.gain.linearRampToValueAtTime(0.4 * vol, t + 0.02);
        gainBase.gain.setValueAtTime(0.4 * vol, t + 0.15);
        gainBase.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        oscBase.connect(gainBase); gainBase.connect(ctx.destination);
        oscBase.start(t); oscBase.stop(t + 0.5);

        var oscHigh = ctx.createOscillator();
        var gainHigh = ctx.createGain();
        oscHigh.type = 'sine';
        oscHigh.frequency.setValueAtTime(587, t + 0.08); // D5
        gainHigh.gain.setValueAtTime(0.0, t + 0.08);
        gainHigh.gain.linearRampToValueAtTime(0.35 * vol, t + 0.12);
        gainHigh.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        oscHigh.connect(gainHigh); gainHigh.connect(ctx.destination);
        oscHigh.start(t + 0.08); oscHigh.stop(t + 0.5);
        break;
      }

      // v0.25.21: 被弾（自機がリアクションを受けた時。低域のドスッ+うめき風の短い下降音）
      case 'hit': {
        var oscTh = ctx.createOscillator();
        var gainTh = ctx.createGain();
        oscTh.type = 'square';
        oscTh.frequency.setValueAtTime(220, t);
        oscTh.frequency.exponentialRampToValueAtTime(70, t + 0.12);
        gainTh.gain.setValueAtTime(0.0, t);
        gainTh.gain.linearRampToValueAtTime(0.42 * vol, t + 0.008);
        gainTh.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        oscTh.connect(gainTh); gainTh.connect(ctx.destination);
        oscTh.start(t); oscTh.stop(t + 0.2);
        var oscVo = ctx.createOscillator();
        var gainVo = ctx.createGain();
        oscVo.type = 'triangle';
        oscVo.frequency.setValueAtTime(440, t + 0.02);
        oscVo.frequency.exponentialRampToValueAtTime(250, t + 0.16);
        gainVo.gain.setValueAtTime(0.0, t + 0.02);
        gainVo.gain.linearRampToValueAtTime(0.22 * vol, t + 0.04);
        gainVo.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        oscVo.connect(gainVo); gainVo.connect(ctx.destination);
        oscVo.start(t + 0.02); oscVo.stop(t + 0.26);
        break;
      }

      // 警告/バッド：低い濁った音（サウトゥース 110→80Hz）
      case 'warning': {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.5 * vol, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.3);
        break;
      }

      default:
        break;
    }
  }

  // SEプリセット名一覧（se() のガードに使用）
  // v0.25.21: hit追加 + kirarin追加（ガード漏れでパネル習得SEが鳴っていなかったバグ修正）
  var _seNames = { tap:1, decide:1, meter:1, perfect:1, appeal:1, star:1, satisfied:1, warning:1, success:1, fail:1, kirarin:1, hit:1 };

  // ---- v0.25.8: 合成BGM（完全オリジナルの簡素なコードループ。ファイルがあればそちら優先） ----
  // ありふれたコード進行のアルペジオ+ベースのみ（作曲は本ツール独自。既存楽曲の再現ではない）
  var _synthTimer = null;
  var _synthScene = null;
  var _synthNextTime = 0;
  var _synthStep = 0;
  var _synthGain = null;

  // シーン別定義: chords=1小節ごとのコード（MIDIノート）、wave=アルペジオ音色、vol=基準音量
  // v0.25.13: シーン毎に arp（音型パターン）を持たせ「同じ曲のテンポ違い」を解消（ユーザーFB）
  //   arp: 8ステップの音型。0-2=コード構成音 / 3-5=同+1オクターブ / null=休符
  //   stac=音長係数（小=スタッカート） / roll=ドラムロール風
  var _BGM_DEFS = {
    // ②-1 ホーム: ゆったり分散和音（従来の雰囲気）
    home:           { bpm: 92,  wave: 'sine',     vol: 0.16, arp: [0, 1, 2, 1, 0, 2, 1, 2],
                      chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]] },
    // ②-2 本戦前: 低音の鼓動パルス（緊迫）
    home_tense:     { bpm: 100, wave: 'triangle', vol: 0.15, arp: [0, null, 0, null, 0, null, 1, null], stac: 0.45,
                      chords: [[45, 48, 52], [45, 48, 52], [41, 44, 48], [43, 47, 50]] },
    // ① 編成/設定: 跳ねるスタッカート
    unit:           { bpm: 108, wave: 'triangle', vol: 0.15, arp: [0, null, 3, null, 1, null, 4, 2], stac: 0.45,
                      chords: [[53, 57, 60], [60, 64, 67], [55, 59, 62], [60, 64, 67]] },
    // スキルパネル: まばら・静か
    review:         { bpm: 70,  wave: 'sine',     vol: 0.12, arp: [0, null, null, null, 2, null, 1, null], stac: 1.4,
                      chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]] },
    // ③ オデ前: サスペンデッドの小走りパルス（準備）
    prepare:        { bpm: 116, wave: 'triangle', vol: 0.12, arp: [0, 0, null, 1, 0, 0, null, 2], stac: 0.5,
                      chords: [[55, 60, 62], [53, 58, 60], [57, 62, 64], [55, 60, 62]] },
    // ④-1 オデ中: 疾走ベースライン+オクターブ跳躍
    audition:       { bpm: 132, wave: 'square',   vol: 0.09, arp: [0, 3, 1, 3, 2, 3, 1, 3], stac: 0.6,
                      chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [52, 55, 59]] },
    // ④-2 決勝: さらに速く・広い跳躍・上昇進行
    audition_final: { bpm: 148, wave: 'square',   vol: 0.10, arp: [0, 3, 5, 3, 1, 4, 2, 5], stac: 0.55,
                      chords: [[50, 53, 57], [52, 55, 59], [53, 57, 60], [55, 59, 62]] },
    // ⑤-1 結果発表: ドラムロール風（低音16分連打）
    reveal:         { bpm: 160, wave: 'square',   vol: 0.10, roll: true, note: 45 },
    // ⑤-2 合格: 上昇ファンファーレ
    result_pass:    { bpm: 124, wave: 'triangle', vol: 0.15, arp: [0, 1, 2, 3, 4, 5, 3, 4],
                      chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [55, 59, 62]] },
    // ⑤-3 不合格: 下降・まばら・短調
    result_fail:    { bpm: 60,  wave: 'sine',     vol: 0.12, arp: [2, null, 1, null, 0, null, null, null], stac: 1.6,
                      chords: [[57, 60, 64], [52, 55, 59], [53, 57, 60], [52, 55, 59]] },
    // ⑥ エンディング: 王道進行をゆったり歌わせる（感動系）
    grand:          { bpm: 78,  wave: 'sine',     vol: 0.16, arp: [0, null, 1, 2, 3, null, 2, 1], stac: 1.5,
                      chords: [[53, 57, 60], [55, 59, 62], [60, 64, 67], [57, 60, 64]] },
  };

  function _midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function _synthNote(ctx, wave, midi, t, dur, vel) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(_midiHz(midi), t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(_synthGain);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function _synthStop() {
    if (_synthTimer) { clearInterval(_synthTimer); _synthTimer = null; }
    _synthScene = null;
    if (_synthGain) { try { _synthGain.disconnect(); } catch (e) {} _synthGain = null; }
  }

  function _synthStart(scene) {
    var def = _BGM_DEFS[scene];
    var ctx = _getCtx();
    if (!def || !ctx) return;
    _synthStop();
    _synthScene = scene;
    _synthGain = ctx.createGain();
    _synthGain.gain.value = _config.bgmVol * def.vol * 2;   // bgmVol 0.5 で def.vol 相当
    _synthGain.connect(ctx.destination);
    var stepDur = (60 / def.bpm) / 2;   // 8分音符
    var stepsPerChord = 8;               // 1小節
    // v0.25.13: シーン固有の音型（0-2=構成音/3-5=+1oct/null=休符）
    var arpPattern = def.arp || [0, 1, 2, 1, 0, 2, 1, 2];
    var stac = def.stac || 0.9;
    _synthStep = 0;
    _synthNextTime = ctx.currentTime + 0.1;
    // 先読みスケジューラ（250ms毎に0.6秒先までノートを予約）
    _synthTimer = setInterval(function () {
      if (!_config.bgmOn || !_synthGain) return;
      while (_synthNextTime < ctx.currentTime + 0.6) {
        if (def.roll) {
          // v0.25.12: ドラムロール風（16分の低音連打・強弱交互）
          var rollDur = (60 / def.bpm) / 4;
          _synthNote(ctx, def.wave, def.note, _synthNextTime, rollDur * 0.8, _synthStep % 2 ? 0.35 : 0.55);
          _synthNextTime += rollDur;
          _synthStep++;
          continue;
        }
        var chord = def.chords[Math.floor(_synthStep / stepsPerChord) % def.chords.length];
        var inStep = _synthStep % stepsPerChord;
        var pick = arpPattern[inStep % arpPattern.length];
        if (pick !== null && pick !== undefined) {
          var midi = chord[pick % 3] + (pick >= 3 ? 12 : 0);
          _synthNote(ctx, def.wave, midi + 12, _synthNextTime, stepDur * stac, 0.5);
        }
        if (inStep === 0) {
          _synthNote(ctx, 'triangle', chord[0] - 12, _synthNextTime, stepDur * stepsPerChord * 0.95, 0.55);
        }
        _synthNextTime += stepDur;
        _synthStep++;
      }
    }, 250);
  }

  // ---- BGMフェードアウト（内部） ----
  function _bgmFadeOut(el, duration, onDone) {
    if (!el) { if (onDone) onDone(); return; }
    _bgmFading = true;
    var startVol = el.volume;
    var startTime = Date.now();
    var tick = function () {
      var elapsed = (Date.now() - startTime) / 1000;
      var ratio = elapsed / duration;
      if (ratio >= 1) {
        el.volume = 0;
        el.pause();
        _bgmFading = false;
        if (onDone) onDone();
        return;
      }
      el.volume = startVol * (1 - ratio);
      requestAnimationFrame(tick);
    };
    // requestAnimationFrame は Node では未定義なのでガード
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(tick);
    } else {
      el.pause();
      _bgmFading = false;
      if (onDone) onDone();
    }
  }

  // ===========================================================
  // 公開API
  // ===========================================================
  SC.audio = {

    // 設定オブジェクト（外部から直接参照可能）
    config: _config,

    // ---- SC.audio.unlock() ----
    // 初回ユーザー操作で呼ぶ。AudioContext 生成 + resume。
    unlock: function () {
      if (_unlocked) return;
      _unlocked = true;
      var ctx = _getCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(function () {});
      }
    },

    // ---- SC.audio.se(name) ----
    // SE を再生。seOn=false なら何もしない。
    // ファイル audio/se/{name}.mp3 があればそちらを優先、失敗なら合成にフォールバック。
    // 一度失敗した name はセッション中キャッシュして以後即合成（404を毎回踏まない）。
    se: function (name) {
      if (!_config.seOn) return;
      if (!name || !_seNames[name]) return;

      // ファイル差し替え：失敗済みでなければ試みる
      if (!_seFailCache[name]) {
        var src = 'audio/se/' + name + '.mp3';

        // キャッシュ済みAudioを再使用
        if (_seAudioCache[name]) {
          var cached = _seAudioCache[name];
          try {
            cached.currentTime = 0;
            cached.volume = _config.seVol;
            cached.play().catch(function () {});
          } catch (e) {}
          return;
        }

        // 初回試行：new Audio で読み込む
        try {
          var audio = new Audio(src);
          audio.volume = _config.seVol;
          var played = false;
          audio.addEventListener('canplaythrough', function () {
            if (!played) {
              played = true;
              _seAudioCache[name] = audio;
              audio.play().catch(function () {});
            }
          });
          audio.addEventListener('error', function () {
            _seFailCache[name] = true;
            _playSynthVol(name);
          });
          // タイムアウト：一定時間読めなければ合成にフォールバック
          setTimeout(function () {
            if (!played && !_seFailCache[name]) {
              _seFailCache[name] = true;
              _playSynthVol(name);
            }
          }, 2000);
          return;
        } catch (e) {
          // Audio コンストラクタが無い環境（node等）→ 即失敗キャッシュ
          _seFailCache[name] = true;
        }
      }

      // 合成再生
      _playSynthVol(name);
    },

    // ---- SC.audio.bgm(scene) ----
    // BGMをループ再生。bgmOn=false なら何もしない。
    // v0.25.8: audio/bgm/{scene}.mp3 がなければ合成BGM（簡素なオリジナルループ）にフォールバック。
    // 同じシーンの再指定はno-op。シーン切替時はフェードアウト(0.5s)→切替。
    // シーン名: 'home' / 'unit'（編成・設定） / 'review'（スキルパネル） / 'audition'
    bgm: function (scene) {
      if (!_config.bgmOn) return;
      if (!scene) return;
      if (_bgmScene === scene && _bgmEl && !_bgmEl.paused) return; // 同シーンno-op（ファイル再生中）
      if (_synthScene === scene && !_bgmEl) return;                // 同シーンno-op（合成再生中）

      var src = 'audio/bgm/' + scene + '.mp3';
      var startNew = function () {
        _bgmEl = null;
        _bgmScene = null;
        try {
          var el = new Audio(src);
          el.loop = true;
          el.volume = _config.bgmVol;
          el.addEventListener('error', function () {
            // ファイルなし → 合成BGMにフォールバック（v0.25.8）
            _bgmEl = null;
            _bgmScene = null;
            _synthStart(scene);
          });
          el.play().then(function () {
            _synthStop();   // ファイルが再生できた → 合成停止
            _bgmEl = el;
            _bgmScene = scene;
          }).catch(function () {
            // autoplay 制限等 → 合成にフォールバック（AudioContext側はunlock後に鳴り始める）
            _bgmEl = null;
            _bgmScene = null;
            _synthStart(scene);
          });
        } catch (e) {
          // Audio 未対応環境 → 合成を試みる
          _synthStart(scene);
        }
      };

      if (_bgmEl && !_bgmFading) {
        // フェードアウト → 切替
        var old = _bgmEl;
        _bgmEl = null;
        _bgmScene = null;
        _bgmFadeOut(old, 0.5, startNew);
      } else {
        startNew();
      }
    },

    // ---- SC.audio.bgmStop() ----
    // BGMをフェードアウト(0.5s)して停止（合成も停止）。
    bgmStop: function () {
      _synthStop();
      if (_bgmEl) {
        var old = _bgmEl;
        _bgmEl = null;
        _bgmScene = null;
        _bgmFadeOut(old, 0.5, null);
      }
    },

    // ---- SC.audio.setConfig(partial) ----
    // 設定を部分更新してlocalStorageに保存。BGM音量は再生中のelementに即反映。
    setConfig: function (partial) {
      if (!partial) return;
      if (typeof partial.seVol  === 'number')  _config.seVol  = partial.seVol;
      if (typeof partial.bgmVol === 'number')  _config.bgmVol = partial.bgmVol;
      if (typeof partial.seOn   === 'boolean') _config.seOn   = partial.seOn;
      if (typeof partial.bgmOn  === 'boolean') _config.bgmOn  = partial.bgmOn;
      // 再生中BGMの音量に即反映
      if (_bgmEl) {
        try { _bgmEl.volume = _config.bgmVol; } catch (e) {}
      }
      // v0.25.8: 合成BGMにも即反映
      if (_synthGain && _synthScene && _BGM_DEFS[_synthScene]) {
        try { _synthGain.gain.value = _config.bgmVol * _BGM_DEFS[_synthScene].vol * 2; } catch (e) {}
      }
      _saveConfig();
    }
  };

  // ---- v0.25.11: ブラウザ非フォーカス時はBGM停止（ユーザー指定: バックグラウンド再生なし） ----
  // タブ切替(visibilitychange)とウィンドウのフォーカス喪失(blur)の両方を拾う。
  // 復帰時は自動再開（一時停止していた場合のみ）。SEは単発なので対象外。
  var _pausedByBlur = false;
  function _onFocusChange() {
    var hidden = (typeof document !== 'undefined' && document.hidden) ||
                 (typeof document !== 'undefined' && typeof document.hasFocus === 'function' && !document.hasFocus());
    if (hidden) {
      var paused = false;
      if (_bgmEl && !_bgmEl.paused) {
        try { _bgmEl.pause(); paused = true; } catch (e) {}
      }
      if (_ctx && _ctx.state === 'running') {
        try { _ctx.suspend(); paused = true; } catch (e) {}
      }
      if (paused) _pausedByBlur = true;
    } else if (_pausedByBlur) {
      _pausedByBlur = false;
      if (_bgmEl && _config.bgmOn) {
        try { _bgmEl.play().catch(function () {}); } catch (e) {}
      }
      if (_ctx && _ctx.state === 'suspended' && _unlocked) {
        try { _ctx.resume(); } catch (e) {}
      }
    }
  }
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.addEventListener) {
    document.addEventListener('visibilitychange', _onFocusChange);
    window.addEventListener('blur', _onFocusChange);
    window.addEventListener('focus', _onFocusChange);
  }

})(window.SC);
