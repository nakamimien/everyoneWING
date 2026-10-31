// ゲーム状態・乱数・セーブロード・共通ヘルパー
window.SC = window.SC || {};

SC.SAVE_KEY = 'sc_wing_local_v3';
// v0.25.31: アイドル名の自由入力が空のときの表示名（SC.IDOL.name）。判定用の SC.IDOL.realName はカードの実名のまま
SC.DEFAULT_IDOL_NAME = 'ゲスト';
SC.CHEAT_SETTINGS_KEY = 'sc_wing_cheat_v1';

// チート設定を localStorage に保存
SC.saveCheatSettings = function (settings) {
  try { localStorage.setItem(SC.CHEAT_SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
};

// チート設定を localStorage から復元
SC.loadCheatSettings = function () {
  try {
    const raw = localStorage.getItem(SC.CHEAT_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
};

// ---- v0.25.26: 会話パターン（性格）。編成画面のアイドルカスタマイズから選択・ブラウザ内保存 ----
// cute=かわいい系（デフォルト・従来のセリフをそのまま採用）／cool=クール系／genki=元気系
// produce.js(doTouch)・ui.js(renderMorning/renderHome)の両方から参照するためロジック層(state.js)に配置
SC.idolPersonality = function () {
  try { return localStorage.getItem('sc_idol_personality') || 'cute'; } catch (e) { return 'cute'; }
};
SC.setIdolPersonality = function (key) {
  try { localStorage.setItem('sc_idol_personality', key); } catch (e) {}
};
// 性格別セリフ集（オリジナル文）。react=朝コミュ反応／promiseReply=約束打診への即答／promiseResult=約束週終了後の守った/破った反応／
//   idleLow・idleHigh=ホーム待機（思い出Lv3未満/以上）／touch=ふれあい
SC.PERSONALITY_TEXT = {
  cute: {
    react: { perfect: 'うんっ、今日もがんばれそうです！', good: 'ふふ、ありがとうございます。ちょっと元気が出ました', normal: 'は、はい……そうですね？' },
    promiseReply: { ok: 'はいっ、約束ですよ！ 楽しみにしてますね', ng: 'そうですよね……お仕事優先、わかりました' },
    promiseResult: { kept: '約束、覚えててくれたんですね。……えへへ、嬉しいです！', broken: '……このあいだの約束、できませんでしたね……。次は、お願いしますね？' },
    idleLow: ['あ、プロデューサーさん。今日は何をしますか？', 'えっと……レッスン、頑張りますね', '少しずつですけど、前に進めてる気がします'],
    idleHigh: ['プロデューサーさん！ 今日も一緒に頑張りましょうっ', 'ふふ、なんだか最近、調子いいんです', 'ここまで来られたのは、プロデューサーさんのおかげです'],
    touch: ['来てくれたんですね、えへへ', '次のお仕事、楽しみです！', 'ちょっとだけ、眠いかも……', 'レッスンの成果、見ててくださいね', '今日もよろしくお願いします！'],
  },
  cool: {
    react: { perfect: 'ん……そうですね。今日も、やれそうです', good: '……ありがとうございます。少し楽になりました', normal: '……そう、ですか' },
    promiseReply: { ok: 'わかりました。約束、忘れないでくださいね', ng: '……そうですか。仕方ないですね、わかりました' },
    promiseResult: { kept: '約束、覚えていてくれたんですね。……ありがとうございます', broken: '……先日の約束の件、気にしていません。仕方ない事情もありますから' },
    idleLow: ['プロデューサー。今日の予定は？', 'レッスン……こなしておきます', '着実に、進んでいるとは思います'],
    idleHigh: ['プロデューサー、今日も付き合ってもらいます', '最近、少し調子が上がってきた気がします', 'ここまで来られたのは……あなたのおかげ、ですね'],
    touch: ['……何か用ですか？', '次の予定、把握してますよ', '少し、疲れてるかもしれません', '成果は、見ればわかるはずです', '今日も、よろしくお願いします'],
  },
  genki: {
    react: { perfect: 'はいっ！ 今日も全力でいきます！！', good: 'ありがとうございますっ、元気出ました！', normal: 'えっ、あ、はいっ！ が、頑張ります！' },
    promiseReply: { ok: 'やった、約束ですねっ！ めちゃくちゃ楽しみです！！', ng: 'えー、残念……！ でも大丈夫、また今度ですねっ' },
    promiseResult: { kept: 'わー、約束覚えててくれたんですねっ！ すっごく嬉しいです！！', broken: 'えっ、あ……このあいだの約束……。ま、まあ次頑張りましょう！' },
    idleLow: ['あっ、プロデューサーさん！ 今日は何します！？', 'レッスン、気合入れて頑張りますっ！', '少しずつだけど、前に進んでる感じします！'],
    idleHigh: ['プロデューサーさん！ 今日も全開でいきましょう！！', 'なんか最近、調子いい気がするんですよねー！', 'ここまで来れたの、プロデューサーさんのおかげです！ ありがとうございます！'],
    touch: ['おおっ、来てくれたんですねー！', '次のお仕事、楽しみすぎます！！', 'ちょっと眠いけど、まだまだ元気です！', 'レッスンの成果、絶対見ててくださいね！', '今日もよろしくお願いしまーす！'],
  },
};
SC.personalityText = function () {
  return SC.PERSONALITY_TEXT[SC.idolPersonality()] || SC.PERSONALITY_TEXT.cute;
};

SC.state = null;

SC.ATTRS = ['vo', 'da', 'vi'];
SC.ATTR_LABEL = { vo: 'Vo', da: 'Da', vi: 'Vi', me: 'Me', ex: 'Ex' };   // ex=Excellentアピール（審査員属性参照）
// v0.25.41: 属性→配色クラス。手札オーブ・スキル履歴・発動中パッシブのアイコン（本編・シミュ共用）の色は、この戻り値の CSS クラス（style.css の .ac-*）だけで決める。
//   attrs = 属性の配列（['vo'] / ['vo','da','vi'] など）または単一属性の文字列。Vo=赤 / Da=青 / Vi=黄 / Excellent(ex)=白〜銀 /
//   複合=含まれる属性の混合（vo→da→vi の順に正規化: ac-vo-da / ac-vo-vi / ac-da-vi / ac-vo-da-vi）。ex を含むなら ex 優先（審査員属性参照の全属性扱い）。
//   Vo/Da/Vi/ex のどれも含まない（バフ属性なし・不明）= ac-none（グレー）。回復札・効果札・思い出は呼び出し側の専用クラス（c-heal / c-effect 等）
SC.attrColorClass = function (attrs) {
  const list = Array.isArray(attrs) ? attrs : (attrs ? [attrs] : []);
  if (list.indexOf('ex') >= 0) return 'ac-ex';
  const have = SC.ATTRS.filter(function (a) { return list.indexOf(a) >= 0; });
  return have.length === 0 ? 'ac-none' : 'ac-' + have.join('-');
};
SC.TREND_PATTERNS = [
  ['vo', 'da', 'vi'], ['vo', 'vi', 'da'], ['da', 'vo', 'vi'],
  ['da', 'vi', 'vo'], ['vi', 'vo', 'da'], ['vi', 'da', 'vo']
];

// ---- 乱数（mulberry32・シード式） ----
SC.rand = function () {
  let a = (SC.state.rngState + 0x6D2B79F5) >>> 0;
  SC.state.rngState = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
SC.randInt = function (min, max) { return Math.floor(SC.rand() * (max - min + 1)) + min; };
SC.chance = function (p) { return SC.rand() < p; };
SC.shuffle = function (arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(SC.rand() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
};
SC.pick = function (arr) { return arr[SC.randInt(0, arr.length - 1)]; };

// ---- 新規ゲーム ----
// mode: 0=ビギナー 1=ミドル 2=マスター
// loadout: produceItemsのkey配列（最大2）。開始時ボーナスとして適用
SC.newGame = function (seed, mode, loadout, options) {
  const s = (seed === undefined || seed === null || seed === '')
    ? (Date.now() & 0xffffffff) : (Number(seed) >>> 0);
  SC.state = {
    seed: s, rngState: s >>> 0,
    mode: (mode === undefined) ? 1 : mode,
    week: 1,                        // 通算週 1..32
    stats: { vo: SC.IDOL.initial.vo, da: SC.IDOL.initial.da, vi: SC.IDOL.initial.vi },
    statCap: { vo: SC.CONFIG.statCap, da: SC.CONFIG.statCap, vi: SC.CONFIG.statCap },
    mental: SC.IDOL.initial.me,
    sp: SC.IDOL.initial.sp,
    stamina: SC.CONFIG.stamina.max,
    tension: (options && options.cheatHighTension) ? 100 : SC.CONFIG.tension.init, // 内部値0-100（v0.25.44: ハイテンションモードは最高から）
    love: 0,                         // 親愛度0-150
    fans: 0,
    morningCount: 0,
    promise: null,                   // { facility, deadlineWeek }
    kizuna: SC.SUPPORTS.map(function (s2) { return s2.kizuna + (s2.kizunaBonus || 0); }), // [仮データ] アイドルの絆スキル分を加算
    guestKizuna: SC.GUEST.kizuna,
    facilityLv: { lessonVo: 1, lessonDa: 1, lessonVi: 1, radio: 1, talk: 1, magazine: 1 },
    placement: null,                 // 今週のサポ配置 { facilityKey: [supportIdx|-1(guest)] }
    pSkills: SC.IDOL.initialSkills.map(function (sk) { return Object.assign({}, sk); }),
    panelOpened: [],
    seasonTrends: null,              // 今シーズン8週分の流行パターン
    trend: null,                     // 今週の流行 ['vo','da','vi']
    eventWeek: false,                // 強化週間（期間限定オデ解放）
    limitedCleared: [],              // クリア済み期間限定オデid
    weekEvents: null,                // 今週の朝コミュ/約束情報（UI用）
    loadout: loadout ? loadout.slice() : [],  // 持ち込みアイテム（ホーム表示用）
    touchedWeek: 0,                  // タッチコミュを行った週（週1回制限）
    passiveRemoved: [],              // 削除済みパッシブ（'p'=Pアイドル / 数値=サポidx）
    preTalk: null,                   // オデ前会話 { defId, choices, correct }
    screen: 'home',
    lastResult: null,
    audition: null,
    finalsStage: null,               // null / 'semi' / 'final'
    ending: null,
    pendingLoss: null,               // コンティニュー待ち { stage }
    continueTickets: SC.CONFIG.continueTicketInit,  // コンティニューチケット
    autoMeter: false,                // アピールメーター自動判定
    cheatStats: (options && options.cheatStats) || null,  // チート初期ステ { vo, da, vi, me, sp } | null
    commsOff: !!(options && options.commsOff),            // コミュOFF（朝コミュ・約束・オデ前会話を発生させない）
    cheatAllPanels: !!(options && options.cheatAllPanels), // v0.10: スキルパネル全習得済みで開始
    showTimer: !!(options && options.showTimer),           // v0.25.6: タイマー常時表示（チートとは別枠）
    cheatMemLv: SC.normCheatMemLv(options && options.cheatMemLv),   // v0.25.44: 思い出Lv固定 1..6 | null（null=通常＝親愛度で上がる）
    cheatHighTension: !!(options && options.cheatHighTension),      // v0.25.44: ハイテンションモード（常にテンション最高・DOWNの影響なし）
    startedAt: Date.now(),          // v0.10.1: プロデュース開始時刻（壁時計ms）。旧セーブはnull→タイム非表示
    showFormationPop: false,        // v0.17: 編成確認ポップアップ表示フラグ
    showItemPop: false              // v0.17: アイテム持込ポップアップ表示フラグ
  };

  // 持ち込みアイテムボーナス（開始時に適用。statCap超過は気にしない）
  if (Array.isArray(loadout)) {
    const st = SC.state;
    loadout.forEach(function (key) {
      const item = SC.CONFIG.produceItems.find(function (p) { return p.key === key; });
      if (!item) return;
      if (item.stat) {
        if (item.stat === 'me') st.mental += item.v;
        else st.stats[item.stat] += item.v;
      }
      if (item.sp) st.sp += item.sp;
    });
  }

  // チート初期ステ適用（setup画面で入力した値で上書き）
  if (SC.state.cheatStats) {
    const cs = SC.state.cheatStats;
    if (cs.vo) SC.state.stats.vo = cs.vo;
    if (cs.da) SC.state.stats.da = cs.da;
    if (cs.vi) SC.state.stats.vi = cs.vi;
    if (cs.me) SC.state.mental = cs.me;
    if (cs.sp) SC.state.sp = cs.sp;
    // v0.15a: チート時は statCap をチートステ入力値以上に自動引き上げ（青天井）
    // 非チート時は初期 statCap=500 のまま変えない
    SC.ATTRS.forEach(function (at) {
      if (cs[at] && cs[at] > SC.state.statCap[at]) {
        SC.state.statCap[at] = cs[at];
      }
    });
  }

  // v0.10: cheatAllPanels: rawパネル以外の全パネルを開放（cap/stat即適用）
  // ※ applyLoadout/buildLoadoutPanels は呼び出し元(main.js)の restoreLoadout が先に実行済み
  if (SC.state.cheatAllPanels) {
    SC.applyCheatAllPanels();
  }

  SC.rollSeasonTrends();
  SC.applyTrendForWeek();
  SC.rollPlacement();
  SC.rollExcellent();
  SC.rollMorning();
  SC.rollSupportEvent();
  // 朝コミュ強制化: rollMorning後に初期画面を決定（morning未済なら'morning'、なければ'home'）
  SC.state.screen = SC.weekStartScreen();
  SC.save();
};

// ---- 流行（wiki: 各シーズン1-6週目に6パターン全部、7-8週目はランダムで相互に異なる） ----
// v0.25.37: 1シーズン分（8週）の流行パターン番号の列を返す純関数（先頭6要素=6パターンの順列・7週目は任意・8週目は7週目と異なる）。
//   rollSeasonTrends の中身をそのまま切り出したもの（乱数の呼び出し順は不変＝同じシードなら従来と同じ列）。シミュの「230万周回」(sim.js)も同じ法則の列を生成するために使う
SC.genSeasonTrends = function () {
  const perms = SC.shuffle([0, 1, 2, 3, 4, 5]);
  const w7 = SC.randInt(0, 5);
  let w8 = SC.randInt(0, 4);
  if (w8 >= w7) w8++;
  return perms.concat([w7, w8]);
};
SC.rollSeasonTrends = function () {
  SC.state.seasonTrends = SC.genSeasonTrends();
};
SC.applyTrendForWeek = function () {
  const st = SC.state;
  st.trend = SC.TREND_PATTERNS[st.seasonTrends[SC.weekInSeason() - 1]].slice();
};
// 本戦用（準決勝と決勝は必ず異なるパターン）
SC.rollFinalsTrends = function () {
  const a = SC.randInt(0, 5);
  let b = SC.randInt(0, 4);
  if (b >= a) b++;
  SC.state.finalsTrends = [a, b];
};
SC.trendRank = function (attr) { return SC.state.trend.indexOf(attr); };

// ---- サポ配置（毎週6施設にランダム。ゲスト含む5人） ----
SC.rollPlacement = function () {
  const keys = Object.keys(SC.CONFIG.facilities);
  const p = {};
  keys.forEach(function (k) { p[k] = []; });
  // v0.25.17: 滞在マスタリー（raw「◯◯レッスン滞在率がUP」・116件）: 対象レッスンの抽選重みを2倍[仮データ]
  const STAY_FACILITY = { 'ボーカル滞在マスタリー': 'lessonVo', 'ダンス滞在マスタリー': 'lessonDa', 'ビジュアル滞在マスタリー': 'lessonVi' };
  const pickFor = function (sup) {
    let stayKey = null;
    if (sup && sup.supportSkills) {
      sup.supportSkills.some(function (sk) {
        stayKey = STAY_FACILITY[sk.name] || null;
        return !!stayKey;
      });
    }
    // 対象施設を候補に1枠追加して抽選（=対象の重み2倍[仮データ]）
    return stayKey ? SC.pick(keys.concat([stayKey])) : SC.pick(keys);
  };
  for (let i = 0; i < SC.SUPPORTS.length; i++) p[pickFor(SC.SUPPORTS[i])].push(i);
  p[pickFor(SC.GUEST)].push(-1);  // ゲスト
  SC.state.placement = p;
};

// ---- 朝コミュ・約束（週初め） ----
SC.rollMorning = function () {
  const st = SC.state;
  const C = SC.CONFIG;
  st.weekEvents = { morning: null, promiseOffer: null };
  // コミュOFF時は朝コミュ・約束を一切発生させない
  if (st.commsOff) return;
  // v0.25.5【wiki仕様考察】: 朝コミュは15種・親愛度34/67で5個ずつ解放・同一コミュは1プロデュース1回
  // → 発生上限を親愛度段階で 5/10/15 に制限（低親愛度だと5回で打ち止め）
  const loveCap = st.love >= 67 ? 15 : (st.love >= 34 ? 10 : 5);
  const morningCap = Math.min(C.morning.maxCount, loveCap);
  // v0.25.13: プロデュース最初の週（シーズン1・残り8週）には朝コミュは発生しない（ユーザー確認仕様）
  if (st.week <= 1) return;
  if (st.morningCount < morningCap && SC.chance(C.morning.rate)) {
    st.morningCount++;
    // 選択肢3つ（1つがPerfect、他はGood/なし）[推測]
    // v0.25.6: textSet=選択肢文言セット番号（仮置き3セット・ui.jsのMORNING_TEXTS対応）
    const kinds = SC.shuffle(['perfect', 'good', 'none']);
    st.weekEvents.morning = { choices: kinds, done: false, textSet: SC.randInt(0, 2) };
    if (!st.promise && SC.chance(C.promise.rate)) {
      // 約束対象はレッスン3種+お休み（ユーザー確認仕様・rec4実測）
      const lessonKeys = ['lessonVo', 'lessonDa', 'lessonVi', 'rest'];
      // 今週(+0)/来週(+1)/2週後(+2) をランダム指定
      // v0.25.14: 約束はシーズンを跨がない（ユーザー確認仕様: 2週後=残り3週以上・来週=残り2週以上の時のみ）
      const weeksLeftS = C.WEEKS_PER_SEASON - ((st.week - 1) % C.WEEKS_PER_SEASON);
      const maxOffset = weeksLeftS >= 3 ? 2 : (weeksLeftS >= 2 ? 1 : 0);
      const offset = SC.randInt(0, maxOffset);
      const targetWeek = st.week + offset;
      const weekLabel = ['今週', '来週', '2週後'][offset];
      st.weekEvents.promiseOffer = {
        facility: SC.pick(lessonKeys),
        targetWeek: targetWeek,
        weekLabel: weekLabel
      };
    }
  }
};

// ---- セーブ・ロード ----
SC.save = function () {
  // v0.25.28: シミュレーション中は本編セーブへ一切書かない（newGame内のsaveも含めて完全停止）
  if (SC._simActive) return;
  if (!SC.state) return;
  // v0.25.14: エンディング到達後はセーブしない（プロデュース終了=リセット。ユーザー指定）
  if (SC.state.ending) return;
  // v0.25.41: プロデュース未開始（起動時にセーブ無しで作った仮の新規ゲーム）は保存しない。setup-start（resetGame）で始めた状態から保存する。
  //   従来はこの仮状態が保存され、次回起動で「プロデュース途中」と判定→WINGで編成画面を飛ばしてホームに入っていた（ユーザー報告: 終了後にリロードするとWINGに入る）
  if (SC.state._notStarted) return;
  // v0.25.41: タイトル表示中は保存しない（起動時に screen を 'title' にした状態を上書き保存すると、本来の画面が失われるため）
  if (SC.state.screen === 'title') return;
  try { localStorage.setItem(SC.SAVE_KEY, JSON.stringify(SC.state)); } catch (e) {}
};
SC.load = function () {
  try {
    const raw = localStorage.getItem(SC.SAVE_KEY);
    if (!raw) return false;
    SC.state = JSON.parse(raw);
    SC.migrate();
    return true;
  } catch (e) { return false; }
};

// 旧バージョンのセーブに後付けフィールドを補完（v0.2セーブ→v0.4コードでも動くように）
SC.migrate = function () {
  const st = SC.state;
  // 旧セーブの items/charmActive は無害なので削除しない（放置）
  if (st.touchedWeek === undefined) st.touchedWeek = 0;
  if (!st.passiveRemoved) st.passiveRemoved = [];
  if (st.preTalk === undefined) st.preTalk = null;
  if (!st.weekEvents) st.weekEvents = { morning: null, promiseOffer: null };
  if (!Array.isArray(st.loadout)) st.loadout = [];
  // 進行不能画面（旧コードで保存されたpreTalk等）はホームに戻す
  if (st.screen === 'preTalk' && !st.preTalk) st.screen = 'home';
  // setup画面は一時状態のため（旧コードで保存されていた場合）ホームに戻す
  if (st.screen === 'setup') st.screen = 'home';
  // コンティニューチケット（旧セーブに未定義の場合は初期値を補完）
  if (st.continueTickets === undefined) st.continueTickets = SC.CONFIG.continueTicketInit;
  // panelOpened 内の存在しないパネルキーを除去（旧セーブとの互換）
  if (Array.isArray(st.panelOpened)) {
    st.panelOpened = st.panelOpened.filter(function (k) { return !!SC.CONFIG.panel[k]; });
  }
  if (st.cheatStats === undefined) st.cheatStats = null;
  if (st.commsOff === undefined) st.commsOff = false;
  // v0.10: その場結果表示 - 直近1件のアクション結果を保持（リロード後も表示）
  if (st.lastActionPopup === undefined) st.lastActionPopup = null;
  // v0.10: cheatAllPanels フラグ（スキルパネル全習得済みで開始）
  if (st.cheatAllPanels === undefined) st.cheatAllPanels = false;
  // v0.25.44: 思い出Lv固定・ハイテンションモード（旧セーブ=通常）
  st.cheatMemLv = SC.normCheatMemLv(st.cheatMemLv);
  if (st.cheatHighTension === undefined) st.cheatHighTension = false;
  // v0.10.1: 開始時刻（旧セーブはnull→タイム非表示）
  if (st.startedAt === undefined) st.startedAt = null;
  // v0.17: ポップアップフラグ（旧セーブ互換）
  if (st.showFormationPop === undefined) st.showFormationPop = false;
  if (st.showItemPop === undefined) st.showItemPop = false;
  // v0.18: 振り返り表示モード（'list' | 'map'）デフォルトはリスト
  if (st.reviewViewMode === undefined) st.reviewViewMode = 'list';
  // v0.19: 審査員の蓄積式化（旧セーブに hp/hpMax が残っている場合、gained/need に変換）
  // audition が進行中のセーブのみ対象
  if (st.audition && Array.isArray(st.audition.judges)) {
    st.audition.judges.forEach(function (j) {
      if (j.hp !== undefined && j.need === undefined) {
        // 旧セーブ: hp=残量, hpMax=必要量 → gained=hpMax-hp, need=hpMax
        const hpMax = j.hpMax || j.hp || 1;
        j.need = hpMax;
        j.gained = Math.max(0, hpMax - (j.hp || 0));
        delete j.hp;
        delete j.hpMax;
      }
    });
  }
};
SC.resetGame = function (seed, mode, loadout, options) {
  try { localStorage.removeItem(SC.SAVE_KEY); } catch (e) {}
  SC.newGame(seed, mode, loadout, options);
};

// ---- v0.10: スキルパネル全習得済み適用（cheatAllPanels=true 時） ----
// rawパネルを除いた全パネルを panelOpened に追加。cap/stat/passive 系を即時反映。
// ライブスキル（type:'live'）と heal スキルは習得済みプールに入れるのみ（4枠制限は維持）
SC.applyCheatAllPanels = function () {
  const st = SC.state;
  const P = SC.CONFIG.panel;
  Object.keys(P).forEach(function (key) {
    const p = P[key];
    // rawパネルはスキップ（習得不可）
    if (p.type === 'raw') return;
    // 既に習得済みならスキップ
    if (st.panelOpened.indexOf(key) >= 0) return;
    // 全パネルを開放
    st.panelOpened.push(key);
    // cap パネルは上限UP即時適用（v0.13a: attrs 配列対応）
    if (p.type === 'cap' && p.add) {
      const capAttrs = p.attrs || (p.attr ? [p.attr] : []);
      capAttrs.forEach(function (at) {
        st.statCap[at] = (st.statCap[at] || SC.CONFIG.statCap) + p.add;
      });
    }
    // stat パネルは即時ステ加算
    if (p.type === 'stat') {
      if (p.attr) SC.addStat(p.attr, p.add);
      if (p.spGain) st.sp += p.spGain;
    }
  });
  // v0.22: cheatAllPanels 時の自動装備優先順
  // 優先順: Pカードのスキル → ゲストのスキル → サポ1〜4のスキル
  // 同一アイドル（owner）内はSPコストの重い順
  // v0.25.36: 効果札（effectOnly＝非アピールのライブスキル）も候補に入れる（最後尾）。旧形式の回復パネル（heal10 等の heal のみ）は従来どおり除外
  const livePanelKeys = Object.keys(P).filter(function (key) {
    const p2 = P[key];
    return p2.type === 'live' && (!p2.heal || p2.effectOnly === true);
  });
  // v0.18.1 バグ1修正: 実カードパネル（cp_p_始まりキーのみ）を優先、汎用パネル（pSolo等）は除外
  // 実カードが設定されている場合は cp_* 動的パネルのみを対象とし、静的汎用パネルは除外する
  const hasDynPanels = livePanelKeys.some(function (k) { return k.indexOf('cp_') === 0; });
  // Pカード由来: cp_p_ 始まり。SP重い順
  const pLivePanels = livePanelKeys.filter(function (key) {
    return key.indexOf('cp_p_') === 0;
  }).sort(function (a2, b2) {
    return (P[b2].sp || 0) - (P[a2].sp || 0); // SPコスト重い順
  });
  // ゲスト由来: cp_guest_ 始まり。SP重い順
  const guestLivePanels = livePanelKeys.filter(function (key) {
    return key.indexOf('cp_guest_') === 0;
  }).sort(function (a2, b2) {
    return (P[b2].sp || 0) - (P[a2].sp || 0);
  });
  // サポ由来: cp_s（P/ゲスト以外の cp_）またはhasDynPanelsでないなら静的パネルも含む。SP重い順
  const sLivePanels = livePanelKeys.filter(function (key) {
    if (key.indexOf('cp_p_') === 0) return false;     // Pカード除く
    if (key.indexOf('cp_guest_') === 0) return false; // ゲスト除く
    if (hasDynPanels && key.indexOf('cp_') !== 0) return false; // 動的パネルある場合は静的除外
    return true;
  }).sort(function (a2, b2) {
    return (P[b2].sp || 0) - (P[a2].sp || 0); // SPコスト重い順
  });
  // 4枠を Pカード → ゲスト → サポ の順で埋める
  // v0.18.1 バグ3修正: 同名スキルはwiki仕様「1つしか覚えられない」に従いスキップ
  st.pSkills = [null, null, null, null];
  const rawCandidates = pLivePanels.concat(guestLivePanels).concat(sLivePanels);
  // v0.25.34: 全体アピール（パネルの allJudges ＝ effect.allAudience 由来）を先に、それ以外を後に並べる（安定。
  //   各グループ内は従来の P→ゲスト→サポ・SP重い順のまま）。従来は P枠が全体札でなくても先に埋まり、強い全体札が漏れた
  const isAllAudience = function (k) { return !!(P[k] && (P[k].allJudges === true || (P[k].effect && P[k].effect.allAudience === true))); };
  // v0.25.36: 優先順は「全体アピール札 > 単体アピール札 > 効果札」（効果札は最後。各グループ内は従来の P→ゲスト→サポ・SP重い順のまま）
  //   v0.25.43: ただし全体札でも倍率が SC.CONFIG.audition.autoEquipAllMultMax(1.5) 以下のものは「取らない」扱い＝単体アピール札の後ろ・効果札の前（他の札で4枠が埋まれば入らない）。
  //     ユーザー指定「自動取得は全体札優先だが、そらカラフルの1.5倍全体は取らない方がデフォルト（2.5全体は取る）」。倍率は mult（可変倍率『最大N倍』は panelDef.mult＝最大倍率）
  //     本編のチート全習得の自動装備とシミュの「自動」枠はこの1関数を通る（シミュも newGame の cheatAllPanels 経由）
  const isEffectOnlyKey = function (k) { return !!(P[k] && P[k].effectOnly === true); };
  //   本体判断: 付随効果（extra。PLUS条件節・(Link)節を含む）に追加の「N倍アピール」を持つ札は対象外（例: 恋鐘「思いがけず、ジェラシー」無印＝全観客にVo1倍＋
  //     [アンティーカ全員参加]全観客にVo2.5倍。PLUS成立で実質3.5倍の全体札なので、本体倍率だけで後回しにしない）
  const hasExtraAppeal = function (k) { return (P[k].extra || []).some(function (x) { return /倍アピール/.test(String(x)); }); };
  const isLowAllAudience = function (k) { return isAllAudience(k) && isFinite(P[k].mult) && P[k].mult <= SC.CONFIG.audition.autoEquipAllMultMax + 1e-9 && !hasExtraAppeal(k); };
  const candidates = rawCandidates.filter(function (k) { return !isEffectOnlyKey(k) && isAllAudience(k) && !isLowAllAudience(k); })
    .concat(rawCandidates.filter(function (k) { return !isEffectOnlyKey(k) && !isAllAudience(k); }))
    .concat(rawCandidates.filter(function (k) { return !isEffectOnlyKey(k) && isLowAllAudience(k); }))
    .concat(rawCandidates.filter(isEffectOnlyKey));
  let slotIdx = 0;
  for (let li = 0; li < candidates.length && slotIdx < 4; li++) {
    const lkey = candidates[li];
    const lp = P[lkey];
    if (!lp) continue;
    // 同名重複チェック（wiki仕様: 同じ名前のライブスキルは違うアイドルでも1個まで）
    if (lp.name && st.pSkills.some(function (sk) { return sk && sk.name === lp.name; })) continue;
    st.pSkills[slotIdx] = SC.panelToSkill(lp);
    slotIdx++;
  }
  // 4枠未満の場合は残りを IDOL.initialSkills で補完
  if (slotIdx < 4) {
    const initSkills = SC.IDOL.initialSkills || [];
    for (let ii = 0; ii < initSkills.length && slotIdx < 4; ii++) {
      st.pSkills[slotIdx] = Object.assign({}, initSkills[ii]);
      slotIdx++;
    }
  }
  // cheatAllPanels 時: ライブスキル/healパネルは習得済みプールとして振り返り画面でSP0装備可能
  // （4枠初期ライブスキルはそのまま。振り返りから選んで上書きする方式）
  st.cheatAllPanels = true;
};

// ---- 共通ヘルパー ----
SC.seasonIndex = function () {
  return Math.min(3, Math.floor((SC.state.week - 1) / SC.CONFIG.WEEKS_PER_SEASON));
};
SC.weekInSeason = function () {
  return ((SC.state.week - 1) % SC.CONFIG.WEEKS_PER_SEASON) + 1;
};
SC.weeksLeftInSeason = function () {
  return SC.CONFIG.WEEKS_PER_SEASON - SC.weekInSeason() + 1;
};
// 経過週W（S1W1=0..S4最終=31、準決勝32、決勝33）
SC.elapsedWeeks = function () {
  if (SC.state.finalsStage === 'semi') return 32;
  if (SC.state.finalsStage === 'final') return 33;
  return SC.state.week - 1;
};
SC.rankOf = function (fans) {
  const r = SC.CONFIG.ranks;
  let cur = r[0];
  for (let i = 0; i < r.length; i++) if (fans >= r[i].fans) cur = r[i];
  return cur.key;
};
SC.rankIndex = function (key) {
  return SC.CONFIG.ranks.findIndex(function (r) { return r.key === key; });
};
// ステータス値のランク文字（動画実測準拠の100刻み[推測]）
SC.statRank = function (v) {
  const r = SC.CONFIG.statRanks;
  let cur = r[0].key;
  for (let i = 0; i < r.length; i++) if (v >= r[i].min) cur = r[i].key;
  return cur;
};
SC.tensionFace = function () {
  const f = SC.CONFIG.tension.faces;
  let cur = f[0];
  for (let i = 0; i < f.length; i++) if (SC.state.tension >= f[i].min) cur = f[i];
  return cur;
};
SC.tensionIdx = function () { return SC.CONFIG.tension.faces.indexOf(SC.tensionFace()); };
SC.addTension = function (v) {
  // v0.25.44: ハイテンションモード（チート）中は常に最高のまま（トラブル・約束を破る・オデ前のバッド等のDOWNを受けない）
  if (SC.state.cheatHighTension) { SC.state.tension = 100; return; }
  SC.state.tension = Math.max(0, Math.min(100, SC.state.tension + v));
};
SC.addStamina = function (v) {
  SC.state.stamina = Math.max(0, Math.min(SC.CONFIG.stamina.max, SC.state.stamina + v));
};
SC.addLove = function (v) {
  // 親愛度は150まで上昇可（思い出LvだけレアリティでCap）wiki
  const lvBefore = SC.memoryLv();
  SC.state.love = Math.max(0, Math.min(150, SC.state.love + v));
  // v0.25.4: 思い出Lvアップ検出（週イベントとして演出表示→表示後にクリア）
  if (SC.state.weekEvents && SC.memoryLv() > lvBefore) {
    SC.state.weekEvents.memLvUp = SC.memoryLv();
  }
};
SC.addStat = function (attr, v) {
  const st = SC.state;
  if (attr === 'me') { st.mental = Math.max(1, st.mental + v); return; }
  st.stats[attr] = Math.max(1, Math.min(st.statCap[attr], st.stats[attr] + v));
};
// v0.25.44: チート「思い出Lv固定」で選べる上限（ユーザー指定: 1〜5・P-URは6まで・P-Rは3まで＝通常のレアリティ上限 memoryLvCap と同じ）
SC.cheatMemLvMax = function () {
  const cap = SC.CONFIG.memoryLvCap[SC.IDOL && SC.IDOL.rarity];
  return cap === undefined ? 5 : cap;
};
// 入力（文字列/数値/null）→ 1..6 の整数 | null（null=通常）
SC.normCheatMemLv = function (v) {
  const n = parseInt(v, 10);
  return (isFinite(n) && n >= 1 && n <= 6) ? n : null;
};
// 思い出アピールLv（親愛度→Lv、レアリティ上限）
SC.memoryLv = function () {
  // v0.25.44: チートの思い出Lv固定は親愛度より優先（上限はレアリティ別 SC.cheatMemLvMax に丸める）
  const fixed = SC.state ? SC.normCheatMemLv(SC.state.cheatMemLv) : null;
  if (fixed) return Math.min(fixed, SC.cheatMemLvMax());
  const t = SC.CONFIG.memoryLvTable;
  let lv = 0;
  for (let i = 0; i < t.length; i++) if (SC.state.love >= t[i]) lv = i;
  const cap = SC.CONFIG.memoryLvCap[SC.IDOL.rarity];
  return Math.min(lv, cap === undefined ? 6 : cap);
};
// トラブル率（0-1）: ROUNDUP(((基準-体力)/10)^3)% 上限99
SC.troubleRate = function (kind) {
  const base = SC.CONFIG.stamina.troubleBase[kind === 'lesson' ? 'lesson' : kind];
  const st = SC.state.stamina;
  if (st >= base) return 0;
  const pct = Math.ceil(Math.pow((base - st) / 10, 3));
  return Math.min(99, pct) / 100;
};
SC.fmt = function (n) { return Number(n).toLocaleString('ja-JP'); };

// ---- v0.20a: パネル定義 → pSkills エントリ変換ヘルパー ----
// 全プロパティを Object.assign でコピーし、パネル管理専用フィールドを除去して返す。
// 今後スキルプロパティが増えても落ちないよう、手書きコピーを廃止して本関数に統一する。
// v0.25.36: 回復札・効果札の判定（審査員選択不要・アピール予測なし・×倍率非表示・シミュの「ダメージなし」表示・1〆の候補外）。
//   回復札=heal を持つ札（旧形式 {name, heal} を含む）／効果札=effectOnly（非アピールのライブスキル。回復を伴うものは heal も持つ）。
//   「回復そのもの」（回復量の表示・回復回数）は引き続き c.heal を見ること
SC.isEffectOnlyCard = function (c) { return !!(c && (c.heal || c.effectOnly)); };

SC.panelToSkill = function (p) {
  if (!p) return null;
  // heal 専用形式（旧来の回復スキル。{name, heal} だけを返す）。v0.25.36: 効果札（effectOnly）は heal を持っていても
  //   下の汎用コピーを通す（extra・effectRaw・randomEffects・memGaugePct 等、使用時に必要なものを落とさない）
  if (p.heal && !p.effectOnly) {
    return { name: p.name, heal: p.heal };
  }
  // ライブスキル形式: パネル管理フィールドを除いた全プロパティをコピー
  const sk = Object.assign({}, p);
  // パネル管理専用フィールドを削除（pSkills には不要）
  delete sk.type;
  delete sk.sp;
  delete sk.owner;
  delete sk._isDynamic;
  delete sk._desc;
  delete sk._cond;
  delete sk._prob;
  delete sk._buffAttr;
  delete sk._buffPct;
  delete sk._buffTurns;
  delete sk._cutPct;
  delete sk._avoidPct;
  delete sk._upPct;
  delete sk._influencePct;
  delete sk._attentionPct;
  delete sk._mult;
  delete sk._turns;
  delete sk._effectKind;
  delete sk._rawCond;
  delete sk._rawProb;
  delete sk._rawMax;
  // v0.25.35: randomEffects（ランダム効果付与の候補）は削除対象に入れない＝Object.assign で札にそのまま運ばれる（applyExtraEffects が参照）
  return sk;
};

// ---- v0.25.29: アイドル短縮名（サポ札の名前バッジ・シミュのダメージ表ラベル用） ----
// idolNo→短縮名（SC.IDOL_SHORT_NAME・config.js）。無い番号は SC.CARDS.idols のフルネームで代替。何も無ければ ''
SC.idolShortName = function (no) {
  if (no === undefined || no === null || no === '') return '';
  const key = String(no);
  if (SC.IDOL_SHORT_NAME && SC.IDOL_SHORT_NAME[key]) return SC.IDOL_SHORT_NAME[key];
  const full = SC.CARDS && SC.CARDS.idols && SC.CARDS.idols[key];
  return (full && full.name) ? full.name : '';
};
// 山札カードの持ち主名（サポ札=サポ番号owner(数値)のみ。P札・ゲスト・生成札は ''）。_idolNo が無い仮データ枠は _idolName で代替
SC.supportOwnerShortName = function (owner) {
  if (typeof owner !== 'number') return '';
  const sup = SC.SUPPORTS && SC.SUPPORTS[owner];
  if (!sup) return '';
  return SC.idolShortName(sup._idolNo) || sup._idolName || '';
};

// ---- v0.25.29: ホームの⚙オプションからのチート設定（即時反映） ----
// 演出カット/タイマーは次回のプロデュース設定画面の初期値にもなるよう SC.saveCheatSettings にマージ保存する
SC._mergeCheatSettings = function (patch) {
  const cur = SC.loadCheatSettings() || {};
  const merged = {
    cheatStats: cur.cheatStats || null, commsOff: !!cur.commsOff,
    cheatAllPanels: !!cur.cheatAllPanels, showTimer: !!cur.showTimer,
    cheatMemLv: SC.normCheatMemLv(cur.cheatMemLv), cheatHighTension: !!cur.cheatHighTension   // v0.25.44
  };
  Object.keys(patch).forEach(function (k) { merged[k] = patch[k]; });
  SC.saveCheatSettings(merged);
};
// key: 'commsOff' | 'showTimer' | 'cheatAllPanels' | 'cheatHighTension'。cheatAllPanels は ON にした時だけ実行（元に戻せない）
SC.applyOptionCheat = function (key, on) {
  const st = SC.state;
  if (!st) return;
  on = !!on;
  if (key === 'commsOff') {
    st.commsOff = on;
    SC._mergeCheatSettings({ commsOff: on });
  } else if (key === 'cheatHighTension') {
    // v0.25.44: ON=その場でテンション最高にして固定。OFF=今の値（最高）から通常どおり増減
    st.cheatHighTension = on;
    if (on) st.tension = 100;
    SC._mergeCheatSettings({ cheatHighTension: on });
  } else if (key === 'showTimer') {
    st.showTimer = on;
    if (on && !st.startedAt) st.startedAt = Date.now();   // 旧セーブ等で開始時刻が無ければ今から計測
    SC._mergeCheatSettings({ showTimer: on });
  } else if (key === 'cheatAllPanels') {
    if (!on || st.cheatAllPanels) return;   // OFFへは戻せない・ON済みなら何もしない
    SC.applyCheatAllPanels();
  } else return;
  SC.save();
};
// v0.25.44: ⚙オプションの思い出Lv固定（v: ''=通常 / '1'..'6'）。次回のプロデュース設定画面の初期値にもマージ保存
SC.applyOptionMemLv = function (v) {
  const st = SC.state;
  if (!st) return;
  st.cheatMemLv = SC.normCheatMemLv(v);
  SC._mergeCheatSettings({ cheatMemLv: st.cheatMemLv });
  SC.save();
};
// vals: { vo, da, vi, me, sp }（文字列/数値。空・NaN・1未満[SPのみ0可]は無視）。statCap を超える値は statCap を引き上げる
// （SC.newGame の cheatStats と同じ扱い）。上限は入力欄と同じ 9999。戻り値: 反映したキー配列
SC.applyOptionStats = function (vals) {
  const st = SC.state;
  const done = [];
  if (!st || !vals) return done;
  const parse = function (v, minV) {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseInt(v, 10);
    if (!isFinite(n) || n < minV) return null;
    return Math.min(9999, n);
  };
  SC.ATTRS.forEach(function (at) {
    const n = parse(vals[at], 1);
    if (n === null) return;
    st.stats[at] = n;
    if (n > st.statCap[at]) st.statCap[at] = n;
    done.push(at);
  });
  const me = parse(vals.me, 1);
  if (me !== null) { st.mental = me; done.push('me'); }
  const sp = parse(vals.sp, 0);
  if (sp !== null) { st.sp = sp; done.push('sp'); }
  if (done.length) SC.save();
  return done;
};
