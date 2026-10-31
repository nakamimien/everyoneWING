// シミュレーション（ダメージ計算機）ロジック層
// v0.25.28: 新規。編成・ステ・週・バフ等の入力から「各スキル札×各審査員の与ダメージ」と
//   「審査員が満足して帰宅するか」を返す。DOMに触らない（nodeで動く＝smoke.jsで検証可能）。
// 計算式は再実装しない。SC.appealPredict / SC.memoryPredict（=SC.playerMemoryValue＋思い出の付随/LINK効果の追加アピール。audition.js）をそのまま呼ぶ（二重実装禁止）。
// シミュ中は SC._simActive=true で SC.save() を止め、本編セーブ（SAVE_KEY）・本編編成（LOADOUT_KEY）に一切書かない。
window.SC = window.SC || {};

SC.SIM_KEY = 'sc_sim_v1';
SC._simActive = false;     // true の間は SC.save() が何もしない（state.js）
SC._simInputs = null;      // 現在の入力（UI/simBuild/simCompute で共有）

// 判定係数: audition.js execPlayerAction の coefTable / memGood=1.5・memBad=0.5 と同値（式そのものは再実装しない）
SC.SIM_COEF = { perfect: 1.5, good: 1.1, normal: 1.0, bad: 0.5 };
SC.SIM_MEM_COEF = { good: 1.5, bad: 0.5 };
SC.SIM_JUDGE_LABEL = { perfect: 'Perfect', good: 'Good', normal: 'Normal', bad: 'Bad' };
SC.SIM_MEM_LABEL = { good: 'Good', bad: 'Bad' };

// v0.25.31: 旧固定おまかせ編成（SIM_FIXED_LOADOUT）は撤去。おまかせ編成は SC.OMAKASE_LOADOUTS（config.js・アイドル番号→{src,p,supports,guest}）を参照する。
//   シミュの既定編成は「全枠未選択」（Pアイドルと週を選ぶまで計算しない）。

// 整数に丸めて [min,max] にクランプ。不正値（NaN/空/非数）は def（NaNガード）
SC._simNum = function (v, def, min, max) {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return def;
  const n = Number(v);
  if (!isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
};

// 週の選択肢（S1残り8週 … S4残り1週 / W.I.N.G.準決勝 / 決勝）。week = (シーズン-1)*8 + (9 - 残り週)
SC.simWeekOptions = function () {
  const per = (SC.CONFIG && SC.CONFIG.WEEKS_PER_SEASON) || 8;
  const out = [];
  for (let s = 1; s <= 4; s++) {
    for (let left = per; left >= 1; left--) {
      out.push({ key: 's' + s + 'w' + left, label: 'S' + s + '残り' + left + '週', week: (s - 1) * per + (per + 1 - left) });
    }
  }
  out.push({ key: 'semi', label: 'W.I.N.G.準決勝', finals: 'semi' });
  out.push({ key: 'final', label: 'W.I.N.G.決勝', finals: 'final' });
  return out;
};

// 選べる通常オーディション（準決勝/決勝は週で自動決定されるので除く）
SC.simAuditionOptions = function () {
  return SC.AUDITIONS.filter(function (a) { return a.season !== 'semi' && a.season !== 'final'; });
};

// v0.25.34: 流行セレクトの選択肢（SC.TREND_PATTERNS と同じ並び: Vo>Da>Vi, Vo>Vi>Da, Da>Vo>Vi, Da>Vi>Vo, Vi>Vo>Da, Vi>Da>Vo）
SC.simTrendOptions = function () {
  return SC.TREND_PATTERNS.map(function (pat, i) {
    return { v: i, label: pat.map(function (at) { return SC.ATTR_LABEL[at]; }).join('>') };
  });
};

// v0.25.29: 週キー（'s3w7'）→ { season:1..4, left:残り週 }。準決勝/決勝/不正は null
SC.simParseWeekKey = function (weekKey) {
  const m = /^s([1-4])w([1-8])$/.exec(String(weekKey));
  return m ? { season: Number(m[1]), left: Number(m[2]) } : null;
};
// v0.25.29: 週ごとの既定オーディション（ユーザー指定・改変禁止）
//   S1=ichiban / S2=yuugata / S3 残り8週=spotlight・残り7〜1週=odotte / S4 残り8週=legend・残り7〜5週=nanairo・残り4〜1週=utahime
//   準決勝/決勝はオーディション欄が無効（週から自動決定）なので従来の既定 utahime を置く（表示用・実際は使われない）
SC.simDefaultAuditionForWeek = function (weekKey) {
  const w = SC.simParseWeekKey(weekKey);
  if (!w) return 'utahime';
  if (w.season === 1) return 'ichiban';
  if (w.season === 2) return 'yuugata';
  if (w.season === 3) return w.left === 8 ? 'spotlight' : 'odotte';
  return w.left === 8 ? 'legend' : (w.left >= 5 ? 'nanairo' : 'utahime');
};
// v0.25.29: その週のシーズンのオーディション（def.season === シーズン番号-1。期間限定も含む）。
//   準決勝/決勝はオーディション欄が無効なので S4 の一覧を返す（無効表示のselectに有効な選択肢を残すため）
SC.simAuditionOptionsForWeek = function (weekKey) {
  const w = SC.simParseWeekKey(weekKey);
  const idx = w ? w.season - 1 : 3;
  return SC.simAuditionOptions().filter(function (a) { return a.season === idx; });
};

// 編成の正規化: 各枠は「有効なカードID（P枠=Pカード・他=Sカード）」か null（未選択）。v0.25.31: 固定編成での穴埋めは廃止
SC._simSafeLoadout = function (lo) {
  const ok = function (id, type) { const c = id ? SC.findCard(id) : null; return !!c && c.type === type; };
  lo = (lo && typeof lo === 'object') ? lo : {};
  const sup = Array.isArray(lo.supports) ? lo.supports : [];
  return {
    p: ok(lo.p, 'P') ? lo.p : null,
    supports: [0, 1, 2, 3].map(function (i) { return ok(sup[i], 'S') ? sup[i] : null; }),
    guest: ok(lo.guest, 'S') ? lo.guest : null
  };
};
// v0.25.31: 空のサポート枠＝「なし」（ステ0・山札に入らない・パッシブなし）／空のゲスト＝ゲストなし
SC.simEmptySupport = function () {
  return { name: 'なし', attr: 'vo', rarity: 'R', stats: { vo: 0, da: 0, vi: 0, me: 0 }, skill: null, kizuna: 0, kizunaBonus: 0,
    supportSkills: [], passive: null, _empty: true };
};
SC.simEmptyGuest = function () {
  return { name: 'なし', attr: 'vo', rarity: 'R', stats: { vo: 0, da: 0, vi: 0, me: 0 }, kizuna: 0, supportSkills: [], _empty: true };
};
// サポ枠 i の基礎ステ/EX込み合計（未選択枠は全0。EXも無視）。表示（入力パネル）と simBuild で共用
SC.simSupportStats = function (inp, i) {
  const id = inp.loadout.supports[i];
  const c = id ? SC.findCard(id) : null;
  const b0 = (c && SC.cardStats(c)) || null;
  if (!b0) return { base: { vo: 0, da: 0, vi: 0, me: 0 }, tot: { vo: 0, da: 0, vi: 0, me: 0 } };
  const base = { vo: b0.vo || 0, da: b0.da || 0, vi: b0.vi || 0, me: b0.me || 0 };
  const ex = inp.ex[i] || { vo: 0, da: 0, vi: 0 };
  return { base: base, tot: { vo: base.vo + ex.vo, da: base.da + ex.da, vi: base.vi + ex.vi, me: base.me } };
};
// v0.25.39: ゲスト枠の基礎ステ/EX込み合計（未選択ゲストは全0）。表示（入力パネルのゲスト行）専用。
//   ゲストのステータスはアピール値に反映しない（wiki「Sはサポートアイドルのうちゲストを除いた4人の該当ステ合計」＝SC.playerAppealValue は SC.SUPPORTS のみ合算）。
//   そのため simBuild はゲストのEXを SC.SUPPORTS にも SC.GUEST.stats にも入れない（計算・1〆・230万に一切影響しない）
SC.simGuestStats = function (inp) {
  const id = inp.loadout.guest;
  const c = id ? SC.findCard(id) : null;
  const b0 = (c && SC.cardStats(c)) || null;
  if (!b0) return { base: { vo: 0, da: 0, vi: 0, me: 0 }, tot: { vo: 0, da: 0, vi: 0, me: 0 } };
  const base = { vo: b0.vo || 0, da: b0.da || 0, vi: b0.vi || 0, me: b0.me || 0 };
  const ex = inp.exGuest || { vo: 0, da: 0, vi: 0 };
  return { base: base, tot: { vo: base.vo + ex.vo, da: base.da + ex.da, vi: base.vi + ex.vi, me: base.me } };
};
// 計算できる状態か（Pアイドルと週が選択済み）
SC.simReady = function (inp) { return !!(inp && inp.loadout && inp.loadout.p && inp.weekKey); };

// v0.25.31: 既定値（初回起動時・「クリア」ボタンとも同じ）
//   編成=全枠未選択／週=未選択／難易度=ミドル／思い出Lv=1／ターン数=1／判定=Perfect／思い出判定=Good／Vo1000・Da1000・Vi1000・Me300／EX=0／
//   バフ指定=保有パッシブ／保有パッシブ=なし／発動中パッシブ=なし／手動バフ=0／選択札=なし
SC.simDefaultInputs = function () {
  return {
    loadout: { p: null, supports: [null, null, null, null], guest: null },
    stats: { vo: 1000, da: 1000, vi: 1000, me: 300 },
    ex: [0, 1, 2, 3].map(function () { return { vo: 0, da: 0, vi: 0 }; }),   // サポートEX（各サポのステに加算。0〜150）
    exGuest: { vo: 0, da: 0, vi: 0 },   // v0.25.39: ゲストのEX（表示と入れ替え用。アピール値・1〆・230万には反映しない。上限はサポートと同じ SC.simExMax）
    weekKey: null,             // null=未選択
    auditionId: SC.simDefaultAuditionForWeek(null),   // weekKey が未選択/semi/final の時は使われない
    mode: 1,                   // 0ビギナー/1ミドル/2マスター
    trend: 0,                  // v0.25.34: 流行（SC.TREND_PATTERNS の添字 0..5。0=Vo>Da>Vi）
    memLv: 1,                  // 0..5
    judge: 'perfect',          // perfect|good|normal|bad
    memJudge: 'good',          // good|bad（思い出リール）
    turn: 1,
    buffMode: 'passive',       // 'manual'=手動バフだけ / 'passive'=保有パッシブ（発動中）だけ（排他）
    buff: { vo: 0, da: 0, vi: 0 },   // 手動バフ%
    passiveOwned: {},          // { panelKey: true } 保有パッシブ（チェック=保有）
    passiveFired: {},          // { panelKey: true } 発動中パッシブ（ランダム発動の結果。保有のうちのもの）
    linkOn: false,
    pSkillKeys: [null, null, null, null],   // null=自動装備のまま
    selected: null             // 札 deck index / 'memory' / null（既定は未選択）
  };
};

// 入力の正規化（その場で書き換えて返す）。欠け・不正値は既定値に戻す（NaNガード）
SC.simSanitize = function (inp) {
  const d = SC.simDefaultInputs();
  const N = SC._simNum;
  inp = (inp && typeof inp === 'object') ? inp : {};
  inp.loadout = SC._simSafeLoadout(inp.loadout || d.loadout);
  const s = (inp.stats && typeof inp.stats === 'object') ? inp.stats : {};
  inp.stats = {
    vo: N(s.vo, d.stats.vo, 0, 9999), da: N(s.da, d.stats.da, 0, 9999),
    vi: N(s.vi, d.stats.vi, 0, 9999), me: N(s.me, d.stats.me, 1, 9999)
  };
  const ex = Array.isArray(inp.ex) ? inp.ex : [];
  inp.ex = [0, 1, 2, 3].map(function (i) {
    const e = (ex[i] && typeof ex[i] === 'object') ? ex[i] : {};
    const mx = SC.simExMax(inp.loadout.supports[i]);   // v0.25.33: URは200・それ以外150
    return { vo: N(e.vo, 0, 0, mx), da: N(e.da, 0, 0, mx), vi: N(e.vi, 0, 0, mx) };
  });
  // v0.25.39: ゲストのEX（旧保存データ・旧セーブスロットには無い＝0）。上限はゲストのカードに応じて SC.simExMax（URは200・それ以外150）
  const eg = (inp.exGuest && typeof inp.exGuest === 'object') ? inp.exGuest : {};
  const mxg = SC.simExMax(inp.loadout.guest);
  inp.exGuest = { vo: N(eg.vo, 0, 0, mxg), da: N(eg.da, 0, 0, mxg), vi: N(eg.vi, 0, 0, mxg) };
  inp.weekKey = SC.simWeekOptions().some(function (o) { return o.key === inp.weekKey; }) ? inp.weekKey : null;   // v0.25.31: 未選択=null
  // v0.25.29: オーディションはその週のシーズンのものだけ。シーズン外・不正値はその週の既定に戻す
  inp.auditionId = SC.simAuditionOptionsForWeek(inp.weekKey).some(function (a) { return a.id === inp.auditionId; })
    ? inp.auditionId : SC.simDefaultAuditionForWeek(inp.weekKey);
  inp.mode = N(inp.mode, d.mode, 0, 2);
  inp.trend = N(inp.trend, d.trend, 0, SC.TREND_PATTERNS.length - 1);   // v0.25.34: 流行
  inp.memLv = N(inp.memLv, d.memLv, 0, 5);
  inp.judge = (typeof inp.judge === 'string' && SC.SIM_COEF[inp.judge] !== undefined) ? inp.judge : d.judge;
  inp.memJudge = (typeof inp.memJudge === 'string' && SC.SIM_MEM_COEF[inp.memJudge] !== undefined) ? inp.memJudge : d.memJudge;
  inp.turn = N(inp.turn, d.turn, 1, 12);
  const b = (inp.buff && typeof inp.buff === 'object') ? inp.buff : {};
  inp.buff = { vo: N(b.vo, 0, -100, 999), da: N(b.da, 0, -100, 999), vi: N(b.vi, 0, -100, 999) };
  // v0.25.31: バフ指定（排他）・保有パッシブ（チェック=保有）・発動中パッシブ（保有のうち）。旧 passiveOn は読み捨て
  inp.buffMode = inp.buffMode === 'manual' ? 'manual' : 'passive';
  const own = (inp.passiveOwned && typeof inp.passiveOwned === 'object') ? inp.passiveOwned : {};
  inp.passiveOwned = {};
  Object.keys(own).forEach(function (k) { if (own[k] === true) inp.passiveOwned[k] = true; });
  const fir = (inp.passiveFired && typeof inp.passiveFired === 'object') ? inp.passiveFired : {};
  inp.passiveFired = {};
  Object.keys(fir).forEach(function (k) { if (fir[k] === true && inp.passiveOwned[k]) inp.passiveFired[k] = true; });   // 保有を外したものは発動中からも外す
  delete inp.passiveOn;
  inp.linkOn = inp.linkOn === true;
  const pk = Array.isArray(inp.pSkillKeys) ? inp.pSkillKeys : [];
  inp.pSkillKeys = [0, 1, 2, 3].map(function (i) { return (typeof pk[i] === 'string' && pk[i]) ? pk[i] : null; });
  inp.selected = (inp.selected === 'memory' || inp.selected === null) ? inp.selected : N(inp.selected, d.selected, 0, 7);
  // v0.25.30: 旧保存データに残る gained（審査員の現在興味値）・selJudge（審査員の選択）は無視して捨てる
  delete inp.gained;
  delete inp.selJudge;
  return inp;
};

// 保存値を既定値とマージして返す（localStorage 不可/壊れていれば既定値）
SC.simLoadInputs = function () {
  let saved = null;
  try {
    const raw = localStorage.getItem(SC.SIM_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (e) { saved = null; }
  return SC.simSanitize(saved);
};
SC.simSaveInputs = function (inp) {
  try { localStorage.setItem(SC.SIM_KEY, JSON.stringify(inp)); } catch (e) {}
};

// 保有パッシブ一覧（チェックで発動扱い）。SC.activePassiveDefs()（audition.js）にバフ内容を付けて返す
// （v0.25.28: activePassiveDefs の cp_ 除外バグを本体側で修正したため、旧補完ループは撤去）
SC.simPassiveDefs = function () {
  const P = SC.CONFIG.panel;
  // v0.25.34: activePassiveDefs は SC.state.passiveRemoved（発動させないkey）を除外してしまうので、一覧の列挙中だけ空にする
  //   （simBuild はターン進行用に passiveRemoved を常時セットする。一覧は未保有を含む全件が必要）
  const stX = SC.state, keepRemoved = stX ? stX.passiveRemoved : null;
  if (stX) stX.passiveRemoved = [];
  let list;
  try { list = (SC.activePassiveDefs ? SC.activePassiveDefs() : []).slice(); } finally { if (stX) stX.passiveRemoved = keepRemoved; }
  // バフ内容（属性とpct）を付与。バフ無し（思い出ゲージ/注目度等）は attrs=[]
  list.forEach(function (d) {
    d.owner = SC.simPassiveOwnerName(d.key);   // v0.25.33: どのカードに付随するパッシブか（持ち主の短縮名）
    const pd = P[d.key] || {};
    const attrs = (pd._buffAttrs && pd._buffAttrs.length > 0) ? pd._buffAttrs : (pd._buffAttr ? [pd._buffAttr] : []);
    const pct = Number(pd._buffPct);
    d.buffAttrs = (attrs.length > 0 && isFinite(pct)) ? attrs.slice() : [];
    d.buffPct = d.buffAttrs.length > 0 ? pct : 0;
    d.buffTurns = SC.CONFIG.audition.passiveEffectTurns;   // v0.25.36: 本編 firePassives と同じ継続ターン（発動したターンのみ＝passiveEffectTurns。従来は未設定時2T）
    d.never = SC.condNeverKind(pd._cond, pd._condUnsupported);   // v0.25.34: 'wing'=WINGでは発動しない / 'loadout'=この編成では不成立 / 'unsupported'=条件未対応 / null=発動し得る
    d.condNow = d.never ? null : SC.simPassiveCondNow(pd);        // v0.25.35: 現在のシミュ状態で条件が成立しているか（true/false。判定できない時・恒久的に不発の時は null）
  });
  return list;
};

// v0.25.40: パッシブの効果文（左下の「発動中のパッシブスキル」詳細モーダル用）。pd = SC.CONFIG.panel[key]。
//   例「Vocal+90%[1T]」「思い出ゲージ+25%」「Vocal+90%[1T] / 思い出ゲージ+25%」。[T]は発動したターンのみ有効（SC.CONFIG.audition.passiveEffectTurns）。バフ以外の種別も効果値を出す
//   v0.25.42: 実体は本編・シミュ共通の SC.passiveEffectText（audition.js）へ移した。この名前は互換のため残す（同じ関数を呼ぶだけ）
SC.simPassiveEffectText = function (pd) { return SC.passiveEffectText(pd); };

// v0.25.35: パッシブの条件が「今のシミュ状態」（SC.state.audition の現在のターン・メンタル・付与中バフ・状態効果・履歴など）で成り立つか。
//   本編の条件評価 SC.condMet をそのまま呼ぶ（判定の二重実装はしない）。ターン進行・ランダム効果でのバフ付与・リセット・入力変更のたびに simBuild/再描画され値が更新される。
//   計算できる状態でない時（Pアイドル/週が未選択でオーディション未開始）は判定しない（null）
SC.simPassiveCondNow = function (pd) {
  const st = SC.state, a = st && st.audition;
  if (!st || !st.simMode || st.simEmpty || !a || !pd) return null;
  return SC.condMet(pd._cond) ? true : false;
};

// v0.25.34: 条件が「絶対に発動しない（never）」か。'wing'=ポジション担当・キーワード等のグレフェス専用条件（loadout.js parseCondString が wing:true を付ける）／
//   'loadout'=ビルド時に不成立が確定した条件（ユニット全員参加など。編成を変えれば発動し得る）／'unsupported'=条件判定未対応のパッシブ／null=発動し得る。
//   複合条件: all=子に never があれば never（wing優先）／any=子が全て never のとき never
SC.condNeverKind = function (cond, unsupported) {
  if (unsupported) return 'unsupported';
  if (!cond || typeof cond !== 'object') return null;
  if (cond.t === 'never') return cond.wing === true ? 'wing' : 'loadout';
  const kids = Array.isArray(cond.list) ? cond.list.map(function (c) { return SC.condNeverKind(c, false); }) : [];
  if (cond.t === 'all') {
    if (kids.indexOf('wing') >= 0) return 'wing';
    return kids.filter(Boolean)[0] || null;
  }
  if (cond.t === 'any' && kids.length > 0 && kids.every(Boolean)) return kids.indexOf('wing') >= 0 && kids.every(function (k) { return k === 'wing'; }) ? 'wing' : 'loadout';
  return null;
};

// v0.25.33: サポートEXの上限（ユーザー確認: URはEx枠4つで最大200、それ以外は最大150）
SC.simExMax = function (cardId) {
  const card = cardId ? SC.findCard(cardId) : null;
  return (card && card.rarity === 'UR') ? 200 : 150;
};

// v0.25.33: パッシブの持ち主（そのパネルが付随するカードのアイドル）の短縮名。
//   動的パネルのkey=cp_{p|s0..s3|guest}_{idx} の持ち主枠から、編成（入力）のカードを引く
SC.simPassiveOwnerName = function (key, loadout) {
  const m = String(key).match(/^cp_(p|s(\d)|guest)_/);
  const lo = loadout || (SC._simInputs && SC._simInputs.loadout);
  if (!m || !lo) return '';
  const id = SC.simOwnerCardId(m[1] === 'p' ? 'p' : (m[1] === 'guest' ? 'guest' : Number(m[2])), lo);   // v0.25.38: 持ち主→カードIDの引き当ては simOwnerCardId に共通化
  const card = id ? SC.findCard(id) : null;
  return card ? SC.idolShortName(card.idolNo) : '';
};
// v0.25.38: パネルの持ち主（'p' / サポ番号 0〜3 / 'guest'。SC.CONFIG.panel[key].owner と同じ表記）→ 編成のカードID（枠が空・不正なら null）
SC.simOwnerCardId = function (owner, loadout) {
  const lo = loadout || (SC._simInputs && SC._simInputs.loadout);
  if (!lo) return null;
  if (owner === 'p') return lo.p || null;
  if (owner === 'guest') return lo.guest || null;
  if (typeof owner === 'number' && owner >= 0 && owner < 4) return (lo.supports || [])[owner] || null;
  return null;
};

// v0.25.34: firePassives に発動させないパッシブkey一覧（SC.state.passiveRemoved 用）。
//   手動バフ指定=全て / 保有パッシブ指定=未保有。simBuild（ターン進行中の発動）と 1〆の基底状態で共用
SC._simRemovedKeys = function (inp, allKeys) {
  return inp.buffMode === 'manual' ? allKeys.slice() : allKeys.filter(function (k) { return !inp.passiveOwned[k]; });
};

// ---- シミュ用 state の組み立て ----
// v0.25.43: 手順3の本体。各サポのステ = 基礎 + EX（未選択枠は「なし」）。編成（SC.SUPPORTS）は適用済みの前提（SC.applyLoadout 後）
SC._simApplySupportStats = function (inp) {
  inp.loadout.supports.forEach(function (id, i) {
    if (!id) { SC.SUPPORTS[i] = SC.simEmptySupport(); return; }
    const sup = SC.SUPPORTS[i];
    if (!sup) return;
    const ss = SC.simSupportStats(inp, i);
    sup._simBase = ss.base;   // 表示用（基礎）
    sup.stats = ss.tot;
  });
};
// v0.25.43: 手順5の本体。SC.state のステ（Vo/Da/Vi）・メンタル（st.mental）・statCap（入力値以上）を入力から決める
SC._simApplyStats = function (inp) {
  const st = SC.state;
  st.stats = { vo: inp.stats.vo, da: inp.stats.da, vi: inp.stats.vi };
  st.mental = inp.stats.me;
  SC.ATTRS.forEach(function (at) { st.statCap[at] = Math.max(st.statCap[at], inp.stats[at]); });
};
// v0.25.30: 手順1〜8（startAudition直前まで）を SC._simBuildBase に分離（simBuild と 1〆(simOneShot) で共用）。
//   戻り値=SC.state（audition=null）。SC.state を差し替えるので、呼び出し側が必要なら退避・復元する
SC._simBuildBase = function (inp) {
  // 1) 本編セーブへの書き込みを完全に止める（state.js SC.save 冒頭のガード。newGame内のsaveも止まる）
  SC._simActive = true;
  // 2) 編成適用（SC.IDOL/SC.SUPPORTS/SC.GUEST と cp_ 動的パネルを作り直す。saveLoadout は呼ばない＝本編編成は不変）
  SC.applyLoadout(inp.loadout);
  // 3) サポートEX: 各サポのステ = 基礎 + EX（meは基礎のまま）。v0.25.31: 未選択枠は「なし」（ステ0・skill無し・パッシブ無し）、未選択ゲストは「なし」
  //   v0.25.43: SC._simApplySupportStats に分離（ターン進行中の入力変更を「その場で」反映する SC.simApplyInPlace と共用）
  SC._simApplySupportStats(inp);
  if (!inp.loadout.guest) SC.GUEST = SC.simEmptyGuest();
  // 4) 新規ゲーム（コミュなし・全パネル習得＋Pスキル4枠自動装備）
  SC.newGame(1, inp.mode, [], { commsOff: true, cheatAllPanels: true });
  const st = SC.state;
  st.simMode = true;
  st.commsOff = false;   // v0.25.34: newGame 内のコミュ判定はOFFで済ませた後、アピール演出（SC.fxPlay）を出すため演出カットは解除する
  st.tension = 100;      // v0.25.47: シミュはハイテンション固定（ユーザー指定）＝思い出ゲージ初期値は最高テンションの70%（SC.CONFIG.tension.memoryInit）。旧=新規ゲームの初期値50（緑・20%）
  // 5) ステータス（statCap は入力値以上へ）。v0.25.43: SC._simApplyStats に分離（その場反映と共用）
  SC._simApplyStats(inp);
  // 6) 週（v0.25.31: 未選択なら何もしない＝既定の週のまま。この場合 simBuild は計算せず「未計算」状態にする）
  const opt = SC.simWeekOptions().filter(function (o) { return o.key === inp.weekKey; })[0];
  if (!opt) {
    st.finalsStage = null;
  } else if (opt.finals) {
    st.finalsStage = opt.finals;
    st.week = (SC.CONFIG && SC.CONFIG.TOTAL_WEEKS) || 32;
    SC.rollFinalsTrends();
    st.trend = SC.TREND_PATTERNS[st.finalsTrends[opt.finals === 'semi' ? 0 : 1]].slice();
  } else {
    st.finalsStage = null;
    st.week = opt.week;
    SC.applyTrendForWeek();
  }
  // v0.25.34: 流行を入力どおりに（審査員の流行順位表示・★ボーナス・ライバルの対象ルーチン rivalTarget が変わる）。週の抽選値は上書きする
  st.trend = SC.TREND_PATTERNS[inp.trend].slice();
  // 7) 思い出Lv（親愛度。実効LvはSC.memoryLv()＝レアリティ上限あり）
  st.love = SC.CONFIG.memoryLvTable[inp.memLv];
  // 8) Pアイドルのライブスキル4枠（null=自動装備のまま）
  inp.pSkillKeys.forEach(function (key, i) {
    if (!key) return;
    const p = SC.CONFIG.panel[key];
    if (!p || p.type !== 'live') return;   // 存在しないkeyは無視
    const sk = SC.panelToSkill(p);
    if (sk) st.pSkills[i] = sk;
  });
  return st;
};

// v0.25.31: Pアイドル未選択の最小状態（計算しない。ヘッダー等の描画用に新規ゲームの器だけ作る）
SC._simBuildEmpty = function (inp) {
  SC._simActive = true;
  SC.newGame(1, inp.mode, [], { commsOff: true });
  const st = SC.state;
  st.simMode = true;
  st.commsOff = false;   // v0.25.34
  st.tension = 100;      // v0.25.47: ヘッダの表示も計算時と同じハイテンション
  st.stats = { vo: inp.stats.vo, da: inp.stats.da, vi: inp.stats.vi };
  st.mental = inp.stats.me;
  st.love = SC.CONFIG.memoryLvTable[inp.memLv];
  return st;
};

// 入力から SC.state を作り直す（毎回ゼロから作るので決定論的。パッシブのランダム発動等は全て消す）
// v0.25.31: Pアイドルまたは週が未選択なら計算せず st.simEmpty=true（audition=null）。Pだけ選択済みなら保有パッシブ一覧用にパネルは構築する
SC.simBuild = function (inp) {
  inp = SC.simSanitize(inp);
  SC._simInputs = inp;
  if (!inp.loadout.p) {
    const st0 = SC._simBuildEmpty(inp);
    st0.simEmpty = true;
    st0.screen = 'simulation';
    return st0;
  }
  const st = SC._simBuildBase(inp);
  // 編成が変わって存在しなくなったパッシブkeyを保有/発動中から外す（パネルは構築済み）
  const validKeys = SC.simPassiveDefs().map(function (d) { return d.key; });
  Object.keys(inp.passiveOwned).forEach(function (k) { if (validKeys.indexOf(k) < 0) delete inp.passiveOwned[k]; });
  Object.keys(inp.passiveFired).forEach(function (k) { if (!inp.passiveOwned[k]) delete inp.passiveFired[k]; });
  if (!inp.weekKey) {
    st.simEmpty = true;
    st.screen = 'simulation';
    return st;
  }
  // 9) オーディション開始（準決勝/決勝は週から自動）
  //   v0.25.34: 開始処理中の firePassives では何も発動させない（全パッシブを除外）。発動中の指定は下の 11) で入力どおりに積む
  const allPassiveKeys = SC.simPassiveDefs().map(function (d) { return d.key; });
  st.passiveRemoved = allPassiveKeys.slice();
  SC.startAudition(st.finalsStage ? st.finalsStage : inp.auditionId, null);
  // 10) 決定論的な上書き（startAudition内のdealHand/firePassivesのランダム要素を消す）
  const a = st.audition;
  const player = a.units[0];
  a.turn = inp.turn;
  a.hand = a.deck.map(function (_, i) { return i; });   // 山札の全札を手札に並べる
  a.cooldown = {};
  player.debuffs = [];
  player.attentionMult = 1.0;
  delete a.statuses;   // v0.25.43: 開始処理で付いた状態効果（注目度UP/DOWN等）も消す（旧: 注目度UPの累計カウンタ _attnUpCount を消していた。注目度は状態効果 'attn' になりカウンタは廃止）
  a.passiveHistory = [];
  a.activePassives = [];
  a._passiveFires = {};
  a.log = [];
  a.history = [];
  player.mem = player.memMax;   // 思い出を選択可能に
  a.selectedCard = null;
  a.selectedJudge = null;
  // 11) バフ（v0.25.31: 手動バフと保有パッシブは排他。buffMode で選んだ側だけ使う）:
  //   手動=手動 Vo/Da/Vi% を全ターン維持（untilTurn 9999）／ 保有パッシブ=発動中パッシブ（保有かつ発動中）の _buffPct を本編 firePassives と同じ継続ターンで積む
  //   （v0.25.34: ターンを進めた時に本編どおり期限切れになる。複合属性は各属性に1件ずつ）。st.simBuff はビルド時の合計（テスト・互換用）
  const add = { vo: 0, da: 0, vi: 0 };
  const firedKeys = [];
  if (inp.buffMode === 'manual') {
    add.vo = inp.buff.vo; add.da = inp.buff.da; add.vi = inp.buff.vi;
    SC.ATTRS.forEach(function (at) {
      if (add[at]) player.debuffs.push({ attr: at, pct: add[at], untilTurn: 9999, src: 'passive' });   // v0.25.40: src:'passive'＝パッシブ相当（手動バフ指定は保有パッシブ分の代わり）。[消去:◯◯]の個数・消去の対象外
    });
  } else {
    SC.simPassiveDefs().forEach(function (d) {
      if (!inp.passiveOwned[d.key] || !inp.passiveFired[d.key]) return;
      firedKeys.push(d.key);
      d.buffAttrs.forEach(function (at) {
        if (add[at] === undefined) return;
        add[at] += d.buffPct;
        player.debuffs.push({ attr: at, pct: d.buffPct, untilTurn: a.turn + d.buffTurns - 1, src: 'passive' });   // v0.25.40: パッシブ由来の印（[消去:◯◯]の対象外）
      });
      a._passiveFires[d.key] = 1;   // v0.25.34: 発動済みとして数える（[最大:N回]の上限を次ターン以降の firePassives が守る）
    });
  }
  st.simBuff = { mode: inp.buffMode, vo: add.vo, da: add.da, vi: add.vi };
  st.simFiredNow = firedKeys;   // v0.25.34: 現在ターンに発動したパッシブkey（左下の「発動中のパッシブ」枠。ターン進行後は simPlayTurn が更新）
  // v0.25.34: 以降のターンで本編 firePassives が発動させるのは保有分だけ（手動バフ指定=全除外・保有パッシブ指定=未保有を除外）
  st.passiveRemoved = SC._simRemovedKeys(inp, allPassiveKeys);
  // 12) （v0.25.30: 審査員の現在の興味値は撤去。startAudition の初期値＝gained 0・gone false のまま）
  // 13) LINK成立扱い: スキル履歴に山札の全ownerを1件ずつ入れる（SC.linkReady は履歴内のowner集合で判定）
  //   v0.25.37: 判定 SC.cardLinkOk が実カードの(Link)節も対象にしたので、これで実カードの(Link)アピール札・思い出のLINK効果の予測にも効く
  if (inp.linkOn) {
    const seen = {};
    a.deck.forEach(function (c) {
      if (seen[c.owner]) return;
      seen[c.owner] = true;
      SC.pushHistory(c.owner, c.attr || null);
      a.history[0].simAssumed = true;   // v0.25.43: 「LINK成立扱い」で入れた履歴の印（SC.simApplyInPlace が LINK成立扱いの切替で足す/外す。実際の使用履歴と区別する）
    });
  }
  // 14) 予測を出す札（selected=deck index。hand=全札なので位置=deck index）
  if (inp.selected === 'memory') a.selectedCard = 'memory';
  else if (typeof inp.selected === 'number' && a.hand.indexOf(inp.selected) >= 0) a.selectedCard = a.hand.indexOf(inp.selected);
  else a.selectedCard = null;
  st.screen = 'simulation';
  return st;
};

// 1審査員への結果（value→帰宅判定・割合）。simCompute と上部審査員カード表示で共用
SC._simResult = function (value, j) {
  const remain = j.need - j.gained;
  const v = isFinite(value) ? value : 0;
  // v0.25.34: ターンを進めて帰宅済みの審査員は「帰宅済」（もう満足させられない）
  if (j.gone) return { value: v, remain: 0, satisfies: false, pct: 0, gone: true };
  return { value: v, remain: remain, satisfies: v >= remain, pct: remain > 0 ? v / remain : 0 };
};
SC.simPredictCard = function (card, j) {
  const coef = SC.SIM_COEF[SC._simInputs.judge];
  return SC._simResult(SC.appealPredict(card, j.attr, coef, j), j);
};
SC.simPredictMemory = function (j) {
  const coef = SC.SIM_MEM_COEF[SC._simInputs.memJudge];
  return SC._simResult(SC.memoryPredict(j, coef), j);   // v0.25.37: 本体＋思い出アピールの付随効果/LINK効果の追加アピール分（SC.memoryPredict）
};

// 札ごと×審査員ごとの与ダメージ表（simBuild 済みの SC.state を対象にする）
SC.simCompute = function () {
  const st = SC.state;
  const a = st && st.audition;
  const inp = SC._simInputs;
  if (!inp || !st || !st.simMode) return null;
  // v0.25.31: Pアイドル/週が未選択＝未計算（rows 空・memory null）
  if (!a || st.simEmpty) return { empty: true, coef: SC.SIM_COEF[inp.judge], memCoef: SC.SIM_MEM_COEF[inp.memJudge], judges: [], rows: [], memory: null };
  const coef = SC.SIM_COEF[inp.judge];
  const memCoef = SC.SIM_MEM_COEF[inp.memJudge];
  const judges = a.judges.map(function (j) {
    // v0.25.34: ターン進行で興味値が蓄積する（開始時は gained=0）。帰宅済み(gone)は remain 0
    return { attr: j.attr, label: j.name, need: j.need, remain: j.gone ? 0 : j.need - j.gained, gone: !!j.gone };
  });
  const rows = a.deck.map(function (card, deckIdx) {
    const heal = !!card.heal;
    const effectOnly = SC.isEffectOnlyCard(card);   // v0.25.36: 回復札・効果札はダメージ計算の対象外（表は「回復（ダメージなし）」「効果（ダメージなし）」）
    return {
      deckIdx: deckIdx,
      name: card.name,
      ownerLabel: card.owner === 'p' ? 'P' : 'S' + (Number(card.owner) + 1),
      ownerName: SC.supportOwnerShortName(card.owner),   // v0.25.29: サポ札の持ち主の短縮名（P札は ''）。表の行ラベル「[S1 摩美々] 札名」用
      heal: heal,
      effectOnly: effectOnly,
      allJudges: !!card.allJudges,
      vals: a.judges.map(function (j) {
        if (effectOnly) return { value: null, satisfies: false, pct: 0 };
        const r = SC.simPredictCard(card, j);
        return { value: r.value, satisfies: r.satisfies, pct: r.pct, gone: !!r.gone };
      })
    };
  });
  const memory = {
    lv: SC.memoryLv(),
    vals: a.judges.map(function (j) {
      const r = SC.simPredictMemory(j);
      return { value: r.value, satisfies: r.satisfies, pct: r.pct, gone: !!r.gone };
    })
  };
  return { coef: coef, memCoef: memCoef, judges: judges, rows: rows, memory: memory };
};

// ---- 札の選択（DOM非依存。UI/main.js から呼ぶ） ----
// v0.25.30: 審査員の選択は撤去（札を選べば単体札・全体札・思い出とも全審査員に自動表示）
// 札を選ぶ（sel=deck index | 'memory' | null）。v0.25.34: ターン進行中の状態を壊さないよう再構築はしない（選択だけ反映して保存）。
//   手札は常に山札の全札（位置=deck index）なので a.selectedCard にそのまま入れる
SC.simSetSelected = function (sel) {
  const inp = SC._simInputs, a = SC.state && SC.state.audition;
  if (!inp) return;
  inp.selected = sel;
  if (a && !SC.state.simEmpty) {
    if (sel === 'memory') a.selectedCard = 'memory';
    else if (typeof sel === 'number' && a.hand.indexOf(sel) >= 0) a.selectedCard = a.hand.indexOf(sel);
    else { a.selectedCard = null; inp.selected = null; }
  }
  SC.simSaveInputs(inp);
};
// 札を未選択に戻す（既に未選択なら false を返す）
SC.simClearSelection = function () {
  const inp = SC._simInputs, a = SC.state && SC.state.audition;
  if (!inp || (inp.selected === null && (!a || a.selectedCard === null))) return false;
  inp.selected = null;
  if (a) a.selectedCard = null;
  SC.simSaveInputs(inp);
  return true;
};

// ---- v0.25.34: ターン進行（札→審査員クリックで1ターン進める。本編と同じ SC.resolveTurn・演出） ----
// 現在ターンに有効なバフ/デバフの属性別合計%（自ユニット debuffs の untilTurn>=現在ターン分。SC.buffMod と同じ判定）。
//   左下「発動中のパッシブ」枠の「バフ合計」表示用（審査員リアクションのデバフ・パッシブ・手動バフを全部含む実際の値）
SC.simCurrentBuff = function () {
  const a = SC.state && SC.state.audition;
  const sum = { vo: 0, da: 0, vi: 0 };
  if (!a) return sum;
  a.units[0].debuffs.forEach(function (d) {
    if (sum[d.attr] !== undefined && d.untilTurn >= a.turn && isFinite(d.pct)) sum[d.attr] += d.pct;
  });
  return sum;
};
// 選択中の札/思い出と、クリックした審査員から本編の resolveTurn 用 action を作る（行えない時は null）。judgement は入力の判定
SC.simBuildAction = function (judgeIdx) {
  const st = SC.state, a = st && st.audition, inp = SC._simInputs;
  if (!st || !st.simMode || st.simEmpty || !a || a.finished || !inp) return null;
  const sel = inp.selected;
  const player = a.units[0];
  if (sel === 'memory') {
    // 思い出: Lv1以上でゲージ満タンの時だけ（本編の memReady と同条件）
    if (SC.memoryLv() < 1 || player.mem < player.memMax) return null;
    return { type: 'memory', judgement: inp.memJudge === 'good' ? 'memGood' : 'memBad' };
  }
  if (typeof sel !== 'number') return null;
  const cardPos = a.hand.indexOf(sel);
  const card = cardPos >= 0 ? a.deck[sel] : null;
  if (!card) return null;
  if (SC.isEffectOnlyCard(card)) return { type: 'heal', cardPos: cardPos, judgement: inp.judge };   // v0.25.36: 回復札・効果札（型名 'heal' は本編 execPlayerAction の共通経路）
  const ji = Number(judgeIdx);
  if (!a.judges[ji] || a.judges[ji].gone) {
    if (!card.allJudges) return null;   // 単体札は帰宅済みの審査員を選べない（全体札は全員が対象なので審査員は何でもよい）
  }
  return { type: 'appeal', cardPos: cardPos, judgeIdx: isFinite(ji) ? ji : 0, allJudges: !!card.allJudges, judgement: inp.judge };
};
// 1ターン進める。戻り値=演出イベント配列（呼び出し側が SC.fxPlay して完了後に render）／進められない時は null。
//   本編のメーター経路（meterResolve）と同じく resolveTurn → fxCollect。ターンを進めても手札は山札の全札のまま（クールダウンもかけない）。
//   審査終了（全員帰宅・自ユニット脱落）時の報酬は本編の finishAudition が st に積むが、シミュは何も持ち越さないので進行前の値に戻す
SC.simPlayTurn = function (judgeIdx) {
  const st = SC.state, a = st && st.audition, inp = SC._simInputs;
  const action = SC.simBuildAction(judgeIdx);
  if (!action) return null;
  const keepProd = JSON.stringify({ stats: st.stats, statCap: st.statCap, sp: st.sp, fans: st.fans, mental: st.mental, limitedCleared: st.limitedCleared });
  const firesBefore = Object.assign({}, a._passiveFires || {});
  const usedCard = action.type === 'memory' ? null : a.deck[a.hand[action.cardPos]];
  a.selectedCard = null;
  a.showPassivePop = false;   // v0.25.40: 左下のパッシブ詳細モーダルはターン進行で閉じる（次ターンの発動中パッシブは別物）
  // v0.25.41: 次ターン開始時のパッシブ抽選（resolveTurn 末尾の firePassives）の直前の状態を控える。
  //   「ランダム発動」をターン進行中に押した時は、この状態に戻して抽選し直す（TURN は戻さない。SC.simRandomPassives）
  const origFire = SC.firePassives;
  let preFire = null;
  SC.firePassives = function () { preFire = JSON.stringify(SC.state.audition); return origFire.apply(this, arguments); };
  try { SC.resolveTurn(action); } finally { SC.firePassives = origFire; }
  st.simPreFire = preFire;
  const events = SC.fxCollect();
  const kp = JSON.parse(keepProd);
  st.stats = kp.stats; st.statCap = kp.statCap; st.sp = kp.sp; st.fans = kp.fans; st.mental = kp.mental; st.limitedCleared = kp.limitedCleared;
  if (usedCard && usedCard.generated) usedCard._spent = true;   // 生成スキルは使い切り（手札を全札に戻す時に復活させない）
  inp.selected = null;
  a.selectedCard = null;
  if (!a.finished) {
    // dealHand で3枚に絞られた手札を山札の全札へ戻す・クールダウンは無し（シミュの利便性。ユーザー指定）
    a.hand = a.deck.map(function (_, i) { return i; }).filter(function (i) { return !(a.deck[i].generated && a.deck[i]._spent); });
    a.cooldown = {};
    // このターン開始時（resolveTurn 末尾の firePassives）に発動したパッシブkey = 発動回数が増えたもの
    const now = a._passiveFires || {};
    st.simFiredNow = Object.keys(now).filter(function (k) { return (now[k] || 0) > (firesBefore[k] || 0); });
  } else {
    st.simFiredNow = [];   // 審査終了（帯の「Nターン」は終了時の a.turn）
  }
  SC.simSaveInputs(inp);
  return events;
};
// オーディション開始時の状態（TURN は入力のターン数・既定1）に戻す。入力はそのまま・simBuild し直し。
//   v0.25.40: ランダム発動中のパッシブ（passiveFired）も空にする＝左下の「発動中のパッシブ」枠は「なし」（ユーザー指定「リセットの場合はランダム発動中のパッシブもナシの状態に」）。
//   保有チェック（passiveOwned）・手動バフ・編成などはそのまま。パッシブ詳細モーダル（a.showPassivePop）も組み直しで閉じる。演出の中断は呼び出し側（main.js が SC.simAbortFx を先に呼ぶ）
SC.simPlayReset = function () {
  const inp = SC._simInputs;
  if (!inp) return;
  inp.passiveFired = {};
  SC.simBuild(inp);
  SC.simSaveInputs(inp);
};

// ---- v0.25.34: クリアを「編成」と「パッシブ」で分ける（v0.25.35: パッシブ側は全解除と同じなので編成クリアだけ残す） ----
// 編成クリア: 編成の全枠を未選択に＋EX0＋Pスキル枠を自動に＋保有/発動中パッシブも空（週・ステ・判定などは残す）
SC.simClearLoadout = function () {
  const inp = SC._simInputs;
  if (!inp) return;
  inp.loadout = { p: null, supports: [null, null, null, null], guest: null };
  inp.ex = [0, 1, 2, 3].map(function () { return { vo: 0, da: 0, vi: 0 }; });
  inp.exGuest = { vo: 0, da: 0, vi: 0 };   // v0.25.39: ゲストのEXも0に
  inp.pSkillKeys = [null, null, null, null];
  inp.passiveOwned = {};
  inp.passiveFired = {};
  SC.simBuild(inp);
  SC.simSaveInputs(inp);
};
// v0.25.35: 「パッシブクリア」ボタンは撤去（「全解除」＝SC.simOwnNone と同じ効果のため）

// ---- v0.25.41: 編成の1枠を変えた時の後始末（ユーザー報告「編成を弄ったら選択中のパッシブのチェックが全部外れる」） ----
// 根因: 従来は sim_ui.js の入力処理が、どの枠を変えても保有（passiveOwned）・発動中（passiveFired）・Pスキル枠の手動指定（pSkillKeys）を丸ごと空にしていた。
// パネルkey は持ち主枠ごと（cp_p_n / cp_s{i}_n / cp_guest_n。SC.buildLoadoutPanels）なので、変えた枠の key だけ外せば他の枠のチェック・指定はそのまま有効。
// path: 'loadout.p' / 'loadout.supports.N' / 'loadout.guest'。変えた枠の新しいカードのパッシブは未チェックから始まる
SC.simOnLoadoutChanged = function (inp, path) {
  if (!inp) return;
  const m = /^loadout\.(p|guest|supports\.([0-3]))$/.exec(String(path));
  if (!m) return;
  const prefix = m[1] === 'p' ? 'cp_p_' : (m[1] === 'guest' ? 'cp_guest_' : 'cp_s' + m[2] + '_');
  const hit = function (k) { return typeof k === 'string' && k.indexOf(prefix) === 0; };
  ['passiveOwned', 'passiveFired'].forEach(function (f) {
    const o = inp[f] || {};
    Object.keys(o).forEach(function (k) { if (hit(k)) delete o[k]; });
    inp[f] = o;
  });
  inp.pSkillKeys = (Array.isArray(inp.pSkillKeys) ? inp.pSkillKeys : [null, null, null, null]).map(function (k) { return hit(k) ? null : k; });
};

// ---- v0.25.39: サポート枠の入れ替え（編成欄の「⇅」ボタン。ユーザー指定「サポート1とサポート2とか、サポート4とゲストを入れ替える」） ----
// 枠の表記: 0〜3（サポート1〜4）または 'guest'（"0"〜"3" の文字列も可＝data-属性から来る値）。不正な枠は null
SC._simSlotId = function (s) {
  if (s === 'guest') return 'guest';
  if (typeof s === 'string' && /^[0-3]$/.test(s)) return Number(s);
  if (typeof s === 'number' && isFinite(s) && Math.floor(s) === s && s >= 0 && s <= 3) return s;
  return null;
};
// パネルkey（cp_s0_3 / cp_guest_2 等）の持ち主枠 oa↔ob（'s0'〜's3' / 'guest'）を入れ替える。それ以外のkey（Pカード由来 cp_p_・汎用パネル・null）はそのまま
SC._simSwapPanelKey = function (key, oa, ob) {
  const m = /^cp_(s[0-3]|guest)_(\d+)$/.exec(String(key));
  if (!m) return key;
  if (m[1] === oa) return 'cp_' + ob + '_' + m[2];
  if (m[1] === ob) return 'cp_' + oa + '_' + m[2];
  return key;
};
// 枠 a と b の中身を入れ替える。入れ替えるもの:
//   ①編成のカードID（片方/両方が空でも可＝空との入れ替えは移動）
//   ②EX（サポ1〜4の inp.ex[i]・ゲストの inp.exGuest）。EXはカードに付いている扱いでカードと一緒に移す（S4↔ゲストでも捨てない・0にしない＝全ペアが2回で元に戻る。
//     ユーザー指定「ゲストもExは貼れるので捨てなくていい」）。空枠に残っている値も枠の中身として動かす
//   ③保有パッシブ（passiveOwned）・発動中パッシブ（passiveFired）・Pスキル枠の手動指定（pSkillKeys）のパネルkey（cp_s{i}_n / cp_guest_n。SC.buildLoadoutPanels）
//     を、カードの移動先の枠に付け替える（チェック状態・手動指定が同じカードに付いたまま残る）
//   選択中の札は解除（札の deck index は編成で変わるため）。simBuild でターン進行中の状態を開始時に戻す（既存の編成変更 simOnChange と同じ扱い）
// 戻り値: 入れ替えた=true / 不正な枠・同じ枠・入力なし=false
SC.simSwapSlots = function (a, b) {
  const inp = SC._simInputs;
  const sa = SC._simSlotId(a), sb = SC._simSlotId(b);
  if (!inp || sa === null || sb === null || sa === sb) return false;
  const lo = inp.loadout;
  const idOf = function (s) { return (s === 'guest' ? lo.guest : lo.supports[s]) || null; };
  const idA = idOf(sa), idB = idOf(sb);
  if (sa === 'guest') lo.guest = idB; else lo.supports[sa] = idB;
  if (sb === 'guest') lo.guest = idA; else lo.supports[sb] = idA;
  // EX（空枠に残っている値も「枠の中身」として一緒に動かす＝同じ入れ替えを2回行うと元に戻る）
  if (!Array.isArray(inp.ex)) inp.ex = [0, 1, 2, 3].map(function () { return { vo: 0, da: 0, vi: 0 }; });
  const exOf = function (s) {
    const e = s === 'guest' ? inp.exGuest : inp.ex[s];
    return { vo: (e && e.vo) || 0, da: (e && e.da) || 0, vi: (e && e.vi) || 0 };
  };
  const exPut = function (s, e) { if (s === 'guest') inp.exGuest = e; else inp.ex[s] = e; };
  const exA = exOf(sa), exB = exOf(sb);
  exPut(sa, exB);
  exPut(sb, exA);
  // パネルkeyの付け替え
  const oa = sa === 'guest' ? 'guest' : 's' + sa, ob = sb === 'guest' ? 'guest' : 's' + sb;
  const remapObj = function (src) {
    const out = {};
    Object.keys(src || {}).forEach(function (k) { out[SC._simSwapPanelKey(k, oa, ob)] = src[k]; });
    return out;
  };
  inp.passiveOwned = remapObj(inp.passiveOwned);
  inp.passiveFired = remapObj(inp.passiveFired);
  inp.pSkillKeys = (Array.isArray(inp.pSkillKeys) ? inp.pSkillKeys : [null, null, null, null]).map(function (k) { return k ? SC._simSwapPanelKey(k, oa, ob) : k; });
  inp.selected = null;
  SC.simBuild(inp);
  SC.simSaveInputs(inp);
  return true;
};

// ---- v0.25.34: セーブ（10スロット）。現在のシミュ入力（編成・EX・週・難易度・オーディション・流行・思い出Lv・ターン・判定・ステ・バフ指定・
//   手動バフ・保有/発動中パッシブ・Pスキル枠・LINK成立扱い）を丸ごと localStorage 'sc_sim_slots_v1' に保存する。本編セーブ（SAVE_KEY）には一切書かない ----
SC.SIM_SLOTS_KEY = 'sc_sim_slots_v1';
SC.SIM_SLOT_COUNT = 10;
SC._simSlotCache = null;
// スロット一覧（長さ10。空き=null / 保存済み={ label, savedAt, inp }）。壊れた保存値・localStorage不可は空き扱い
SC.simSlots = function () {
  if (SC._simSlotCache) return SC._simSlotCache;
  let arr = [];
  try {
    const raw = localStorage.getItem(SC.SIM_SLOTS_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    arr = (obj && Array.isArray(obj.slots)) ? obj.slots : [];
  } catch (e) { arr = []; }
  const out = [];
  for (let i = 0; i < SC.SIM_SLOT_COUNT; i++) {
    const sl = arr[i];
    if (!(sl && typeof sl === 'object' && sl.inp && typeof sl.inp === 'object')) { out.push(null); continue; }
    const one = { label: String(sl.label || ''), savedAt: Number(sl.savedAt) || 0, inp: sl.inp };
    if (sl.res && typeof sl.res === 'object') one.res = sl.res;   // v0.25.40: 保存時に分かっていた1〆・230万の結果（SC.simSaveSlot / SC._simSlotAttach）。キャッシュが押し出されても読込で即表示できる
    out.push(one);
  }
  SC._simSlotCache = out;
  return out;
};
SC._simSlotsWrite = function (slots) {
  SC._simSlotCache = slots;
  try { localStorage.setItem(SC.SIM_SLOTS_KEY, JSON.stringify({ slots: slots })); } catch (e) {}
};
// ラベル「Pアイドル名 / 週 / 月/日 時:分」（例: 郁田はるき / S3残り7週 / 10/24 13:05）
SC.simSlotLabel = function (inp, savedAt) {
  const pc = inp.loadout && inp.loadout.p ? SC.findCard(inp.loadout.p) : null;
  const idol = pc ? (pc.idolName || (SC.CARDS.idols[pc.idolNo] || {}).name || pc.name) : 'P未選択';
  const wo = SC.simWeekOptions().filter(function (o) { return o.key === inp.weekKey; })[0];
  const d = new Date(savedAt);
  const two = function (n) { return (n < 10 ? '0' : '') + n; };
  // v0.25.41: Pカードの名称も表示（ユーザー指定）。例「月岡恋鐘【思いがけず、ジェラシー】 / S4残り4週 / 10/25 23:34」
  const pName = pc ? '【' + pc.name + '】' : '';
  return idol + pName + ' / ' + (wo ? wo.label : '週未選択') + ' / ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
};
// 現在の入力をスロット i（0〜9）に保存（上書き可。確認は呼び出し側）。成功で true
SC.simSaveSlot = function (i) {
  i = Number(i);
  if (!SC._simInputs || !(i >= 0 && i < SC.SIM_SLOT_COUNT)) return false;
  const inp = SC.simSanitize(JSON.parse(JSON.stringify(SC._simInputs)));
  const now = Date.now();
  const slots = SC.simSlots().slice();
  slots[i] = { label: SC.simSlotLabel(inp, now), savedAt: now, inp: inp };
  // v0.25.40: 保存時点で分かっている1〆・230万の結果（永続キャッシュにあるもの）をスロットにも持たせる＝キャッシュが他の入力で押し出されても、
  //   読込で即表示できる。まだ未計算・計算中のものは、完了時に SC.simCachePut が SC._simSlotAttach でこのスロットに足す
  const res = SC._simSlotResults(inp);
  if (res) slots[i].res = res;
  SC._simSlotsWrite(slots);
  return true;
};
// スロット i を読み込んで即反映（サニタイズ→simBuild→入力保存。ターン進行は開始時に戻る。描画・1〆再計算は呼び出し側の render）。空き/不正は false
//   v0.25.40: スロットが持つ計算結果（res）は永続キャッシュに戻す＝続く render の SC.simOneShotLookup / SC.sim230Lookup が即ヒットして「計算中」を出さない
SC.simLoadSlot = function (i) {
  i = Number(i);
  const sl = (i >= 0 && i < SC.SIM_SLOT_COUNT) ? SC.simSlots()[i] : null;
  if (!sl) return false;
  const inp = SC.simSanitize(JSON.parse(JSON.stringify(sl.inp)));
  SC._simInputs = inp;
  SC.simBuild(inp);
  SC.simSaveInputs(inp);
  SC._simSlotSeed(sl, inp);
  return true;
};
SC.simDeleteSlot = function (i) {
  i = Number(i);
  if (!(i >= 0 && i < SC.SIM_SLOT_COUNT) || !SC.simSlots()[i]) return false;
  const slots = SC.simSlots().slice();
  slots[i] = null;
  SC._simSlotsWrite(slots);
  return true;
};

// ---- v0.25.31: 保有パッシブ（チェック=保有）・ランダム発動（=条件に基づく発動）・全選択/全解除・クリア・おまかせ編成 ----
// ランダム発動: 現在のシミュ状態（ターン数・メンタル・審査員数・手動バフ等）で、保有しているパッシブだけを対象に、本編と同じ発動判定
// （条件=SC.condMet・確率=_prob+状態補正・[最大:N回]・1ターン上限 passiveMaxPerTurn・パネル順）を行う本編の SC.firePassives() を
// そのまま1回走らせ、発動したパネルkey（a._passiveFires）を passiveFired にする（発動判定の二重実装はしない）。
// 未保有のパッシブは SC.state.passiveRemoved に入れて firePassives に除外させる（走らせた後は空に戻す＝表示用の一覧は不変）。
// 条件を満たさないパッシブは firePassives が発動させない。手動バフ指定中・未計算（Pアイドル/週未選択）は何もしない。
// 戻り値: 発動したkey配列。呼び出し後は passiveFired を保存→simBuild 済み（firePassivesが積んだバフ・履歴・ログは再buildで消える）
SC._simRandSeq = 0;
SC.simRandomPassives = function () {
  const inp = SC._simInputs;
  if (!inp || inp.buffMode === 'manual' || !SC.simReady(inp)) return [];
  // v0.25.41: ターン進行中（開始ターンより進んでいる）は、TURN を戻さずに「そのターン開始時の抽選」だけをやり直す
  //   （ユーザー報告「ランダム発動を押してもTURNが戻ってしまう」。従来は下の simBuild で開始時の状態に作り直していた。TURN を戻すのは「リセット」）
  const st0 = SC.state, a0 = st0 && st0.audition;
  if (a0 && st0.simPreFire && a0.turn > (inp.turn || 1)) {
    if (a0.finished) return [];
    return SC._simReRollCurrentTurn(inp);
  }
  inp.passiveFired = {};
  SC.simBuild(inp);   // 発動中なしの基底状態（バフ0・a._passiveFires={}・activePassives=[]）
  const st = SC.state;
  const allKeys = SC.simPassiveDefs().map(function (d) { return d.key; });   // passiveRemoved を触る前に全件を取る
  const owned = allKeys.filter(function (k) { return inp.passiveOwned[k]; });
  st.passiveRemoved = allKeys.filter(function (k) { return !inp.passiveOwned[k]; });   // 未保有は発動対象から除外
  // 押すたびに結果が変わるよう Date.now() 由来の値に再シード（連打でも変わるよう連番も混ぜる）
  SC._simRandSeq++;
  st.rngState = ((Date.now() & 0x7fffffff) ^ Math.imul(SC._simRandSeq, 0x9E3779B1)) >>> 0;
  SC.fxBegin();   // firePassives が fxPush するぶんは受けて捨てる（本編と同じ記録先）
  SC.firePassives();
  SC.fxCollect();
  const fired = Object.keys(st.audition._passiveFires || {});
  st.passiveRemoved = [];
  const on = {};
  fired.forEach(function (k) { if (owned.indexOf(k) >= 0) on[k] = true; });
  inp.passiveFired = on;
  SC.simSaveInputs(inp);
  SC.simBuild(inp);   // 発動結果（バフ）を反映した状態で再構築
  return Object.keys(on);
};
// v0.25.41: ターン進行中の「ランダム発動」= 現在のターン開始時（パッシブ抽選前・simPlayTurn が控えた st.simPreFire）の状態に戻し、
//   保有パッシブだけを本編の firePassives で抽選し直す。TURN・興味値・メンタル・履歴などターン進行の結果はそのまま。
//   開始ターンの発動中（inp.passiveFired）は変えない（それは「リセット」後の TURN 開始時の指定）
SC._simReRollCurrentTurn = function (inp) {
  const st = SC.state;
  const spent = st.audition.deck.map(function (c) { return !!(c && c._spent); });   // 生成スキルの使い切りは控えの後に付くので引き継ぐ
  st.audition = JSON.parse(st.simPreFire);
  const a = st.audition;
  a.deck.forEach(function (c, i) { if (c && spent[i]) c._spent = true; });
  if (SC._simRelink) SC._simRelink(st);
  const allKeys = SC.simPassiveDefs().map(function (d) { return d.key; });
  st.passiveRemoved = allKeys.filter(function (k) { return !inp.passiveOwned[k]; });   // 未保有は発動対象から除外
  SC._simRandSeq++;
  st.rngState = ((Date.now() & 0x7fffffff) ^ Math.imul(SC._simRandSeq, 0x9E3779B1)) >>> 0;
  const firesBefore = Object.assign({}, a._passiveFires || {});
  SC.fxBegin();   // firePassives の演出イベントは捨てる
  SC.firePassives();
  SC.fxCollect();
  st.passiveRemoved = SC._simRemovedKeys(inp, allKeys);   // simBuild と同じ（以降のターン進行用）
  const now = a._passiveFires || {};
  st.simFiredNow = Object.keys(now).filter(function (k) { return (now[k] || 0) > (firesBefore[k] || 0); });
  // simPlayTurn の後処理と同じ（手札=山札の全札・クールダウンなし・選択解除）
  a.hand = a.deck.map(function (_, i) { return i; }).filter(function (i) { return !(a.deck[i].generated && a.deck[i]._spent); });
  a.cooldown = {};
  a.selectedCard = null;
  a.showPassivePop = false;
  inp.selected = null;
  SC.simSaveInputs(inp);
  return st.simFiredNow.slice();
};
// ---- v0.25.43: ターン進行中の入力変更を「作り直さず」現在の状態へその場で反映（ユーザー指示「ステータスやパッシブのチェックを弄ったタイミングでもリセットされてしまうけど、リセットボタン押してないときはリセットしないで」） ----
// 対象の入力: ステ（stats.*）・サポートEX（ex.*）・ゲストEX（exGuest.*）・保有パッシブ（passiveOwned.*・全選択/全解除）・バフ指定（buffMode）・手動バフ値（buff.*）・判定（judge/memJudge）・LINK成立扱い（linkOn）。
//   ※札の選択（simSetSelected）は従来から作り直さない。編成・週・オーデ・難易度・流行・思い出Lv・ターン数・Pスキル枠はオーディション自体（札・パッシブ・審査員）が変わるので従来どおり開始時に戻る。
// 「ターン進行中」= 現在ターン > 入力の開始ターン。開始ターンにいる時は失うものが無いので従来どおり作り直してよい
SC.simInProgress = function () {
  const st = SC.state, a = st && st.audition, inp = SC._simInputs;
  return !!(inp && st && st.simMode && !st.simEmpty && a && a.turn > (inp.turn || 1));
};
SC.simIsInPlacePath = function (path) {
  return /^(stats\.(vo|da|vi|me)|ex\.[0-3]\.(vo|da|vi)|exGuest\.(vo|da|vi)|passiveOwned(\..+)?|buffMode|buff\.(vo|da|vi)|judge|memJudge|linkOn)$/.test(String(path));
};
// 入力変更後の反映の分岐（sim_ui.js simOnChange・simOwnAll/None が呼ぶ。DOM非依存＝nodeで検証できる）: ターン進行中のその場反映対象ならその場で、それ以外は従来どおり作り直し
SC.simRefreshAfterInput = function (inp, path) {
  if (SC.simInProgress() && SC.simIsInPlacePath(path)) SC.simApplyInPlace(inp, path);
  else SC.simBuild(inp);
};
// オーディション状態 aud（現在の SC.state.audition か、ターン開始時の控え st.simPreFire を parse したもの）へ、入力の変更をその場で反映する。
//   ・メンタル: 最大メンタルを入力の Me にし、現在メンタルは割合を保つ [判断]（脱落済みは0のまま・生きていれば最低1）
//   ・手動バフ（untilTurn 9999・src:'passive' の印）を入力の値で差し替える。手動バフ指定の間はパッシブの発動中バフ（untilTurn<9999・src:'passive'）は持たない（simBuild と同じ排他）。保有パッシブ指定への切替では現在ターンのパッシブ発動は増やさない（次の抽選から）
//   ・LINK成立扱い: ON=履歴に無い持ち主の分を足す（simAssumed の印）／OFF=印のついた分を外す（実際の使用履歴は残す）
SC._simInPlaceAudition = function (aud, inp) {
  const pl = aud.units[0];
  const newMax = inp.stats.me;
  if (pl.mentalMax !== newMax) {
    const r = pl.mentalMax > 0 ? pl.mental / pl.mentalMax : 1;
    pl.mentalMax = newMax;
    pl.mental = (pl.out || pl.mental <= 0) ? 0 : Math.min(newMax, Math.max(1, Math.round(newMax * r)));
  }
  pl.debuffs = pl.debuffs.filter(function (d) { return !(d.src === 'passive' && d.untilTurn >= 9999); });
  if (inp.buffMode === 'manual') {
    pl.debuffs = pl.debuffs.filter(function (d) { return !(d.src === 'passive' && d.untilTurn < 9999); });
    SC.ATTRS.forEach(function (at) {
      if (inp.buff[at]) pl.debuffs.push({ attr: at, pct: inp.buff[at], untilTurn: 9999, src: 'passive' });
    });
  }
  if (!inp.linkOn) {
    aud.history = aud.history.filter(function (h) { return !h.simAssumed; });
  } else {
    const have = {};
    aud.history.forEach(function (h) { have[h.owner] = true; });
    aud.deck.forEach(function (c) {
      if (have[c.owner]) return;
      have[c.owner] = true;
      aud.history.unshift({ owner: c.owner, attr: c.attr || null, simAssumed: true });
    });
    const hm = SC.CONFIG.audition.historyMax;
    if (aud.history.length > hm) aud.history.length = hm;
  }
};
// 入力 inp の変更（path）を、作り直さずに現在のシミュ状態へ反映する（SC.simInProgress() の時だけ呼ぶ）。
//   TURN・興味値・履歴・メンタル割合・付与済みのバフ/状態効果・今ターンの発動中パッシブはそのまま。予測表・1〆・230万は呼び出し側の再描画で入力キー基準に再計算される。
//   ・ステ/サポートEX: SC.state.stats・SC.SUPPORTS の stats を入力から更新（simBuild と同じ SC._simApplyStats / SC._simApplySupportStats）。予測値は新しいステで変わる
//   ・保有パッシブのチェック: 以降のターンで発動させる対象（st.passiveRemoved）だけ更新。現在ターンの発動中（st.simFiredNow・付いているバフ）は変えない（次の「ランダム発動」・ターン進行から反映）
//   ・「ランダム発動」の控え（st.simPreFire＝今ターン開始時の状態）にも同じ変更を反映する（押した時に変更が巻き戻らないように）
SC.simApplyInPlace = function (inp, path) {
  void path;
  inp = SC.simSanitize(inp);   // 正規化（クランプ・保有を外したパッシブは発動中指定からも外す。simBuild と同じ）
  SC._simInputs = inp;
  const st = SC.state, a = st.audition;
  a.effectPop = null; a.showPassivePop = false;   // 作り直した時と同じく、中央の詳細モーダル（ステータス効果／審査員の状態／パッシブ）は入力変更で閉じる
  SC._simApplyStats(inp);
  SC._simApplySupportStats(inp);
  SC._simInPlaceAudition(a, inp);
  if (st.simPreFire) {
    const pa = JSON.parse(st.simPreFire);
    SC._simInPlaceAudition(pa, inp);
    st.simPreFire = JSON.stringify(pa);
  }
  const allKeys = SC.simPassiveDefs().map(function (d) { return d.key; });
  st.passiveRemoved = SC._simRemovedKeys(inp, allKeys);   // 以降のターンの firePassives が見る（手動バフ指定=全除外・保有パッシブ指定=未保有を除外）
  if (inp.buffMode === 'manual') st.simFiredNow = [];     // 手動バフ指定中は発動中パッシブなし（左下の枠は「手動バフ指定中」）
  SC.simSaveInputs(inp);
  return st;
};
// 保有パッシブの全選択 / 全解除（全解除は発動中も空に）
SC.simOwnAll = function () {
  const inp = SC._simInputs;
  if (!inp) return;
  inp.passiveOwned = {};
  SC.simPassiveDefs().forEach(function (d) { inp.passiveOwned[d.key] = true; });
  SC.simSaveInputs(inp);
  SC.simRefreshAfterInput(inp, 'passiveOwned');   // v0.25.43: ターン進行中はその場で反映（開始ターンなら従来どおり作り直し）
};
SC.simOwnNone = function () {
  const inp = SC._simInputs;
  if (!inp) return;
  inp.passiveOwned = {};
  inp.passiveFired = {};
  SC.simSaveInputs(inp);
  SC.simRefreshAfterInput(inp, 'passiveOwned');   // v0.25.43: 同上（全解除でも現在ターンの発動中は変えない）
};
// 「クリア」: 既定値（SC.simDefaultInputs）に戻す
SC.simClear = function () {
  SC._simInputs = SC.simDefaultInputs();
  SC.simBuild(SC._simInputs);
  SC.simSaveInputs(SC._simInputs);
};
// v0.25.38: おまかせ編成を適用した時の「保有パッシブ」既定チェックの規則（ユーザー指定）。
//   保有パッシブ一覧（SC.simPassiveDefs）のうち、次のどれにも当たらないものをチェックする:
//     a. never 系（d.never = 'wing'/'loadout'/'unsupported'）= 従来どおりチェック不可
//     b. バースデーサポートのカード由来（持ち主枠がサポ/ゲストで、そのカードが birthday:true。tools/convert_cards.js が付与）
//     c. サポ産（サポ0〜3・ゲスト）で効果量（バフ量など）が59%以下（SC.simPassiveEffectPct(pd) <= 59。Pカード由来は効果量に関係なく対象外＝この規則は掛けない。確率は見ない）。
//        v0.25.40: 旧c「確率が59%以下」は誤解釈だった（ユーザー指摘「59%以下は発動率ではなくバフ量の話。甘奈のVocal50%UPは外すがVocal135%UPは付ける」）。
//        例: 甘奈 Vocal50%UP→外す／Vocal135%UP→付ける。効果量が取れない（バフ以外の未知の種別）パッシブはこの規則では外さない
//     e. （v0.25.43 追加・ユーザー指定「発動率10%以下は初期チェックなし」）発動率（パネルの _prob＝確率表記なし=1.0・「ごく稀」=0.03 等は SC.parsePassiveProb どおり）が 10% 以下のもの。P産・サポ産を問わない。
//        判定順は a→b→c→e→d（never → birthday → effect → lowprob → turn1）。a〜d は不変
//     d. ターン1の基底状態（TURN1・メンタル満タン・バフなし・履歴なし）で条件が成立しないもの。ただし不成立の理由が「Nターン以降」だけのものは外さない
//        （判定は SC.condMetIgnoringTurnMin。「3ターン以降」→チェック／「履歴に◯◯」「メンタル50%以下」「VocalUPが3個以上付与」→外す）
//   複数に当たる時の理由は a→b→c→e→d の順で最初のもの。戻り値: { owned: [key…], excluded: [{ key, name, owner, reason:'never'|'birthday'|'effect'|'lowprob'|'turn1' }], counts: { never, birthday, effect, lowprob, turn1 }, total }
//   入力 inp は書き換えない（複製をターン1・バフなし・LINKなしにして simBuild し、評価後に inp で作り直す）。週が未選択なら S4残り4週（既定オーデ=歌姫）で評価 [推測]
SC.SIM_OMAKASE_LOWPROB_MAX = 0.10;   // v0.25.43: 発動率（pd._prob。1.0=100%）がこの値以下のパッシブは既定チェックしない（ユーザー指定。P産・サポ産を問わない）
SC.SIM_OMAKASE_EFFECT_MAX = 59;   // サポ産パッシブは効果量（%）がこの値以下なら既定チェックしない（ユーザー指定。v0.25.40: 旧 SC.SIM_OMAKASE_PROB_MAX=0.59（確率）から変更）
// パッシブの効果量（%）。buff パッシブ=_buffPct（複合属性「Vocal&Dance&Visual30%UP」も1つの値・「Vocal100%UP/メンタルダメージ20%CUT」のような複合はバフ側の値）／
//   非バフ系=その効果値（思い出ゲージ=_memGaugePct・回復=_healPct・ダメージカット=_cutPct・回避=_avoidPct・注目度=|_attnPct|）。取れなければ null
SC.simPassiveEffectPct = function (pd) {
  if (!pd) return null;
  const v = (typeof pd._buffPct === 'number' && ((pd._buffAttrs && pd._buffAttrs.length > 0) || pd._buffAttr)) ? pd._buffPct
    : (pd._memGaugePct !== undefined ? pd._memGaugePct
    : (pd._healPct !== undefined ? pd._healPct
    : (pd._cutPct !== undefined ? pd._cutPct
    : (pd._avoidPct !== undefined ? pd._avoidPct
    : (pd._attnPct !== undefined ? Math.abs(pd._attnPct) : null)))));
  return (v !== null && isFinite(v)) ? v : null;
};
SC.simOmakasePassiveRule = function (inp) {
  const keep = SC._simInputs;
  const probe = JSON.parse(JSON.stringify(inp));
  probe.turn = 1; probe.passiveOwned = {}; probe.passiveFired = {}; probe.linkOn = false; probe.selected = null; probe.buffMode = 'passive';
  if (!probe.weekKey) probe.weekKey = 's4w4';   // [推測] 週が未選択でも基底状態（審査員3人・★0・順位）を作れるよう、既定オーデが歌姫の週で評価する
  const res = { owned: [], excluded: [], counts: { never: 0, birthday: 0, effect: 0, lowprob: 0, turn1: 0 }, total: 0 };
  try {
    SC.simBuild(probe);
    const P = SC.CONFIG.panel;
    SC.simPassiveDefs().forEach(function (d) {
      res.total++;
      const pd = P[d.key] || {};
      const ownerId = SC.simOwnerCardId(pd.owner, probe.loadout);
      const ownerCard = ownerId ? SC.findCard(ownerId) : null;
      const fromSupport = !!ownerCard && (pd.owner === 'guest' || typeof pd.owner === 'number');   // サポ0〜3・ゲスト産（Pカード由来は false）
      const eff = SC.simPassiveEffectPct(pd);   // v0.25.40: 効果量（確率ではなくバフ量等。取れなければ null＝この規則では外さない）
      let reason = null;
      if (d.never) reason = 'never';
      else if (fromSupport && ownerCard.birthday === true) reason = 'birthday';
      else if (fromSupport && eff !== null && eff <= SC.SIM_OMAKASE_EFFECT_MAX + 1e-9) reason = 'effect';
      else if (typeof pd._prob === 'number' && pd._prob <= SC.SIM_OMAKASE_LOWPROB_MAX + 1e-9) reason = 'lowprob';   // v0.25.43: 発動率10%以下（確率表記なし=1.0は対象外）
      else if (!SC.condMetIgnoringTurnMin(pd._cond)) reason = 'turn1';
      if (reason) { res.counts[reason]++; res.excluded.push({ key: d.key, name: d.name, owner: d.owner, reason: reason }); }
      else res.owned.push(d.key);
    });
  } finally {
    SC._simInputs = keep;
    if (keep) SC.simBuild(keep);   // 呼び出し前の入力で state を作り直す（probe の基底状態を残さない）
  }
  return res;
};
// おまかせ編成: SC.OMAKASE_LOADOUTS[アイドル番号] を編成に入れる（Pスキル枠・発動中パッシブはリセット）。未知の番号は false
//   v0.25.38: 保有パッシブは SC.simOmakasePassiveRule の規則で既定チェックし、バフ指定を「保有パッシブ」にする（旧: 保有も空にリセット）。
//   本編の編成画面のおまかせ（main.js omakase-pick の本編側）はこの関数を通らない＝対象外。手動の編成変更（simOnChange）・編成クリアは従来どおり保有を空にする
SC.simApplyOmakase = function (no) {
  const o = SC.OMAKASE_LOADOUTS && SC.OMAKASE_LOADOUTS[no];
  const inp = SC._simInputs;
  if (!o || !inp) return false;
  inp.loadout = SC._simSafeLoadout({ p: o.p, supports: (o.supports || []).slice(), guest: o.guest });
  inp.passiveOwned = {};
  inp.passiveFired = {};
  inp.pSkillKeys = [null, null, null, null];
  inp.buffMode = 'passive';
  SC.simOmakasePassiveRule(inp).owned.forEach(function (k) { inp.passiveOwned[k] = true; });
  SC.simBuild(inp);
  SC.simSaveInputs(inp);
  return true;
};

// ---- v0.25.30: 1〆（1ターン目で審査員全員が満足して終わる）確率のモンテカルロ ----
// 本編エンジンをそのまま使う（行動順・アピール計算・審査員リアクション・ライバル行動の再実装はしない）:
//   入力から startAudition 直前の基底状態を作る → 試行ごとに JSON クローン → rngState を「試行番号だけ」から決まるシードに →
//   SC.startAudition（手札3枚・ライバル計画[判定は本番どおりランダム]・パッシブ抽選）→ 試行番号だけのシードで再シード →
//   手札の各候補行動を状態クローン上で SC.resolveTurn（プレイヤー判定 SC.SIM_ONESHOT_JUDGEMENT＝PERFECT）→ 審査員全員が満足したか判定。
//   v0.25.36: プレイヤー判定を NORMAL → PERFECT に変更（ユーザー指定「プレイヤー判定NORMALなの？ これはPERFECTにして」。1〆を狙う時は目押しでPERFECTを取る想定。
//   行動順も PERFECT なので、ライバル/審査員より先にプレイヤーが動く）
// v0.25.34: 共通乱数（CRN）化 — 旧実装は試行のシードが「入力全体のハッシュ」由来で、パッシブを1つ保有に足すだけで乱数列が全部変わり、
//   試行回数分のサンプリング誤差（200試行で±3%）がそのまま「確率が変わった」ように見えていた。
//   ①試行 t のシードは t だけから決める（入力に依存しない）②パッシブの発動判定は SC.passiveChance フックで (試行番号, panelKey) 由来の
//   独立した乱数にする（他のパッシブの有無・順序が発動結果に影響しない）③firePassives の後・resolveTurn の前に再シード
//   （以降のライバル行動・審査員リアクションの乱数も入力から独立）④ライバルの判定は本番どおりランダム（旧: 全員NORMAL強制）
//   ⑤既定1000試行を数十回ずつのチャンクで非同期実行（UI: SC.simOneShotKick）。診断として「ライバル寄与（平均）」を返す。
// バフ指定は排他（v0.25.31）: 手動バフ指定=手動バフ%だけを自ユニットの debuffs に加え、パッシブは一切発動させない（全パッシブを passiveRemoved に）/
//   保有パッシブ指定=保有にチェックしたパッシブだけが試行ごとに本編どおり発動（未保有は passiveRemoved で除外）・手動バフは無視。
//   発動中パッシブ・LINK成立扱い・ターン数・判定入力・ターン進行は使わない（ターンは常に1・プレイヤー判定はPERFECT固定）。
SC.SIM_ONESHOT_JUDGEMENT = 'perfect';   // v0.25.36: 1〆のプレイヤー判定（ユーザー指定）。入力キー（simOneShotKey）にも含める＝判定を変えたら過去の確定値は使わない
SC.SIM_ONESHOT_TRIALS = 1000;   // v0.25.34: 既定の試行回数（旧200）。実測で1試行≒1〜2ms（ブラウザ）→1000回≒1〜2秒。チャンク実行なので画面は固まらない
SC.SIM_ONESHOT_CHUNK = 25;      // 1チャンクの試行数（setTimeout で区切る）
SC._simHash = function (str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) + str.charCodeAt(i)) | 0;
  return h >>> 0;
};
// 試行 t の開始シード（入力に依存しない）／firePassives 後の再シード（同じく t だけ）
SC._simTrialSeed = function (t) { return Math.imul(0x9E3779B9, t + 1) >>> 0; };
SC._simTrialSeed2 = function (t) { return (Math.imul(0x85EBCA6B, t + 1) ^ 0x5BD1E995) >>> 0; };
// (試行番号, パッシブkey) から決まる一様乱数 [0,1)（murmur3 の最終混合）。SC.passiveChance の差し替え先
SC._simPassiveUnit = function (t, key) {
  let h = (SC._simHash(String(key)) ^ Math.imul(t + 1, 0x9E3779B1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
};
// 1〆に関係する入力だけのキー（キャッシュ用）。バフ指定と、手動バフ指定なら手動バフ／保有パッシブ指定なら保有セットを含める。
// 発動中パッシブ・linkOn・turn・judge・selected 等は含めない。v0.25.34: 流行(trend)を含める
SC.simOneShotKey = function (inp) {
  const fin = inp.weekKey === 'semi' || inp.weekKey === 'final';
  const buffPart = inp.buffMode === 'manual' ? inp.buff : Object.keys(inp.passiveOwned || {}).sort();
  return JSON.stringify([inp.loadout, inp.stats, inp.ex, inp.weekKey, fin ? 'finals' : inp.auditionId, inp.mode, inp.trend, inp.memLv, inp.buffMode, buffPart, inp.pSkillKeys, SC.SIM_ONESHOT_JUDGEMENT]);   // v0.25.36: 末尾に1〆の判定（旧キャッシュ=NORMAL時代の値を返さない）
};

// 実行器を作る（基底状態の組み立てまで。試行は simOneShotStep で進める）。
//   SC.state / SC._simActive / SC._fx は呼び出し前の値に戻す（表示用 state は同一オブジェクトのまま不変）。
//   注: 編成グローバル（SC.IDOL/SUPPORTS/cp_パネル）は inp から再構築する。inp は現在の入力（SC._simInputs）と同じ前提
SC.simOneShotStart = function (inp, trials, opts) {
  const n = Math.max(1, Math.round(Number(trials) || SC.SIM_ONESHOT_TRIALS));
  // v0.25.40: opts.seedBase=乱数番号の開始位置（既定0＝従来どおり試行番号から。230万はセルごとに重ならない範囲を渡して、セル間の標本誤差を独立にする）
  const r = { trials: n, seedBase: (opts && isFinite(opts.seedBase)) ? Math.max(0, Math.floor(opts.seedBase)) : 0, t: 0, done: false, cancelled: false, ms: 0, cur: 0, success: 0, judgeOk: [0, 0, 0], rival: [0, 0, 0], fin: {},
    res: { trials: n, success: 0, rate: 0, judgeRate: [0, 0, 0], rivalAvg: [0, 0, 0], finishers: [], ms: 0 } };
  const keep = { state: SC.state, active: SC._simActive, fx: SC._fx };
  const t0 = Date.now();
  try {
    r.inp = SC.simSanitize(JSON.parse(JSON.stringify(inp)));   // 呼び出し元の入力は書き換えない
    // v0.25.31: Pアイドル/週が未選択なら計算しない（rate=null）
    if (!SC.simReady(r.inp)) {
      r.res.trials = 0; r.res.rate = null; r.res.judgeRate = [null, null, null]; r.res.rivalAvg = [null, null, null]; r.res.empty = true;
      r.done = true;
      return r;
    }
    SC._simActive = true;   // 本編セーブへ書かない
    SC._fx = null;
    const base = SC._simBuildBase(r.inp);
    // 発動させないパッシブを除外（手動バフ指定=全除外 / 保有パッシブ指定=未保有を除外）。firePassives は passiveRemoved を見る
    base.passiveRemoved = SC._simRemovedKeys(r.inp, SC.simPassiveDefs().map(function (d) { return d.key; }));
    r.baseJson = JSON.stringify(base);
    r.defId = base.finalsStage ? base.finalsStage : r.inp.auditionId;
  } finally {
    SC.state = keep.state;
    SC._simActive = keep.active;
    SC._fx = keep.fx;
  }
  r.ms += Date.now() - t0;
  return r;
};
// v0.25.34: 状態を JSON でクローンすると、planRivals が u.plan.target に入れた「審査員オブジェクトへの参照」が審査員配列から切り離された
//   コピーになる（execRivalAction は plan.target をそのまま applyAppeal の対象にするので、ライバルのアピールがクローン側の本物の審査員に
//   一切入らなかった＝旧1〆はライバル寄与が常に0だった）。クローン直後に属性で引き直して繋ぎ直す
//   ※本編 execRivalAction も v0.25.34 で「計画対象を属性で引き直す」よう根治済み（オデ中セーブ→ロードの同種バグ）。本関数は二重の保険
SC._simRelink = function (state) {
  const a = state && state.audition;
  if (!a) return state;
  a.units.forEach(function (u) {
    if (!u.plan || !u.plan.target) return;
    const j = a.judges.filter(function (x) { return x.attr === u.plan.target.attr; })[0];
    if (j) u.plan.target = j;
  });
  return state;
};
// v0.25.47: 札が1回の使用で審査員3人全員に届き得るか（1〆の候補になるか）。
//   本体が全体アピール（allJudges）／効果文（付随・PLUS・LINK）に「全観客にN倍アピール」がある（単体＋全体の複合アピール、PLUS成立で全体になる札も含む）。
//   条件節の成否はここでは見ない（実際に成立するかは試行の中で本編の処理が決める）。全観客の追加アピールが (Grow) 節の倍率変動だけの札は届かない扱い（applyExtraEffects も撃たない）
SC.simCardReachesAll = function (card) {
  if (!card) return false;
  if (card.allJudges) return true;
  if (!Array.isArray(card.extra) || !SC.parseExtraSegments) return false;
  const re = SC._extraApRegex(true);
  return SC.parseExtraSegments(card).some(function (seg) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(seg.text)) !== null) {
      if (m[1] && !SC._extraApAfterGrow(seg.text, m)) return true;
    }
    return false;
  });
};

// 1試行（SC.state / パッシブ判定フックは simOneShotStep が差し替え済みの前提）
SC._simOneTrial = function (r, t0) {
  const inp = r.inp;
  const t = t0 + (r.seedBase || 0);          // v0.25.40: 乱数の番号。既定(seedBase=0)は従来どおり試行番号そのまま（1〆パネルの値は不変）。230万のセルは重ならない範囲を渡す
  r.cur = t;
  SC.state = JSON.parse(r.baseJson);
  SC.state.rngState = SC._simTrialSeed(t);   // 入力に依存しない共通乱数
  SC.startAudition(r.defId, null);           // 手札配布・ライバル計画（判定は本番どおりランダム）・パッシブ抽選（passiveChance フック）
  SC.state.rngState = SC._simTrialSeed2(t);  // 以降（ライバル行動・審査員リアクションの対象等）の乱数も入力から独立
  const a = SC.state.audition;
  const player = a.units[0];
  // 手動バフ%（手動バフ指定の時だけ。保有パッシブ指定では手動バフは無視）
  if (inp.buffMode === 'manual') {
    SC.ATTRS.forEach(function (at) {
      if (inp.buff[at]) player.debuffs.push({ attr: at, pct: inp.buff[at], untilTurn: 9999, src: 'passive' });   // v0.25.40: 手動バフ＝パッシブ相当の印
    });
  }
  // 候補行動: 手札のアピール札（単体札=審査員3通り・全体札=1通り。v0.25.36: 回復札・効果札は除く）＋ ゲージ満タンなら思い出（memGood）。プレイヤーの判定は PERFECT（v0.25.36。旧NORMAL）
  //   v0.25.47: 全審査員に届かない札（SC.simCardReachesAll が false＝本体が単体で、全観客への追加アピールも無い）は1〆し得ないので試さない（ユーザー指定）
  const cands = [];
  a.hand.forEach(function (deckIdx, pos) {
    const card = a.deck[deckIdx];
    if (!card || SC.isEffectOnlyCard(card) || !SC.simCardReachesAll(card)) return;
    const owner = card.owner;
    if (card.allJudges) {
      cands.push({ key: owner + '|' + card.name, name: card.name, owner: owner,
        action: { type: 'appeal', cardPos: pos, judgeIdx: 0, allJudges: true, judgement: SC.SIM_ONESHOT_JUDGEMENT } });
    } else {
      a.judges.forEach(function (j, ji) {
        cands.push({ key: owner + '|' + card.name, name: card.name, owner: owner,
          action: { type: 'appeal', cardPos: pos, judgeIdx: ji, allJudges: false, judgement: SC.SIM_ONESHOT_JUDGEMENT } });
      });
    }
  });
  if (SC.memoryLv() >= 1 && player.mem >= player.memMax) {
    cands.push({ key: 'p|思い出アピール', name: '思い出アピール', owner: 'p', action: { type: 'memory', judgement: 'memGood' } });
  }
  const snap = JSON.stringify(SC.state);
  let bestGone = [false, false, false], bestCnt = -1, bestRival = [0, 0, 0];
  const win = {};
  cands.forEach(function (c) {
    SC.state = SC._simRelink(JSON.parse(snap));
    SC.resolveTurn(c.action);
    SC.fxCollect();   // 演出バッファは必ず捨てる
    const js = SC.state.audition.judges;
    const gone = js.map(function (j) { return !!j.gone; });
    const cnt = gone.filter(Boolean).length;
    if (cnt === gone.length) win[c.key] = c;
    if (cnt > bestCnt) {
      bestCnt = cnt; bestGone = gone;
      // 診断: この行動の1ターン内にライバルが各審査員へ与えた量（applyAppeal が judge.dealt に蓄積した値＝余剰切捨て後の有効分）
      const us = SC.state.audition.units;
      bestRival = js.map(function (j) {
        return us.reduce(function (sum, u) { return u.isPlayer ? sum : sum + (j.dealt[u.key] || 0); }, 0);
      });
    }
  });
  bestGone.forEach(function (g, i) { if (g) r.judgeOk[i]++; });
  bestRival.forEach(function (v, i) { r.rival[i] += v; });
  const wk = Object.keys(win);
  if (wk.length > 0) {
    r.success++;
    wk.forEach(function (k) {
      const c = win[k];
      if (!r.fin[k]) r.fin[k] = { name: c.name, owner: c.owner, w: 0 };
      r.fin[k].w += 1 / wk.length;
    });
  }
};
// 実行器を count 試行ぶん進める。完了したら true（結果は r.res）。SC.state / _simActive / _fx / passiveChance は呼び出し前に戻す
SC.simOneShotStep = function (r, count) {
  if (r.done || r.cancelled) return r.done;
  const keep = { state: SC.state, active: SC._simActive, fx: SC._fx, pc: SC.passiveChance };
  const t0 = Date.now();
  try {
    SC._simActive = true;
    SC._fx = null;
    // パッシブの発動判定を (試行番号, panelKey) 由来の独立した乱数に差し替える（この試行中だけ）
    SC.passiveChance = function (prob, key) { return SC._simPassiveUnit(r.cur, key) < prob; };
    const end = Math.min(r.trials, r.t + Math.max(1, count));
    while (r.t < end) { SC._simOneTrial(r, r.t); r.t++; }
  } finally {
    SC.state = keep.state;
    SC._simActive = keep.active;
    SC._fx = keep.fx;
    SC.passiveChance = keep.pc;
  }
  r.ms += Date.now() - t0;
  if (r.t >= r.trials) {
    const res = r.res, n = r.trials;
    res.success = r.success;
    res.rate = r.success / n;
    res.judgeRate = r.judgeOk.map(function (c) { return c / n; });
    res.rivalAvg = r.rival.map(function (v) { return v / n; });
    res.finishers = Object.keys(r.fin).map(function (k) { return r.fin[k]; })
      .sort(function (x, y) { return y.w - x.w; }).slice(0, 3)
      .map(function (f) {
        return { name: f.name, owner: f.owner, ownerName: SC.supportOwnerShortName(f.owner), share: r.success > 0 ? f.w / r.success : 0 };
      });
    res.ms = r.ms;
    r.done = true;
  }
  return r.done;
};
// 同期版（smoke・テスト用）。戻り値 { trials, success, rate, judgeRate:[vo,da,vi], rivalAvg:[vo,da,vi], finishers:[{name, owner, ownerName, share}], ms }
//   judgeRate = 各試行の最良行動（成功候補が無ければ満足人数最多）での各審査員の満足率 / rivalAvg = 同じ最良行動の1ターン内にライバルが各審査員へ与えたアピールの平均 /
//   finishers = 成功した試行で全員満足させられた札の内訳（1試行内に複数の成功札があれば等分。share は成功試行に対する割合 0〜1・上位3件）
SC.simOneShot = function (inp, trials) {
  const r = SC.simOneShotStart(inp, trials);
  if (!r.done) SC.simOneShotStep(r, r.trials);
  return r.res;
};

// ---- v0.25.37: 230万周回の1〆数（S2残り1週から毎週オーディションを受けた17戦で、1〆が何回起きるかの期待値 ◯/17） ----
// ユーザー指定: 該当オーディションの1〆率とは別に表示。S2残り1週から毎回オーディションを受けた場合（WING準決勝・決勝は受けない）の17試合。
//   他は1〆シミュレーションと同じ（プレイヤーはPERFECT・ライバルはランダム判定だが行動表に従う）。流行は完全ランダムではなく wiki の法則
//   （各シーズンの最初の6週=6パターンの順列・7、8週目はランダムで7≠8。SC.genSeasonTrends）。残り8週=シーズン1週目、残り1週=8週目（S2残り1週は S2 の8週目）
// 計算（本編エンジンの1〆実行器 SC.simOneShotStart/Step を使う。式は再実装しない）:
//   ①v0.25.40: 17週（週ごとの実際の週キー・オーデは SC.simDefaultAuditionForWeek）×6流行パターン=102セルそれぞれを N 試行回して成功率 p(週,流行)を出す
//     （旧 v0.25.37〜39: オーデごとに代表週1つ=6×6=36セル。週が違えば経過週Wが違い、サポのステへの係数 0.2(1+0.1W) の分だけ成功率が少し変わる→週ごとに厳密化）
//   ②流行の並びを法則どおりに多数サンプルし（S2・S3・S4 それぞれ SC.genSeasonTrends で8週分を生成。S2は8週目だけ使う）、
//     17週の Σ p(その週, その週の流行) の平均＝1〆回数の期待値。乱数は SC.shuffle/SC.randInt（SC.genSeasonTrends）経由・
//     シードは入力に依存しない固定値（決定論的）。SC.state を一時的に差し替えて抽選し、必ず元に戻す
SC.SIM230_AUDS = [   // 6オーディションの代表週と表示名（ユーザー指定の週キー）。v0.25.40: 計算の単位ではなくなった（結果の perAud＝オーデ別の集計・検算用）
  { id: 'yuugata', weekKey: 's2w1', label: '夕方' }, { id: 'spotlight', weekKey: 's3w8', label: 'SPOT' },
  { id: 'odotte', weekKey: 's3w7', label: '踊って' }, { id: 'legend', weekKey: 's4w8', label: 'LEGEND' },
  { id: 'nanairo', weekKey: 's4w7', label: '七彩' }, { id: 'utahime', weekKey: 's4w4', label: '歌姫' }
];
SC.SIM230_TRIALS = 60;       // 1セルあたりの試行数（v0.25.40: 102セルで総所要時間が従来(36セル×200試行≒8秒)と同程度になる値。ブラウザ実測: 60試行=約8.6秒・70=約10.9秒・80=約11.9秒・200=約29.7秒。セル間の乱数は独立なので60でも200試行と期待値の差は0.03程度）
SC.SIM230_CHUNK = 40;        // 1チャンクの試行数（setTimeout で区切る。1チャンク≒30〜40ms。小さいほど setTimeout の待ちが積もって遅くなる）
SC.SIM230_SAMPLES = 20000;   // 流行の並びのサンプル数
SC.SIM230_SEED = 2300000;    // 流行の並びの抽選シード（入力に依存しない固定値）
// 17戦: S2残り1週 → S3残り8〜1週 → S4残り8〜1週。各要素 { weekKey, season(2..4), pos(シーズン内の週 0..7), auditionId }
SC.sim230Weeks = function () {
  const list = [{ season: 2, left: 1 }];
  [3, 4].forEach(function (se) { for (let left = 8; left >= 1; left--) list.push({ season: se, left: left }); });
  return list.map(function (w) {
    const wk = 's' + w.season + 'w' + w.left;
    return { weekKey: wk, season: w.season, pos: 8 - w.left, auditionId: SC.simDefaultAuditionForWeek(wk) };
  });
};
// 230万の入力キー（1〆のキーから 週・オーデ・流行 を除いたもの。ターン・判定・選択札・LINK成立扱い・発動中パッシブも含めない）
SC.sim230Key = function (inp) {
  const buffPart = inp.buffMode === 'manual' ? inp.buff : Object.keys(inp.passiveOwned || {}).sort();
  return JSON.stringify([inp.loadout, inp.stats, inp.ex, inp.mode, inp.memLv, inp.buffMode, buffPart, inp.pSkillKeys, SC.SIM_ONESHOT_JUDGEMENT]);
};
// 230万は Pアイドルが選ばれていれば計算できる（週は使わない。1〆の SC.simReady は週も必須なので別判定）
SC.sim230Ready = function (inp) { return !!(inp && inp.loadout && inp.loadout.p); };
// v0.25.40: 計算するセルの総数（17週×6流行=102。UIの進捗表示「計算中 n/102」と実行器の total が使う）
SC.sim230Total = function () { return SC.sim230Weeks().length * SC.TREND_PATTERNS.length; };
// 実行器: 102セル（週順×流行順）を1つずつ SC.simOneShotStart/Step で回す。r.p = { 週キー: [流行0..5 の成功率] }
SC.sim230Start = function (inp, trials) {
  const n = Math.max(1, Math.round(Number(trials) || SC.SIM230_TRIALS));
  const r = { trials: n, weekList: SC.sim230Weeks(), total: SC.sim230Total(), idx: 0, run: null, p: {}, done: false, cancelled: false, ms: 0, res: null };
  r.inp = SC.simSanitize(JSON.parse(JSON.stringify(inp)));   // 呼び出し元の入力は書き換えない
  if (!SC.sim230Ready(r.inp)) { r.done = true; r.res = { empty: true }; }
  return r;
};
// count 試行ぶん進める（セルの境目をまたいでよい）。完了したら true（結果は r.res）
SC.sim230Step = function (r, count) {
  if (r.done || r.cancelled) return r.done;
  const T = SC.TREND_PATTERNS.length;
  let left = Math.max(1, count);
  const t0 = Date.now();
  while (!r.done && left > 0) {
    const wk = r.weekList[Math.floor(r.idx / T)], tr = r.idx % T;
    if (!r.run) {
      const ci = JSON.parse(JSON.stringify(r.inp));
      ci.weekKey = wk.weekKey; ci.auditionId = wk.auditionId; ci.trend = tr;   // v0.25.40: 週ごとの実際の週キー（経過週Wが違えば支援ステの係数も違う）
      // 乱数番号はセルごとに重ならない範囲（r.idx × 試行数〜）。全セルが同じ番号列（共通乱数）だと、少ない試行数の標本誤差が102セルで同じ向きに揃って
      //   17戦の合計が大きくずれる（70試行で最大±1/17）→ セル間は独立にして誤差を平均で打ち消す。入力（編成・ステ等）には依存しない＝決定論的
      r.run = SC.simOneShotStart(ci, r.trials, { seedBase: r.idx * r.trials });
    }
    const before = r.run.t;
    SC.simOneShotStep(r.run, left);
    left -= Math.max(1, r.run.t - before);
    if (r.run.done) {
      if (!r.p[wk.weekKey]) r.p[wk.weekKey] = [];
      r.p[wk.weekKey][tr] = r.run.res.rate;
      r.run = null;
      r.idx++;
      if (r.idx >= r.total) { r.res = SC.sim230Compute(r.p, r.trials); r.done = true; }
    }
  }
  r.ms += Date.now() - t0;
  if (r.done && r.res) r.res.ms = r.ms;
  return r.done;
};
// 102セルの成功率 → 期待値。pTab = { 週キー: [流行0..5 の成功率] }（17週ぶん）
SC.sim230Compute = function (pTab, trials) {
  const weeks = SC.sim230Weeks();
  const T = SC.TREND_PATTERNS.length;
  const mean6 = function (wkKey) { return pTab[wkKey].reduce(function (s, v) { return s + v; }, 0) / T; };
  // 厳密値（流行の各週の周辺分布は一様なので Σ_週 (その週の6流行平均)）。サンプルの検算用
  const expectExact = weeks.reduce(function (s, w) { return s + mean6(w.weekKey); }, 0);
  // 法則どおりの流行列をサンプルして 17戦の Σ p の平均を取る（S2・S3・S4 の3シーズン分を毎回生成）
  const keep = SC.state;
  let acc = 0;
  const N = SC.SIM230_SAMPLES;
  try {
    SC.state = { rngState: SC.SIM230_SEED >>> 0 };   // SC.rand は SC.state.rngState を使う。表示用 state には触らない
    for (let k = 0; k < N; k++) {
      const seasons = { 2: SC.genSeasonTrends(), 3: SC.genSeasonTrends(), 4: SC.genSeasonTrends() };
      let sum = 0;
      for (let i = 0; i < weeks.length; i++) sum += pTab[weeks[i].weekKey][seasons[weeks[i].season][weeks[i].pos]];
      acc += sum;
    }
  } finally { SC.state = keep; }
  // オーデ別の集計（表示・検算用）: そのオーデを受ける週ぶんの p の平均。byTrend=各流行の週平均
  const perAud = SC.SIM230_AUDS.map(function (a) {
    const ws = weeks.filter(function (w) { return w.auditionId === a.id; });
    const byTrend = [];
    for (let tr = 0; tr < T; tr++) byTrend.push(ws.reduce(function (s, w) { return s + pTab[w.weekKey][tr]; }, 0) / (ws.length || 1));
    return { id: a.id, label: a.label, weekKey: a.weekKey, weeks: ws.length, p: byTrend.reduce(function (s, v) { return s + v; }, 0) / T, byTrend: byTrend };
  });
  const byWeek = weeks.map(function (w) { return { weekKey: w.weekKey, auditionId: w.auditionId, p: mean6(w.weekKey), byTrend: pTab[w.weekKey].slice() }; });
  return {
    trials: trials, samples: N, weeks: weeks.length, cells: weeks.length * T,
    expect: acc / N, expectExact: expectExact,
    perAud: perAud, byWeek: byWeek,
    ms: 0
  };
};
// 同期版（smoke・テスト用）。trials=1セルあたりの試行数
SC.sim230 = function (inp, trials) {
  const r = SC.sim230Start(inp, trials);
  while (!r.done) SC.sim230Step(r, 1000000);
  return r.res;
};

// ---- v0.25.40: 1〆・230万の計算結果の永続キャッシュ（localStorage 'sc_sim_cache_v1'） ----
// ユーザー指定「一度算出したやつはキャッシュ等を残してすぐ出せるように。特にセーブした編成」。入力キー（SC.simOneShotKey / SC.sim230Key）＋試行数＋計算の版ごとに、
//   結果オブジェクト（1〆: rate・rivalAvg・finishers…／230万: expect・週×流行セルの p…）を保存する。本編セーブ・sc_sim_v1・sc_sim_slots_v1 とは別キー（SC.save は通らない＝SC._simActive の扱いは不変）。
// ★運用ルール（重要）: 結果は計算ロジックとデータに依存する。1〆・230万の結果が変わり得る変更
//   （audition.js のアピール計算/パッシブ/ライバル、sim.js の実行器、config.js の定数、tools/convert_cards.js で cards.js を再生成した時 など）をしたら、
//   必ず下の SC.SIM_CALC_VER を上げること。版が違うエントリは読まれず、次に書き込む時に掃除される（古い結果を新ロジックの値として出さないため）。
// キー: 版 | 種別 | ハッシュ2本＋文字数（入力キー文字列＋'#'＋試行数）。2本の32bitハッシュ＋長さで衝突は実質起きない（照合も同じ id 文字列）
// 容量: 種別ごとに LRU の件数上限（1〆 200・230万 100）。QuotaExceeded 等の書き込み失敗は握りつぶし、古い順に削って再試行→それでも駄目ならメモリ上だけで動く（例外は外に出さない）。
//   localStorage が使えない環境（プライベートモード・node）でもメモリ上のキャッシュだけで動く
SC.SIM_CALC_VER = '0.25.48';   // v0.25.48: カードMDの追加で cards.js を再生成（新カード10枚）。(旧 v0.25.47: シミュをハイテンション固定（思い出ゲージ初期70%）・1〆の候補から全審査員に届かない単体札を除外（審査員別満足率の内訳が変わる）。(旧 v0.25.44: PLUS等の条件節 [〜場合] を札の使用前の状態で評価（使用者本人の履歴条件は札自身で成立しない）＝PLUSが従来より成立しにくくなり1〆・230万が変わる。(旧 v0.25.43: 注目度UP/DOWNを[Nターン]どおりに切れる状態効果に（パッシブの注目度は発動ターンのみ・ライブスキルの注目度UPも付与）＝ライバルの狙い方・注目度条件・[注目度が高い/低いほど効果UP]の結果が変わる。(旧 v0.25.42: 1ターンのパッシブ発動上限を6個（P-UR編成のみ8個）に。思い出ゲージ/注目度パッシブも発動数に数える))))
SC.SIM_CACHE_KEY = 'sc_sim_cache_v1';
SC.SIM_CACHE_MAX = { os: 200, s230: 100 };
SC._simCacheMem = null;     // { os: [エントリ…古い→新しい], s230: [...], dirty }。エントリ = { id, v, t, r }
SC._simCacheLs = null;      // メモリ上のキャッシュを読み込んだ時の localStorage（差し替わったら読み直す＝テストの模擬ストレージ用）
SC._simCacheTimer = null;
SC._simCacheStore = function () {
  try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
};
SC._simCacheHash = function (str) {
  let h1 = 0x811c9dc5, h2 = 5381;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;                       // FNV-1a
    h2 = (Math.imul(h2 ^ c, 0x5bd1e995) + (h2 >>> 15)) >>> 0;     // 別系統の混合
  }
  return h1.toString(36) + '.' + h2.toString(36) + '.' + str.length.toString(36);
};
SC._simCacheId = function (kind, keyStr, trials) {
  return SC.SIM_CALC_VER + '|' + kind + '|' + SC._simCacheHash(String(keyStr) + '#' + (Number(trials) || 0));
};
SC._simCacheLoad = function () {
  const ls = SC._simCacheStore();
  if (SC._simCacheMem && SC._simCacheLs === ls) return SC._simCacheMem;
  const m = { os: [], s230: [], dirty: false };
  let raw = null;
  try { raw = ls ? ls.getItem(SC.SIM_CACHE_KEY) : null; } catch (e) { raw = null; }
  if (raw) {
    try {
      const o = JSON.parse(raw);
      ['os', 's230'].forEach(function (k) {
        if (o && Array.isArray(o[k])) o[k].forEach(function (e) {
          if (e && typeof e.id === 'string' && typeof e.v === 'string' && e.r && typeof e.r === 'object') m[k].push({ id: e.id, v: e.v, t: Number(e.t) || 0, r: e.r });
        });
      });
    } catch (e) { /* 壊れた保存値は空のキャッシュとして扱う */ }
  }
  SC._simCacheMem = m;
  SC._simCacheLs = ls;
  return m;
};
// メモリ上のキャッシュを localStorage に書く。容量超過（QuotaExceeded 系）で失敗したら、古い順に25%ずつ削った「保存する分」で最大8回まで再試行する
//   （削るのは保存する分だけ。メモリ上のキャッシュはそのセッションで使い続ける）。QuotaExceeded 以外の失敗（アクセス拒否など）は削らずに諦める。例外は外に出さない。成功で true
SC._simCacheWrite = function () {
  const m = SC._simCacheMem;
  const ls = SC._simCacheStore();
  if (!m || !ls) return false;
  let os = m.os, s230 = m.s230;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      ls.setItem(SC.SIM_CACHE_KEY, JSON.stringify({ os: os, s230: s230 }));
      m.dirty = false;
      return true;
    } catch (e) {
      const quota = !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 || /quota/i.test(String(e.message || e)));
      if (!quota || os.length + s230.length === 0) return false;
      os = os.slice(Math.ceil(os.length * 0.25));
      s230 = s230.slice(Math.ceil(s230.length * 0.25));
    }
  }
  return false;
};
// ヒット時の LRU 更新（並べ替え）は次の書き込みか、少し待って（2秒）まとめて保存する＝ヒットのたびに全体を書き直さない
SC._simCacheSchedule = function () {
  if (SC._simCacheTimer || typeof setTimeout !== 'function') return;
  SC._simCacheTimer = setTimeout(function () {
    SC._simCacheTimer = null;
    if (SC._simCacheMem && SC._simCacheMem.dirty) SC._simCacheWrite();
  }, 2000);
};
SC.simCacheClear = function () {
  SC._simCacheMem = null; SC._simCacheLs = null;
  const ls = SC._simCacheStore();
  try { if (ls) ls.removeItem(SC.SIM_CACHE_KEY); } catch (e) {}
};
// id で引く（版違い・id 違いはミス）。ヒットしたらその種別の末尾（最近使った）に移して結果のコピーを返す
SC._simCacheGetId = function (kind, id) {
  const m = SC._simCacheLoad();
  const list = m[kind];
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.id === id && e.v === SC.SIM_CALC_VER) {
      if (i !== list.length - 1) { list.splice(i, 1); list.push(e); m.dirty = true; SC._simCacheSchedule(); }
      return JSON.parse(JSON.stringify(e.r));
    }
  }
  return null;
};
// id で書く（上書き可）。他の版のエントリを掃除し、種別ごとの上限を超えた分は古い順に捨てて保存
SC._simCachePutId = function (kind, id, result) {
  if (!result || typeof result !== 'object' || result.empty) return false;
  const m = SC._simCacheLoad();
  if (!m[kind]) return false;
  let copy;
  try { copy = JSON.parse(JSON.stringify(result)); } catch (e) { return false; }
  ['os', 's230'].forEach(function (k) { m[k] = m[k].filter(function (e) { return e.v === SC.SIM_CALC_VER && e.id !== id; }); });
  m[kind].push({ id: id, v: SC.SIM_CALC_VER, t: Date.now(), r: copy });
  const mx = SC.SIM_CACHE_MAX[kind] || 100;
  while (m[kind].length > mx) m[kind].shift();
  m.dirty = true;
  SC._simCacheWrite();
  return true;
};
// kind: 'os'(1〆) | 's230'(230万)。keyStr=SC.simOneShotKey / SC.sim230Key の文字列。trials=その結果を出した試行数
SC.simCacheGet = function (kind, keyStr, trials) { return SC._simCacheGetId(kind, SC._simCacheId(kind, keyStr, trials)); };
SC.simCachePut = function (kind, keyStr, trials, result) {
  const id = SC._simCacheId(kind, keyStr, trials);
  const ok = SC._simCachePutId(kind, id, result);
  if (ok) SC._simSlotAttach(kind, id, result);
  return ok;
};
// 入力 inp の1〆／230万の結果をキャッシュから引く（無ければ null）。UI（sim_ui.js）は render 時に呼び、ヒットなら「計算中」を出さずに即表示する
SC.simOneShotLookup = function (inp, trials) { return inp ? SC.simCacheGet('os', SC.simOneShotKey(inp), trials || SC.SIM_ONESHOT_TRIALS) : null; };
SC.simOneShotStore = function (inp, result, trials) { return inp ? SC.simCachePut('os', SC.simOneShotKey(inp), trials || SC.SIM_ONESHOT_TRIALS, result) : false; };
SC.sim230Lookup = function (inp, trials) { return inp ? SC.simCacheGet('s230', SC.sim230Key(inp), trials || SC.SIM230_TRIALS) : null; };
SC.sim230Store = function (inp, result, trials) { return inp ? SC.simCachePut('s230', SC.sim230Key(inp), trials || SC.SIM230_TRIALS, result) : false; };
// 同期版（smoke・テスト用）: キャッシュにあれば実行器を呼ばずに返し、無ければ計算して書く。戻り値は SC.simOneShot / SC.sim230 と同じ形
SC.simOneShotCached = function (inp, trials) {
  const si = SC.simSanitize(JSON.parse(JSON.stringify(inp)));
  const n = trials || SC.SIM_ONESHOT_TRIALS;
  const hit = SC.simOneShotLookup(si, n);
  if (hit) return hit;
  const res = SC.simOneShot(si, n);
  SC.simOneShotStore(si, res, n);
  return res;
};
SC.sim230Cached = function (inp, trials) {
  const si = SC.simSanitize(JSON.parse(JSON.stringify(inp)));
  const n = trials || SC.SIM230_TRIALS;
  const hit = SC.sim230Lookup(si, n);
  if (hit) return hit;
  const res = SC.sim230(si, n);
  SC.sim230Store(si, res, n);
  return res;
};

// ---- セーブスロットと計算結果（上の永続キャッシュが押し出されてもセーブした編成は即表示できるように、スロット側にも結果を持たせる） ----
// スロットの res = { ver, os, osId, s230, s230Id }（無い項目は省略）。ver が違う・id が（入力から計算し直した値と）違うものは使わない
SC._simSlotIds = function (inp) {
  return { os: SC._simCacheId('os', SC.simOneShotKey(inp), SC.SIM_ONESHOT_TRIALS), s230: SC._simCacheId('s230', SC.sim230Key(inp), SC.SIM230_TRIALS) };
};
// 保存時: 入力 inp の結果のうちキャッシュにあるものを集める（1〆は週が未選択だと計算されないので無い）。何も無ければ null
SC._simSlotResults = function (inp) {
  const ids = SC._simSlotIds(inp);
  const res = { ver: SC.SIM_CALC_VER };
  let any = false;
  [['os', SC.simReady(inp)], ['s230', SC.sim230Ready(inp)]].forEach(function (p) {
    if (!p[1]) return;
    const r = SC._simCacheGetId(p[0], ids[p[0]]);
    if (r) { res[p[0]] = r; res[p[0] + 'Id'] = ids[p[0]]; any = true; }
  });
  return any ? res : null;
};
// 読込時: スロットの結果をキャッシュへ戻す（版が同じで id が一致するものだけ。すでにキャッシュにあれば何もしない）
SC._simSlotSeed = function (sl, inp) {
  const res = sl && sl.res;
  if (!res || res.ver !== SC.SIM_CALC_VER) return;
  const ids = SC._simSlotIds(inp);
  ['os', 's230'].forEach(function (k) {
    if (res[k] && res[k + 'Id'] === ids[k] && !SC._simCacheGetId(k, ids[k])) SC._simCachePutId(k, ids[k], res[k]);
  });
};
// 計算完了（キャッシュ書き込み）時: 同じ入力で保存済みのスロットで、その結果をまだ持っていないものに結果を足す（保存→計算中→完了、の経路）
SC._simSlotAttach = function (kind, id, result) {
  let slots;
  try { slots = SC.simSlots(); } catch (e) { return; }
  let changed = false;
  const out = slots.map(function (sl) {
    if (!sl || !sl.inp) return sl;
    let sid;
    try { sid = SC._simSlotIds(SC.simSanitize(JSON.parse(JSON.stringify(sl.inp))))[kind]; } catch (e) { return sl; }
    if (sid !== id || (sl.res && sl.res.ver === SC.SIM_CALC_VER && sl.res[kind + 'Id'] === id)) return sl;
    const keepRes = (sl.res && sl.res.ver === SC.SIM_CALC_VER) ? sl.res : { ver: SC.SIM_CALC_VER };
    changed = true;
    const ns = Object.assign({}, sl, { res: Object.assign({}, keepRes) });
    ns.res[kind] = JSON.parse(JSON.stringify(result));
    ns.res[kind + 'Id'] = id;
    return ns;
  });
  if (changed) SC._simSlotsWrite(out);
};

// 入口: 保存済み入力を読み込み→組み立て→シミュレーション画面へ
SC.simEnter = function () {
  SC._simInputs = SC.simLoadInputs();
  SC.simBuild(SC._simInputs);
  SC.state.screen = 'simulation';
};
