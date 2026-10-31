// シミュレーション画面UI（入力パネル + ダメージ表）
// v0.25.28: 新規。上部=オーディション画面（SC.renderAudition をそのまま使う）、下部=#global-log に入力パネルを描く。
// ロジックは sim.js（SC.simBuild / SC.simCompute）。計算式はここに持たない。
window.SC = window.SC || {};

SC.simEsc = function (s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

// v0.25.34: 条件が絶対に成立しない（never）パッシブの注記。wing=ポジション担当・キーワード等のグレフェス専用条件
SC.SIM_NEVER_NOTE = { wing: '（WINGでは発動しない）', loadout: '（この編成では発動しない）', unsupported: '（条件未対応のため発動しない）' };

// ---- v0.25.30: 編成のカード選択=「アイドル→個別カード」の2段プルダウン（datalist は撤去） ----
// 種別ごと（P=type P / S=type S）に、そのカードを1枚以上持つアイドル（番号順・表示はフルネーム）と、アイドル別のカード一覧（データ順=番号順）。初回に一度だけ組み立てる
SC._simCardCache = null;
SC.simCardLabel = function (c) { return c.name + '（' + c.rarity + '）'; };
SC.simCardLists = function () {
  if (SC._simCardCache) return SC._simCardCache;
  const cards = { P: {}, S: {} };
  ((SC.CARDS && SC.CARDS.cards) || []).forEach(function (c) {
    if (c.type !== 'P' && c.type !== 'S') return;
    if (!cards[c.type][c.idolNo]) cards[c.type][c.idolNo] = [];
    cards[c.type][c.idolNo].push(c);
  });
  const idols = { P: [], S: [] };
  Object.keys((SC.CARDS && SC.CARDS.idols) || {}).sort().forEach(function (no) {
    ['P', 'S'].forEach(function (t) {
      if (cards[t][no] && cards[t][no].length) idols[t].push({ no: no, name: SC.CARDS.idols[no].name });
    });
  });
  SC._simCardCache = { idols: idols, cards: cards };
  return SC._simCardCache;
};

// ---- 上部審査員カードに出す予測（renderAudition の st.simMode 分岐から呼ぶ） ----
// 札（または思い出）を選ぶと、単体札・全体札・思い出とも3審査員すべてに「{判定}時 値」＋（満足させる時だけ）「帰宅◎」を自動表示。回復札は「回復（ダメージなし）」、
// v0.25.37: 満足させない時の残り量表示は撤去（ユーザー指定「表示自体不要」）。満足させない時は何も出さない。
// v0.25.36: 効果札（非アピールのライブスキル）は「効果（ダメージなし）」（主効果が回復の効果札は「回復（ダメージなし）」）。未選択は予測なし
// 戻り値 { text, badge: html } | null（予測なし）
SC.simPredictLabel = function (card, isMem, j) {
  const inp = SC._simInputs;
  if (!inp) return null;
  let r, label;
  if (isMem) { r = SC.simPredictMemory(j); label = SC.SIM_MEM_LABEL[inp.memJudge]; }
  else if (card && SC.isEffectOnlyCard(card)) return { text: SC.simEffectLabel(card), badge: '' };   // v0.25.36: 回復札・効果札はアピール予測を呼ばない
  else if (card) { r = SC.simPredictCard(card, j); label = SC.SIM_JUDGE_LABEL[inp.judge]; }
  else return null;
  return {
    text: label + '時 ' + SC.fmt(r.value),
    badge: r.satisfies ? '<div class="sim-home-badge sim-top-badge">帰宅◎</div>' : ''   // v0.25.37: 満足させない時は何も出さない（旧: 残り量表示）
  };
};

// v0.25.36: 回復札・効果札のダメージ表示ラベル（heal を持つ札=回復 / それ以外の効果札=効果）
SC.simEffectLabel = function (cardOrRow) {
  return (cardOrRow && cardOrRow.heal) ? '回復（ダメージなし）' : '効果（ダメージなし）';
};

// ---- 画面: 上部はオーディション画面そのまま。ルートmainに sim-mode クラスを付ける ----
// v0.25.31: Pアイドルまたは週が未選択なら計算しない＝ステージ背景＋中央に案内（右は 1〆パネルの「—」）。おまかせ編成モーダルは #app 内に重ねる
SC.renderSimEmptyUpper = function () {
  let lights = '';
  for (let i = 0; i < 6; i++) lights += '<i></i>';
  return `
  <main class="audition-panel sim-mode sim-empty">
    <div class="battle-main-area" style="bottom:0">
      <div class="judge-col-v16b"></div>
      <div class="battle-center-stage">
        <img class="scene-bg" src="img/bg/stage.png" alt="" onerror="this.remove()">
        <div class="stage-deco">
          <div class="stage-lights">${lights}</div>
          <div class="stage-spots"><i></i><i></i><i></i></div>
          <div class="stage-floor"></div>
        </div>
        <div class="sim-empty-msg">Pアイドルと週を選ぶと計算が始まります</div>
      </div>
      <div class="rank-col-v16b">${SC.simOneShotPanelHtml()}</div>
    </div>
  </main>`;
};
SC.renderSimulation = function () {
  const upper = (SC.state && SC.state.simEmpty)
    ? SC.renderSimEmptyUpper()
    : SC.renderAudition().replace('class="audition-panel"', 'class="audition-panel sim-mode"');
  return upper + (SC._omakaseOpen && SC.omakasePopHtml ? SC.omakasePopHtml() : '');
};

// ---- 入力パネルの部品 ----
SC._simOwnerTag = function (o) { return o === 'p' ? 'P' : (o === 'guest' ? 'ゲスト' : 'S' + (Number(o) + 1)); };
// ライブスキル選択肢（習得済みの type==='live' パネル。実カード由来(cp_)があればそれだけ＝applyCheatAllPanelsと同じ扱い）
SC.simLiveOptions = function () {
  const P = SC.CONFIG.panel;
  let keys = (SC.state.panelOpened || []).filter(function (k) { return P[k] && P[k].type === 'live'; });
  if (keys.some(function (k) { return k.indexOf('cp_') === 0; })) keys = keys.filter(function (k) { return k.indexOf('cp_') === 0; });
  const cnt = {};
  keys.forEach(function (k) { const n = P[k].name || k; cnt[n] = (cnt[n] || 0) + 1; });
  return keys.map(function (k) {
    const n = P[k].name || k;
    return { v: k, label: cnt[n] > 1 ? n + '（' + SC._simOwnerTag(P[k].owner) + '）' : n };
  });
};
SC._simBuffText = function (d) {
  if (!d.buffAttrs || d.buffAttrs.length === 0) return 'ダメージ計算に影響なし';
  return d.buffAttrs.map(function (a) { return SC.ATTR_LABEL[a] || a; }).join('&') + (d.buffPct >= 0 ? '+' : '') + d.buffPct + '%';
};

// ---- 下部パネル本体（HTML文字列）。再描画は SC.simMountPanel が差分反映する ----
SC.renderSimPanel = function () {
  const inp = SC._simInputs;
  const st = SC.state;
  const cmp = SC.simCompute();
  if (!inp || !cmp) return '<div class="sim-wrap"></div>';
  const E = SC.simEsc, F = SC.fmt;
  const L = SC.simCardLists();
  const num = function (path, v, min, max, step, disabled) {
    return '<input type="number" class="sim-num" data-sim="' + path + '" data-sim-type="num" value="' + E(v) + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '"' + (disabled ? ' disabled' : '') + '>';
  };
  const sel = function (path, cur, opts, type, disabled) {
    return '<select class="sim-sel" data-sim="' + path + '" data-sim-type="' + (type || 'str') + '"' + (disabled ? ' disabled' : '') + '>' +
      opts.map(function (o) { return '<option value="' + E(o.v) + '"' + (String(o.v) === String(cur) ? ' selected' : '') + '>' + E(o.label) + '</option>'; }).join('') + '</select>';
  };
  // v0.25.31: 先頭に「（未選択）」を持つ2段プルダウン（アイドル側を未選択にするとカード側も未選択）
  const cardIn = function (path, id, type) {
    const c0 = id ? SC.findCard(id) : null;
    const curNo = c0 ? c0.idolNo : '';
    const idolOpts = '<option value=""' + (curNo ? '' : ' selected') + '>（未選択）</option>' + L.idols[type].map(function (i) {
      return '<option value="' + E(i.no) + '"' + (i.no === curNo ? ' selected' : '') + '>' + E(i.name) + '</option>';
    }).join('');
    const cardOpts = '<option value=""' + (id ? '' : ' selected') + '>（未選択）</option>' + (L.cards[type][curNo] || []).map(function (c) {
      return '<option value="' + E(c.id) + '"' + (c.id === id ? ' selected' : '') + '>' + E(SC.simCardLabel(c)) + '</option>';
    }).join('');
    return '<select class="sim-sel sim-idol-sel" data-sim="' + path + '" data-sim-type="idol" data-card-type="' + type + '">' + idolOpts + '</select>' +
      '<select class="sim-sel sim-card-sel" data-sim="' + path + '" data-sim-type="nullable">' + cardOpts + '</select>';
  };
  const st3 = function (o) { return 'Vo ' + F(o.vo) + ' Da ' + F(o.da) + ' Vi ' + F(o.vi); };

  // 編成（基礎/合計ステは入力から算出。未選択枠は全0）
  const supRows = [0, 1, 2, 3].map(function (i) {
    const ss = SC.simSupportStats(inp, i);
    const empty = !inp.loadout.supports[i];
    const exMax = SC.simExMax(inp.loadout.supports[i]);   // v0.25.33: URは200・それ以外150
    // v0.25.39: 各サポの2行目（EX行）の左端に「⇅」＝その枠と1つ下の枠（サポ1〜3→次のサポ / サポ4→ゲスト）の中身を入れ替える（2つの行の境目に位置する）。両方未選択なら無効
    const nextId = i < 3 ? inp.loadout.supports[i + 1] : inp.loadout.guest;
    const nextName = i < 3 ? 'サポート' + (i + 2) : 'ゲスト';
    const swapBtn = '<button class="sim-btn sim-btn-swap" data-action="sim-swap" data-a="' + i + '" data-b="' + (i < 3 ? i + 1 : 'guest') + '"' +
      (empty && !nextId ? ' disabled' : '') + ' title="サポート' + (i + 1) + 'と' + nextName + 'を入れ替え">⇅</button>';
    // 1行目=カード入力+基礎ステ / 2行目=EX入力+合計（2段固定で幅が変わっても崩れない）
    return '<div class="sim-row sim-row-sup"><span class="sim-lbl">サポート' + (i + 1) + '</span>' +
      cardIn('loadout.supports.' + i, inp.loadout.supports[i], 'S') +
      '<span class="sim-st">基礎 ' + st3(ss.base) + '</span></div>' +
      '<div class="sim-row sim-row-ex"><span class="sim-lbl">' + swapBtn + '</span>' +
      '<span class="sim-ex">EX Vo' + num('ex.' + i + '.vo', inp.ex[i].vo, 0, exMax, 5, empty) + 'Da' + num('ex.' + i + '.da', inp.ex[i].da, 0, exMax, 5, empty) + 'Vi' + num('ex.' + i + '.vi', inp.ex[i].vi, 0, exMax, 5, empty) + '</span>' +
      '<span class="sim-st sim-st-tot">合計 ' + st3(ss.tot) + '</span></div>';
  }).join('');
  // v0.25.39: ゲストにもサポートと同じEX入力行（基礎・合計つき。ユーザー指定「ゲストもExは貼れる」）。ゲストのステータスはアピール値に反映しない（SC.playerAppealValue はサポ1〜4だけ合算）ので注記を添える
  const gs = SC.simGuestStats(inp);
  const gEmpty = !inp.loadout.guest;
  const gExMax = SC.simExMax(inp.loadout.guest);
  const guestRows = '<div class="sim-row sim-row-sup sim-row-guest"><span class="sim-lbl">ゲスト</span>' +
    cardIn('loadout.guest', inp.loadout.guest, 'S') +
    '<span class="sim-st">基礎 ' + st3(gs.base) + '</span></div>' +
    '<div class="sim-row sim-row-ex sim-row-guest-ex"><span class="sim-lbl"></span>' +
    '<span class="sim-ex">EX Vo' + num('exGuest.vo', inp.exGuest.vo, 0, gExMax, 5, gEmpty) + 'Da' + num('exGuest.da', inp.exGuest.da, 0, gExMax, 5, gEmpty) + 'Vi' + num('exGuest.vi', inp.exGuest.vi, 0, gExMax, 5, gEmpty) + '</span>' +
    '<span class="sim-st sim-st-tot">合計 ' + st3(gs.tot) + '</span>' +
    '<span class="sim-guest-note">※ゲストのステータスはアピール値に反映されません</span></div>';
  const formation =
    '<section class="sim-sec"><h4>編成<button class="sim-btn sim-btn-sm" data-action="omakase-open" title="アイドルを選んで、そのアイドルの強編成を入れる">おまかせ編成</button>' +
    '<button class="sim-btn sim-btn-sm" data-action="sim-clear-loadout" title="編成の全枠を未選択に・EXを0に・Pスキル枠を自動に・保有/発動中パッシブも空に">編成クリア</button></h4>' +
    '<div class="sim-row"><span class="sim-lbl">Pアイドル</span>' + cardIn('loadout.p', inp.loadout.p, 'P') + '</div>' +
    supRows + guestRows + '</section>';

  // プロデュース状況（週は未選択あり。未選択/準決勝/決勝ではオーディション欄は無効）
  const weekOpts = [{ v: '', label: '（未選択）' }].concat(SC.simWeekOptions().map(function (o) { return { v: o.key, label: o.label }; }));
  const finals = inp.weekKey === 'semi' || inp.weekKey === 'final';
  // v0.25.29: その週のシーズンのオーディションだけを出す（期間限定含む。準決勝/決勝は無効表示）
  const audOpts = inp.weekKey
    ? SC.simAuditionOptionsForWeek(inp.weekKey).map(function (a) { return { v: a.id, label: 'S' + (a.season + 1) + ' ' + a.name + (a.limited ? '（期間限定）' : '') }; })
    : [{ v: '', label: '—' }];
  const effLv = inp.loadout.p ? SC.memoryLv() : inp.memLv;
  const situation =
    '<section class="sim-sec"><h4>プロデュース状況</h4><div class="sim-grid">' +
    '<label class="sim-f"><span>週</span>' + sel('weekKey', inp.weekKey || '', weekOpts, 'nullable') + '</label>' +
    '<label class="sim-f"><span>難易度</span>' + sel('mode', inp.mode, [{ v: 0, label: 'ビギナー' }, { v: 1, label: 'ミドル' }, { v: 2, label: 'マスター' }], 'num') + '</label>' +
    '<label class="sim-f"><span>流行</span>' + sel('trend', inp.trend, SC.simTrendOptions(), 'num') + '</label>' +   // v0.25.34: 流行の並び（審査員の流行順位・ライバルの対象が変わる）
    '<label class="sim-f"><span>オーディション</span>' + sel('auditionId', inp.weekKey ? inp.auditionId : '', audOpts, 'str', finals || !inp.weekKey) + '</label>' +
    '<label class="sim-f"><span>思い出Lv</span>' + num('memLv', inp.memLv, 0, 5, 1) + '<em class="sim-eff">' + (effLv !== inp.memLv ? '→実効Lv' + effLv : '') + '</em></label>' +
    '<label class="sim-f"><span>ターン数</span>' + num('turn', inp.turn, 1, 12, 1) + '</label>' +
    '<label class="sim-f"><span>判定</span>' + sel('judge', inp.judge, [{ v: 'perfect', label: 'Perfect' }, { v: 'good', label: 'Good' }, { v: 'normal', label: 'Normal' }, { v: 'bad', label: 'Bad' }]) + '</label>' +
    '<label class="sim-f"><span>思い出判定</span>' + sel('memJudge', inp.memJudge, [{ v: 'good', label: 'Good' }, { v: 'bad', label: 'Bad' }]) + '</label>' +
    '</div></section>';

  // ステータス
  const stats =
    '<section class="sim-sec"><h4>ステータス</h4><div class="sim-grid">' +
    ['vo', 'da', 'vi', 'me'].map(function (k) {
      return '<label class="sim-f"><span>' + SC.ATTR_LABEL[k] + '</span>' + num('stats.' + k, inp.stats[k], k === 'me' ? 1 : 0, 9999, 1) + '</label>';
    }).join('') + '</div></section>';

  // バフ・パッシブ（v0.25.31: 手動バフと保有パッシブは排他。選んでいない側は disabled＝計算に使わない）
  const manual = inp.buffMode === 'manual';
  const passives = SC.simPassiveDefs();
  const passRows = passives.length === 0
    ? '<div class="sim-none">' + (inp.loadout.p ? '保有パッシブなし' : 'Pアイドルを選ぶと一覧が出ます') + '</div>'
    : passives.map(function (d) {
      // v0.25.34: 条件が絶対に成立しない（never）パッシブは行の末尾に注記してチェックを無効化（wing=ポジション担当などグレフェス専用条件）
      const neverTxt = SC.SIM_NEVER_NOTE[d.never] || '';
      // v0.25.35: 現在のターン・状態で条件が成り立たないパッシブはグレー表示＋行末に「（このターンは条件未達）」。保有チェックは操作できるまま（ターンが進めば発動しうる）。
      //   恒久的に不発（never）のものは従来どおり注記＋チェック不可。判定できない時（condNow=null）は通常表示
      const notNow = !neverTxt && d.condNow === false;
      return '<label class="sim-pass' + (neverTxt ? ' sim-pass-never' : '') + (notNow ? ' sim-pass-notnow' : '') + '"><input type="checkbox" data-sim="passiveOwned.' + E(d.key) + '" data-sim-type="bool"' + (inp.passiveOwned[d.key] ? ' checked' : '') + (manual || neverTxt ? ' disabled' : '') + '>' +
        '<b>' + (d.owner ? '[' + E(d.owner) + ']' : '') + E(d.name) + '</b>' +   // v0.25.33: 冒頭に持ち主（例 [はるき]Vocal120%UP）
        '<span class="sim-pc">' + (d.cond ? '[条件:' + E(String(d.cond).replace(/[\r\n]/g, '')) + ']' : '') + '</span>' +
        '<span class="sim-pc">' + (d.prob ? '[確率:' + E(d.prob) + ']' : '') + '</span>' +
        '<span class="sim-pc">' + (d.max ? '[最大:' + E(d.max) + ']' : '') + '</span>' +
        '<em class="sim-buff">' + E(SC._simBuffText(d)) + '</em>' +
        (neverTxt ? '<em class="sim-never">' + E(neverTxt) + '</em>' : '') +
        (notNow ? '<em class="sim-notnow">（このターンは条件未達）</em>' : '') + '</label>';
    }).join('');
  const radio = function (v, label) {
    return '<label class="sim-radio"><input type="radio" name="sim-buffmode" data-sim="buffMode" data-sim-type="str" value="' + v + '"' + (inp.buffMode === v ? ' checked' : '') + '>' + label + '</label>';
  };
  const buffs =
    '<section class="sim-sec"><h4>バフ・パッシブ</h4>' +
    '<div class="sim-row sim-buffmode"><span class="sim-lbl">バフ指定</span>' + radio('manual', '手動バフ') + radio('passive', '保有パッシブ') + '</div>' +
    '<div class="sim-grid">' +
    ['vo', 'da', 'vi'].map(function (k) {
      return '<label class="sim-f"><span>手動バフ ' + SC.ATTR_LABEL[k] + '%</span>' + num('buff.' + k, inp.buff[k], -100, 999, 5, !manual) + '</label>';
    }).join('') +
    '<label class="sim-f sim-f-chk"><input type="checkbox" data-sim="linkOn" data-sim-type="bool"' + (inp.linkOn ? ' checked' : '') + '><span>LINK成立扱い</span></label>' +
    '</div><div class="sim-sub">保有パッシブ（チェックで保有）' +
    '<button class="sim-btn sim-btn-sm" data-action="sim-own-all"' + (manual ? ' disabled' : '') + '>全選択</button>' +
    '<button class="sim-btn sim-btn-sm" data-action="sim-own-none"' + (manual ? ' disabled' : '') + '>全解除</button></div>' +   // v0.25.35: 「パッシブクリア」は全解除と同じ効果なので撤去
    '<div class="sim-pass-list' + (manual ? ' sim-pass-off' : '') + '">' + passRows + '</div></section>';

  // ライブスキル4枠
  const liveOpts = [{ v: '', label: '自動' }].concat(SC.simLiveOptions());
  const lives =
    '<section class="sim-sec"><h4>Pアイドルのライブスキル（4枠）</h4><div class="sim-grid">' +
    [0, 1, 2, 3].map(function (i) {
      return '<label class="sim-f"><span>枠' + (i + 1) + '</span>' + sel('pSkillKeys.' + i, inp.pSkillKeys[i] || '', liveOpts, 'skill') + '</label>';
    }).join('') + '</div></section>';

  const left = '<div class="sim-left">' +
    '<div class="sim-head"><b class="sim-title">シミュレーション設定</b>' +
    '<button class="sim-btn" data-action="sim-back-title">タイトルへ戻る</button></div>' +   // v0.25.34: 上部の「クリア」は撤去（編成クリア・パッシブクリアに分割）
    SC.simSaveSectionHtml() + formation + situation + stats + buffs + lives + '</div>';

  // 右: ダメージ表（v0.25.31: Pアイドル/週が未選択なら計算しない＝「—」）
  if (cmp.empty) {
    return '<div class="sim-wrap">' + left + '<div class="sim-right"><h4>ダメージ計算</h4><div class="sim-tbl-empty">—</div></div></div>';
  }
  const pctTxt = function (v) { return v.pct > 9.99 ? '>999%' : Math.round(v.pct * 100) + '%'; };   // 残りが極小の時の巨大%は打ち切る
  // v0.25.30: セルクリックも行クリックと同じ「札選択」（行の data-action="sim-select" に委譲。審査員の選択は撤去）
  const cellHtml = function (v) {
    if (v.gone) return '<td class="sim-cell sim-gone">帰宅済</td>';   // v0.25.34: ターン進行で帰宅した審査員
    return '<td class="sim-cell' + (v.satisfies ? ' sim-ok' : '') + '"><b>' + F(v.value) + '</b><small>' + pctTxt(v) + '</small>' +
      (v.satisfies ? '<i class="sim-home-badge">帰宅◎</i>' : '') + '</td>';
  };
  const bodyRows = cmp.rows.map(function (r) {
    const cur = inp.selected === r.deckIdx ? ' sim-row-sel' : '';
    const cells = r.effectOnly ? '<td class="sim-heal" colspan="3">' + SC.simEffectLabel(r) + '</td>' : r.vals.map(cellHtml).join('');   // v0.25.36: 回復札・効果札
    // v0.25.29: サポ札は「[S1 摩美々] 札名」
    const owner = r.ownerLabel + (r.ownerName ? ' ' + E(r.ownerName) : '');
    return '<tr class="sim-tr' + cur + '" data-action="sim-select" data-sel="' + r.deckIdx + '"><td class="sim-name">[' + owner + '] ' + E(r.name) + '</td>' + cells + '</tr>';
  }).join('');
  const memRow = '<tr class="sim-tr sim-tr-mem' + (inp.selected === 'memory' ? ' sim-row-sel' : '') + '" data-action="sim-select" data-sel="memory"><td class="sim-name">思い出アピール（Lv' +
    cmp.memory.lv + '・' + SC.SIM_MEM_LABEL[inp.memJudge] + '）</td>' + cmp.memory.vals.map(cellHtml).join('') + '</tr>';
  const heads = cmp.judges.map(function (j) {
    // v0.25.34: ターン進行で興味値が蓄積するので「必要 N・残り M」を戻す（帰宅済みは「帰宅済」）
    return '<th class="sim-th sim-j-' + j.attr + '">' + E(j.label) + '<small>' + (j.gone ? '帰宅済' : '必要 ' + F(j.need) + '・残り ' + F(j.remain)) + '</small></th>';
  }).join('');
  const right = '<div class="sim-right"><h4>ダメージ計算（' + SC.SIM_JUDGE_LABEL[inp.judge] + '時）</h4>' +
    '<table class="sim-tbl"><thead><tr><th class="sim-th">札</th>' + heads + '</tr></thead><tbody>' + bodyRows + memRow + '</tbody></table>' +
    // v0.25.36: 帰宅判定の注意書き（ユーザー指定「右下にあるダメージ計算の帰宅判定はライバルのアピール分を含まないから、実際は帰宅する可能性があるって注意書きを下の方に書いておいて」）
    // v0.25.37: 注意書きから残り量表示の説明を削除（ユーザー指定）
    '<div class="sim-tbl-note">※帰宅◎はプレイヤー自身のアピールだけで判定しています。実際は同じターンのライバルのアピールも審査員の興味に加わるため、帰宅◎が付いていなくても帰宅することがあります（ライバル込みの確率は1〆シミュレーションを参照）。</div></div>';

  return '<div class="sim-wrap">' + left + right + '</div>';
};

// ---- 差分反映（入力欄のフォーカス・カーソル・スクロール位置を壊さない） ----
// innerHTML 丸ごと置換だと、入力のたびにフォーカスが外れて次の欄を押せない（クリックで古いDOMが消える）。
// 構造が同じ要素は属性とプロパティだけ更新し、構造が違う所だけ差し替える。
SC.simPatch = function (live, fresh) {
  const la = live.attributes, fa = fresh.attributes;
  for (let i = la.length - 1; i >= 0; i--) {
    if (!fresh.hasAttribute(la[i].name)) live.removeAttribute(la[i].name);
  }
  for (let i = 0; i < fa.length; i++) {
    if (live.getAttribute(fa[i].name) !== fa[i].value) live.setAttribute(fa[i].name, fa[i].value);
  }
  const lc = live.childNodes, fc = fresh.childNodes;
  const n = Math.min(lc.length, fc.length);
  for (let i = 0; i < n; i++) {
    const a = lc[i], b = fc[i];
    if (a.nodeType === 1 && b.nodeType === 1 && a.tagName === b.tagName) SC.simPatch(a, b);
    else if (a.nodeType === b.nodeType && (a.nodeType === 3 || a.nodeType === 8)) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; }
    else live.replaceChild(b.cloneNode(true), a);
  }
  while (lc.length > fc.length) live.removeChild(live.lastChild);
  for (let i = lc.length; i < fc.length; i++) live.appendChild(fc[i].cloneNode(true));
  // フォーム部品はプロパティ（現在値）も合わせる（属性だけでは入力済みの値が更新されない）
  if (live.tagName === 'INPUT') {
    if (live.type === 'checkbox' || live.type === 'radio') { if (live.checked !== fresh.hasAttribute('checked')) live.checked = fresh.hasAttribute('checked'); }   // v0.25.31: radio も同期
    else { const v = fresh.getAttribute('value') || ''; if (live.value !== v) live.value = v; }
  } else if (live.tagName === 'SELECT') {
    const opt = fresh.querySelector('option[selected]');
    const v = opt ? opt.getAttribute('value') : '';
    if (live.value !== v) live.value = v;
  }
};

// #global-log にシミュパネルを描く（初回=丸ごと挿入 / 以降=差分反映）
SC.simMountPanel = function (pane) {
  const html = SC.renderSimPanel();
  const live = pane.querySelector('.sim-wrap');
  if (!live) {
    pane.innerHTML = html;
    return;
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  SC.simPatch(live, tpl.content.firstElementChild);
};

// ---- 入力の反映 ----
SC.simGetPath = function (obj, path) {
  return path.split('.').reduce(function (o, k) { return (o === undefined || o === null) ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]; }, obj);
};
SC.simSetPath = function (obj, path, val) {
  const ks = path.split('.').map(function (k) { return /^\d+$/.test(k) ? Number(k) : k; });
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] === undefined || o[ks[i]] === null || typeof o[ks[i]] !== 'object') o[ks[i]] = (typeof ks[i + 1] === 'number') ? [] : {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = val;
};
// v0.25.34: ターン進行の演出（fxPlay）の再生中に入力が変わると、再描画で #fx-layer ごと消えて演出キューが落ちる（clickは再生中ロックされるが change は通る）。
//   入力変更・各種クリア等の前に再生を中断して後片付けする（進行済みの状態は入力変更で開始時に戻るので問題なし）
SC.simAbortFx = function () {
  // v0.25.40: 飛んでいる canvas パーティクル（星・音符・ビーム）と演出レイヤの残りも消す（リセット後に演出の残骸を残さない。演出が終わった直後の残り粒も対象）
  const hasDoc = typeof document !== 'undefined';
  if (SC._pt) SC._pt.parts = [];
  const cv = hasDoc ? document.getElementById('fx-canvas') : null;
  if (cv && cv.getContext) { const g = cv.getContext('2d'); if (g) g.clearRect(0, 0, cv.width, cv.height); }
  const layer0 = hasDoc ? document.getElementById('fx-layer') : null;
  if (layer0) layer0.innerHTML = '';
  if (!SC.fxPlaying && !SC._fxTimer) return;
  if (SC._fxTimer) { clearTimeout(SC._fxTimer); SC._fxTimer = null; }
  SC._fxQueue = [];
  SC._fxDone = null;
  SC.fxPlaying = false;
};
// change イベントから呼ぶ（data-sim="パス" の要素）。値を SC._simInputs に書く→保存→再構築→再描画
SC.simOnChange = function (el) {
  const inp = SC._simInputs;
  if (!inp) return;
  SC.simAbortFx();
  const path = el.dataset.sim, type = el.dataset.simType || 'str';
  let val;
  if (type === 'bool') val = !!el.checked;
  else if (type === 'num') {
    const n = Number(el.value);
    // 不正値（空・NaN）は既定値に戻す（NaNガード）
    val = (el.value === '' || !isFinite(n)) ? SC.simGetPath(SC.simDefaultInputs(), path) : n;
  } else if (type === 'idol') {
    // v0.25.30: アイドルを変えたら、そのアイドルの先頭カードを自動選択して再計算。v0.25.31: 「（未選択）」ならカード側も未選択（null）
    if (el.value === '') val = null;
    else {
      const list = SC.simCardLists().cards[el.dataset.cardType][el.value];
      val = (list && list[0]) ? list[0].id : null;
      if (!val) { SC.render(); return; }   // 不正な選択は元の表示に戻す
    }
  } else if (type === 'nullable') val = el.value || null;   // v0.25.31: ''=未選択（週・カード）
  else if (type === 'skill') val = el.value || null;   // ''=自動
  else val = el.value;
  SC.simSetPath(inp, path, val);
  if (path === 'weekKey') inp.auditionId = SC.simDefaultAuditionForWeek(inp.weekKey);   // v0.25.29: 週を変えたらその週の既定オーデに自動で切り替える
  // v0.25.41: 編成の変更は、変えた枠のパッシブ・Pスキル枠指定だけを外す（従来=どの枠を変えても全部リセット→ユーザー報告「チェックが全部外れる」）
  if (path.indexOf('loadout.') === 0) SC.simOnLoadoutChanged(inp, path);
  // v0.25.43: ターン進行中（現在ターン > 開始ターン）にステ・サポートEX・ゲストEX・保有パッシブ・バフ指定/手動バフ・判定・LINK成立扱いを変えた時は、作り直さず現在の状態へその場で反映する
  //   （ユーザー指示「ステータスやパッシブのチェックを弄ったタイミングでもリセットされてしまうけど、リセットボタン押してないときはリセットしないで」）。
  //   開始ターンにいる時・編成/週/オーデ/難易度/流行/思い出Lv/ターン数/Pスキル枠の変更は従来どおり開始時から作り直す（SC.simRefreshAfterInput。sim.js）
  SC.simRefreshAfterInput(inp, path);   // 作り直す場合は正規化（クランプ・既定値補完）込み
  SC.simSaveInputs(inp);
  SC.render();
};
// 札の選択（SC.simSetSelected / simClearSelection）は DOM非依存なので sim.js にある

// ---- v0.25.30: 1〆シミュレーションパネル（右の順位リストの自分の行の下。計算は sim.js の SC.simOneShot） ----
// 入力（編成・ステ・週・オデ・難易度・流行・思い出Lv・手動バフ・Pスキル枠）が変わった時だけ再計算（入力キーでキャッシュ）。
// v0.25.34: 既定1000試行を数十回ずつのチャンク（setTimeout）で非同期実行し、パネルに進捗「計算中… 400/1000」→完了で確定値。
//   入力が変わったら実行中の計算を破棄して再開。札選択・ターン進行など入力以外の再描画では再計算しない（1〆パネルは常に開始時＝入力基準）
SC._simOS = null;       // 確定済み { key, result }
SC._simOSRun = null;    // 実行中 { key, runner, timer }
SC.simOneShotPanelHtml = function () {
  const inp = SC._simInputs;
  if (!inp) return '';
  const E = SC.simEsc;
  let c = SC._simOS;
  // v0.25.40: 確定値が現在の入力と違う（入力を変えた・スロットを読み込んだ・ページを開き直した）時は、まず永続キャッシュ（SC.simOneShotLookup）を引く。
  //   ヒットすれば計算を走らせず「計算中」も出さずに即表示（続く simOneShotKick は確定済みとして何もしない）
  if (SC.simReady(inp) && (!c || c.key !== SC.simOneShotKey(inp))) {
    const hit = SC.simOneShotLookup(inp);
    if (hit) c = SC._simOS = { key: SC.simOneShotKey(inp), result: hit };
  }
  let body;
  if (!SC.simReady(inp)) {
    body = '<div class="sim-os-dash">—</div>';   // v0.25.31: Pアイドル/週が未選択なら計算しない
  } else if (!c || c.key !== SC.simOneShotKey(inp)) {
    const run = SC._simOSRun;
    const prog = (run && run.key === SC.simOneShotKey(inp) && run.runner) ? ' ' + run.runner.t + '/' + run.runner.trials : '';
    body = '<div class="sim-os-calc">計算中…' + prog + '</div>';
  } else {
    const r = c.result;
    const pc1 = function (v) { return (Math.round(v * 1000) / 10).toFixed(1) + '%'; };
    const pc0 = function (v) { return Math.round(v * 100) + '%'; };
    const fin = r.finishers.length === 0 ? '<div class="sim-os-f">—</div>' : r.finishers.map(function (f) {
      return '<div class="sim-os-f">' + (f.ownerName ? '<i class="sip-who">' + E(f.ownerName) + '</i>' : '') + E(f.name) + ' <b>' + pc0(f.share) + '</b></div>';
    }).join('');
    const rv = (r.rivalAvg || [0, 0, 0]).map(function (v) { return SC.fmt(Math.round(v)); });
    // v0.25.38: 「試行N回・プレイヤー判定PERFECT・ライバルは…」の注記行と「審査員別の満足率」の行を削除（ユーザー指定。値 r.trials / r.judgeRate は結果に残す）。
    //   プレイヤー判定がPERFECTである旨は SC.SIM_ONESHOT_JUDGEMENT（sim.js）のコメントに残す
    body = '<div class="sim-os-rate">1〆確率 ' + pc1(r.rate) + '</div>' +
      // v0.25.41: ライバル寄与は2行（1行目=見出し「ライバル寄与（平均）」/ 2行目=「Vo 1,234 / Da 2,345 / Vi 3,456」。数値の書式は従来どおり3桁区切り）
      '<div class="sim-os-riv" title="最良行動の試行で、ライバルがその1ターン内に各審査員へ与えたアピール量（余剰切捨て後）の平均"><span class="sim-os-riv-h">ライバル寄与（平均）</span><span class="sim-os-riv-v">Vo ' + rv[0] + ' / Da ' + rv[1] + ' / Vi ' + rv[2] + '</span></div>' +
      '<div class="sim-os-fin"><div class="sim-os-finh">決め札</div>' + fin + '</div>';
  }
  return '<div class="sim-oneshot"><div class="sim-os-title">1〆シミュレーション</div>' + body + SC.sim230Html() + '</div>';   // v0.25.37: 下に230万周回の1〆数
};
// 実行中の計算を破棄する（入力が変わった時・未選択になった時）
SC.simOneShotCancel = function () {
  const run = SC._simOSRun;
  if (!run) return;
  if (run.timer) clearTimeout(run.timer);
  if (run.runner) run.runner.cancelled = true;
  SC._simOSRun = null;
};
// render 後に呼ぶ: 入力キーが変わっていれば計算を予約（実行時点の最新入力で計算）→チャンク実行→完了したらパネルだけ差し替え
SC.simOneShotKick = function () {
  const inp = SC._simInputs;
  if (!inp || !SC.state || !SC.state.simMode || !SC.simReady(inp)) { SC.simOneShotCancel(); return; }   // v0.25.31: 未選択なら計算しない
  const key = SC.simOneShotKey(inp);
  if (SC._simOS && SC._simOS.key === key) { SC.simOneShotCancel(); return; }   // 確定済み
  if (SC._simOSRun && SC._simOSRun.key === key) return;                       // 同じ入力で実行中
  SC.simOneShotCancel();                                                      // 入力が変わった: 実行中を破棄して再開
  const run = { key: key, runner: null, timer: null };
  SC._simOSRun = run;
  run.timer = setTimeout(function () { run.timer = null; SC._simOneShotBegin(run); }, 30);
};
SC._simOneShotBegin = function (run) {
  if (SC._simOSRun !== run) return;
  const cur = SC._simInputs;
  if (!cur || !SC.state || !SC.state.simMode || !SC.simReady(cur) || SC.simOneShotKey(cur) !== run.key) { SC._simOSRun = null; return; }
  run.runner = SC.simOneShotStart(cur);
  if (run.runner.done) {   // 未選択など（通常ここには来ない）
    SC._simOS = { key: run.key, result: run.runner.res };
    SC._simOSRun = null;
    return;
  }
  SC._simOneShotChunk(run);
};
SC._simOneShotChunk = function (run) {
  if (SC._simOSRun !== run || !run.runner || run.runner.cancelled) return;
  const cur = SC._simInputs;
  if (!cur || !SC.state || !SC.state.simMode || SC.simOneShotKey(cur) !== run.key) { SC.simOneShotCancel(); return; }   // 入力が変わっていた
  const done = SC.simOneShotStep(run.runner, SC.SIM_ONESHOT_CHUNK);
  const el = document.querySelector('.sim-oneshot');
  if (done) {
    SC._simOS = { key: run.key, result: run.runner.res };
    SC._simOSRun = null;
    SC.simCachePut('os', run.key, run.runner.trials, run.runner.res);   // v0.25.40: 完了した結果だけ永続キャッシュへ（途中で破棄された計算はここに来ない）
    if (el) el.outerHTML = SC.simOneShotPanelHtml();
    return;
  }
  const calc = el ? el.querySelector('.sim-os-calc') : null;
  if (calc) calc.textContent = '計算中… ' + run.runner.t + '/' + run.runner.trials;
  run.timer = setTimeout(function () { run.timer = null; SC._simOneShotChunk(run); }, 0);
};

// ---- v0.25.37: 230万周回の1〆数（1〆パネルの下。ロジックは sim.js の SC.sim230Start/Step/Compute） ----
// 例「230万周回／1〆 期待 8.9/17（52.4%）」（v0.25.38: 見出しの週範囲・オーデ別の内訳は表示しない。S2残り1週〜S4残り1週の17戦で計算）。
//   既存の1〆（該当オーディション）の計算が終わってから始める（1〆の実行中は待つ）。進捗「計算中 n/102」（v0.25.40: 17週×6流行。旧 n/36）。入力が変わったら中断して再計算。
//   キャッシュは SC.sim230Key（1〆のキーから 週・オーデ・流行 を除いたもの）＝週・オーデ・流行・ターン・判定・選択札を変えても再計算しない。
//   Pアイドルが選ばれていれば（週が未選択でも）計算できる（SC.sim230Ready）。未選択なら何も出さない
SC._sim230 = null;       // 確定済み { key, result }
SC._sim230Run = null;    // 実行中 { key, runner, timer }
SC.sim230Html = function () {
  const inp = SC._simInputs;
  if (!inp || !SC.sim230Ready(inp)) return '';
  const key = SC.sim230Key(inp);
  let c = SC._sim230;
  if (!c || c.key !== key) {   // v0.25.40: 永続キャッシュを先に引く（ヒットなら即表示・「計算中 n/102」を出さない）
    const hit = SC.sim230Lookup(inp);
    if (hit) c = SC._sim230 = { key: key, result: hit };
  }
  let body;
  if (!c || c.key !== key) {
    const run = SC._sim230Run;
    const total = SC.sim230Total();   // v0.25.40: 17週×6流行=102セル（旧: 6オーデ×6流行=36）
    const n = (run && run.key === key && run.runner) ? run.runner.idx : 0;
    body = '<div class="sim-s230-calc">計算中 ' + n + '/' + total + '</div>';
  } else {
    const r = c.result;
    // v0.25.38: 「1〆 期待 8.9/17（52.4%）」だけ表示（オーデ別の内訳行・見出しの「（S2残り1〜S4残り1・17戦）」を削除。ユーザー指定）。
    //   ％ = 期待値 ÷ 戦数（17）× 100 の小数1桁（r.perAud は結果に残す＝テスト・将来用）
    const pct = r.weeks > 0 && isFinite(r.expect) ? r.expect / r.weeks * 100 : 0;   // NaNガード
    body = '<div class="sim-s230-main">1〆 期待 <b>' + r.expect.toFixed(1) + '</b>/' + r.weeks + '（' + pct.toFixed(1) + '%）</div>';
  }
  return '<div class="sim-s230"><div class="sim-s230-h">230万周回</div>' + body + '</div>';
};
// 実行中の230万の計算を破棄する（入力が変わった時・未選択になった時）
SC.sim230Cancel = function () {
  const run = SC._sim230Run;
  if (!run) return;
  if (run.timer) clearTimeout(run.timer);
  if (run.runner) run.runner.cancelled = true;
  SC._sim230Run = null;
};
// render 後に呼ぶ（ui.js refreshGlobalLog）: 230万の入力キーが変わっていれば計算を予約→チャンク実行→完了したら230万の枠だけ差し替え
SC.sim230Kick = function () {
  const inp = SC._simInputs;
  if (!inp || !SC.state || !SC.state.simMode || !SC.sim230Ready(inp)) { SC.sim230Cancel(); return; }
  const key = SC.sim230Key(inp);
  if (SC._sim230 && SC._sim230.key === key) { SC.sim230Cancel(); return; }   // 確定済み
  if (SC._sim230Run && SC._sim230Run.key === key) return;                   // 同じ入力で実行中
  SC.sim230Cancel();                                                        // 入力が変わった: 実行中を破棄して再開
  const run = { key: key, runner: null, timer: null };
  SC._sim230Run = run;
  run.timer = setTimeout(function () { run.timer = null; SC._sim230Chunk(run); }, 60);
};
SC._sim230Chunk = function (run) {
  if (SC._sim230Run !== run) return;
  const cur = SC._simInputs;
  if (!cur || !SC.state || !SC.state.simMode || SC.sim230Key(cur) !== run.key) { SC.sim230Cancel(); return; }   // 入力が変わっていた
  if (SC._simOSRun) { run.timer = setTimeout(function () { run.timer = null; SC._sim230Chunk(run); }, 80); return; }   // 1〆の計算が終わるまで待つ
  if (!run.runner) run.runner = SC.sim230Start(cur, SC.SIM230_TRIALS);
  const done = SC.sim230Step(run.runner, SC.SIM230_CHUNK);
  const el = document.querySelector('.sim-s230');
  if (done) {
    SC._sim230 = { key: run.key, result: run.runner.res };
    SC._sim230Run = null;
    SC.simCachePut('s230', run.key, run.runner.trials, run.runner.res);   // v0.25.40: 完了した結果だけ永続キャッシュへ
    if (el) el.outerHTML = SC.sim230Html();
    return;
  }
  const calc = el ? el.querySelector('.sim-s230-calc') : null;
  if (calc) calc.textContent = '計算中 ' + run.runner.idx + '/' + run.runner.total;
  run.timer = setTimeout(function () { run.timer = null; SC._sim230Chunk(run); }, 0);
};

// ---- v0.25.31: シミュ上部の左下「発動中のパッシブ」枠（スキル履歴欄の代わり）。ランダム発動ボタン・バフ合計つき ----
// v0.25.34: 「現在ターンの実際のバフ合計」（自ユニット debuffs の有効分＝パッシブ・手動バフ・審査員リアクションのデバフ全部。SC.simCurrentBuff）と、
//   そのターンに発動したパッシブ（st.simFiredNow）を表示。手動バフ指定中は「手動バフ指定中」（パッシブは発動しない）
SC.simPassiveBoxHtml = function () {
  const inp = SC._simInputs, st = SC.state;
  if (!inp || !st) return '';
  const E = SC.simEsc;
  const manual = inp.buffMode === 'manual';
  const b = SC.simCurrentBuff();
  const sg = function (v) { return (v >= 0 ? '+' : '') + v + '%'; };
  const tot = 'Vo' + sg(b.vo) + ' / Da' + sg(b.da) + ' / Vi' + sg(b.vi);
  let body;
  if (manual) {
    body = '<div class="sim-pb-mode">手動バフ指定中</div><div class="sim-pb-total">バフ合計 ' + tot + '</div>';
  } else {
    // v0.25.40: 発動中のパッシブは本編の左下アイコン列（.passive-icon-btn）と同じ見た目の丸アイコン（1発動=1アイコン）。
    //   クリックで中央に「発動中のパッシブスキル」詳細（本編と同じ passive-icon-click / passive-pop-close アクション・a.showPassivePop）。発動なしは「なし」
    const fired = SC.simFiredPassiveDefs();
    const icons = fired.length === 0 ? '<span class="sim-pb-none">なし</span>'
      : fired.map(function (d) { return SC.simPassiveIconHtml(d); }).join('');
    body = '<div class="sim-pb-list">' + icons + '</div><div class="sim-pb-total">バフ合計 ' + tot + '</div>';
  }
  return '<div class="sim-passive-box"><div class="sim-pb-head"><b>発動中のパッシブ</b>' +
    '<button class="sim-btn sim-btn-sm" data-action="sim-rand-passive" title="オーデ開始時に戻して再抽選"' + (manual ? ' disabled' : '') + '>ランダム発動</button></div>' + body + '</div>';
};

// ---- v0.25.40: 発動中パッシブのアイコン（左下枠）と詳細モーダル ----
// 今ターンに発動中のパッシブの定義（SC.simPassiveDefs の要素）。手動バフ指定中は発動しないので空
SC.simFiredPassiveDefs = function () {
  const inp = SC._simInputs, st = SC.state;
  if (!inp || !st || inp.buffMode === 'manual') return [];
  const nowKeys = st.simFiredNow || [];
  return SC.simPassiveDefs().filter(function (d) { return nowKeys.indexOf(d.key) >= 0; });
};
// v0.25.42: アイコン・オンマウス詳細・詳細モーダルの描画は本編と共通の関数（ui.js の SC.passiveIconHtml / SC.passivePopHtml）。シミュ固有なのは「何を発動中として出すか」（simFiredPassiveDefs）と
//   文字拡大用のクラス（sim-pb-icon / sim-pp-*）だけ。表示用の定義は 保有パッシブ定義（simPassiveDefs。name/owner/cond/prob/max/buffAttrs）＋効果文（SC.passiveEffectText）
SC.simPassiveView = function (d) {
  return Object.assign({ effect: SC.passiveEffectText(SC.CONFIG.panel[d.key]) }, d);
};
// アイコン1つ: 丸・中の文字=持ち主の短縮名の1文字目（持ち主が分からなければパッシブ名の1文字目）・色=バフ属性・オンマウスで 持ち主/名前/効果/[条件][確率][最大]。クリックは本編と同じ data-action="passive-icon-click"
//   v0.25.41: 配色は SC.attrColorClass（state.js）が返す CSS クラス（.ac-*。Vo赤/Da青/Vi黄・複合=混合・バフ属性なし=グレー）。本編の手札・スキル履歴・パッシブアイコンと共通
SC.simPassiveIconHtml = function (d) {
  return SC.passiveIconHtml(SC.simPassiveView(d), 'sim-pb-icon');
};
// 詳細モーダル（本編と同じ構造・同じ描画関数）。a.showPassivePop が真の時だけ。
//   各パッシブ: 持ち主名・パッシブ名／効果／[条件][確率][最大]。閉じる=「閉じる」ボタンまたはモーダル外クリック（passive-pop-close）
SC.simPassivePopHtml = function () {
  const a = SC.state && SC.state.audition;
  if (!a || !a.showPassivePop) return '';
  return SC.passivePopHtml(SC.simFiredPassiveDefs().map(SC.simPassiveView), { overlay: 'sim-pp-overlay', row: 'sim-pp-row', eff: 'sim-pp-eff' });
};

// ---- v0.25.34: セーブ欄（10スロット）。ロジックは sim.js の SC.simSlots / simSaveSlot / simLoadSlot / simDeleteSlot ----
SC.simSaveSectionHtml = function () {
  const E = SC.simEsc;
  const slots = SC.simSlots();
  const rows = slots.map(function (sl, i) {
    const empty = !sl;
    return '<div class="sim-slot"><span class="sim-slot-no">' + (i + 1) + '</span>' +
      '<span class="sim-slot-lbl' + (empty ? ' sim-slot-empty' : '') + '" title="' + E(empty ? '' : sl.label) + '">' + E(empty ? '（空き）' : sl.label) + '</span>' +
      '<button class="sim-btn sim-btn-xs" data-action="sim-slot-save" data-slot="' + i + '" title="現在の入力をスロット' + (i + 1) + 'に保存">保存</button>' +
      '<button class="sim-btn sim-btn-xs" data-action="sim-slot-load" data-slot="' + i + '"' + (empty ? ' disabled' : '') + ' title="スロット' + (i + 1) + 'の入力を読み込む">読込</button>' +
      '<button class="sim-btn sim-btn-xs sim-btn-del" data-action="sim-slot-del" data-slot="' + i + '"' + (empty ? ' disabled' : '') + ' title="スロット' + (i + 1) + 'を削除">削除</button></div>';
  }).join('');
  return '<section class="sim-sec sim-saves"><h4>セーブ</h4><div class="sim-slot-grid">' + rows + '</div></section>';
};

// ---- v0.25.41: シミュ右上の音量ボタン＋ポップオーバー（ヘッダーの「ホーム」の隣。ui.js renderHeader が SC.simVolHtml() を差し込む。本編には出さない） ----
// 音量・ON/OFF は本編の⚙オプションと同じ設定値（SC.audio.config。保存先 sc_audio も共通）・同じ反映経路（SC.audio.setConfig）。
//   スライダーは本編オプションと同じ data-opt="seVol" / "bgmVol"（main.js の input 委譲が setConfig を呼ぶ。render しない＝操作中に要素が作り直されない）。
//   ミュート = SE・BGM とも OFF（seOn / bgmOn 設定）。両方 OFF の間だけ「ミュート中」としてアイコンをミュート表示にする。
//   開閉: SC._simVolOpen（再描画をまたいで保持。保存はしない）。ボタン再クリック=main.js の case 'sim-vol-toggle'／外側クリック=main.js のクリック委譲が SC.simVolClose()
SC._simVolOpen = false;
SC.simVolMuted = function () {
  const ac = SC.audio && SC.audio.config;
  return !!ac && !ac.seOn && !ac.bgmOn;
};
// ミュート切替（main.js の case 'sim-vol-mute' から。切替後に render される＝BGM再開は render 内の SC.audio.bgm が担当。本編オプションの bgmOn と同じ流れ）
SC.simVolMute = function () {
  if (!SC.audio) return;
  if (SC.simVolMuted()) {
    SC.audio.setConfig({ seOn: true, bgmOn: true });
    SC.audio.se('decide');   // 本編オプションの seOn と同じ確認音
  } else {
    SC.audio.setConfig({ seOn: false, bgmOn: false });
    SC.audio.bgmStop();
  }
};
// ポップオーバーを閉じる（再描画しない。DOM のクラスだけ外す）
SC.simVolClose = function () {
  SC._simVolOpen = false;
  if (typeof document === 'undefined') return;
  const w = document.querySelector('.sim-vol-wrap');
  if (w) {
    w.classList.remove('open');
    const b = w.querySelector('.sim-vol-btn');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
};
SC.simVolHtml = function (place) {   // v0.25.42: place=置き場所のクラス（本編ヘッダー用 'vol-hdr-left'。省略=シミュの右上）
  if (!SC.audio) return '';
  const ac = SC.audio.config;
  const muted = SC.simVolMuted();
  const row = function (label, key, vol) {
    const v = Math.round(vol * 100);
    return '<div class="sim-vol-row"><span class="sim-vol-lbl">' + label + '</span>' +
      '<input type="range" class="sim-vol-range" data-opt="' + key + '" min="0" max="100" value="' + v + '" aria-label="' + label + '音量">' +
      '<b class="sim-vol-num">' + v + '</b></div>';
  };
  return '<span class="sim-vol-wrap' + (place ? ' ' + place : '') + (SC._simVolOpen ? ' open' : '') + (muted ? ' muted' : '') + '">' +
    '<button class="give-up-btn sim-vol-btn" data-action="sim-vol-toggle" title="音量設定" aria-label="音量設定" aria-expanded="' + (SC._simVolOpen ? 'true' : 'false') + '">' + SC.icon(muted ? 'speakerMute' : 'speaker') + '</button>' +
    '<div class="sim-vol-pop">' +
      row('SE', 'seVol', ac.seVol) + row('BGM', 'bgmVol', ac.bgmVol) +
      '<button class="sim-btn sim-vol-mute" data-action="sim-vol-mute">' + (muted ? 'ミュート解除' : 'ミュート') + '</button>' +
    '</div></span>';
};
