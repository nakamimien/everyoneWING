// オーディション（ライブバトル）エンジン
// 実仕様: ★=TA/LA/アピールボーナス、行動順 Perfect>Good>審査員>Normal>Bad、
//        審査員は毎ターンway数へ口撃・4の倍数ターンで1.5倍+属性DOWN、余剰アピール切捨て
window.SC = window.SC || {};

// ---- ルーチン文字列のパース（'c231' / 's1>2'） ----
SC.parseRoutine = function (str) {
  if (!str) return { t: 'cycle', seq: [1, 2, 3] };
  if (str[0] === 'c') return { t: 'cycle', seq: str.slice(1).split('').map(Number) };
  const m = str.match(/^s(\d)>(\d)$/);
  return { t: 'spear', rank: Number(m[1]), next: Number(m[2]) };
};

// ---- オデ前会話（動画実測: 選択肢式。正解でテンションUP） ----
SC.beginAuditionFlow = function (defId) {
  const st = SC.state;
  // v0.13b: commsOff 時はオデ前会話をカット → 即バトル（テンション変動もなし）
  if (st.commsOff) {
    SC.startAudition(defId, null);
    return;
  }
  // v0.25.12: 本戦（準決勝・決勝）も本選用オデ前コミュを挟む（選択肢なし・テンション変動なし。ユーザー指定）
  if (st.finalsStage === 'semi' || st.finalsStage === 'final') {
    st.preTalk = { defId: defId, finals: true };
    st.screen = 'preTalk';
    return;
  }
  // v0.25.6: 位置固定3択（ユーザー実機確認: 上=テンションUP／左=変動なし／右=DOWN）。文言はオリジナル
  st.preTalk = { defId: defId };
  st.screen = 'preTalk';
};

// v0.25.6: choiceIdx = 0:左（変動なし）/ 1:上（UP）/ 2:右（DOWN）＝位置固定
SC.resolvePreTalk = function (choiceIdx) {
  const st = SC.state;
  const p = st.preTalk;
  if (!p) return;
  const result = choiceIdx === 1 ? 'up' : (choiceIdx === 2 ? 'down' : 'flat');
  if (result === 'up') SC.addTension(SC.CONFIG.tension.delta.preTalkGood);
  if (result === 'down') SC.addTension(SC.CONFIG.tension.delta.preTalkBad);
  // v0.25.4: 反応フェイズを挟む（アイドルの反応+テンション演出→タップでオーディションへ）。演出カット時は即開始
  if (SC.state.commsOff) {
    st.preTalk = null;
    SC.startAudition(p.defId, SC._preTalkLabel(result));
    return;
  }
  p.phase = 'result';
  p.result = result;
};

SC._preTalkLabel = function (result) {
  return result === 'up' ? 'グッド（テンションUP）'
    : result === 'down' ? 'バッド（テンションDOWN）' : '（テンション変動なし）';
};

// v0.25.4: 反応フェイズからオーディション開始（main.jsのpretalk-goから）
SC.preTalkGo = function () {
  const st = SC.state;
  const p = st.preTalk;
  if (!p) return;
  st.preTalk = null;
  // v0.25.12: 本戦コミュはテンション変動なし＝結果ラベルもなし
  SC.startAudition(p.defId, p.finals ? null : SC._preTalkLabel(p.result));
};

// ---- 開始 ----
// preTalkResult: 会話結果ログ文字列（beginAuditionFlow経由時のみ。直接呼び出し時はnull）
SC.startAudition = function (defId, preTalkResult) {
  const st = SC.state;
  const def = SC.AUDITIONS.find(function (a) { return a.id === defId; });
  const mode = st.mode;
  const A = SC.CONFIG.audition;
  const preTalk = preTalkResult || null;

  // 山札8枚 = P4枚 + サポ4枚
  const deck = [];
  st.pSkills.forEach(function (sk, i) {
    // Object.assign でallJudges/selfDmg/condBuff等の追加プロパティもコピー
    deck.push(Object.assign({}, sk, { owner: 'p', idx: i }));
  });
  // v0.24: Object.assign で sup.skill の全プロパティを保全（allJudges/extra/appealVar 等を落とさない）
  SC.SUPPORTS.forEach(function (sup, i) {
    if (!sup || !sup.skill) return;   // v0.25.31: skill の無い枠（シミュの「なし」枠）は山札に入れない。本編は全枠に skill があるので挙動不変
    deck.push(Object.assign({}, sup.skill, { owner: i, idx: 4 + i }));
  });

  // チャージアピール持ちは思い出ゲージ上限200%（wiki）
  let mentalStart = st.mental;
  const memMax = SC.IDOL.chargeAppeal ? 2000 : 1000;

  const tIdx = SC.tensionIdx();
  const units = [{
    key: 'player', name: SC.IDOL.name, isPlayer: true,
    mental: mentalStart, mentalMax: mentalStart, out: false, stars: 0,
    mem: SC.CONFIG.tension.memoryInit[tIdx], memMax: memMax, debuffs: [], judgement: null,
    attentionMult: 1.0,  // v0.14: 注目度重み（重み付き抽選用）【wiki効果解説】
    // ki（気力）はWING編対象外（ユーザー確認2026-07-04）のため不要だが互換のため0で保持
  }];
  def.rivals.forEach(function (rv, i) {
    units.push({
      // 実機準拠でシルエット名のみ表示（中身のキャラ名はconfigのwiki情報として保持）
      key: 'r' + i, name: 'アイドル' + 'ABCDE'[i], isPlayer: false,
      fav: rv.fav, routine: SC.parseRoutine(rv.r[mode]),
      // wiki個別値採用（動画の350はミドルだがwiki値が正・ユーザー確認2026-07-03）
      mental: def.rivalMental, mentalMax: def.rivalMental, out: false, stars: 0,
      mem: A.rivalMemory.init, memMax: 1000, debuffs: [], judgement: null, plan: null,
      attentionMult: 1.0, // v0.14: 注目度重み
    });
  });

  const judges = SC.ATTRS.map(function (attr) {
    return {
      attr: attr, name: SC.ATTR_LABEL[attr] + '審査員',
      // v0.19: 蓄積式（実機仕様: wiki「興味値が最大になると満足しスターを配って画面外にはける」）
      // gained=蓄積アピール量(0から加算)、need=満足に必要なアピール量(旧hpMax相当)
      gained: 0, need: def.hp[mode], gone: false,
      dealt: {}, bonusStep: {}, lastHitBy: null, taTo: null, laTo: null,
      interests: [],      // v0.14: 興味倍率エントリ配列 [{ mult, until }]【wiki効果解説】
      influencePct: 0,    // v0.14: 影響力%（加算）【wiki効果解説】
    };
  });

  st.audition = {
    defId: defId, mode: mode, label: def.name, def: def,
    passRank: def.passRank || 2, way: def.way, dmg: def.dmg[mode],
    turn: 1, units: units, judges: judges, deck: deck,
    cooldown: {},           // deckIdx -> 再登場ターン
    hand: [], selectedCard: null, selectedJudge: null,
    history: [],            // スキル履歴（直近5行動の owner。リンク条件判定用）
    goneThisTurn: [],       // このターンに満足した審査員（パーフェクトライブ判定用）
    log: [], finished: false, result: null, phase: 'select',
    totalDealt: {}, stars: def.stars || SC.CONFIG.audition.stars,
    passiveHistory: []      // v0.20b: 発動パッシブ履歴（最大6件・古いものから消える）
  };
  units.forEach(function (u) { st.audition.totalDealt[u.key] = 0; });
  if (preTalk) SC.auditionLog(`オーディション前の会話：${preTalk}`, 'sys');
  SC.dealHand();
  SC.planRivals();
  SC.firePassives();
  st.screen = 'audition';
};

// v0.25.34: パッシブの発動確率判定フック。既定は SC.chance(prob)（本編の挙動・乱数消費とも不変）。
//   シミュの1〆確率（sim.js simOneShot）だけが試行中に差し替え、(試行番号, panelKey) 由来の独立した乱数で判定する
//   （他のパッシブを保有に加えても・順序が変わっても、各パッシブの発動結果が変わらない＝共通乱数）
SC.passiveChance = function (prob, panelKey) { void panelKey; return SC.chance(prob); };

// v0.25.36: 思い出ゲージを pct% 加算（ゲージ100%=1000・上限 memMax）。思い出ゲージUPパッシブ（firePassives）と効果札（execPlayerAction）の共通処理
SC.addMemoryGauge = function (pct) {
  const player = SC.state.audition.units[0];
  const add = Math.round(1000 * pct / 100);
  player.mem = Math.min(player.memMax || 1000, player.mem + (isFinite(add) ? add : 0));
  return add;
};

// v0.25.42: 1ターンに発動できるパッシブの上限（ユーザー確認「1ターンに発動するパッシブスキルは6個まで。P-UR編成時のみ8個発動する」。wiki「同一ターンにパッシブスキルが7個以上発動することもない」）。
//   編成のP（SC.IDOL._cardId のカード）がUR=SC.CONFIG.audition.passiveMaxPerTurnPUR(8)、それ以外（SSR/SR・Pなし・仮データ）=SC.CONFIG.audition.passiveMaxPerTurn(6)。
//   firePassives の両経路（仮データ passive / 実カードの動的パネル cp_）と、発動履歴（passiveHistory）・発動中アイコン列の最大件数が共通で使う。本編・シミュ・1〆共通（ロジック層）
SC.passiveMaxPerTurn = function () {
  const A = SC.CONFIG.audition;
  const id = SC.IDOL && SC.IDOL._cardId;
  const card = (id && SC.findCard) ? SC.findCard(id) : null;
  return (card && card.rarity === 'UR') ? A.passiveMaxPerTurnPUR : A.passiveMaxPerTurn;
};

// ---- パッシブスキル（ターン開始時に条件・確率で発動。上限6/ターン・P-URは8/ターン＝SC.passiveMaxPerTurn） ----
// 実機準拠: パッシブは対応パネル(type:'passive')を習得した場合のみ発動対象
SC.firePassives = function () {
  const a = SC.state.audition;
  const player = a.units[0];
  let fired = 0;
  const maxFire = SC.passiveMaxPerTurn();   // v0.25.42: 1ターンの発動上限（P-UR編成のみ8・他は6）
  const removed = SC.state.passiveRemoved || [];
  const opened = SC.state.panelOpened || [];

  // v0.17: activePassives の残ターン更新（ターン開始時に-1、0以下は除去）
  if (!a.activePassives) a.activePassives = [];
  a.activePassives = a.activePassives.filter(function (ap) {
    ap.turnsLeft = (ap.turnsLeft || 1) - 1;
    return ap.turnsLeft > 0;
  });

  // v0.25.47: 前のターンに発動した「思い出ゲージN%UP」（「発動時に」が付かないもの）は次のターンの開始時に上がる（ユーザー確認）。このターンのパッシブ抽選より前に加算
  if (a.pendingMemGauge && a.pendingMemGauge.length > 0) {
    const due = a.pendingMemGauge.filter(function (e) { return e.turn <= a.turn; });
    a.pendingMemGauge = a.pendingMemGauge.filter(function (e) { return e.turn > a.turn; });
    due.forEach(function (e) {
      SC.addMemoryGauge(e.pct);
      SC.auditionLog(`思い出ゲージ+${e.pct}%（前のターンに発動した「${e.name}」）`, 'good');
    });
  }
  // パッシブの思い出ゲージ加算: 発動時に＝今すぐ／それ以外＝次のターン開始時（a.pendingMemGauge に積む）
  const gaugeUp = function (pct, now, name) {
    if (!(pct > 0)) return;
    if (now) { SC.addMemoryGauge(pct); return; }
    if (!a.pendingMemGauge) a.pendingMemGauge = [];
    a.pendingMemGauge.push({ pct: pct, turn: a.turn + 1, name: name || 'パッシブ' });
  };

  // パネルkey→holder の対応を config.panel から構築
  const holderByKey = {};
  Object.keys(SC.CONFIG.panel).forEach(function (key) {
    const p = SC.CONFIG.panel[key];
    if (p.type === 'passive' && p.holder !== undefined) {
      holderByKey[key] = p.holder;
    }
  });

  // 習得済みのパッシブパネルの holder 一覧
  const activeHolders = {};
  opened.forEach(function (key) {
    if (holderByKey[key] !== undefined) {
      activeHolders[holderByKey[key]] = true;
    }
  });

  // ---- 仮データ passive（IDOL/SUPPORTS[i].passive）の発動 ----
  // v0.21: 実カード編成スロット（_hasRealCard=true）では仮データのpassiveを発動させない。
  // 実カードのpassiveは動的パネル（cp_プレフィックス）として登録・発動する。
  const holders = [{ id: 'p', who: SC.IDOL.name, p: SC.IDOL.passive, hasReal: !!SC.IDOL._hasRealCard }].concat(
    SC.SUPPORTS.map(function (s, i) { return { id: i, who: s.name, p: s.passive, hasReal: !!s._hasRealCard }; }));

  holders.forEach(function (h) {
    // v0.21: 実カードスロットの仮データpassiveは発動禁止
    if (h.hasReal) return;
    // パネル習得チェック: 対応パネルが習得済みでない場合はスキップ
    if (!h.p || !activeHolders[h.id]) return;
    if (removed.indexOf(h.id) >= 0 || fired >= maxFire) return;   // v0.25.42: 上限は SC.passiveMaxPerTurn()
    const c = h.p.cond || { t: 'always' };
    if (c.t === 'turnMin' && a.turn < c.v) return;
    if (c.t === 'mentalBelow' && player.mental / player.mentalMax >= c.v) return;
    if (!SC.passiveChance(h.p.rate, 'h:' + h.id)) return;   // v0.25.34: 発動判定フック（既定=SC.chance）

    const e = h.p.effect;
    if (e.t === 'buff') {
      player.debuffs.push({ attr: e.attr, pct: e.pct, untilTurn: a.turn + e.turns - 1, src: 'passive' });   // v0.25.40: src:'passive'＝パッシブ由来のバフ（[消去:◯◯]の個数に数えない・消去もしない）
      SC.auditionLog(`⚡パッシブ「${h.p.name}」発動！ ${SC.ATTR_LABEL[e.attr]} +${e.pct}%[${e.turns}T]`, 'good');
    } else if (e.t === 'heal') {
      const heal = Math.ceil(player.mentalMax * e.pct);
      player.mental = Math.min(player.mentalMax, player.mental + heal);
      a.healCount = (a.healCount || 0) + 1;   // v0.25.40: 回復パッシブの発動も回復回数に数える（【wiki】パッシブ等の回復もカウント。「回復回数N回以上」条件・[回復回数増加で効果UP]共通）
      SC.auditionLog(`⚡パッシブ「${h.p.name}」発動！ Me +${heal}（${player.mental}/${player.mentalMax}）`, 'good');
    } else if (e.t === 'mem') {
      player.mem = Math.min(player.memMax, player.mem + e.gain);
      SC.auditionLog(`⚡パッシブ「${h.p.name}」発動！ 思い出ゲージ +${e.gain / 10}%`, 'good');
    }
    // v0.17: 発動パッシブをアイコン枠用リストに追加
    a.activePassives.push({
      key: h.id,
      name: h.p.name || 'パッシブ',
      desc: h.p.desc || '',
      turnsLeft: 2
    });
    // v0.20b: 発動履歴（v0.25.42: 最大件数=1ターンの発動上限。6→6/8）
    if (!a.passiveHistory) a.passiveHistory = [];
    a.passiveHistory.unshift({ key: h.id, name: h.p.name || 'パッシブ', desc: h.p.desc || '', turn: a.turn, attrs: e.t === 'buff' ? [e.attr] : [] });   // v0.25.41: 仮データのパッシブはパネル定義が無いので、バフ属性を履歴に持つ（本編アイコンの配色用）
    if (a.passiveHistory.length > maxFire) a.passiveHistory.length = maxFire;
    fired++;
  });

  // ---- 動的パネル（cp_ プレフィックス）の buff パッシブ発動 ----
  // 実カード由来の buff パネルが習得済みの場合、仮データ passive と同じ流れで発動
  // 仮データ passive との二重発動はない（動的パネルは holder=key 自身、仮データは holder=数値/文字）
  opened.forEach(function (panelKey) {
    if (panelKey.indexOf('cp_') !== 0) return; // 動的パネルのみ対象
    if (fired >= maxFire) return;   // v0.25.42: 上限は SC.passiveMaxPerTurn()
    const pd = SC.CONFIG.panel[panelKey];
    if (!pd || pd.type !== 'passive') return;

    // 削除済みチェック（holder=panelKey 自身）
    if (removed.indexOf(panelKey) >= 0) return;

    // 条件チェック（_cond: null=always / turnMin / turnMax / mentalBelow / mentalAbove / starMin / starMax /
    //   rank / judgesMin / hasBuff / never / histGenre。v0.25.9で拡張）
    const cond = pd._cond || { t: 'always' };
    if (!SC.condMet(cond)) return;   // v0.25.18: 条件評価を共通化（extra条件節と共用）
    // v0.25.9: 最大発動回数（[最大:N回]）の制限
    if (pd._maxN) {
      if (!a._passiveFires) a._passiveFires = {};
      if ((a._passiveFires[panelKey] || 0) >= pd._maxN) return;
    }

    // 確率チェック（_prob: 0〜1。未設定時 1.0）[仮データ]
    // v0.25.13: パッシブスキル発動率UP状態を加算
    let prob = (pd._prob !== undefined) ? pd._prob : 1.0;
    prob = Math.min(1, prob + SC.sumStatusPct('passProb') / 100);
    if (!SC.passiveChance(prob, panelKey)) return;   // v0.25.34: 発動判定フック（既定=SC.chance）

    // 発動回数を記録（v0.25.9: [最大:N回]制限用）
    const markFired = function () {
      if (!a._passiveFires) a._passiveFires = {};
      a._passiveFires[panelKey] = (a._passiveFires[panelKey] || 0) + 1;
    };
    // v0.25.35: 発動パッシブをアイコン枠用リスト＋発動履歴（最大6件）に載せ、1ターンの発動上限カウントを進める
    //   （buff パッシブと同じ扱い。回復・ダメージカット・回避の各パッシブも共用）
    const recordFired = function (turnsLeft) {
      a.activePassives.push({
        key: panelKey,
        name: pd.name || 'パッシブ',
        desc: pd.desc || '',
        turnsLeft: turnsLeft
      });
      if (!a.passiveHistory) a.passiveHistory = [];
      a.passiveHistory.unshift({ key: panelKey, name: pd.name || 'パッシブ', desc: pd.desc || '', turn: a.turn });
      if (a.passiveHistory.length > maxFire) a.passiveHistory.length = maxFire;   // v0.25.42: 最大件数=1ターンの発動上限
      fired++;
    };
    // v0.25.35: パッシブ発動のカットイン（思い出ゲージUPの書き方に倣う）
    const passiveCutin = function (effText) {
      SC.fxPush({ type: 'cutin', cls: 'passive', logo: 'Passive Skill',
        text: (pd.name || '') + '&nbsp;&nbsp;' + effText,
        faceAttr: 'vo', faceText: (pd.name || 'P').charAt(0), duration: 800 });
    };

    // v0.25.9: 思い出ゲージUPパッシブ（ゲージ100%=1000）
    if (pd._memGaugePct !== undefined) {
      // v0.25.47: 発動時に＝このターン／それ以外＝次のターン（gaugeUp）。従来は全部このターンに加算していた
      gaugeUp(pd._memGaugePct, !!pd._memGaugeNow, pd.name);   // 加算は SC.addMemoryGauge（効果札 memGaugePct と共通の式）
      markFired();
      const gTxt = '思い出ゲージ+' + pd._memGaugePct + '%' + (pd._memGaugeNow ? '' : '（次のターン）');
      SC.auditionLog(`⚡パッシブ「${pd.name}」発動！ ${gTxt}`, 'good');
      SC.fxPush({ type: 'cutin', cls: 'passive', logo: 'Passive Skill',
        text: (pd.name || '') + '&nbsp;&nbsp;' + gTxt,
        faceAttr: 'vo', faceText: (pd.name || 'P').charAt(0), duration: 800 });
      recordFired(SC.CONFIG.audition.passiveEffectTurns);   // v0.25.42: 発動履歴・発動中アイコンに載せ、1ターンの発動上限（SC.passiveMaxPerTurn）にも数える（従来は載せず・数えず＝上限を超えて発動できていた）
      return;
    }
    // v0.25.9: 注目度UP/DOWNパッシブ（attentionMultに乗算・最大回数で1回制）
    if (pd._attnPct !== undefined) {
      // v0.25.43: 注目度UP/DOWNパッシブは状態効果 'attn' として持つ。パッシブ効果＝発動したターンのみ（SC.CONFIG.audition.passiveEffectTurns。ユーザー確認「パッシブの効果は発動したターンのみ」）。
      //   従来は player.attentionMult に永続で乗算していた（発動ターン以降ずっと効いていた）。passive:true＝パッシブ由来（ステータス効果の詳細モーダルには出さない＝左下のパッシブ枠で見る）
      const attnTurns = SC.CONFIG.audition.passiveEffectTurns;
      SC.addStatus('attn', { pct: pd._attnPct, untilTurn: a.turn + attnTurns - 1, src: panelKey, passive: true });
      markFired();
      SC.auditionLog(`⚡パッシブ「${pd.name}」発動！ 注目度${pd._attnPct > 0 ? '+' : ''}${pd._attnPct}%[${attnTurns}T]`, 'good');
      recordFired(attnTurns);   // v0.25.42: 同上（発動履歴・アイコン・発動上限に数える）
      return;
    }
    // v0.25.35: 回復パッシブ（既存の仮データ passive の heal と同じ式でメンタル回復）
    //   v0.25.40: a.healCount を +1 する（v0.25.35 で増やさないようにしたのは誤り。【wiki】パッシブスキル等による回復も回復回数にカウント・メンタル満タンでの回復も1回）
    if (pd._healPct !== undefined) {
      const heal = Math.ceil(player.mentalMax * (pd._healPct / 100));
      player.mental = Math.min(player.mentalMax, player.mental + heal);
      a.healCount = (a.healCount || 0) + 1;
      gaugeUp(pd._memGaugeAdd, !!pd._memGaugeNow, pd.name);   // v0.25.47: 「思い出ゲージN%UP/メンタルN%回復」のゲージ分（従来は捨てていた）
      markFired();
      SC.auditionLog(`⚡パッシブ「${pd.name}」発動！ Me +${heal}（${player.mental}/${player.mentalMax}）${pd._memGaugeAdd ? ' / 思い出ゲージ+' + pd._memGaugeAdd + '%' + (pd._memGaugeNow ? '' : '（次のターン）') : ''}`, 'good');
      passiveCutin('Me+' + heal);
      recordFired(SC.CONFIG.audition.passiveEffectTurns);   // v0.25.36: アイコン枠の表示ターン数＝パッシブ効果の有効ターン数（発動したターンのみ。ユーザー確認）
      return;
    }
    // v0.25.35: ダメージカット／回避パッシブ。発動したターンから数ターンの状態効果として付与する（習得しただけでは効かない）。
    //   v0.25.36: 有効なのは発動したターンのみ（SC.CONFIG.audition.passiveEffectTurns＝1。ユーザー確認「パッシブの効果はパッシブが発動したターンのみに有効」）。
    //   審査員リアクション（judgeReaction）が SC.sumStatusPct で参照
    if (pd._cutPct !== undefined || pd._avoidPct !== undefined) {
      const stTurns = SC.CONFIG.audition.passiveEffectTurns;   // v0.25.36: 発動ターンのみ（untilTurn = a.turn）
      const isCut = pd._cutPct !== undefined;
      const stPct = isCut ? pd._cutPct : pd._avoidPct;
      SC.addStatus(isCut ? 'dmgCut' : 'avoid', { pct: stPct, untilTurn: a.turn + stTurns - 1, src: panelKey, passive: true });   // v0.25.43: passive:true＝パッシブ由来（ステータス効果の詳細モーダルには出さない）
      markFired();
      SC.auditionLog(`⚡パッシブ「${pd.name}」発動！ ${isCut ? 'メンタルダメージ' + stPct + '%CUT' : 'リアクション回避率+' + stPct + '%'}[${stTurns}T]`, 'good');
      passiveCutin((isCut ? 'Me被ダメ-' : '回避+') + stPct + '%[' + stTurns + 'T]');
      recordFired(stTurns);
      return;
    }

    // バフ適用（_buffAttrs=複合対応。v0.25.9）
    const attrs = (pd._buffAttrs && pd._buffAttrs.length > 0) ? pd._buffAttrs : (pd._buffAttr ? [pd._buffAttr] : []);
    let pct = pd._buffPct;
    if (attrs.length === 0 || pct === undefined) return;
    // v0.25.13: パッシブスキル強化状態（効果量を乗算で増加）
    const passBoost = SC.sumStatusPct('passBoost');
    if (passBoost > 0) pct = Math.round(pct * (1 + passBoost / 100));
    const turns = SC.CONFIG.audition.passiveEffectTurns; // v0.25.36: 発動したターンのみ有効（untilTurn = a.turn。ユーザー確認。従来は pd._buffTurns || 2 [仮データ] で常に2ターン）
    attrs.forEach(function (attr) {
      player.debuffs.push({ attr: attr, pct: pct, untilTurn: a.turn + turns - 1, src: 'passive' });   // v0.25.40: パッシブ由来の印（[消去:◯◯]の対象外）
    });
    gaugeUp(pd._memGaugeAdd, !!pd._memGaugeNow, pd.name);   // v0.25.47: 「Dance75%UP/思い出ゲージ25%UP」等のゲージ分（従来は捨てていた。発動時に が無いので次のターン）
    markFired();
    const attrLabel = attrs.map(function (x) { return SC.ATTR_LABEL[x] || x; }).join('&');
    SC.auditionLog(`⚡パッシブ「${pd.name}」発動！ ${attrLabel} +${pct}%[${turns}T]${pd._memGaugeAdd ? ' / 思い出ゲージ+' + pd._memGaugeAdd + '%' + (pd._memGaugeNow ? '' : '（次のターン）') : ''}`, 'good');
    // FX（1080p実測）: パッシブは下半分の大型カットイン（ピンクストライプ帯+立ち絵+効果名）
    SC.fxPush({ type: 'cutin', cls: 'passive', logo: 'Passive Skill',
      text: (pd.name || '') + '&nbsp;&nbsp;' + attrLabel + '+' + pct + '%[' + turns + 'T]',
      faceAttr: attrs[0], faceText: (pd.name || 'P').charAt(0), duration: 800 });
    // v0.17: 発動パッシブをアイコン枠用リストに追加／v0.20b: 発動履歴（最大6件）／発動上限カウント（v0.25.35: recordFired に共通化）
    recordFired(turns);
  });
};

// ---- v0.25.18: 条件オブジェクトの共通評価器（パッシブ発動 / extra内[〜場合]条件節で共用） ----
// cond: SC.parseCondString等が返す {t:...}。成立=true
SC.condMet = function (cond) {
  const a = SC.state.audition;
  if (!a) return false;
  const player = a.units[0];
  if (!cond || cond.t === 'always') return true;
  if (cond.t === 'never') return false;   // WING対象外条件（ポジション担当等）
  // 2026-10 カード更新対応: 複合条件（SC.parseCondString が返す {t:'all'|'any', list:[cond...]}）
  if (cond.t === 'all') return (cond.list || []).every(function (c) { return SC.condMet(c); });   // AND
  if (cond.t === 'any') return (cond.list || []).some(function (c) { return SC.condMet(c); });    // OR
  if (cond.t === 'turnMin' && a.turn < cond.v) return false;
  if (cond.t === 'turnMax' && a.turn > cond.v) return false;
  if (cond.t === 'mentalBelow' && player.mental / player.mentalMax >= cond.v) return false;
  if (cond.t === 'mentalAbove' && player.mental / player.mentalMax < cond.v) return false;
  if (cond.t === 'starMin' && player.stars < cond.v) return false;
  if (cond.t === 'starMax' && player.stars > cond.v) return false;
  if (cond.t === 'judgesMin' && SC.aliveJudges().length < cond.v) return false;
  if (cond.t === 'judgesMax' && SC.aliveJudges().length > cond.v) return false;
  if (cond.t === 'hasBuff' && !player.debuffs.some(function (b) {
    return b.attr === cond.attr && b.pct > 0 && b.untilTurn >= a.turn;
  })) return false;
  // v0.25.9: バフN個以上／VoDaVi全部付与／注目度UP付与／回避率UP付与（近似実装[推測]）
  if (cond.t === 'hasBuffN' && player.debuffs.filter(function (b) {
    return b.attr === cond.attr && b.pct > 0 && b.untilTurn >= a.turn;
  }).length < cond.n) return false;
  if (cond.t === 'hasAllBuffs' && !['vo', 'da', 'vi'].every(function (x) {
    return player.debuffs.some(function (b) { return b.attr === x && b.pct > 0 && b.untilTurn >= a.turn; });
  })) return false;
  // v0.25.43: 注目度UP/DOWNの「付与されている個数」は有効中の状態効果 'attn' の件数（従来は付与の累計＝期限が切れても数えていた）
  if (cond.t === 'hasAttnUpN' && SC.attnStatusCount(1) < cond.n) return false;
  if (cond.t === 'hasAttnDown' && SC.attentionMultOf(player) >= 1) return false;   // 注目度DOWN付与=実効の注目度乗率が1未満[近似]（v0.25.43: 有効中の効果だけで計算する SC.attentionMultOf）
  // v0.25.35: 回避率UPの付与=状態効果 'avoid'（回避パッシブが発動して有効中）。従来は習得しただけで真だった
  if (cond.t === 'hasAvoidUp' && SC.activeStatuses('avoid').length === 0) return false;
  if (cond.t === 'rank') {
    // 現在順位（★降順・プレイヤー優先・与興味降順＝表示と同じ基準）
    const sorted = a.units.slice().sort(function (x, y) {
      return (y.stars - x.stars) || ((y.isPlayer ? 1 : 0) - (x.isPlayer ? 1 : 0)) ||
        (a.totalDealt[y.key] - a.totalDealt[x.key]);
    });
    if (sorted.indexOf(player) + 1 !== cond.v) return false;
  }
  // v0.25.12: 履歴エントリの使用者名を解決（サポ札=そのサポのアピール扱い＝ユーザー確認仕様）
  const histOwnerName = function (h) {
    if (h.owner === 'p') return (SC.IDOL.realName || SC.IDOL.name || '').replace(/\s/g, '');   // v0.25.18: 判定は実名
    if (h.owner === 'guest') return (SC.GUEST ? SC.GUEST.name : '').replace(/\s/g, '');
    const s = SC.SUPPORTS[h.owner];
    return (s ? s.name : '').replace(/\s/g, '');   // 「カード名（アイドル名）」形式→部分一致で判定
  };
  // histPerson: 「履歴に◯◯がある場合」= 指定人物全員のスキルが履歴にあること
  if (cond.t === 'histPerson') {
    const okAll = (cond.persons || []).every(function (pn) {
      return a.history.some(function (h) { return histOwnerName(h).indexOf(pn) >= 0; });
    });
    if (!okAll) return false;
  }
  // histGenre: 履歴の使用スキルのジャンル（vo/da/vi）種類数で判定
  // 【wiki効果解説: 履歴にxジャンル以上(以下)】
  // v0.25.12: person付き=「その人物のスキルが履歴にある」も必要（例: 霧子1ジャンル以下。ユーザー確認仕様）
  if (cond.t === 'histGenre') {
    if (cond.person) {
      const hasPerson = a.history.some(function (h) { return histOwnerName(h).indexOf(cond.person) >= 0; });
      if (!hasPerson) return false;
    }
    const histAttrs = new Set();
    a.history.forEach(function (h) {
      if (h.attr === 'vo' || h.attr === 'da' || h.attr === 'vi') histAttrs.add(h.attr);   // ジャンル=Vo/Da/Viのみ[推測]
    });
    const genreCount = histAttrs.size;
    // le と ge の両方がある場合は or 条件（wiki「1ジャンル以下又は3ジャンル以上」）
    if (cond.le !== undefined && cond.ge !== undefined) {
      // or条件: leを満たさない かつ geを満たさない → 発動しない
      if (genreCount > cond.le && genreCount < cond.ge) return false;
    } else if (cond.le !== undefined) {
      if (genreCount > cond.le) return false;
    } else if (cond.ge !== undefined) {
      if (genreCount < cond.ge) return false;
    }
  }
  // ==== v0.25.13: 状態効果・回数・観客数ちょうど・履歴系の新条件 ====
  if (cond.t === 'hasStatus' && SC.activeStatuses(cond.s).length < (cond.n || 1)) return false;
  if (cond.t === 'hasStatusAny' && !cond.ss.some(function (s2) { return SC.activeStatuses(s2).length > 0; })) return false;
  if (cond.t === 'hasApUpPerson' && !SC.activeStatuses('apUp').some(function (e) {
    return e.person.indexOf(cond.person) >= 0 || cond.person.indexOf(e.person) >= 0;
  })) return false;
  if (cond.t === 'charmOnJudge' && !a.judges.some(function (j) {
    return !j.gone && j.charmUntil !== undefined && j.charmUntil >= a.turn;
  })) return false;
  // v0.25.35: メンタルダメージCUTの付与=状態効果 'dmgCut'（ダメージカットパッシブが発動して有効中）
  if (cond.t === 'hasDamCut' && SC.sumStatusPct('dmgCut') <= 0) return false;
  if (cond.t === 'judgesExact' && SC.aliveJudges().length !== cond.v) return false;
  if (cond.t === 'healMin' && (a.healCount || 0) < cond.v) return false;
  if (cond.t === 'mentalMaxMin' && player.mentalMax < cond.v) return false;
  if (cond.t === 'hasGenerated' && !a.hand.some(function (hi) { return a.deck[hi] && a.deck[hi].generated; })) return false;
  if (cond.t === 'hasAttnDownN' && SC.attnStatusCount(-1) < cond.n) return false;   // v0.25.43: 有効中の注目度DOWNの件数（従来は累計）
  // v0.25.35: 回避率UPがN個以上=有効中の状態効果 'avoid' の件数
  if (cond.t === 'hasAvoidUpN' && SC.activeStatuses('avoid').length < cond.n) return false;
  if (cond.t === 'hasAllBuffsN') {
    const okAllN = ['vo', 'da', 'vi'].every(function (at) {
      return player.debuffs.filter(function (b) { return b.attr === at && b.pct > 0 && b.untilTurn >= a.turn; }).length >= cond.n;
    });
    if (!okAllN) return false;
  }
  if (cond.t === 'histUnitN') {
    const members = (SC.UNIT_MEMBERS || {})[cond.unit] || [];
    const nos = new Set();
    a.history.forEach(function (h) {
      let no = null;
      if (h.owner === 'p') no = SC.IDOL._idolNo;
      else if (h.owner !== 'guest' && SC.SUPPORTS[h.owner]) no = SC.SUPPORTS[h.owner]._idolNo;
      if (no && members.indexOf(no) >= 0) nos.add(no);
    });
    if (nos.size < cond.n) return false;   // 異なるメンバーn人以上[推測]
  }
  if (cond.t === 'histPersonN') {
    const cnt = a.history.filter(function (h) { return SC.ownerIdolName(h.owner).indexOf(cond.person) >= 0; }).length;
    if (cnt < cond.n) return false;
  }
  return true;
};

// v0.25.38: 「Nターン以降」（turnMin）だけを成立扱いにして評価する条件評価（SC.condMet の隣の姉妹関数）。
//   cond ツリーを再帰: turnMin=成立 / all=全子が成立 / any=どれかの子が成立 / それ以外=SC.condMet そのまま。
//   用途: シミュのおまかせ編成が保有パッシブを既定チェックする時の「ターン1で条件を満たさないが、満たさない理由が“Nターン以降”だけのもの」の判定
//   （例: 「3ターン以降」→真 / 「履歴に◯◯がある場合」「メンタル50%以下」→偽 / 「3ターン以降＋アンティーカ全員参加」→ユニットが揃っていれば真）。
//   評価はその時点の SC.state.audition（ターン1の基底状態を渡すのは呼び出し側）で行う
SC.condMetIgnoringTurnMin = function (cond) {
  if (cond && cond.t === 'turnMin') return true;
  if (cond && cond.t === 'all') return (cond.list || []).every(function (c) { return SC.condMetIgnoringTurnMin(c); });
  if (cond && cond.t === 'any') return (cond.list || []).some(function (c) { return SC.condMetIgnoringTurnMin(c); });
  return SC.condMet(cond);
};

// ユニット全員参加判定（v0.23: P+supports[0..3]のidolNoがユニット全員を含むか。guest除外）
// currentLoadout: { p: cardId|null, supports: [cardId|null ×4], guest: cardId|null }
SC.unitAllInLoadout = function (unitName) {
  const members = (SC.UNIT_MEMBERS || {})[unitName];
  if (!members || members.length === 0) return false;
  // 現在のロードアウトからidolNo集合を収集
  const nos = new Set();
  // Pカード
  if (SC.IDOL._idolNo) nos.add(SC.IDOL._idolNo);
  // サポートA〜D（guest除く）
  SC.SUPPORTS.forEach(function (sup) {
    if (sup && sup._idolNo) nos.add(sup._idolNo);
  });
  // 全メンバーが揃っているか
  return members.every(function (no) { return nos.has(no); });
};

// v0.25.13: 「{ユニット}から{人物}のみがライブに参加」判定（P+サポ・ゲスト除く。ビルド時解決用）
// = 編成内のそのユニット所属アイドルが、指定人物ただ1人であること
SC.unitOnlyInLoadout = function (unitName, personName) {
  const members = (SC.UNIT_MEMBERS || {})[unitName];
  if (!members) return false;
  // 編成中のidolNo→名前
  const present = [];
  const pushIf = function (no, name) {
    if (no && members.indexOf(no) >= 0) present.push({ no: no, name: (name || '').replace(/\s/g, '') });
  };
  pushIf(SC.IDOL._idolNo, SC.IDOL.realName || SC.IDOL.name);   // v0.25.18: 判定は実名
  (SC.SUPPORTS || []).forEach(function (sup) {
    if (sup) pushIf(sup._idolNo, sup._idolName);
  });
  // 重複カード（同アイドル複数枚）は1人と数える
  const uniq = {};
  present.forEach(function (e) { uniq[e.no] = e; });
  const list = Object.values(uniq);
  if (list.length !== 1) return false;
  const nm = list[0].name;
  return nm.indexOf(personName) >= 0 || personName.indexOf(nm) >= 0;
};

// 編成のユニットメンバー充足状態（ツールチップ用）
SC.unitAllStatus = function (unitName) {
  const members = (SC.UNIT_MEMBERS || {})[unitName];
  if (!members) return null;
  // idolNo → アイドル名マップ
  const noToName = {};
  if (SC.IDOL._idolNo) noToName[SC.IDOL._idolNo] = SC.IDOL.realName || SC.IDOL.name;
  SC.SUPPORTS.forEach(function (sup) {
    if (sup && sup._idolNo && sup._idolName) noToName[sup._idolNo] = sup._idolName;
  });
  return members.map(function (no) {
    return { no: no, name: noToName[no] || ('No.' + no), ok: !!noToName[no] };
  });
};

// ツールチップ用: ユニット全員参加の充足表示テキスト
SC.unitAllStatusText = function (unitName) {
  const status = SC.unitAllStatus(unitName);
  if (!status) return unitName + '（不明）';
  const parts = status.map(function (s) {
    return s.name + (s.ok ? '✓' : '✗');
  });
  return unitName + ': ' + parts.join(' ');
};

// リンクアピール発動可否（v0.23: 本来条件実装）
// wikiルール:「LS使用者以外のユニットメンバー全員が、スキル履歴（直近5行動）に載っている」
// 前提: 編成にユニット全員が揃っていること（P+サポA〜D、guest除く）
// 引数 card: 使用するリンクカード（owner='p'またはサポのowner番号）
SC.linkReady = function (card) {
  const a = SC.state.audition;
  // cardが渡されていない場合は旧簡略化判定にフォールバック（後方互換）
  if (!card) {
    const owners = {};
    a.history.forEach(function (h) { if (h.owner !== 'p') owners[h.owner] = true; });
    return Object.keys(owners).length >= SC.CONFIG.audition.linkNeed;
  }
  // card.ownerのアイドルのユニットを特定
  let userIdolNo = null;
  if (card.owner === 'p') {
    userIdolNo = SC.IDOL._idolNo;
  } else if (typeof card.owner === 'number') {
    const sup = SC.SUPPORTS[card.owner];
    if (sup) userIdolNo = sup._idolNo;
  }
  if (!userIdolNo) {
    // idolNoが取れない→旧簡略化フォールバック
    const owners = {};
    a.history.forEach(function (h) { if (h.owner !== 'p') owners[h.owner] = true; });
    return Object.keys(owners).length >= SC.CONFIG.audition.linkNeed;
  }
  // 使用者のユニットを探す
  let unitName = null;
  let unitMembers = null;
  Object.keys(SC.UNIT_MEMBERS || {}).forEach(function (name) {
    const m = SC.UNIT_MEMBERS[name];
    if (m.indexOf(userIdolNo) >= 0) {
      if (!unitName || m.length < (SC.UNIT_MEMBERS[unitName] || []).length) {
        // 複数ユニット名が同メンバーを持つ（短縮名）場合: 最初に見つかったもの
        unitName = name;
        unitMembers = m;
      }
    }
  });
  if (!unitName || !unitMembers) {
    // ユニット不明→旧簡略化フォールバック
    const owners = {};
    a.history.forEach(function (h) { if (h.owner !== 'p') owners[h.owner] = true; });
    return Object.keys(owners).length >= SC.CONFIG.audition.linkNeed;
  }
  // 前提チェック: 編成にユニット全員が揃っているか
  if (!SC.unitAllInLoadout(unitName)) return false;
  // 使用者以外のメンバーのowner番号を収集（P=idolNo→ownerKey='p'、サポ=owner番号）
  const otherMemberOwners = [];
  unitMembers.forEach(function (no) {
    if (no === userIdolNo) return; // 使用者自身は除く
    // 編成内のどのスロットか探す
    if (SC.IDOL._idolNo === no) { otherMemberOwners.push('p'); return; }
    SC.SUPPORTS.forEach(function (sup, i) {
      if (sup && sup._idolNo === no) otherMemberOwners.push(i);
    });
  });
  if (otherMemberOwners.length === 0) return false;
  // 履歴5件内に全員の行動があるか
  const histOwners = new Set();
  a.history.forEach(function (h) { histOwners.add(h.owner); });
  return otherMemberOwners.every(function (ownerKey) {
    return histOwners.has(ownerKey);
  });
};

// v0.25.37: 札の extra に「(Link)」節（SC.parseExtraSegments で viaLink:true になる節）があるか。
//   実カードの LINK は card.link フラグではなくこの節で表す（従来は実カードの札に link が立たず、(Link)節が本編・シミュとも一度も発動しなかった）
SC.cardHasLinkClause = function (card) {
  if (!card || !Array.isArray(card.extra) || !SC.parseExtraSegments) return false;
  return SC.parseExtraSegments(card).some(function (s) { return s.viaLink; });
};
// v0.25.37: LINK成立の判定（linkReady は従来のまま）。仮データ札（card.link===true）と実カードの札（(Link)節あり）の両方を対象にする。
//   アピール札の経路・効果札の経路・予測値（appealPredict）・手札バッジが同じ判定を使う（履歴の追記より前に評価すること）
SC.cardLinkOk = function (card) {
  return !!(card && (card.link || SC.cardHasLinkClause(card)) && SC.linkReady(card));
};

// プラスアピール発動可否（手札バッジ点灯用）
// v0.25.18: extra条件節の実評価（SC.extraCondsMet）に接続＝履歴条件等の旧plusオブジェクトで
//   拾えない条件にも対応。extraがない場合は旧card.plus判定にフォールバック
SC.plusActive = function (card) {
  if (card.extra && Array.isArray(card.extra) && SC.parseExtraSegments) {
    const segs = SC.parseExtraSegments(card).filter(function (s) { return s.cond && !s.viaLink; });
    if (segs.length > 0) return segs.some(function (s) { return SC.extraCondsMet(s.cond); });
  }
  const a = SC.state.audition;
  if (!card.plus) return false;
  const plus = card.plus;
  // パース不能条件 → 不成立（安全側）
  if (plus._unknownCond) return false;
  // ユニット全員参加条件（v0.23: 編成P+サポA〜Dで判定）
  if (plus.unitAll && !SC.unitAllInLoadout(plus.unitAll)) return false;
  // Nターン以降
  if (plus.turnMin && a.turn < plus.turnMin) return false;
  // Nターン以前
  if (plus.turnMax && a.turn > plus.turnMax) return false;
  // メンタルN%以上
  if (plus.mentalAbove !== undefined) {
    const player = a.units[0];
    if (player.mental / player.mentalMax < plus.mentalAbove) return false;
  }
  // メンタルN%以下
  if (plus.mentalBelow !== undefined) {
    const player = a.units[0];
    if (player.mental / player.mentalMax > plus.mentalBelow) return false;
  }
  return true;
};

// スキル履歴に追加（直近5件のみ保持。attr: アピールジャンル）
SC.pushHistory = function (owner, attr) {
  const a = SC.state.audition;
  a.history.unshift({ owner: owner, attr: attr || null });
  if (a.history.length > SC.CONFIG.audition.historyMax) a.history.pop();
};

// ==== v0.25.13: 名前付き状態効果システム（ユーザー確認: いずれもWINGで付与可能） ====
// relax=リラックス（被メンタルダメージ軽減[推測]）/ passProb=パッシブ発動率UP / passBoost=パッシブ強化
// melancholySelf=メランコリー（被メンタルダメージ増加[推測]）/ resurrection=復活[1回]（脱落時N%で復帰[推測]）
// hitomi=瞳の輝き（条件参照用・固有効果は要仕様確認）/ apUp={人物}のアピール倍率UP
// 魅了は審査員側（j.charmUntil）に保持
SC.addStatus = function (key, entry) {
  const a = SC.state.audition;
  if (!a) return;
  if (!a.statuses) a.statuses = {};
  if (!a.statuses[key]) a.statuses[key] = [];
  a.statuses[key].push(entry);
};
SC.activeStatuses = function (key) {
  const a = SC.state.audition;
  if (!a || !a.statuses || !a.statuses[key]) return [];
  return a.statuses[key].filter(function (s) {
    return !s.used && (s.untilTurn === undefined || s.untilTurn >= a.turn);
  });
};
SC.sumStatusPct = function (key) {
  return SC.activeStatuses(key).reduce(function (s, e) { return s + (e.pct || 0); }, 0);
};

// ==== v0.25.43: 注目度（UP/DOWN）のターン管理 ====
// 「注目度N%UP/DOWN[Nターン]」は状態効果 'attn'（pct=±N・untilTurn）として持ち、[Nターン]どおりに切れる（untilTurn = 付与ターン + N − 1。他の状態効果と同じ数え方）。
//   [Nターン]の無い表記（パッシブの注目度UP/DOWN・思い出のLINK効果「注目度5%DOWN」等）は SC.CONFIG.audition.passiveEffectTurns（=1。発動/付与したターンのみ）。
//   従来(〜v0.25.42)は player.attentionMult に永続で乗算しており、[Nターン]もパッシブの1ターン限りも無視していた。
//   player.attentionMult は「基準」（常に1.0・シミュの手動指定やテストが直接入れる値）として残し、実効の乗率は下の SC.attentionMultOf（基準 × 有効中の attn の積）が返す。
//   使い道（全部この関数を通す）: ライバル審査員リアクションの対象抽選の重み(weightedSampleUnits)・注目度条件(hasAttnDown)・倍率変動アピール[注目度が高い/低いほど効果UP](varAppealResolve)
// 有効中の 'attn' の件数（dir>0=UP・dir<0=DOWN）。「注目度UPがN個以上付与」「注目度DOWNがN個以上付与」条件用
SC.attnStatusCount = function (dir) {
  return SC.activeStatuses('attn').filter(function (e) { return dir > 0 ? e.pct > 0 : e.pct < 0; }).length;
};
// ユニットの実効の注目度乗率。ライバル（状態効果を持たない）は基準 attentionMult そのまま。非有限は1.0
SC.attentionMultOf = function (unit) {
  const base = (unit && typeof unit.attentionMult === 'number' && isFinite(unit.attentionMult)) ? unit.attentionMult : 1.0;
  if (!unit || !unit.isPlayer) return base;
  let m = base;
  SC.activeStatuses('attn').forEach(function (e) {
    const f = Math.max(0, 1 + (isFinite(e.pct) ? e.pct : 0) / 100);   // 100%DOWN以上は0（狙われない）
    m *= f;
  });
  return isFinite(m) ? Math.max(0, m) : 1.0;
};
// 履歴owner→アイドル名（空白除去）
SC.ownerIdolName = function (owner) {
  if (owner === 'p') return (SC.IDOL.realName || SC.IDOL.name || '').replace(/\s/g, '');   // v0.25.18: 判定は実名
  if (owner === 'guest') return (SC.GUEST ? (SC.GUEST.name || '') : '').replace(/\s/g, '');
  const s = SC.SUPPORTS[owner];
  return (s ? (s._idolName || s.name || '') : '').replace(/\s/g, '');
};

// v0.25.13: ライブスキル生成（「ライブスキル生成[スキル名]」効果）
// 同名のライブスキルパネル定義があればそれを、なければ汎用スキル[仮データ]を手札に加える
SC.generateLiveSkill = function (name, owner) {
  const a = SC.state.audition;
  if (!a) return;
  let def = null;
  if (name) {
    const P = SC.CONFIG.panel || {};
    for (const k in P) {
      if (P[k] && P[k].type === 'live' && P[k].name === name) { def = P[k]; break; }
    }
  }
  const gen = def
    ? { name: def.name, attr: def.attr, attrs: def.attrs, mult: def.mult, allJudges: !!def.allJudges,
        extra: def.extra || null, randomEffects: def.randomEffects || null,   // v0.25.35: ランダム効果の候補も引き継ぐ
        owner: owner, generated: true, effectRaw: '生成: ' + def.name }
    : { name: name || '生成スキル', attr: 'vo', mult: 2, owner: owner, generated: true,
        effectRaw: 'Vo2倍アピール[仮データ: 定義未発見の生成スキル]' };
  if (def && def.appealVar) gen.appealVar = def.appealVar;   // v0.25.40: 倍率変動アピールの生成スキルも max×f で撃つ（札を作る経路は全部 appealVar を運ぶ）
  a.deck.push(gen);
  a.hand.push(a.deck.length - 1);
  SC.auditionLog(`✨ ライブスキル「${gen.name}」を生成！`, 'good');
};

SC.auditionLog = function (msg, cls, extra) {
  // extra: { attr, owner, cardName } など（スキル履歴アイコン用）
  const entry = { turn: SC.state.audition.turn, msg: msg, cls: cls || '' };
  if (extra) Object.assign(entry, extra);
  SC.state.audition.log.unshift(entry);
};

// v0.14: 重み付き抽選（attentionMult ベース）【wiki効果解説: 注目度が高いほど狙われやすい】
SC.weightedSampleUnits = function (units, count) {
  const remaining = units.slice();
  const selected = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    // attentionMult が未定義・null の場合デフォルト1.0（0 は意図的な0として扱う）
    // v0.25.43: 重みは実効の注目度乗率（SC.attentionMultOf＝基準 × 有効中の注目度UP/DOWN。期限切れは含まない）
    const getW = function (u) { return SC.attentionMultOf(u); };
    const totalW = remaining.reduce(function (s, u) { return s + getW(u); }, 0);
    // totalW=0の場合は均等抽選にフォールバック
    let chosen;
    if (totalW <= 0) {
      chosen = remaining[Math.floor(SC.rand() * remaining.length)];
    } else {
      const r = SC.rand() * totalW;
      let cum = 0;
      chosen = remaining[remaining.length - 1];
      for (let j = 0; j < remaining.length; j++) {
        cum += getW(remaining[j]);
        if (r < cum) { chosen = remaining[j]; break; }
      }
    }
    selected.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }
  return selected;
};
SC.aliveJudges = function () {
  return SC.state.audition.judges.filter(function (j) { return !j.gone; });
};
SC.aliveUnits = function () {
  return SC.state.audition.units.filter(function (u) { return !u.out; });
};

// ---- 手札（山札8枚から3枚。使用札は5ターンクールダウン） ----
// v0.21 wiki準拠: 初手3枚配布。2ターン目以降は使った1枚だけ補充（残り2枚は持ち越し）。
// 補充対象: cooldown中でない札からランダム。
SC.dealHand = function () {
  const a = SC.state.audition;
  const handSize = SC.CONFIG.audition.handSize;  // 3

  // 初回（hand が空）: 通常通り3枚配布
  if (!a.hand || a.hand.length === 0) {
    const avail = a.deck.map(function (_, i) { return i; })
      .filter(function (i) { return !(a.cooldown[i] > a.turn); });
    a.hand = SC.shuffle(avail).slice(0, handSize);
    a.selectedCard = null;
    a.selectedJudge = null;
    return;
  }

  // 2ターン目以降: 持ち越せる枚数 = cooldownが切れている手札のみ残す
  const kept = a.hand.filter(function (deckIdx) {
    return !(a.cooldown[deckIdx] > a.turn);
  });

  // 補充できる残り: 手札にない & cooldown中でない
  const handSet = new Set(kept);
  const pool = a.deck.map(function (_, i) { return i; })
    .filter(function (i) { return !handSet.has(i) && !(a.cooldown[i] > a.turn); });
  const need = handSize - kept.length;
  const draw = SC.shuffle(pool).slice(0, need);

  a.hand = kept.concat(draw);
  a.selectedCard = null;
  a.selectedJudge = null;
};

// ---- ターン開始時：ライバルの行動・判定を先に確定（wiki: 後出し調整可能） ----
SC.planRivals = function () {
  const a = SC.state.audition;
  const A = SC.CONFIG.audition;
  const def = a.def;
  const dist = (def.season === 'semi' || def.season === 'final')
    ? A.rivalJudgeFinals : A.rivalJudgeBySeason[def.season];

  a.units.forEach(function (u) {
    if (u.isPlayer || u.out) return;
    // 思い出アピール（ゲージMAXで必ず使用）
    if (u.mem >= u.memMax) {
      u.plan = { memory: true };
      u.judgement = SC.chance(A.rivalMemory.judgeGoodRate) ? 'memGood' : 'memBad';
      return;
    }
    // 判定分布（メンタル25%未満はBad寄りに[推測]）
    let p = dist[0], g = dist[1], n = dist[2];
    if (u.mental / u.mentalMax < 0.25) { g -= 0.1; }
    const r = SC.rand();
    u.judgement = r < p ? 'perfect' : (r < p + g ? 'good' : (r < p + g + n ? 'normal' : 'bad'));
    // 得意属性変動オデ（朝ごはん）
    if (def.favRandom) u.fav = SC.pick(SC.ATTRS);
    u.plan = { memory: false, target: SC.rivalTarget(u) };
  });
};

// ルーチンからターゲット審査員を決定
SC.rivalTarget = function (u) {
  const a = SC.state.audition;
  const byRank = function (rank) {   // 流行rank位(1..3)の審査員
    const attr = SC.state.trend[rank - 1];
    return a.judges.find(function (j) { return j.attr === attr; });
  };
  const r = u.routine;
  if (r.t === 'spear') {
    let j = byRank(r.rank);
    if (!j.gone) return j;
    j = byRank(r.next);
    if (!j.gone) return j;
    return SC.aliveJudges()[0] || null;
  }
  // 変遷: 対象退場時は「次ターンの行動を今行い、次ターンも同じ行動」（wiki: 231→331型）
  // 思い出アピールを挟んだターンは順番を消費しない（wiki）→ ユニット個別カウンタ(cyc)
  const seq = r.seq;
  const base = (u.cyc || 0) % seq.length;
  for (let k = 0; k < seq.length; k++) {
    const j = byRank(seq[(base + k) % seq.length]);
    if (j && !j.gone) return j;
  }
  return null;
};

// ---- アピール値計算 ----
// バフ補正 = 1 + Σ(ユニットに付与された該当属性バフ%)/100
SC.buffMod = function (unit, attr) {
  const a = SC.state.audition;
  let pct = 0;
  unit.debuffs.forEach(function (d) {
    // v0.10.1 NaN防御: _buffPct 未設定や文字列混入を防ぐ
    if (d.attr === attr && d.untilTurn >= a.turn && isFinite(d.pct)) pct += d.pct;
  });
  const result = Math.max(0, 1 + pct / 100);
  // buffMod が非有限（NaN/Infinity）の場合は 1.0 にフォールバック
  return isFinite(result) ? result : 1.0;
};

// v0.14: 興味倍率の総乗を返す（生存中のinterestsを総乗）【wiki効果解説】
SC.interestMult = function (judge) {
  const a = SC.state.audition;
  let mult = 1.0;
  (judge.interests || []).forEach(function (ef) {
    if (ef.until >= a.turn) mult *= ef.mult;
  });
  return mult;
};

// v0.25.7: 複合属性スキル（attrs配列）が指定属性を含むか（UI予測のExcellent表示用）
SC.skillHasAttr = function (card, attr) {
  // v0.25.15: Excellentアピール（'ex'）はどの審査員にも属性一致扱い【wiki仕様考察】
  if (card.attr === 'ex' || (card.attrs && card.attrs.indexOf('ex') >= 0)) return true;
  if (card.attrs && card.attrs.length > 0) return card.attrs.indexOf(attr) >= 0;
  return card.attr === attr;
};

// v0.25.8: 複合アピール=属性ごとに1発ずつ（ユーザー確認: Vo2倍&Da2倍をVo審査員に→Vo側のみExcellent）
// 単属性は1件の配列を返す。Excellent×2はplayerAppealValue内で属性一致時に掛かる
SC.appealHits = function (card, judgeAttr, coef, judgeObj) {
  const attrs = (card.attrs && card.attrs.length > 1) ? card.attrs : [card.attr];
  return attrs.map(function (a) {
    const one = Object.assign({}, card, { attr: a, attrs: null });
    return {
      attr: a,
      value: SC.playerAppealValue(one, judgeAttr, coef, judgeObj),
      excellent: a === (judgeObj ? judgeObj.attr : judgeAttr),
    };
  });
};

// v0.25.8: 複合対応の合計アピール値（UI予測・リンク追撃基準用）
SC.appealTotal = function (card, judgeAttr, coef, judgeObj) {
  return SC.appealHits(card, judgeAttr, coef, judgeObj).reduce(function (s, h) { return s + h.value; }, 0);
};

// ==== v0.25.40: 倍率変動アピール（「最大N倍アピール[…ほど効果UP]」「A~B倍アピール[…]」「[消去:◯◯]」）====
// 【wiki】情報/wiki/skill_effects.txt「スキル効果の詳細・考察」アピール系:
//   実倍率 = 最大 × 係数f（f は 0.2〜1.0 にクランプ。「所属ユニットが多いほど」だけ 0.25〜1.0）。最小は最大の1/5（所属ユニットは1/4）で、
//   「A~B倍」はB＝最大として同じ規則（Aは使わない）。駆動タグが無い・未対応の「最大N倍」は f=0.6 [仮データ]。
// 予測（appealPredict / extraAppealPredict / memoryPredict）と実行（execPlayerAction / applyExtraEffects）は必ず下の同じ関数・同じ状態で計算する。
SC.VAR_APPEAL_FALLBACK_F = 0.6;   // [仮データ] 駆動タグが見つからない「最大N倍」の係数（0.2〜1.0の中央値）
SC.VAR_APPEAL_MEM100 = 1000;      // 思い出ゲージ100%の内部値（SC.addMemoryGauge・ui.js memPct と同じ）

// 効果文の表記ゆれを正規化する（1関数に集約。parseExtraSegments が extra 文字列ごとに通すので、予測・実行・思い出の付随/LINK・パネル extra で共通）。
//   ① wikiリンク残骸「[[[注目度が低いほど効果UP]>スキル効果の解説#appeal_006]]」→「[注目度が低いほど効果UP]」（[ が3重）
//   ② 属性と最大が「 / 」で離れた「Vocal & Dance & Visual / 最大N倍アピール」→ 連結
//   ③ 思い出の付随/LINK効果はタグが「 / 」の後ろに離れている「Vocal&Dance&Visual最大0.5倍アピール / [メンタルが少ないほど効果UP]」→「…倍アピール[メンタルが少ないほど効果UP]」
//      （寄せるのは「効果UP」「消去:」を含むタグだけ。「/ [追加]全観客に…」のような次の効果の前置きは寄せない）
SC.normalizeVarAppealText = function (str) {
  let s = String(str === undefined || str === null ? '' : str);
  if (s.indexOf('倍アピール') < 0) return s;
  s = s.replace(/\[\[\[([^\[\]]*)\]>[^\[\]]*\]\]/g, '[$1]');
  s = s.replace(/(Vocal|Dance|Visual|Vo|Da|Vi)\s*\/\s*最大/g, '$1最大');
  s = s.replace(/((?:最大\s*[\d.]+|[\d.]+\s*[~〜]\s*[\d.]+)倍アピール)\s*\/\s*(\[[^\[\]]*(?:効果UP|消去[:：])[^\[\]]*\])/g, '$1$2');
  return s;
};

// 倍率変動アピール1件を探す正規表現（processSingle の追加アピールと SC.extraAppealPredict で共用。通常の「N倍アピール」も同じ式で拾う）
//   グループ: 1=全観客に 2=属性群 3=最大の値 4=[タグ…](最大) 5=Aの値 6=Bの値(=最大) 7=[タグ…](A~B) 8=通常の倍率
SC._extraApRegex = function (global) {
  return new RegExp('(全観客に)?' + SC._extraAttrGroup + '\\s*(?:最大\\s*([\\d.]+)倍アピール((?:\\[[^\\[\\]]*\\])*)|([\\d.]+)\\s*[~〜]\\s*([\\d.]+)倍アピール((?:\\[[^\\[\\]]*\\])*)|([\\d.]+)倍アピール)', global ? 'g' : '');
};
// 倍率変動（最大N倍／A~B倍）の追加アピールが「(Grow)」節（スキル成長の発動条件つきの追加効果。条件の成立判定は未実装）の後ろにあるか。
//   そうなら適用・予測しない（無条件に撃つと過大になる。該当は extra 内の3件「…(Grow)[…]全観客にDance最大3倍アピール」）。通常の「N倍アピール」は従来どおり（この判定の対象外）
SC._extraApAfterGrow = function (text, m) {
  if (m[8] !== undefined) return false;
  const g = String(text).indexOf('(Grow)');
  return g >= 0 && m.index > g;
};
// _extraApRegex のマッチ → { mult, erase, f, kind, fallback, tag }。通常の倍率は f=null。mult は NaN ガード済み
SC.extraApResolve = function (m, ctx) {
  if (m[8] !== undefined) {
    const v = parseFloat(m[8]);
    return { mult: isFinite(v) ? v : 0, erase: null, f: null, kind: null, fallback: false, tag: '' };
  }
  const isMax = m[3] !== undefined;
  const max = parseFloat(isMax ? m[3] : m[6]);
  const tag = (isMax ? m[4] : m[7]) || '';
  const r = SC.varAppealResolve(tag, ctx);
  return { mult: isFinite(max) ? max * r.f : 0, erase: r.erase, f: r.f, kind: r.kind, fallback: r.fallback, tag: tag, n: r.n };
};
// 本体（先頭の節）の倍率変動アピールのタグ文字列。無ければ ''（パネル effectRaw / ライブスキル effect から。loadout.js が appealVar.tag に載せる）
SC.varAppealMainTag = function (effectRaw) {
  const s = SC.normalizeVarAppealText(String(effectRaw || '').split('(Link)')[0]);
  const m = s.match(SC._extraApRegex(false));
  if (!m || m[8] !== undefined) return '';
  return (m[3] !== undefined ? m[4] : m[7]) || '';
};
// 札の appealVar からタグ文字列を取り出す。tag があればそれ、無ければ旧形式 ref（mentalLow/mentalHigh/memGauge）から。どれも無ければ ''（=f 0.6 [仮データ]）
SC.appealVarTag = function (av) {
  if (av && typeof av.tag === 'string' && av.tag) return av.tag;
  const ref = av && av.ref;
  return ref === 'mentalLow' ? 'メンタルが少ないほど効果UP' : ref === 'mentalHigh' ? 'メンタルが多いほど効果UP' : ref === 'memGauge' ? '思い出ゲージが多いほど効果UP' : '';
};

// タグ文字列 → { kind, erase }。kind: mentalHigh/mentalLow/attnHigh/attnLow/memHigh/memLow/turnLong/turnShort/healCount/avoid/history/units/erase。
//   erase（kind==='erase'のみ）= [{ attr:'vo'|'da'|'vi', dir:'UP'|'DOWN' }]。駆動タグが無ければ null
SC.varAppealTagKind = function (tagText) {
  // wikiリンク残骸・[ ] を落として、駆動タグの文言だけにする（「程」「ほど」・「少ない」「低い」の表記ゆれを吸収）
  const s = String(tagText || '').replace(/\]>[^\[\]]*\]*/g, ']').replace(/[\[\]]/g, ' ');
  const mE = s.match(/消去[:：]\s*((?:(?:Vocal|Dance|Visual|Vo|Da|Vi)(?:UP|DOWN)?\s*&?\s*)+)/);
  if (mE) {
    const AT = { Vocal: 'vo', Vo: 'vo', Dance: 'da', Da: 'da', Visual: 'vi', Vi: 'vi' };
    const toks = [];
    const re = /(Vocal|Dance|Visual|Vo|Da|Vi)(UP|DOWN)?/g;
    let t;
    while ((t = re.exec(mE[1])) !== null) toks.push({ attr: AT[t[1]], dir: t[2] || null });
    let def = 'UP';   // 「Da & ViUP」のように末尾にだけ UP/DOWN がある表記は全属性に係る
    for (let i = toks.length - 1; i >= 0; i--) { if (toks[i].dir) { def = toks[i].dir; break; } }
    return { kind: 'erase', erase: toks.map(function (x) { return { attr: x.attr, dir: x.dir || def }; }) };
  }
  const T = '(?:ほど|程)';
  const tests = [
    ['mentalHigh', new RegExp('(?:メンタル|Me)が?(?:多い|高い)' + T)], ['mentalLow', new RegExp('(?:メンタル|Me)が?(?:少ない|低い)' + T)],
    ['attnHigh', new RegExp('注目度が?高い' + T)], ['attnLow', new RegExp('注目度が?低い' + T)],
    ['memHigh', new RegExp('思い出ゲージが?(?:多い|高い)' + T)], ['memLow', new RegExp('思い出ゲージが?(?:少ない|低い)' + T)],
    ['turnLong', new RegExp('経過ターンが?長い' + T)], ['turnShort', new RegExp('経過ターンが?短い' + T)],
    ['healCount', /回復回数増加/], ['avoid', new RegExp('回避率が?高い' + T)],
    ['history', new RegExp('スキル履歴が?多い' + T)], ['units', new RegExp('所属ユニットが?多い' + T)]
  ];
  for (let i = 0; i < tests.length; i++) if (tests[i][1].test(s)) return { kind: tests[i][0], erase: null };
  return null;
};

// 係数 f を現在のオーディション状態から出す。ctx: { memory:true }=思い出アピール自身の付随/LINK効果（思い出ゲージ100%として計算【wiki】）／
//   { histLen:n }=スキル履歴の件数を現在値でなく n に固定（使用中の札自身が履歴に載る前の値で、予測と実行をそろえる）。
//   戻り値 { f, kind, erase, n, fallback }。fallback=true は駆動タグ無し／未対応で f=0.6 [仮データ]。n=消去の個数（erase のみ）
SC.varAppealResolve = function (tagText, ctx) {
  ctx = ctx || {};
  const info = SC.varAppealTagKind(tagText);
  const FB = SC.VAR_APPEAL_FALLBACK_F;
  const a = SC.state && SC.state.audition;
  const pl = a && a.units && a.units[0];
  if (!info) return { f: FB, kind: null, erase: null, n: 0, fallback: true };
  const clamp = function (x, lo) { return isFinite(x) ? Math.round(Math.max(lo, Math.min(1, x)) * 1e9) / 1e9 : FB; };   // 浮動小数の揺れ（0.6000000000000002 等）を 1e-9 で丸める
  if (!pl) return { f: FB, kind: info.kind, erase: info.erase, n: 0, fallback: true };
  const r = (pl.mentalMax > 0 && isFinite(pl.mental)) ? Math.max(0, Math.min(1, pl.mental / pl.mentalMax)) : 1;   // 現在メンタル / 最大メンタル
  const u = SC.attentionMultOf(pl) - 1;                                                                           // 注目度UP量（実効の乗率−1。100%UP=1。v0.25.43: 有効中の注目度UP/DOWNだけで計算）
  const g = ctx.memory ? 1 : Math.max(0, Math.min(1, (pl.mem || 0) / SC.VAR_APPEAL_MEM100));                      // 思い出ゲージ（思い出自身の付随/LINKは100%）
  const turn = isFinite(a.turn) ? a.turn : 1;
  let f, n = 0;
  switch (info.kind) {
    case 'mentalHigh': f = clamp(1.6 * r - 0.6, 0.2); break;
    case 'mentalLow': f = clamp(1 - 0.8 * r, 0.2); break;
    case 'attnHigh': f = clamp(0.4 * u + 0.2, 0.2); break;
    case 'attnLow': f = clamp(-0.8 * u + 0.6, 0.2); break;
    case 'memHigh': f = clamp(0.8 * g + 0.2, 0.2); break;
    case 'memLow': f = clamp(1 - 0.8 * g, 0.2); break;
    case 'turnLong': f = clamp(0.8 * (turn - 1) / 9 + 0.2, 0.2); break;
    case 'turnShort': f = clamp(1 - 0.8 * (turn - 1) / 9, 0.2); break;
    case 'healCount': f = clamp(0.2 * (1 + (a.healCount || 0)), 0.2); break;
    case 'avoid': f = clamp(0.2 + 0.8 * Math.min(1, SC.sumStatusPct('avoid') / 100), 0.2); break;
    case 'history': {
      const hl = isFinite(ctx.histLen) ? ctx.histLen : (a.history || []).length;
      f = clamp(0.2 * Math.max(1, Math.min(5, hl)), 0.2);   // 0〜1人=0.2・5人=1.0
      break;
    }
    case 'units': f = clamp(0.25 * SC.countLoadoutUnitKinds(), 0.25); break;   // ライブ参加者（P＋サポ1〜4・ゲスト除く）の所属ユニット種類数
    case 'erase': n = SC.varEraseCount(info.erase); f = clamp(0.2 * n + 0.2, 0.2); break;
    default: return { f: FB, kind: info.kind, erase: info.erase, n: 0, fallback: true };
  }
  return { f: f, kind: info.kind, erase: info.erase, n: n, fallback: false };
};
SC.varAppealFactor = function (tagText, ctx) { return SC.varAppealResolve(tagText, ctx).f; };

// ---- [消去:◯◯]: 対象のステータス効果（ライブスキル／審査員リアクションで付いたバフ・デバフ）の数え方と消去 ----
// 【wiki】パッシブスキル由来のバフ（画面左下）は数えない・消去もしない → player.debuffs の src:'passive' 印のものは除外（firePassives・シミュの手動/保有パッシブが付ける）。
//   UP は pct>0・DOWN は pct<0 の該当属性。個数は付与されている（期限内の）効果の件数
SC._varEraseMatch = function (b, erase) {
  return b.src !== 'passive' && isFinite(b.pct) && erase.some(function (e) { return e.attr === b.attr && (e.dir === 'DOWN' ? b.pct < 0 : b.pct > 0); });
};
SC.varEraseCount = function (erase) {
  const a = SC.state && SC.state.audition;
  if (!a || !erase) return 0;
  return a.units[0].debuffs.filter(function (b) { return b.untilTurn >= a.turn && SC._varEraseMatch(b, erase); }).length;
};
SC._varFilterErased = function (debuffs, erase) {
  return debuffs.filter(function (b) { return !SC._varEraseMatch(b, erase); });
};
// アピール後に該当ステータス効果を全て消去（残りターンにかかわらず・5個以上でも全部）。消した件数を返す
SC.varEraseStatuses = function (erase) {
  const a = SC.state && SC.state.audition;
  if (!a || !erase) return 0;
  const pl = a.units[0];
  const before = pl.debuffs.length;
  pl.debuffs = SC._varFilterErased(pl.debuffs, erase);
  return before - pl.debuffs.length;
};
SC._varEraseLabel = function (erase) {
  return (erase || []).map(function (e) { return (SC.ATTR_LABEL[e.attr] || e.attr) + e.dir; }).join('・');
};
// erase 後の状態で fn を評価（予測用。applyExtraEffects が本体アピールの後に消去してから追加アピールを撃つ順序を、状態を戻せる形で再現する）
SC._withVarErase = function (erase, fn) {
  const a = SC.state && SC.state.audition;
  if (!erase || !a) return fn();
  const pl = a.units[0], keep = pl.debuffs;
  pl.debuffs = SC._varFilterErased(keep, erase);
  try { return fn(); } finally { pl.debuffs = keep; }
};

// 札（本体が倍率変動アピール＝card.appealVar）の実効倍率を解決して返す。実行（execPlayerAction）と予測（appealPredict）で共用。
//   戻り値 { card: 倍率を max×f に差し替えた札のコピー, erase, f, kind, fallback, n }。appealVar 無しの札はそのまま（f=null）
SC.varCardResolve = function (card, ctx) {
  if (!card || !card.appealVar) return { card: card, erase: null, f: null, kind: null, fallback: false, n: 0 };
  const av = card.appealVar;
  const max = isFinite(av.max) ? av.max : (isFinite(card.mult) ? card.mult : 1);
  const r = SC.varAppealResolve(SC.appealVarTag(av), ctx);
  return { card: Object.assign({}, card, { mult: max * r.f }), erase: r.erase, f: r.f, kind: r.kind, fallback: r.fallback, n: r.n };
};

// v0.25.18: UI予測用（ユーザー指定: 予測値はPLUS/LINKの追加効果分も含める）
// = 基本アピール + extra内の追加アピールのうち現時点で条件成立している分（対象審査員に当たる分）
SC.appealPredict = function (card, judgeAttr, coef, judgeObj) {
  // v0.25.36: 「[PERFECTならN倍アピール]」の札は Perfect 係数（1.5）の予測で倍率を差し替え（execPlayerAction と同じ）
  if (card && card.perfectMult && coef >= 1.5) card = Object.assign({}, card, { mult: card.perfectMult });
  // v0.25.40: 倍率変動アピールの本体は max×f に解決（execPlayerAction と同じ SC.varCardResolve）。本体に [消去] があれば、追加アピールは消去後の状態で予測する
  const vr = SC.varCardResolve(card);
  card = vr.card;
  const condOk = SC.extraCondSnapshot(card);   // v0.25.44: 条件節は使用前（本体の [消去] より前）の状態で評価（実行 execPlayerAction と同じ時点）
  return SC.appealTotal(card, judgeAttr, coef, judgeObj) + SC._withVarErase(vr.erase, function () {
    return SC.extraAppealPredict(card, judgeAttr, coef, judgeObj, SC.cardLinkOk(card), undefined, condOk);   // v0.25.37: LINK判定は実カードの(Link)節も対象（SC.cardLinkOk）。追加アピール分は下の関数に分離（思い出アピールの予測と共用）
  });
};

// v0.25.37: extra 内の追加アピール分だけの予測（appealPredict から分離。思い出アピールの付随効果・LINK効果の予測 SC.memoryPredict も同じ関数を使う）。
//   条件節 [〜場合] が現時点で成立している分＋(Link)節（linkOk のとき）の「N倍アピール」を、applyExtraEffects の追加アピールと同じ式（playerAppealValue）で合算する
//   v0.25.40: 「最大N倍アピール[tag]」「A~B倍アピール[tag]」も同じ経路で 倍率=最大×f（SC.extraApResolve）。[消去] 付きの追加アピールは、後続の追加アピールを消去後の状態で予測する
//   （vctx/card.varCtx は SC.varAppealResolve の ctx。card.varCtx.memory=思い出アピールの付随/LINK）
SC.extraAppealPredict = function (card, judgeAttr, coef, judgeObj, linkOk, vctx, condOk) {
  let total = 0;
  if (!card || !card.extra || !Array.isArray(card.extra) || !SC.parseExtraSegments) return total;
  const ctx = Object.assign({}, card.varCtx || {}, vctx || {});
  const condMap = condOk || SC.extraCondSnapshot(card);   // v0.25.44: 条件節は使用前の状態で評価（applyExtraEffects と同じ）
  const apRe = SC._extraApRegex(true);
  const a = SC.state && SC.state.audition;
  const pl = a && a.units && a.units[0], keepDeb = pl ? pl.debuffs : null;
  try {
    SC.parseExtraSegments(card).forEach(function (seg) {
      if (seg.viaLink && !linkOk) return;
      if (seg.cond && !condMap[seg.cond]) return;
      let m;
      apRe.lastIndex = 0;
      while ((m = apRe.exec(seg.text)) !== null) {
        if (SC._extraApAfterGrow(seg.text, m)) continue;   // (Grow)節の倍率変動アピールは対象外（applyExtraEffects と同じ）
        const rv = SC.extraApResolve(m, ctx);
        SC._extraToAttrs(m[2]).forEach(function (exAttr) {
          total += SC.playerAppealValue({ name: card.name, attr: exAttr, mult: rv.mult, owner: card.owner }, judgeAttr, coef, judgeObj);
        });
        if (rv.erase && pl) pl.debuffs = SC._varFilterErased(pl.debuffs, rv.erase);   // 消去は「そのアピールの後」（実行側 processSingle と同じ順序）
      }
    });
  } finally { if (pl) pl.debuffs = keepDeb; }
  return total;
};

// プレイヤー（自ユニット）の通常アピール値。乱数なし（wiki）
// v0.14: judgeObj を追加（興味倍率接続。なければ judgeAttr だけで動く後方互換）
SC.playerAppealValue = function (card, judgeAttr, coef, judgeObj) {
  const st = SC.state;
  const W = SC.elapsedWeeks();
  // v0.10.1 NaN防御: card.attr が undefined/null の場合 stats[undefined]=NaN になる
  // v0.25.8: 複合属性はここでは扱わない（appealHitsが属性ごとに1発ずつ呼ぶ＝ユーザー確認仕様）
  const attr = card.attr;
  // judgeObj が渡された場合はその attr を優先（後方互換のため judgeAttr をフォールバック）
  const resolvedJudgeAttr = judgeObj ? judgeObj.attr : judgeAttr;
  // v0.25.15: Excellentアピール（attr='ex'）=審査員の属性ステを参照し常に属性一致扱い
  //   【wiki仕様考察: Vo審査員にExcellent3倍=Vo3倍と同等】。従来はstats['ex']=0でほぼ無威力だった（ユーザー指摘）
  const isExSkill = attr === 'ex';
  const refAttr = isExSkill ? resolvedJudgeAttr : attr;
  const P = refAttr ? (st.stats[refAttr] || 0) : 0;
  const S = SC.SUPPORTS.reduce(function (s, sup) {
    const sv = (sup && sup.stats && refAttr) ? (sup.stats[refAttr] || 0) : 0;
    return s + sv;
  }, 0);
  const wMod = 0.2 * (1 + 0.1 * W);
  const buff = SC.buffMod(st.audition.units[0], refAttr);
  let base;
  if (card.owner === 'p') {
    base = 2 * P + S * wMod;
  } else {
    const ownerSup = SC.SUPPORTS[card.owner];
    const ownerStat = (ownerSup && ownerSup.stats && refAttr) ? (ownerSup.stats[refAttr] || 0) : 0;
    base = 0.5 * P + (S + 3 * ownerStat) * wMod;
  }
  const mult = isFinite(card.mult) ? card.mult : 1.0; // mult が NaN/未設定の場合 1.0 扱い
  // v0.25.34: 端数処理をユーザー提供のExcel計算機（情報/WING計算機.xlsx）の順序に一致させる:
  //   p_a = INT( INT(base) × 判定係数 × バフ補正 ) ／ 値 = INT( (属性一致なら2・不一致1) × 倍率 × p_a )
  //   （旧: INT(base×バフ×倍率×判定) → INT(×2)。倍率を掛ける前に p_a を切り捨てる点が違う）
  const pa = SC.floorE(SC.floorE(base) * coef * buff);
  const matchMult = (isExSkill || attr === resolvedJudgeAttr) ? SC.CONFIG.audition.judge.excellent : 1;
  let v = SC.floorE(matchMult * mult * pa);
  // v0.14: 興味補正を乗算（judgeObj がある場合のみ）【wiki効果解説】。従来どおり最後に INT(値×倍率)
  if (judgeObj) {
    const iMult = SC.interestMult(judgeObj);
    if (iMult !== 1.0) v = SC.floorE(v * iMult);
  }
  return Math.max(0, isFinite(v) ? v : 0);
};

// v0.25.34: 切り捨て（Excel の INT 相当）。2692×1.5 のような浮動小数の誤差（x.9999999…）で1ずれないよう微小値を足す
SC.floorE = function (x) { return Math.floor(x + 1e-9); };

// 思い出アピール（本体）: 全審査員へVo&Da&Vi複合。
// v0.25.34: Excel計算機に一致 — 各属性 mem_a = INT( p_a × 思い出Lv係数 )（p_a = INT(INT(2P+S×0.2(1+0.1W)) × 判定係数 × バフ補正) = P札と同じ式）
//   審査員Jへの値 = 2×mem_J + 他2属性の mem の合計
SC.playerMemoryValue = function (judge, coef) {
  const st = SC.state;
  const W = SC.elapsedWeeks();
  const wMod = 0.2 * (1 + 0.1 * W);
  const mMult = SC.CONFIG.audition.memoryMult[SC.memoryLv()];
  let total = 0;
  SC.ATTRS.forEach(function (attr) {
    const P = st.stats[attr];
    const S = SC.SUPPORTS.reduce(function (s, sup) { return s + sup.stats[attr]; }, 0);
    const buff = SC.buffMod(st.audition.units[0], attr);
    const pa = SC.floorE(SC.floorE(2 * P + S * wMod) * coef * buff);
    const v = SC.floorE(pa * mMult);
    total += (attr === judge.attr) ? v * 2 : v;
  });
  return Math.max(0, total);
};

// v0.25.37: Pアイドルの思い出アピール（現在の実効Lv）の「付随効果」と「LINK効果」を、applyExtraEffects に渡せる擬似札にする。
//   データ: Pカードの memoryAppeal.levels[Lv]（SC.memoryAppealLevel）の effectParsed.extra（付随効果。例「Vocal10%UP[6ターン]」）と
//   linkEffect（リンクアピール。例「Vocal&Visual25%UP[5ターン]」「全観客にVisual1倍アピール」）。
//   擬似札の extra = [付随効果, '(Link)'+LINK効果]（記載順＝付随→LINK）。効果文の解釈は applyExtraEffects/parseExtraSegments に任せる（再実装しない）。
//   実カードのPでない（仮データのP）・思い出Lv0・付随もLINKも無いときは null
SC.memoryExtraCard = function () {
  const lv = SC.memoryLv();
  const pc = (SC.IDOL && SC.IDOL._cardId) ? SC.findCard(SC.IDOL._cardId) : null;
  const ent = (pc && lv >= 1) ? SC.memoryAppealLevel(pc, lv) : null;
  if (!ent) return null;
  const ex = (ent.effectParsed && ent.effectParsed.extra) ? String(ent.effectParsed.extra).trim() : '';
  const lk = String(ent.linkEffect || '').trim();
  const extra = [];
  if (ex) extra.push(ex);
  if (lk) extra.push('(Link)' + lk);
  if (extra.length === 0) return null;
  // v0.25.40: varCtx.memory=true → 倍率変動アピール（付随/LINK効果の「最大N倍アピール[tag]」）の思い出ゲージ係数を100%として計算する【wiki】。
  //   効果文は SC.parseExtraSegments が SC.normalizeVarAppealText で正規化する（「最大0.5倍アピール / [メンタルが少ないほど効果UP]」の離れたタグ等）
  return { name: ent.name || '思い出アピール', owner: 'p', extra: extra, varCtx: { memory: true } };
};
// v0.25.37: 思い出アピールの予測値（UI・シミュ用）= 本体 SC.playerMemoryValue ＋ 付随効果/LINK効果の追加アピール分（SC.extraAppealPredict。
//   LINK効果は現時点で LINK 成立のときだけ）。SC.playerMemoryValue 自体は実行側（execPlayerAction）も使うので変えない。式は再実装しない
SC.memoryPredict = function (judge, coef) {
  const base = SC.playerMemoryValue(judge, coef);
  const mc = SC.memoryExtraCard();
  if (!mc) return base;
  return base + SC.extraAppealPredict(mc, judge.attr, coef, judge, SC.cardLinkOk(mc));
};

// ライバル: 基礎攻撃力×判定係数×得意Excellent×謎バフ（wiki/一部推測）
SC.rivalAppealValue = function (u, judge, coefKey) {
  const a = SC.state.audition;
  const A = SC.CONFIG.audition;
  const coef = { perfect: 1.5, good: 1.1, normal: 1.0, bad: 0.5 }[coefKey];
  let v = a.def.atk[a.mode] * coef;
  if (u.fav && u.fav === judge.attr) v *= A.judge.excellent;
  if (a.turn >= A.rivalMysteryBuff.fromTurn && SC.chance(A.rivalMysteryBuff.rate)) {
    v *= A.rivalMysteryBuff.mult;
  }
  return Math.round(v);
};

// ---- アピール適用（余剰切捨て・ボーナス★・満足判定） ----
// v0.19: 蓄積式に変更。judge.gained（蓄積量）が judge.need（必要アピール）に達したら満足
SC.applyAppeal = function (unit, judge, rawValue, label) {
  const a = SC.state.audition;
  if (judge.gone) return 0;
  // v0.10.1 NaN防御: rawValue が非有限（NaN/Infinity）なら 0 に置換してログ警告
  if (!isFinite(rawValue)) {
    SC.auditionLog(`⚠ アピール値計算異常（${label || '不明'}）: rawValue=${rawValue} → 0に補正`, 'bad');
    rawValue = 0;
  }
  // 余剰切捨て: 残り必要量を超えない分だけ有効（wiki: 余剰アピール切捨て）
  const remaining = judge.need - judge.gained;
  const applied = Math.min(rawValue, remaining);
  judge.gained += applied;
  judge.dealt[unit.key] = (judge.dealt[unit.key] || 0) + applied;
  judge.lastHitBy = unit.key;
  a.totalDealt[unit.key] += applied;
  SC.auditionLog(`${unit.name} → ${judge.name}：${SC.fmt(rawValue)}${applied < rawValue ? `（有効 ${SC.fmt(applied)}）` : ''} ${label || ''}`,
    unit.isPlayer ? 'player' : 'rival');
  // FX: ダメージ数字フロート（審査員カード上）
  SC.fxPush({ type: 'float', target: 'judge:' + a.judges.indexOf(judge), text: '+' + SC.fmt(applied),
    cls: unit.isPlayer ? 'appeal' : 'rival', duration: unit.isPlayer ? 550 : 350, parallel: !unit.isPlayer });

  // アピールボーナス（30/60/90%到達で即時★。脱落者は獲得不可）
  if (!unit.out) {
    const th = SC.CONFIG.audition.bonusThresholds;
    const ratio = judge.dealt[unit.key] / judge.need;
    let step = judge.bonusStep[unit.key] || 0;
    let bonusSum = 0;   // FX用: 同時到達分は1バナーに集約（全体札1発で9連発になるのを防止）
    while (step < th.length && ratio >= th[step]) {
      const starN = a.stars.bonus[SC.trendRank(judge.attr)];
      unit.stars += starN;
      bonusSum += starN;
      SC.auditionLog(`★アピールボーナス（${Math.round(th[step] * 100)}%）: ${unit.name} +★${starN}`, unit.isPlayer ? 'good' : 'bad');
      step++;
    }
    judge.bonusStep[unit.key] = step;
    if (unit.isPlayer && bonusSum > 0) {
      // 1080p実測: 「Bonus!! ★×N」帯（青ピンク）
      SC.fxPush({ type: 'starband', text: 'Bonus!!', stars: bonusSum, cls: 'bonus', duration: 650 });
    }
  }

  if (judge.gained >= judge.need) SC.judgeSatisfied(judge);
  return applied;
};

// 審査員満足 → TA/LA付与・退場
SC.judgeSatisfied = function (judge) {
  const a = SC.state.audition;
  judge.gone = true;
  a.goneThisTurn.push({ attr: judge.attr, by: judge.lastHitBy });
  const rank = SC.trendRank(judge.attr);

  // TA: 最多興味（脱落者は繰り下げ）
  const ranked = a.units.slice().sort(function (x, y) {
    return (judge.dealt[y.key] || 0) - (judge.dealt[x.key] || 0);
  });
  const taUnit = ranked.find(function (u) { return !u.out && (judge.dealt[u.key] || 0) > 0; });
  // LA: トドメ
  const laUnit = a.units.find(function (u) { return u.key === judge.lastHitBy && !u.out; });

  const taStar = a.stars.ta[rank], laStar = a.stars.la[rank];
  if (taUnit) { taUnit.stars += taStar; judge.taTo = taUnit.key; }
  if (laUnit) { laUnit.stars += laStar; judge.laTo = laUnit.key; }
  SC.auditionLog(`🎉 ${judge.name}が満足して退場！ TA★${taStar}→${taUnit ? taUnit.name : 'なし'} ／ LA★${laStar}→${laUnit ? laUnit.name : 'なし'}`, 'sys');
  // FX（1080p実測）: 黄色い爆発（審査員位置）→帰宅スライドアウト→「Top Appeal! ★×N」オレンジ帯→「Last Appeal! ★×N」白青帯
  SC.fxPush({ type: 'burst', target: 'judge:' + a.judges.indexOf(judge), duration: 450 });
  // v0.25.2: 満足した審査員が帰宅（旧DOMのカードにスライドアウトclass付与。keep=剥がさず次renderの退場カードへ直結）
  SC.fxPush({ type: 'elclass', target: 'judge:' + a.judges.indexOf(judge), cls: 'judge-leaving', duration: 600, keep: true });
  if (taUnit) {
    SC.fxPush({ type: 'starband', text: 'Top Appeal!<span class="fx-starband-who">' + taUnit.name + '</span>',
      stars: taStar, cls: 'ta', duration: taUnit.isPlayer ? 800 : 550 });
  }
  if (laUnit) {
    SC.fxPush({ type: 'starband', text: 'Last Appeal!<span class="fx-starband-who">' + laUnit.name + '</span>',
      stars: laStar, cls: 'la', duration: laUnit.isPlayer ? 800 : 550 });
  }
};

// ---- 行動順構築ヘルパー（resolveTurn / turnOrderPreview 共用） ----
// playerJudgement: プレイヤーの判定文字列（'normal'等）
SC.buildActors = function (playerJudgement) {
  const a = SC.state.audition;
  const prio = function (j) {
    return { perfect: 5, memGood: 5, good: 4, judge: 3, normal: 2, bad: 1, memBad: 1 }[j];
  };
  const actors = [];
  a.units.forEach(function (u, i) {
    if (u.out) return;
    const isP = u.isPlayer;
    const j = isP ? playerJudgement : u.judgement;
    actors.push({ kind: 'unit', unit: u, prio: prio(j), sub: isP ? 100 : i });
  });
  const judgePrio = a.def.special === 'no1' ? 4.5 : 3;
  a.judges.forEach(function (j) {
    if (j.gone) return;
    actors.push({ kind: 'judge', judge: j, prio: judgePrio, sub: SC.ATTRS.indexOf(j.attr) });
  });
  actors.sort(function (x, y) { return (y.prio - x.prio) || (y.sub - x.sub); });
  return actors;
};

// ---- 行動順プレビュー（UIヒント用。ターン状態を変更しない） ----
// 戻り値: { units: {key: 順位番号}, judges: {attr: 順位番号} }（1始まり）
SC.turnOrderPreview = function () {
  // プレイヤーの判定は 'normal' 仮定[簡略化表示]
  const actors = SC.buildActors('normal');
  const result = { units: {}, judges: {} };
  let rank = 1;
  actors.forEach(function (act) {
    if (act.kind === 'unit') {
      result.units[act.unit.key] = rank++;
    } else {
      result.judges[act.judge.attr] = rank++;
    }
  });
  return result;
};

// ---- ターン実行（プレイヤーの行動確定後に呼ぶ） ----
// playerAction: { type:'appeal', cardPos, judgeIdx, judgement } |
//               { type:'memory', judgement:'memGood'|'memBad' } | { type:'heal', cardPos }
SC.resolveTurn = function (playerAction) {
  const a = SC.state.audition;
  const A = SC.CONFIG.audition;
  const player = a.units[0];
  // v0.25.42: 終了済みのオーディションには何もしない（防御的ガード。連打の調査で二重解決は起きていないと確認済み＝根因ではない）。
  //   従来は先頭にガードが無く、ターン先頭の a.goneThisTurn / player.judgement を書き換えてからループ内の a.finished で抜けていた
  if (a.finished) return;
  a.effectPop = null;    // v0.25.43: ステータス効果／審査員の状態の詳細モーダルはターン進行で閉じる（a.showPassivePop と同じ扱い。表示側も a.effectPop.turn が現在ターンの時だけ出す）
  SC.fxBegin();          // v0.25 P1: このターンの演出イベント記録を開始
  a.goneThisTurn = [];   // パーフェクトライブ判定用にターン毎リセット
  // v0.10.1: heal もメーター経由になり judgement が渡ってくる。なければ 'normal' フォールバック
  player.judgement = playerAction.judgement || 'normal';

  // --- 行動順の構築（buildActorsヘルパーを使用） ---
  const actors = SC.buildActors(player.judgement);

  // order: 'first'/'last' フラグ対応（今ターン使用カードに order がある場合）
  if (playerAction.type === 'appeal' || playerAction.type === 'heal') {
    const usedCard = a.deck[a.hand[playerAction.cardPos]];
    if (usedCard && usedCard.order === 'first') {
      const pidx = actors.findIndex(function (act) { return act.kind === 'unit' && act.unit.isPlayer; });
      if (pidx > 0) { actors.unshift(actors.splice(pidx, 1)[0]); }
    } else if (usedCard && usedCard.order === 'last') {
      const pidx2 = actors.findIndex(function (act) { return act.kind === 'unit' && act.unit.isPlayer; });
      if (pidx2 >= 0 && pidx2 < actors.length - 1) { actors.push(actors.splice(pidx2, 1)[0]); }
    }
  }

  // --- 順に解決 ---
  for (let i = 0; i < actors.length; i++) {
    const act = actors[i];
    if (a.finished) return;

    if (act.kind === 'judge') {
      if (!act.judge.gone) SC.judgeReaction(act.judge);
      // v0.25.27: 審査員の口撃でプレイヤーが脱落した場合もここで終了判定しないと、
      //   a.finished が立たないままターン終了フェイズ（次ターンの手札/パッシブ発動）まで進んでしまうバグ
      //   （ユーザーFB「審査終了するタイミングなのに次ターン用のパッシブ演出が入る」の根因）
      if (SC.checkBattleEnd()) return;
      continue;
    }
    const u = act.unit;
    if (u.out) continue;

    if (u.isPlayer) {
      SC.execPlayerAction(playerAction);
    } else {
      SC.execRivalAction(u);
    }
    if (SC.checkBattleEnd()) return;
  }

  // --- エンドフェイズ：思い出ゲージ増加（ターン終了時メンタル割合） ---
  a.units.forEach(function (u) {
    if (u.out || u.mem >= u.memMax) return;
    const ratio = u.mental / u.mentalMax;
    let gain = 100;
    const t = A.memoryGain;
    if (ratio >= 1) gain = t[0].gain;
    else if (ratio > 0.75) gain = t[1].gain;
    else if (ratio > 0.50) gain = t[2].gain;
    else if (ratio > 0.25) gain = t[3].gain;
    else if (ratio >= 0.05) gain = t[4].gain;
    else gain = t[5].gain;
    u.mem = Math.min(u.memMax, u.mem + gain);
  });

  a.turn++;
  SC.dealHand();
  SC.planRivals();
  SC.firePassives();
  a.phase = 'select';
};

SC.execPlayerAction = function (pa) {
  const a = SC.state.audition;
  const A = SC.CONFIG.audition;
  const player = a.units[0];
  const coefTable = { perfect: 1.5, good: 1.1, normal: 1.0, bad: 0.5 };
  // v0.25.40: 倍率変動アピールの [スキル履歴が多いほど] は「使用前の履歴の件数」で数える（履歴への追記 pushHistory より前の値。予測＝この時点の状態と一致させる）。
  //   本体の係数と extra 内の追加アピール（applyExtraEffects）の両方に同じ値を渡す
  const vctx = { histLen: a.history.length };

  // v0.25.36: pa.type==='heal' は「回復札」と「効果札（非アピールのライブスキル＝card.effectOnly。SC.isEffectOnlyCard）」共通の経路
  //   （アクション型名は互換のため 'heal' のまま）。審査員選択なし・アピール値なし。
  //   回復量(card.heal)>0 なら回復して a.healCount+1（回復札のときだけ数える）→ 思い出ゲージUP(card.memGaugePct)があれば加算 →
  //   効果文(card.extra)を SC.applyExtraEffects で適用（対象審査員なし＝追加アピールがあれば全生存審査員へ [推測]）
  if (pa.type === 'heal') {
    const card = a.deck[a.hand[pa.cardPos]];
    if (!card) return;
    const healRate = Number(card.heal) > 0 ? Number(card.heal) : 0;
    const linkOk = SC.cardLinkOk(card);   // アピール札の経路と同じ判定（履歴の追記より前に評価する）。v0.25.37: 実カードの(Link)節も対象
    const condOk = SC.extraCondSnapshot(card);   // v0.25.44: 条件節 [〜場合] も履歴の追記・回復より前に評価（予測と同じ時点）
    a.cooldown[a.hand[pa.cardPos]] = a.turn + A.skillCooldown;
    // v0.10.1: 判定をログに表示（回復量は判定に依存しない[実測]、行動順は judgement で決まる）
    const jLabel = { perfect: 'Perfect', good: 'Good', normal: 'Normal', bad: 'Bad' }[pa.judgement] || 'Normal';
    if (healRate > 0) {
      a.healCount = (a.healCount || 0) + 1;   // v0.25.13: 「回復回数N回以上」条件用
      const heal = Math.ceil(player.mentalMax * healRate);
      player.mental = Math.min(player.mentalMax, player.mental + heal);
      SC.auditionLog(`${player.name}：${card.name}（${jLabel}）+${heal}回復（→ ${player.mental}/${player.mentalMax}）`, 'player');
    } else {
      SC.auditionLog(`${player.name}：${card.name}（${jLabel}）`, 'player');
    }
    if (card.memGaugePct > 0) {
      SC.addMemoryGauge(card.memGaugePct);
      SC.auditionLog(`${player.name}：思い出ゲージ+${card.memGaugePct}%（${card.name}）`, 'good');
    }
    // v0.20b: スキル履歴に追記（回復札は従来どおり attr:'heal'。回復の無い効果札は attr:null [推測]）
    if (!a.skillHistory) a.skillHistory = [];
    a.skillHistory.unshift({ attr: healRate > 0 ? 'heal' : null, owner: card.owner, cardName: card.name, turn: a.turn });
    if (a.skillHistory.length > 5) a.skillHistory.length = 5;
    // 効果札はアピール札と同じく LINK・「履歴に◯◯がある」条件用の履歴(a.history)にも載る（旧来の回復札は従来どおり載せない）
    if (card.effectOnly) SC.pushHistory(card.owner, null);
    SC.applyExtraEffects(card, pa, coefTable[pa.judgement] || 1.0, null, linkOk, vctx, condOk);
    return;
  }
  if (pa.type === 'memory') {
    const coef = pa.judgement === 'memGood' ? 1.5 : 0.5;
    // チャージアピール: ゲージ200%で思い出に追加アピール（wiki/倍率は[推測]）
    const charged = SC.IDOL.chargeAppeal && player.mem >= player.memMax && player.memMax >= 2000;
    // v0.25.37: 思い出アピールの付随効果・LINK効果（Pカードの memoryAppeal）。LINK成立は履歴の追記（下の pushHistory）より前に評価する
    const memExtra = SC.memoryExtraCard();
    const memLinkOk = memExtra ? SC.cardLinkOk(memExtra) : false;
    const memCondOk = memExtra ? SC.extraCondSnapshot(memExtra) : null;   // v0.25.44: 付随効果の条件節も履歴の追記より前に評価
    player.mem = 0;
    SC.pushHistory('p', null);   // 思い出も履歴に載る（wiki）。複合属性のためattrはnull
    SC.auditionLog(`✨ 思い出アピール（${pa.judgement === 'memGood' ? 'Good' : 'Bad'}）！`, 'good');
    // FX(v0.25.3): 思い出カットイン実機寄せ＝暗転全画面+「Appeal Start!」大型斜体+放射光線→白フラッシュ（動画実測）
    // v0.25.24: リール目押し→アピールスタート→アピール計算の順に修正（ユーザーFB。v0.25.22で
    //   白バーストをmemcutより前に置いたためAppeal Start!!バナーの表示が遅れて見えた）
    //   SDジャンプはバナーと同時（parallel）・白バーストとフラッシュはバナーの後＝「アピール計算」の瞬間に同時発生
    SC.fxPush({ type: 'elclass', target: '.stage-members .sm-c', cls: 'sm-jump', duration: 560, parallel: true });
    SC.fxPush({ type: 'memcut', duration: 1100 });
    SC.fxMark();   // v0.25.42: 思い出の付随/LINK効果の LINK! カットインは Appeal Start!! の直後へ（Live Skill と同じ理由）
    if (pa.judgement === 'memGood') SC.fxPush({ type: 'whiteburst', target: 'unit:player', duration: 500, parallel: true });
    SC.fxPush({ type: 'flash', cls: 'appeal', duration: 300 });
    // v0.20b: スキル履歴に追記
    if (!a.skillHistory) a.skillHistory = [];
    a.skillHistory.unshift({ attr: 'mem', owner: 'p', cardName: '思い出アピール', turn: a.turn });
    if (a.skillHistory.length > 5) a.skillHistory.length = 5;
    SC.aliveJudges().slice().forEach(function (j) {
      // v0.25.17: 思い出アピールも右の順位行アイコン発・音符の波（ユーザー指定）
      SC.fxPush({ type: 'shot', from: 'unit:player', to: 'judge:' + a.judges.indexOf(j), hue: 325, n: 12, style: 'notes', parallel: true });
      SC.applyAppeal(player, j, SC.playerMemoryValue(j, coef), '思い出');
    });
    if (charged) {
      const cMult = A.chargeMult[(SC.IDOL.chargeAppeal.lv || 1) - 1];
      SC.auditionLog(`🔥 チャージアピール発動！（Lv${SC.IDOL.chargeAppeal.lv || 1}）`, 'good');
      SC.aliveJudges().slice().forEach(function (j) {
        SC.applyAppeal(player, j, Math.floor(SC.playerMemoryValue(j, coef) * cMult), 'チャージ');
      });
    }
    // v0.25.37: 本体アピールの後に 付随効果 → LINK効果 の順で適用（Pカード memoryAppeal.levels[実効Lv] の effectParsed.extra / linkEffect）。
    //   擬似札 memExtra を既存の SC.applyExtraEffects に渡す（バフ付与・追加アピール(全生存審査員へ)・LINK成立ログ/カットインも既存処理）。
    //   追加アピールの判定係数は思い出と同じ coef（Good=1.5 / Bad=0.5）[推測]。未対応の効果文（メンタル回復等）は何もしない（既存の挙動）
    if (memExtra) SC.applyExtraEffects(memExtra, pa, coef, null, memLinkOk, vctx, memCondOk);
    return;
  }
  let card = a.deck[a.hand[pa.cardPos]];
  // appealVar カードの倍率を実効倍率（最大×f）に解決（v0.25.40: 予測 SC.appealPredict と同じ SC.varCardResolve。旧: ref が mentalLow/mentalHigh/それ以外0.5 [仮データ]
  //   で min〜max を補間しており、mentalHigh は wiki の式（1.6r−0.6）と違った）。本体に [消去:◯◯] があればアピール後に該当ステータス効果を消去する（varErase）
  let varErase = null;
  if (card && card.appealVar) {
    const vr = SC.varCardResolve(card, vctx);
    card = vr.card;
    varErase = vr.erase;
    SC.auditionLog(`${card.name}：倍率変動 最大${card.appealVar.max}×${vr.f.toFixed(2)}＝×${Number(card.mult.toFixed(3))}${vr.fallback ? '（駆動タグなし・0.6 [仮データ]）' : ''}`, 'sys');
  }
  // v0.25.36: 「[PERFECTならN倍アピール]」（甜花「事務所。静寂。大輪の華」±）: PERFECT判定時は倍率を差し替え
  if (card && card.perfectMult && pa.judgement === 'perfect') card = Object.assign({}, card, { mult: card.perfectMult });
  // v0.25.13: {人物}のアピール倍率UP状態（対象人物のスキル倍率に加算。ユーザー確認: PにちかS美琴→美琴の固有スキルUP）
  const apBoost = SC.activeStatuses('apUp').reduce(function (s, e) {
    const on = SC.ownerIdolName(card.owner);
    return s + ((on && (on.indexOf(e.person) >= 0 || e.person.indexOf(on) >= 0)) ? e.pct : 0);
  }, 0);
  if (apBoost > 0) {
    card = Object.assign({}, card, { mult: card.mult + apBoost });
    SC.auditionLog(`⤴ アピール倍率UP適用: ×${card.mult}（+${apBoost}）`, 'good');
  }
  const coef = coefTable[pa.judgement];
  const plus = SC.plusActive(card);
  const linkOk = SC.cardLinkOk(card);   // v0.25.37: 仮データ札(card.link)に加え、実カードの(Link)節を持つ札も対象（履歴の追記 pushHistory より前に評価）
  const condOk = SC.extraCondSnapshot(card);   // v0.25.44: 条件節 [〜場合] も履歴の追記・本体アピール・[消去] より前に評価（予測 appealPredict と同じ時点）
  // v0.25.37: 汎用の「LINK追撃（本体の50%）[簡略化]」は (Link)節を持たない仮データ札だけ。実カードは (Link)節の効果（applyExtraEffects）だけにする
  const genericLink = linkOk && card.link === true && !SC.cardHasLinkClause(card);
  const usedDeckIdx = a.hand[pa.cardPos];
  a.cooldown[usedDeckIdx] = a.turn + A.skillCooldown;
  // v0.25.13: 生成スキルは使い切り（使用後に手札から消える）
  if (card.generated) a.hand.splice(pa.cardPos, 1);
  SC.pushHistory(card.owner, card.attr);   // 履歴は札の持ち主（サポ札=そのサポのアピール扱い）。attrもhistGenre判定用に記録
  // v0.20b: スキル履歴に追記
  if (!a.skillHistory) a.skillHistory = [];
  a.skillHistory.unshift({ attr: card.attr || 'vo', attrs: (card.attrs && card.attrs.length > 1) ? card.attrs.slice() : null, owner: card.owner, cardName: card.name, turn: a.turn });   // v0.25.41: 複合属性は attrs も記録（履歴アイコンの混合色用。SC.attrColorClass）
  if (a.skillHistory.length > 5) a.skillHistory.length = 5;

  // FX（1080p実測）: 判定→放射光線→Live Skillカットイン（斜め帯+スキル名+立ち絵）→ダメージ数字
  const jText = { perfect: 'Perfect!!', good: 'Good!', normal: 'Normal', bad: 'Bad…' }[pa.judgement] || '';
  SC.fxPush({ type: 'banner', text: jText, cls: 'judgement-' + pa.judgement, duration: 420 });
  SC.fxPush({ type: 'rays', cls: 'appeal', duration: 300, parallel: true });
  // v0.25.22: アピール時に中央SDメンバーが跳ねる（動画実測: SDキャラはアピールで大きく動く）
  SC.fxPush({ type: 'elclass', target: '.stage-members .sm-c', cls: 'sm-jump', duration: 560, parallel: true });
  SC.fxPush({ type: 'cutin', cls: 'liveskill', logo: 'Live Skill&#9834;', text: card.name || '',
    faceAttr: card.attr || 'vo',
    faceText: (card.owner === 'p' ? (SC.IDOL.name || 'P') : ((SC.SUPPORTS[card.owner] || {}).name || 'S')).charAt(0),
    duration: 850 });
  SC.fxMark();   // v0.25.42: PLUS!/LINK! のカットインはこの直後（Live Skill の次）に差し込む。後ろへ積むとダメージ・満足・帰宅・★帯の後＝終了演出の後に出てしまう

  // v0.25.14: アピール光弾の色（属性別）
  const shotHue = { vo: 340, da: 205, vi: 45 }[card.attr] || 320;
  // allJudges: 対象選択なしで全生存審査員にアピール
  if (card.allJudges) {
    SC.auditionLog(`${player.name}：${card.name}（全審査員）`, 'player');
    const isComposite = card.attrs && card.attrs.length > 1;
    // v0.25.17: 全体札=生存審査員それぞれへ右の順位行アイコン発・音符の波（帰宅済みは対象外。「3方向」維持）
    SC.aliveJudges().slice().forEach(function (j) {
      SC.fxPush({ type: 'shot', from: 'unit:player', to: 'judge:' + a.judges.indexOf(j), hue: shotHue, n: 10, style: 'notes', parallel: true });
    });
    SC.aliveJudges().slice().forEach(function (j) {
      // v0.25.8: 複合属性は属性ごとに1発ずつ（属性一致ヒットのみExcellent 2倍）。単属性は従来どおり1発
      SC.appealHits(card, j.attr, coef, j).forEach(function (hit) {
        const jv = hit.value;   // v0.25.18: PLUSはextra経由の追加効果で適用（plusBoost簡略乗算は撤去）
        SC.applyAppeal(player, j, jv,
          `${card.name}${isComposite ? '・' + SC.ATTR_LABEL[hit.attr] : ''}・${pa.judgement.toUpperCase()}${hit.excellent ? '・Excellent!!' : ''}${plus ? '・PLUS!' : ''}`);
      });
    });
    // v0.25.40: 本体の [消去:◯◯]＝全審査員へのアピールが終わった後に該当ステータス効果を消去
    if (varErase) {
      const nEr = SC.varEraseStatuses(varErase);
      if (nEr > 0) SC.auditionLog(`${player.name}：${SC._varEraseLabel(varErase)} のステータス効果を${nEr}個消去`, 'good');
    }

    // selfDmg: 自身のメンタルを割合で減少（自傷では脱落しない[推測]）
    if (card.selfDmg) {
      const sd = Math.ceil(player.mental * card.selfDmg);
      player.mental = Math.max(1, player.mental - sd);
      SC.auditionLog(`${player.name}：自傷 -${sd} Me（残 ${player.mental}/${player.mentalMax}）`, 'dmg');
    }

    // condBuff: メンタル減少割合に比例してバフ付与（最大pctMax[推測解釈]）
    if (card.condBuff) {
      const cb = card.condBuff;
      const pct = Math.round(cb.pctMax * (1 - player.mental / player.mentalMax));
      player.debuffs.push({ attr: cb.attr, pct: pct, untilTurn: a.turn + cb.turns - 1, src: card.name });   // v0.25.43: 由来の札名
      SC.auditionLog(`${player.name}：${SC.ATTR_LABEL[cb.attr]} +${pct}%[${cb.turns}T]（条件バフ）`, 'good');
    }

    // link追撃: allJudges時は残り体力最少の審査員1体のみに適用[簡略化]（v0.25.37: 仮データ札だけ。実カードは(Link)節）
    if (genericLink) {
      const alive = SC.aliveJudges();
      if (alive.length > 0) {
        const target = alive.slice().sort(function (x, y) { return x.hp - y.hp; })[0];
        let fv = SC.appealTotal(card, target.attr, coef, target);   // v0.25.8: 複合は合算値基準
        fv = Math.floor(fv * A.linkFollowMult);
        SC.auditionLog(`🔗 リンクアピール発動！ 追撃`, 'good');
        SC.applyAppeal(player, target, fv, 'LINK追撃');
      }
    }

    // v0.14/v0.25.8: extra 処理（付随バフ・追加アピール・(Link)分。allJudges時の追加アピールは全審査員へ）
    SC.applyExtraEffects(card, pa, coef, null, linkOk, vctx, condOk);
    return;
  }

  // 通常アピール（既存処理）
  const judge = a.judges[pa.judgeIdx];
  if (!judge || judge.gone) return;
  // v0.25.17: 単体アピール=右の順位行アイコン発・対象審査員へ音符の波（ユーザー指定）
  SC.fxPush({ type: 'shot', from: 'unit:player', to: 'judge:' + pa.judgeIdx, hue: shotHue, n: 12, style: 'notes', parallel: true });
  const isComposite2 = card.attrs && card.attrs.length > 1;
  // v0.25.8: 複合属性は属性ごとに1発ずつ（属性一致ヒットのみExcellent 2倍）
  let vTotal = 0;
  SC.appealHits(card, judge.attr, coef, judge).forEach(function (hit) {
    const v = hit.value;   // v0.25.18: PLUSはextra経由の追加効果で適用（plusBoost簡略乗算は撤去）
    vTotal += v;
    SC.applyAppeal(player, judge, v,
      `${card.name}${isComposite2 ? '・' + SC.ATTR_LABEL[hit.attr] : ''}・${pa.judgement.toUpperCase()}${hit.excellent ? '・Excellent!!' : ''}${plus ? '・PLUS!' : ''}`);
  });
  // v0.25.40: 本体の [消去:◯◯]＝アピール後に該当ステータス効果を消去
  if (varErase) {
    const nEr2 = SC.varEraseStatuses(varErase);
    if (nEr2 > 0) SC.auditionLog(`${player.name}：${SC._varEraseLabel(varErase)} のステータス効果を${nEr2}個消去`, 'good');
  }
  // リンクアピール: 履歴条件を満たすと追撃（[簡略化] 本体（複合は合算）の50%）。v0.25.37: 仮データ札だけ（実カードは(Link)節）
  if (genericLink && !judge.gone) {
    const fv = Math.floor(vTotal * A.linkFollowMult);
    SC.auditionLog(`🔗 リンクアピール発動！ 追撃`, 'good');
    SC.applyAppeal(player, judge, fv, 'LINK追撃');
  }

  // v0.14/v0.25.8: extra 処理（付随バフ・追加アピール・(Link)分。単体時は同じ審査員へ）
  SC.applyExtraEffects(card, pa, coef, judge, linkOk, vctx, condOk);
};

// ---- v0.25.8: liveSkill.extra の共通処理（付随バフ・注目度DOWN・追加アピール・(Link)分） ----
// v0.25.18: 全面改修（ユーザー指摘: PLUSの追加アピールが不発だった）
//   ①条件節 [〜場合] を分解して SC.extraCondsMet で評価（成立時のみ後続効果＝PLUS本来仕様）
//   ②属性の短縮表記 Vo/Da/Vi に対応（P系パネルraw。従来はVocal等のみで不一致＝効果落ち）
//   ③1文字列内の複数効果（「Vo60%UP[5ターン]注目度50%DOWN[3ターン]」等）を連続処理
//   ④PLUS/LINK成立時はカットイン演出（ユーザー指定）
// targetJudge=null なら追加アピールは全生存審査員へ（allJudges時）。(Link)以降はリンク成立時のみ

// extra文字列 → セグメント配列 [{text, cond, viaLink}]（条件節と(Link)区切りの分解を予測側と共用）
SC.parseExtraSegments = function (card) {
  const out = [];
  // 条件節はextra配列の要素をまたいで係る（converterが元rawを「/」で分割して配列化しているため。
  //   例: ジェラシー=[条件]全観客にVo2.5倍アピール / Vo60%UP / 注目度DOWN → 後続要素も条件配下）
  let curCond = null;
  (card.extra || []).forEach(function (exRaw0) {
    const exRaw = SC.normalizeVarAppealText(exRaw0);   // v0.25.40: 倍率変動アピールの表記ゆれ（離れたタグ・[[[ 重複・wikiリンク残骸）を正規化（予測・実行・思い出の付随/LINK・パネルextraで共通）
    const pushParts = function (str, viaLink) {
      let rest = String(str || '');
      let guard = 0;
      while (rest && guard++ < 10) {
        const m = rest.match(/\[([^\]]*場合)\]/);
        if (!m) {
          if (rest.trim()) out.push({ text: rest.trim(), cond: curCond, viaLink: viaLink });
          break;
        }
        const before = rest.slice(0, m.index);
        if (before.trim()) out.push({ text: before.trim(), cond: curCond, viaLink: viaLink });
        curCond = m[1];
        rest = rest.slice(m.index + m[0].length);
      }
    };
    const li = String(exRaw).indexOf('(Link)');
    if (li >= 0) {
      pushParts(exRaw.slice(0, li), false);
      curCond = null;   // (Link)ブランチは別トリガー＝条件の係りをリセット
      pushParts(exRaw.slice(li + 6), true);
    } else {
      pushParts(exRaw, false);
    }
  });
  return out;
};

// v0.25.44: extra の条件節 [〜場合] を「札を使う前の状態」で一括評価して { 条件文字列: 成立 } を返す。
//   実行（execPlayerAction）は履歴の追記（pushHistory）より前にこれを取って applyExtraEffects に渡し、予測（extraAppealPredict）も同じ時点の状態で取る。
//   ユーザー確認（2026-10-28）: 使用者本人を条件にした PLUS（broken shout「履歴に斑鳩 ルカがある場合」等）は札自身では成立しない（先に別の札で履歴を埋める必要がある）。
//   従来は実行側だけ「使用後の履歴＋先に適用した付随効果」で評価しており、予測と実際がずれていた
SC.extraCondSnapshot = function (card) {
  const out = {};
  if (!card || !Array.isArray(card.extra) || !SC.parseExtraSegments) return out;
  SC.parseExtraSegments(card).forEach(function (seg) {
    if (seg.cond && !Object.prototype.hasOwnProperty.call(out, seg.cond)) out[seg.cond] = SC.extraCondsMet(seg.cond);
  });
  return out;
};

// 条件節文字列の成立判定（複合AND対応: 「2ターン以前アンティーカ全員がライブに参加している場合」等）
// ターン/メンタル/ユニット全員/履歴思い出を先に消し込み、残りはSC.parseCondString+SC.condMetで評価
SC.extraCondsMet = function (condStr) {
  let s = (condStr || '').replace(/\s/g, '');
  let ok = true;
  const take = function (re, fn) {
    s = s.replace(re, function () { fn.apply(null, arguments); return ''; });
  };
  take(/(\d+)ターン目?以降/, function (m, n) { if (!SC.condMet({ t: 'turnMin', v: Number(n) })) ok = false; });
  take(/(\d+)ターン目?以前/, function (m, n) { if (!SC.condMet({ t: 'turnMax', v: Number(n) })) ok = false; });
  take(/メンタル(?:が)?(\d+)%以上/, function (m, n) { if (!SC.condMet({ t: 'mentalAbove', v: Number(n) / 100 })) ok = false; });
  take(/メンタル(?:が)?(\d+)%以下/, function (m, n) { if (!SC.condMet({ t: 'mentalBelow', v: Number(n) / 100 })) ok = false; });
  take(/^(\d+)%以下/, function (m, n) { if (!SC.condMet({ t: 'mentalBelow', v: Number(n) / 100 })) ok = false; });   // 「メンタル65%以上69%以下」の残片
  take(/(.+?)全員がライブに参加している/, function (m, u) { if (!(SC.unitAllInLoadout && SC.unitAllInLoadout(u))) ok = false; });
  take(/履歴に思い出アピールがある/, function () {
    const a = SC.state.audition;
    if (!a || !a.history.some(function (h) { return h.attr === 'mem'; })) ok = false;
  });
  if (!ok) return false;
  if (!s || s === '場合' || s === 'の場合') return true;
  // 残り（履歴・付与個数・人物参加・ユニット種類・回復回数等）は共通パーサで単一条件として解釈
  const pc = SC.parseCondString(s.slice(-2) === '場合' ? s : s + '場合');
  if (!pc) return false;   // 未対応条件は不成立扱い（安全側）
  return SC.condMet(pc);
};

// 属性表記グループ（extra解析用・Vo/Da/Vi短縮形対応。長い表記を先に置くこと）
SC._extraAttrGroup = '((?:Vocal|Dance|Visual|Vo|Da|Vi)(?:\\s*&\\s*(?:Vocal|Dance|Visual|Vo|Da|Vi))*)';
SC._extraToAttrs = function (grp) {
  const map = { Vocal: 'vo', Dance: 'da', Visual: 'vi', Vo: 'vo', Da: 'da', Vi: 'vi' };
  return grp.split('&').map(function (s) { return map[s.trim()]; }).filter(Boolean);
};

SC.applyExtraEffects = function (card, pa, coef, targetJudge, linkOk, vctx, condOk) {
  if (!card.extra || !Array.isArray(card.extra)) return;
  const a = SC.state.audition;
  const player = a.units[0];
  // v0.25.44: 条件節の成立は使用前の状態で評価済みのもの（SC.extraCondSnapshot）を使う。未指定の呼び出しはこの時点（自分の効果を適用する前）で評価
  const condMap = condOk || SC.extraCondSnapshot(card);
  const ATTR_GROUP = SC._extraAttrGroup;
  const toAttrs = SC._extraToAttrs;
  // v0.25.40: 倍率変動アピール（追加アピールの「最大N倍[tag]」「A~B倍[tag]」）の係数 f の文脈。card.varCtx（思い出の付随/LINK=memory:true）＋呼び出し側の vctx（使用前の履歴件数 histLen）。
  //   予測 SC.extraAppealPredict と同じ SC.extraApResolve を使う（二重実装しない）
  const varCtx = Object.assign({}, card.varCtx || {}, vctx || {});

  // 1効果分の適用。マッチしたら該当文字列（match[0]）を返し、呼び出し側が残りを再処理する
  const processSingle = function (text, tag) {
    // v0.25.35: 「ランダム効果N個付与」— card.randomEffects（MDの候補表）からN回 SC.pick で抽選（同一の効果が重なることもある）し、
    //   選ばれた効果文を既存の効果適用（processOne＝下の付随バフ/状態効果などの処理）にそのまま渡す。
    //   この節が成立している時だけここに来る（条件節 [〜場合] は parseExtraSegments/extraCondsMet で評価済み）。
    //   randomEffects の無い札は従来どおり何もしない（このブロックを素通り）。予測値（appealPredict）には含めない（使用後に付くため）
    const mRand = text.match(/ランダム効果(\d+)個付与/);
    if (mRand) {
      const pool = (card.randomEffects || []).filter(function (c) { return c && c.indexOf('ランダム効果') < 0; });
      if (pool.length > 0) {
        const picks = [];
        for (let k = 0; k < Number(mRand[1]); k++) picks.push(SC.pick(pool));
        SC.auditionLog(`ランダム効果: ${picks.join('／')}`, 'good');
        picks.forEach(function (pk) { processOne(String(pk).replace(/％/g, '%'), '（ランダム効果）'); });   // 全角％は半角へ寄せて既存パターンに通す
        return mRand[0];
      }
    }
    // 付随バフ（複合属性対応: 「Vocal & Dance15%UP[3ターン]」→ 両属性にバフ）
    const mBuff = text.match(new RegExp(ATTR_GROUP + '\\s*([\\d.]+)%UP\\[(\\d+)ターン\\]'));
    if (mBuff) {
      const attrs = toAttrs(mBuff[1]);
      const pct = parseFloat(mBuff[2]);
      const turns = parseInt(mBuff[3]);
      attrs.forEach(function (exAttr) {
        player.debuffs.push({ attr: exAttr, pct: pct, untilTurn: a.turn + turns - 1, src: card.name });   // v0.25.43: src＝由来の札名（ステータス効果の詳細モーダル用。'passive' 以外なので消去の対象は従来どおり）
      });
      SC.auditionLog(`${player.name}：${attrs.map(function (x) { return SC.ATTR_LABEL[x]; }).join('&')} +${pct}%[${turns}T]${tag}`, 'good');
      return mBuff[0];
    }
    // 追加アピール（「(全観客に)DanceN倍アピール」= 2発目以降。属性ごとに1発ずつ）
    //   v0.25.40: 「最大N倍アピール[tag]」「A~B倍アピール[tag]」も同じ経路で 倍率=最大×f（SC.extraApResolve。予測 SC.extraAppealPredict と共用）。[消去:◯◯] はそのアピールの後に消去
    const mAp = text.match(SC._extraApRegex(false));
    if (mAp && SC._extraApAfterGrow(text, mAp)) return null;   // v0.25.40: (Grow)節の倍率変動アピールは撃たない（予測 extraAppealPredict も同じ）
    if (mAp) {
      const exAll = !!mAp[1] || !targetJudge;
      const attrs = toAttrs(mAp[2]);
      const rv = SC.extraApResolve(mAp, varCtx);
      const mult = rv.mult;
      const fTxt = rv.f !== null ? `・倍率変動×${rv.f.toFixed(2)}${rv.fallback ? '[仮データ0.6]' : ''}` : '';
      const targets = exAll ? SC.aliveJudges().slice() : (targetJudge && !targetJudge.gone ? [targetJudge] : []);
      targets.forEach(function (j) {
        attrs.forEach(function (exAttr) {
          // v0.25.8: owner継承（計算式がP札/サポ札で異なるため。従来はowner欠落でサポ式に落ちていた）
          const exCard = { name: card.name, attr: exAttr, mult: mult, owner: card.owner };
          const jv = SC.playerAppealValue(exCard, j.attr, coef, j);
          SC.applyAppeal(player, j, jv,
            `${card.name}・追加${attrs.length > 1 ? '・' + SC.ATTR_LABEL[exAttr] : ''}${exAttr === j.attr ? '・Excellent!!' : ''}${fTxt}${tag}`);
        });
      });
      if (rv.erase) {
        const nEr = SC.varEraseStatuses(rv.erase);
        if (nEr > 0) SC.auditionLog(`${player.name}：${SC._varEraseLabel(rv.erase)} のステータス効果を${nEr}個消去${tag}`, 'good');
      }
      return mAp[0];
    }
    // v0.20a: 注目度DOWN（自身の注目度を下げる → 狙われにくくなる）／v0.25.43: 注目度UP（狙われやすくなる）も同じ経路で付与
    //   v0.25.43: [Nターン]どおりに切れる状態効果 'attn'（SC.attentionMultOf が有効中のものだけ乗算）。従来は player.attentionMult に永続で乗算（[Nターン]を無視）し、
    //   UP は本処理に無く一度も付与されなかった（ライブスキル532件・思い出48件の「注目度N%UP[Nターン]」が無効だった）。
    //   [Nターン]が無い表記（思い出のLINK効果「注目度5%DOWN」等）は SC.CONFIG.audition.passiveEffectTurns（付与したターンのみ）[推測]
    const mAttn = text.match(/注目度([\d.]+)%(UP|DOWN)(?:\[(\d+)ターン\])?/);
    if (mAttn) {
      const pct = parseFloat(mAttn[1]);
      const sgn = mAttn[2] === 'DOWN' ? -1 : 1;
      const attnTurns = mAttn[3] ? parseInt(mAttn[3]) : SC.CONFIG.audition.passiveEffectTurns;
      if (isFinite(pct) && attnTurns > 0) {
        SC.addStatus('attn', { pct: sgn * pct, untilTurn: a.turn + attnTurns - 1, src: card.name });
        SC.auditionLog(`${player.name}：注目度${pct}%${mAttn[2]}[${attnTurns}T]（${sgn < 0 ? '注目されにくくなる' : '注目されやすくなる'}）${tag}`, 'good');
      }
      return mAttn[0];
    }
    // v0.25.36: ライブスキル付随の「メンタルダメージN%CUT[Nターン]」「リアクション回避率N%UP[Nターン]」を状態効果として付与
    //   （キーはパッシブの発動時と同じ 'dmgCut' / 'avoid'。judgeReaction が SC.sumStatusPct で参照。アピール値(appealPredict)には影響しない）
    const mCut = text.match(/メンタルダメージ([\d.]+)%CUT\[(\d+)ターン\]/);
    if (mCut) {
      const pct = parseFloat(mCut[1]);
      const turns = parseInt(mCut[2]);
      SC.addStatus('dmgCut', { pct: pct, untilTurn: a.turn + turns - 1, src: card.name });
      SC.auditionLog(`${player.name}：メンタルダメージ${pct}%CUT[${turns}T]${tag}`, 'good');
      return mCut[0];
    }
    const mAvoid = text.match(/リアクション回避率([\d.]+)%UP\[(\d+)ターン\]/);
    if (mAvoid) {
      const pct = parseFloat(mAvoid[1]);
      const turns = parseInt(mAvoid[2]);
      SC.addStatus('avoid', { pct: pct, untilTurn: a.turn + turns - 1, src: card.name });
      SC.auditionLog(`${player.name}：リアクション回避率+${pct}%[${turns}T]${tag}`, 'good');
      return mAvoid[0];
    }
    // ==== v0.25.13: 名前付き状態効果の付与（ユーザー確認: WINGで付与可能なスキルが存在） ====
    const exTurns = (function () { const m = text.match(/\[(\d+)ターン\]/); return m ? parseInt(m[1]) : 3; })();   // [仮データ]既定3T
    let mSt = text.match(/パッシブスキル発動率([\d.]+)%UP/);
    if (mSt) {
      SC.addStatus('passProb', { pct: parseFloat(mSt[1]), untilTurn: a.turn + exTurns - 1 });
      SC.auditionLog(`${player.name}：パッシブ発動率+${mSt[1]}%[${exTurns}T]${tag}`, 'good');
      return mSt[0];
    }
    mSt = text.match(/パッシブスキル([\d.]+)%強化/);
    if (mSt) {
      SC.addStatus('passBoost', { pct: parseFloat(mSt[1]), untilTurn: a.turn + exTurns - 1 });
      SC.auditionLog(`${player.name}：パッシブ${mSt[1]}%強化[${exTurns}T]${tag}`, 'good');
      return mSt[0];
    }
    mSt = text.match(/リラックス(?:効果)?([\d.]+)%付与/);
    if (mSt) {
      SC.addStatus('relax', { pct: parseFloat(mSt[1]), untilTurn: a.turn + exTurns - 1 });
      SC.auditionLog(`${player.name}：リラックス${mSt[1]}%[${exTurns}T]（被Meダメージ軽減[推測]）${tag}`, 'good');
      return mSt[0];
    }
    mSt = text.match(/(ライバルに|自身に)?メランコリー効果([\d.]+)%付与/);
    if (mSt) {
      const pct = parseFloat(mSt[2]);
      if (mSt[1] === 'ライバルに') {
        SC.aliveUnits().forEach(function (u) {
          if (u.isPlayer) return;
          if (!u.melancholy) u.melancholy = [];
          u.melancholy.push({ pct: pct, untilTurn: a.turn + exTurns - 1 });
        });
        SC.auditionLog(`ライバル全員にメランコリー${pct}%[${exTurns}T]（被Meダメージ増加[推測]）${tag}`, 'good');
      } else {
        SC.addStatus('melancholySelf', { pct: pct, untilTurn: a.turn + exTurns - 1 });
        SC.auditionLog(`${player.name}：メランコリー${pct}%[${exTurns}T]${tag}`, '');
      }
      return mSt[0];
    }
    mSt = text.match(/リザレクション効果([\d.]+)%付与/);
    if (mSt) {
      SC.addStatus('resurrection', { pct: parseFloat(mSt[1]), untilTurn: a.turn + exTurns - 1, once: true });
      SC.auditionLog(`${player.name}：リザレクション${mSt[1]}%[${exTurns}T]（脱落時に復帰[推測]）${tag}`, 'good');
      return mSt[0];
    }
    mSt = text.match(/瞳の輝き/);
    if (mSt) {
      SC.addStatus('hitomi', { pct: 0, untilTurn: a.turn + exTurns - 1 });
      SC.auditionLog(`${player.name}：瞳の輝き[${exTurns}T]（固有効果は要仕様確認・条件参照のみ）`, 'good');
      return mSt[0];
    }
    // 魅了（「魅了強化」はwikiリンク表記のノイズなので除外）
    mSt = text.match(/(全観客に)?魅了(?!強化)/);
    if (mSt) {
      const charmTargets = (mSt[1] || !targetJudge) ? SC.aliveJudges().slice() : [targetJudge];
      charmTargets.forEach(function (j) { if (j) j.charmUntil = a.turn + exTurns - 1; });
      SC.auditionLog(`審査員に魅了[${exTurns}T]（リアクション停止[推測]）${tag}`, 'good');
      return mSt[0];
    }
    mSt = text.match(/(.+?)のアピール倍率([\d.]+)倍?UP/);   // v0.25.35: wiki表記ゆれ「アピール倍率0.2UP」（倍の脱落。ROOTSのランダム効果候補）も同じ効果として扱う
    if (mSt) {
      SC.addStatus('apUp', { person: mSt[1].replace(/\s/g, ''), pct: parseFloat(mSt[2]), untilTurn: a.turn + exTurns - 1 });
      SC.auditionLog(`${mSt[1]}のアピール倍率+${mSt[2]}[${exTurns}T]${tag}`, 'good');
      return mSt[0];
    }
    mSt = text.match(/ライブスキル生成(?:\[(.+?)\])?/);
    if (mSt) {
      SC.generateLiveSkill(mSt[1] || null, card.owner);
      return mSt[0];
    }
    return null;
  };

  // 1テキスト内の複数効果を連続処理（マッチ分を除去しながら最大6効果）
  const processOne = function (text, tag) {
    let rest = String(text || '');
    let guard = 0;
    while (rest && guard++ < 6) {
      const consumed = processSingle(rest, tag);
      if (!consumed) break;
      const i = rest.indexOf(consumed);
      rest = (rest.slice(0, i) + rest.slice(i + consumed.length)).replace(/^[、,/\s]+/, '');
    }
  };

  let plusCutin = false, linkCutin = false;
  SC.parseExtraSegments(card).forEach(function (seg) {
    if (seg.viaLink && !linkOk) return;
    if (seg.cond && !condMap[seg.cond]) return;
    // v0.25.18: PLUS/LINK成立演出（ユーザー指定・スキル1回の使用につき各1回）
    if (seg.viaLink && !linkCutin) {
      linkCutin = true;
      SC.auditionLog(`🔗 LINK成立！追加効果発動`, 'good');
      SC.fxPushAtMark({ type: 'cutin', cls: 'link', logo: 'LINK!', text: card.name, duration: 700 });   // v0.25.42: 末尾でなく札の使用宣言の直後へ（SC.fxMark）
    }
    if (seg.cond && !seg.viaLink && !plusCutin) {
      plusCutin = true;
      SC.auditionLog(`➕ PLUS成立！（${seg.cond}）追加効果発動`, 'good');
      SC.fxPushAtMark({ type: 'cutin', cls: 'plus', logo: 'PLUS!', text: card.name, duration: 700 });   // v0.25.42: 同上
    }
    const tag = seg.viaLink ? '（LINK効果）' : (seg.cond ? '（PLUS効果）' : '（付随バフ）');
    seg.text.split('/').forEach(function (part) {
      if (part.trim()) processOne(part.trim(), tag);
    });
  });
};

SC.execRivalAction = function (u) {
  const a = SC.state.audition;
  if (u.plan && u.plan.memory) {
    // ライバル思い出: 全審査員へ全属性Excellent全体攻撃（wiki）
    const coef = u.judgement === 'memGood' ? 1.5 : 0.5;
    u.mem = 0;
    SC.auditionLog(`💥 ${u.name}の思い出アピール！`, 'rival');
    // FX(v0.25.2): ライバル思い出はピンク帯+放射（1080p実測: カットインは自機のみ）
    SC.fxPush({ type: 'banner', text: u.name + 'の思い出アピール！', cls: 'memory', duration: 550 });
    SC.fxPush({ type: 'rays', cls: 'rival', duration: 300, parallel: true });
    // v0.25.20: 謎バフは思い出アピールにも影響する【wiki: shiyou「思い出にも影響する」】（1アピールにつき1回抽選）
    const A2 = SC.CONFIG.audition;
    const mystery = (a.turn >= A2.rivalMysteryBuff.fromTurn && SC.chance(A2.rivalMysteryBuff.rate))
      ? A2.rivalMysteryBuff.mult : 1;
    SC.aliveJudges().slice().forEach(function (j) {
      let v = a.def.atk[a.mode] * coef * SC.CONFIG.audition.judge.excellent * mystery;
      v = Math.round(v);
      // v0.25.17: ライバル思い出も音符の波（アイドルのアピール=音符・審査員リアクション=レーザーで統一）
      SC.fxPush({ type: 'shot', from: 'unit:' + u.key, to: 'judge:' + a.judges.indexOf(j), hue: 285, n: 8, style: 'notes', duration: 300 });   // v0.25.18: 1人ずつ順に（ユーザー指定）
      SC.applyAppeal(u, j, v, '思い出');
    });
    return;
  }
  // v0.25.34: 計画対象は属性で現在の審査員配列から引き直す。オデ中のセーブ→ロード（JSON）やクローンで plan.target が
  //   審査員配列から切り離されたコピーになり、ライバルのアピールが本物の審査員に入らなかったバグの根治（シミュ1〆で発覚）
  const planAttr = (u.plan && u.plan.target) ? u.plan.target.attr : null;
  let target = planAttr ? (a.judges.filter(function (j) { return j.attr === planAttr; })[0] || null) : null;
  if (!target || target.gone) target = SC.rivalTarget(u);   // 対象退場時の再決定
  u.cyc = (u.cyc || 0) + 1;   // 変遷カウンタ（通常アピール時のみ進む）
  if (!target) return;
  const v = SC.rivalAppealValue(u, target, u.judgement);
  const ex = u.fav && u.fav === target.attr;
  // v0.25.17: ライバルアピール＝順位行から対象審査員へ音符の波（アイドルのアピール=音符で統一）
  SC.fxPush({ type: 'shot', from: 'unit:' + u.key, to: 'judge:' + a.judges.indexOf(target), hue: 285, n: 9, style: 'notes', duration: 300 });
  SC.applyAppeal(u, target, v, `${u.judgement.toUpperCase()}${ex ? '・Excellent' : ''}`);
};

// 審査員のリアクション（毎ターン。4の倍数ターンは1.5倍+属性DOWN）
SC.judgeReaction = function (judge) {
  const a = SC.state.audition;
  const A = SC.CONFIG.audition.judge;
  // v0.25.13: 魅了中の審査員はリアクションしない[推測]
  if (judge.charmUntil !== undefined && judge.charmUntil >= a.turn) {
    SC.auditionLog(`💘 ${judge.name}は魅了されていてリアクションできない！`, 'good');
    return;
  }
  // v0.14: 重み付き抽選（注目度 attentionMult ベース）【wiki効果解説】
  const targets = SC.weightedSampleUnits(SC.aliveUnits(), a.way);
  const isBoost = a.turn % A.reactEvery === 0;
  const isNo1Buff = a.def.special === 'no1' && a.turn % 2 === 0;

  // FX(v0.25.2): 口撃する審査員カードが青白く発光（1080p実測r3）
  SC.fxPush({ type: 'elclass', target: 'judge:' + a.judges.indexOf(judge), cls: 'judge-attacking', duration: 450, parallel: true });

  // v0.25.20: 同一審査員の複数対象（3WAY等）は同時発射・同時着弾（ユーザーFB。審査員同士の逐次はv0.25.18のまま）
  //   ショットは全弾parallelで即時発射→wait（弾の飛行時間）→着弾shock/ダメージ数字をまとめて表示
  let anyShot = false;
  const impactFx = [];
  targets.forEach(function (u) {
    // reactAvoid: プレイヤーユニットの場合、回避率チェック
    if (u.isPlayer) {
      // v0.25.35: 回避率は状態効果 'avoid'（回避パッシブが発動したターンから有効中のもの）の合計。習得しただけ（未発動）では効かない
      const avoidPct = SC.sumStatusPct('avoid');
      if (avoidPct > 0 && SC.chance(avoidPct / 100)) {
        SC.auditionLog(`💨 ${u.name}がリアクションを回避！（回避率${avoidPct}%）`, 'good');
        return; // このユニットへのリアクション全スキップ
      }
    }
    // v0.25.14: リアクションは審査員から対象ユニットへ光弾が飛ぶ（ユーザー指定: 攻撃対象に向かう）
    // v0.25.20: 全弾parallel=同時発射（応援=no1バフは攻撃でないので出さない）
    if (!isNo1Buff) {
      SC.fxPush({ type: 'shot', from: 'judge:' + a.judges.indexOf(judge), to: 'unit:' + u.key, hue: 210, n: 10,
        duration: u.isPlayer ? 320 : 280, parallel: true });
      anyShot = true;
      // FX(v0.25.2): 青白い衝撃波が対象ユニットへ着弾（1080p実測r3_5）→ wait後にまとめて表示
      // v0.25.21: 自機被弾はhit音（ユーザーFB「被弾ボイス（SEでもいい）」）
      impactFx.push({ type: 'shock', target: 'unit:' + u.key, duration: u.isPlayer ? 420 : 260, parallel: true,
        se: u.isPlayer ? 'hit' : null });
      // v0.25.21: 被弾対象は一瞬前（左）に出て分かりやすく（ユーザーFB）
      impactFx.push({ type: 'elclass', target: 'unit:' + u.key, cls: 'unit-hit', duration: 520, parallel: true });
    }
    // v0.14: 影響力補正（審査員側・加算）【wiki効果解説: 複数は加算】
    const influenceMod = 1.0 + (judge.influencePct || 0) / 100;
    let dmg = a.dmg;
    if (isNo1Buff) {
      dmg = 0;
      u.debuffs.push({ attr: judge.attr, pct: 100, untilTurn: a.turn + A.reactDebuffTurns - 1, src: judge.name + 'の応援' });   // v0.25.43: 由来（ステータス効果の詳細モーダル用）
      SC.auditionLog(`${judge.name}の応援！ ${u.name}の${SC.ATTR_LABEL[judge.attr]} 100%UP[2T]`, 'sys');
    } else if (isBoost) {
      // エレぇベスト等: 強化ターンはMeダメ0でデバフのみ（wiki）
      dmg = a.def.reactZeroDmg ? 0 : Math.round(dmg * A.reactBoost * influenceMod);
      const debuffPct = a.def.reactDebuff !== undefined ? a.def.reactDebuff : A.reactDebuff;
      u.debuffs.push({ attr: judge.attr, pct: -debuffPct, untilTurn: a.turn + A.reactDebuffTurns - 1, src: judge.name + 'のリアクション' });   // v0.25.43: 由来（ステータス効果の詳細モーダル用）
      if (dmg === 0) SC.auditionLog(`${judge.name}のリアクション → ${u.name} ${SC.ATTR_LABEL[judge.attr]}${debuffPct}%DOWN[2T]`, u.isPlayer ? 'dmg' : '');
    } else {
      dmg = Math.round(dmg * influenceMod);
    }
    if (dmg > 0) {
      // dmgCut: プレイヤーユニットが dmgCut 状態効果を持つ場合 Meダメージを軽減（加算・上限80%）[仮データ]
      if (u.isPlayer) {
        // v0.25.35: 状態効果 'dmgCut'（ダメージカットパッシブが発動して有効中のもの）の合計。習得しただけ（未発動）では効かない
        const cutPct = Math.min(80, SC.sumStatusPct('dmgCut')); // 上限80%[仮データ]
        if (cutPct > 0) {
          const dmgOrig = dmg;
          dmg = Math.ceil(dmg * (1 - cutPct / 100));
          SC.auditionLog(`🛡 ダメージカット発動！ ${SC.fmt(dmgOrig)} → ${SC.fmt(dmg)}（${cutPct}%CUT）`, 'good');
        }
        // v0.14: dmgUP: 受けるメンタルダメージ増加（乗算）【wiki効果解説: 複数は乗算】
        (SC.state.panelOpened || []).forEach(function (key) {
          const pd = SC.CONFIG.panel[key];
          if (pd && pd.type === 'dmgUP') {
            dmg = Math.ceil(dmg * (1 + (pd._upPct || 0) / 100));
          }
        });
        // v0.25.13: リラックス=被Meダメージ軽減 / 自身メランコリー=増加（[推測]効果解釈・上限90%軽減）
        const relaxPct = Math.min(90, SC.sumStatusPct('relax'));
        if (relaxPct > 0) {
          const before = dmg;
          dmg = Math.ceil(dmg * (1 - relaxPct / 100));
          SC.auditionLog(`😌 リラックス発動！ Me-${before} → -${dmg}（${relaxPct}%軽減）`, 'good');
        }
        const melanSelf = SC.sumStatusPct('melancholySelf');
        if (melanSelf > 0) dmg = Math.ceil(dmg * (1 + melanSelf / 100));
      }
      // v0.25.13: ライバルのメランコリー=被Meダメージ増加[推測]
      if (!u.isPlayer && u.melancholy) {
        const mel = u.melancholy.filter(function (s) { return s.untilTurn >= a.turn; })
          .reduce(function (s, e) { return s + e.pct; }, 0);
        if (mel > 0) dmg = Math.ceil(dmg * (1 + mel / 100));
      }
      u.mental = Math.max(0, u.mental - dmg);
      // v0.25.13: リザレクション（プレイヤー脱落時にN%で復帰・1回）[推測]
      if (u.isPlayer && u.mental <= 0) {
        const res = SC.activeStatuses('resurrection')[0];
        if (res) {
          res.used = true;
          u.mental = Math.max(1, Math.ceil(u.mentalMax * res.pct / 100));
          SC.auditionLog(`💫 リザレクション発動！ メンタル${res.pct}%（${u.mental}）で復帰！`, 'good');
        }
      }
      SC.auditionLog(`${judge.name}のリアクション → ${u.name} Me-${dmg}${isBoost ? '（強化・' + SC.ATTR_LABEL[judge.attr] + 'DOWN付与）' : ''}（残 ${u.mental}）`,
        u.isPlayer ? 'dmg' : '');
      // FX: 口撃ダメージ（プレイヤー被弾は目立たせる=cls側）→ v0.25.20: wait後の着弾グループで同時表示
      impactFx.push({ type: 'float', target: 'unit:' + u.key, text: '-' + dmg,
        cls: u.isPlayer ? 'reaction-me' : 'reaction', duration: u.isPlayer ? 500 : 300, parallel: true });
      if (u.mental <= 0 && !u.out) {
        u.out = true;
        SC.auditionLog(`💔 ${u.name}はメンタルが尽きて脱落！`, 'bad');
        impactFx.push({ type: 'banner', text: u.name + ' 脱落……', cls: 'out', duration: 800 });
      }
    }
  });
  // v0.25.20: 弾の飛行時間ぶん待ってから着弾shock+ダメージ数字を同時表示（3WAY同時化）
  if (anyShot) SC.fxPush({ type: 'wait', duration: 320 });
  impactFx.forEach(function (ev) { SC.fxPush(ev); });
  if (impactFx.length) SC.fxPush({ type: 'wait', duration: 420 });   // 着弾の見せ場（次の審査員に進む前の間）
  SC.checkBattleEnd();
};

// v0.25.27: 現在保有中（習得済み・削除されていない）の全パッシブ定義を一覧表示用に列挙。
//   発動履歴（passiveHistory=発動済みイベントのみ）と異なり、条件未成立でまだ発動していないものも含む全件
SC.activePassiveDefs = function () {
  const opened = SC.state.panelOpened || [];
  const removed = SC.state.passiveRemoved || [];
  const list = [];
  opened.forEach(function (key) {
    if (removed.indexOf(key) >= 0) return;
    const p = SC.CONFIG.panel[key];
    // 仮データpassive用のマーカーパネル（holder='p'/数値=別の持ち主を指す）は除外。
    // v0.25.28: 実カード由来の動的パネル（cp_*）は holder=自分自身のkey なので除外しない
    //   （v0.25.27は holder!==undefined で全除外しており、実プレイで一覧が常に空だったバグ）
    if (!p || p.type !== 'passive' || (p.holder !== undefined && p.holder !== key)) return;
    list.push({ key: key, name: p.name || 'パッシブ', cond: p._rawCond || '', prob: p._rawProb || '', max: p._rawMax || '' });
  });
  return list;
};

// ---- v0.25.42: パッシブの表示用データ（本編・シミュ共通。HTML は ui.js の SC.passiveIconHtml / SC.passiveRowHtml / SC.passivePopHtml が作る） ----
// 表示用の定義 d = { key, name, owner(持ち主の短縮名), effect(効果文), cond, prob, max(原文の[条件][確率][最大]), buffAttrs(バフ属性＝アイコンの配色用。バフ以外=[]) }。
//   本編: SC.firedPassiveDefs()（このターンに発動したもの）／シミュ: SC.simFiredPassiveDefs()（sim.js の保有パッシブ定義＋効果文）。
//   効果文（パネル定義 pd = SC.CONFIG.panel[key] から。例「Vocal+90%[1T]」「思い出ゲージ+25%」「Vocal+90%[1T] / 思い出ゲージ+25%」。[T]は発動したターンのみ有効＝passiveEffectTurns）
//   （v0.25.40 で sim.js に作った SC.simPassiveEffectText をここへ移した。simPassiveEffectText は同じ関数を呼ぶだけ）
SC.passiveEffectText = function (pd) {
  if (!pd) return '';
  const T = SC.CONFIG.audition.passiveEffectTurns;
  const AL = { vo: 'Vocal', da: 'Dance', vi: 'Visual' };
  const parts = [];
  const attrs = (pd._buffAttrs && pd._buffAttrs.length > 0) ? pd._buffAttrs : (pd._buffAttr ? [pd._buffAttr] : []);
  if (attrs.length > 0 && typeof pd._buffPct === 'number') parts.push(attrs.map(function (a) { return AL[a] || a; }).join('&') + '+' + pd._buffPct + '%[' + T + 'T]');
  // v0.25.47: 思い出ゲージは「発動時に」なら発動したターン、無ければ次のターンに上がる（表記で区別）。バフ型・回復型に付いたゲージ分（_memGaugeAdd）も出す
  const gNext = pd._memGaugeNow ? '' : '（次ターン）';
  if (pd._memGaugePct !== undefined) parts.push('思い出ゲージ+' + pd._memGaugePct + '%' + gNext);
  if (pd._healPct !== undefined) parts.push('メンタル' + pd._healPct + '%回復');
  if (pd._memGaugeAdd !== undefined) parts.push('思い出ゲージ+' + pd._memGaugeAdd + '%' + gNext);
  if (pd._cutPct !== undefined) parts.push('メンタルダメージ' + pd._cutPct + '%CUT[' + T + 'T]');
  if (pd._avoidPct !== undefined) parts.push('リアクション回避率+' + pd._avoidPct + '%[' + T + 'T]');
  if (pd._attnPct !== undefined) parts.push('注目度' + (pd._attnPct >= 0 ? '+' : '') + pd._attnPct + '%[' + T + 'T]');   // v0.25.43: 注目度も発動したターンのみ有効（他のパッシブ効果と同じ [1T] 表記）
  return parts.join(' / ');
};
// パッシブの持ち主（そのパネルが付随するカードのアイドル）の短縮名。key=動的パネルkey cp_{p|s0..s3|guest}_n（パネルの owner='p'/0〜3/'guest'）または仮データの 'p' / サポ番号。
//   「適用済みの編成」（SC.IDOL / SC.SUPPORTS / SC.GUEST の _idolNo。SC.applyLoadout が設定）から引く。持ち主が分からなければ ''。
//   （シミュの SC.simPassiveOwnerName は「入力の編成」から引く別経路。適用済みの編成と入力が一致している時は同じ名前になる）
SC.passiveOwnerName = function (key) {
  const pd = SC.CONFIG.panel[key];
  const owner = (pd && pd.owner !== undefined) ? pd.owner : key;
  let no;
  if (owner === 'p') no = SC.IDOL && SC.IDOL._idolNo;
  else if (owner === 'guest') no = SC.GUEST && SC.GUEST._idolNo;
  else if (typeof owner === 'number') no = SC.SUPPORTS && SC.SUPPORTS[owner] && SC.SUPPORTS[owner]._idolNo;
  return SC.idolShortName ? SC.idolShortName(no) : '';
};
// 発動したパッシブ1件の表示用定義。key=パネルkey（仮データのパッシブは 'p' / サポ番号）、base=発動履歴の1件など { name, desc, attrs }（パネル定義が無い仮データの補い）
SC.passiveViewDef = function (key, base) {
  base = base || {};
  const pd = SC.CONFIG.panel[key];
  const isPanel = !!(pd && pd.type === 'passive');
  const pAttrs = isPanel ? ((pd._buffAttrs && pd._buffAttrs.length > 0) ? pd._buffAttrs : (pd._buffAttr ? [pd._buffAttr] : [])) : [];
  return {
    key: key,
    name: base.name || (pd && pd.name) || 'パッシブ',
    owner: SC.passiveOwnerName(key),
    effect: isPanel ? SC.passiveEffectText(pd) : (base.desc || ''),
    cond: isPanel ? (pd._rawCond || '') : '',
    prob: isPanel ? (pd._rawProb || '') : '',
    max: isPanel ? (pd._rawMax || '') : '',
    // バフ属性（アイコンの色）: パネル定義（_buffAttrs。バフ以外=なし）／無ければ発動履歴に載せた属性（仮データのパッシブ。v0.25.41）
    buffAttrs: (isPanel && pAttrs.length > 0 && isFinite(Number(pd._buffPct))) ? pAttrs.slice() : (Array.isArray(base.attrs) ? base.attrs.slice() : [])
  };
};
// このターンに発動したパッシブ（＝発動中。パッシブの効果は発動したターンのみ有効 passiveEffectTurns=1）の表示用定義を発動順に返す。
//   発動履歴（a.passiveHistory。新しい順・最大件数=SC.passiveMaxPerTurn()）のうち今ターン（turn===a.turn）のもの。保有しているだけで発動していないパッシブは含めない
SC.firedPassiveDefs = function () {
  const a = SC.state && SC.state.audition;
  if (!a) return [];
  return (a.passiveHistory || []).filter(function (h) { return h.turn === a.turn; }).slice().reverse().map(function (h) {
    return SC.passiveViewDef(h.key, { name: h.name, desc: h.desc, attrs: h.attrs });
  });
};

// ---- v0.25.43: ステータス効果（自ユニット）／審査員の状態の表示用リスト（本編・シミュ共通。HTML は ui.js の SC.effectPopHtml が作る。二重実装しない） ----
// 戻り値の要素: { kind, label, value, turnsLeft, src, tone }
//   kind: 'buff'(属性バフ/デバフ)・'status'(名前付き状態効果)・'attn'(注目度)・'interest'・'influence'・'charm'・'react'(リアクション強化/応援)
//   turnsLeft: このターンを「含む」残りターン数＝ untilTurn − 現在ターン + 1（「残り1ターン」＝今ターンで切れる。効果の持続は untilTurn = 付与ターン + N − 1 なので、[3ターン]の札を使った次のターンは「残り2ターン」）。期限なし（未設定・9999）は null
//   src: 由来（ライブスキルの札名・「Vo審査員のリアクション」など）。分からなければ ''
//   tone: 'good'(プレイヤーに有利)／'bad'(不利)／'neutral'（色分け用）
SC._effTurnsLeft = function (until) {
  const a = SC.state && SC.state.audition;
  if (!a || until === undefined || until === null || !isFinite(until) || until >= 9999) return null;
  return Math.max(1, until - a.turn + 1);
};
SC._effSigned = function (v) {   // +50% / −30%（浮動小数の揺れを丸める）
  const n = Number(Math.abs(v).toFixed(2));
  return (v < 0 ? '−' : '+') + n + '%';
};
// 名前付き状態効果（a.statuses）の表示定義。この順に並べる。注目度 'attn' は別枠（UP/DOWN で名前が変わる）
SC._STATUS_VIEW = [
  { key: 'relax', label: 'リラックス', val: function (e) { return Number(e.pct) + '%'; }, tone: 'good' },
  { key: 'passProb', label: 'パッシブスキル発動率UP', val: function (e) { return SC._effSigned(e.pct); }, tone: 'good' },
  { key: 'passBoost', label: 'パッシブスキル強化', val: function (e) { return Number(e.pct) + '%'; }, tone: 'good' },
  { key: 'melancholySelf', label: 'メランコリー', val: function (e) { return Number(e.pct) + '%'; }, tone: 'bad' },
  { key: 'resurrection', label: 'リザレクション', val: function (e) { return Number(e.pct) + '%'; }, tone: 'good' },
  { key: 'hitomi', label: '瞳の輝き', val: function () { return ''; }, tone: 'good' },
  { key: 'dmgCut', label: 'メンタルダメージCUT', val: function (e) { return Number(e.pct) + '%'; }, tone: 'good' },
  { key: 'avoid', label: 'リアクション回避率UP', val: function (e) { return SC._effSigned(e.pct); }, tone: 'good' },
  { key: 'apUp', label: function (e) { return (e.person || '') + 'のアピール倍率UP'; }, val: function (e) { return '+' + Number(Number(e.pct).toFixed(2)); }, tone: 'good' }
];
// 自ユニットに付いているステータス効果。ライブスキル・思い出・審査員リアクション由来だけ（パッシブ由来は出さない＝左下のパッシブ枠で見る）:
//   属性バフ/デバフ（unit.debuffs のうち src≠'passive' の期限内）・名前付き状態効果（a.statuses のうち passive≠true の有効中。使用済み 'used' のリザレクションは出ない）・注目度UP/DOWN（'attn'）。
//   unit 省略=自ユニット。ライバルを渡した場合は debuffs とメランコリー（u.melancholy）だけ（状態効果は自ユニットのもの）
SC.unitEffectList = function (unit) {
  const a = SC.state && SC.state.audition;
  if (!a) return [];
  unit = unit || a.units[0];
  const list = [];
  const AL = { vo: 'Vocal', da: 'Dance', vi: 'Visual' };
  const order = ['vo', 'da', 'vi'];
  // ① 属性バフ/デバフ（属性順 Vo→Da→Vi・同じ属性内は付与順）
  const bufs = (unit.debuffs || []).filter(function (d) {
    return d.src !== 'passive' && d.untilTurn >= a.turn && isFinite(d.pct) && d.pct !== 0;
  });
  order.concat(bufs.map(function (d) { return d.attr; }).filter(function (x) { return order.indexOf(x) < 0; })).forEach(function (attr, i, arr) {
    if (arr.indexOf(attr) !== i) return;
    bufs.filter(function (d) { return d.attr === attr; }).forEach(function (d) {
      list.push({ kind: 'buff', label: AL[attr] || String(attr), value: SC._effSigned(d.pct), turnsLeft: SC._effTurnsLeft(d.untilTurn), src: d.src || '', tone: d.pct > 0 ? 'good' : 'bad' });
    });
  });
  // ② 名前付き状態効果（自ユニットのみ）／ライバルのメランコリー
  if (unit.isPlayer) {
    SC._STATUS_VIEW.forEach(function (v) {
      SC.activeStatuses(v.key).filter(function (e) { return !e.passive; }).forEach(function (e) {
        list.push({ kind: 'status', label: typeof v.label === 'function' ? v.label(e) : v.label, value: v.val(e), turnsLeft: SC._effTurnsLeft(e.untilTurn), src: e.src || '', tone: v.tone });
      });
    });
    // ③ 注目度UP/DOWN（付与順）
    SC.activeStatuses('attn').filter(function (e) { return !e.passive && e.pct !== 0; }).forEach(function (e) {
      list.push({ kind: 'attn', label: e.pct > 0 ? '注目度UP' : '注目度DOWN', value: SC._effSigned(e.pct), turnsLeft: SC._effTurnsLeft(e.untilTurn), src: e.src || '', tone: 'neutral' });
    });
  } else {
    (unit.melancholy || []).filter(function (e) { return e.untilTurn >= a.turn; }).forEach(function (e) {
      list.push({ kind: 'status', label: 'メランコリー', value: Number(e.pct) + '%', turnsLeft: SC._effTurnsLeft(e.untilTurn), src: e.src || '', tone: 'bad' });
    });
  }
  return list;
};
// 審査員に付いている効果（実装済みのもの）: 興味UP/DOWN（judge.interests。倍率の総乗は SC.interestMult）・影響力UP/DOWN（judge.influencePct。加算・期限なし）・魅了（charmUntil）・
//   このターンのリアクション強化（4の倍数ターン。SC.CONFIG.audition.judge.reactEvery）／応援（No.1特殊ルールの偶数ターン）。judgeReaction と同じ判定（魅了中はリアクションしないので強化・応援は出さない）。
//   熱狂などゲームに無い効果は出さない。※興味UP/DOWN・影響力は現状ゲーム内に付与する処理が無く（効果文の「興味0.5倍[2ターン]」等は未パース）、データ上に入った時だけ出る
SC.judgeEffectList = function (judge) {
  const a = SC.state && SC.state.audition;
  if (!a || !judge) return [];
  const list = [];
  const AL = { vo: 'Vocal', da: 'Dance', vi: 'Visual' };
  (judge.interests || []).forEach(function (ef) {
    if (!(ef.until >= a.turn) || !isFinite(ef.mult) || ef.mult === 1) return;
    list.push({ kind: 'interest', label: ef.mult > 1 ? '興味UP' : '興味DOWN', value: '×' + Number(ef.mult.toFixed(3)), turnsLeft: SC._effTurnsLeft(ef.until), src: ef.src || '', tone: ef.mult > 1 ? 'good' : 'bad' });
  });
  if (isFinite(judge.influencePct) && judge.influencePct !== 0) {
    list.push({ kind: 'influence', label: judge.influencePct > 0 ? '影響力UP' : '影響力DOWN', value: SC._effSigned(judge.influencePct), turnsLeft: SC._effTurnsLeft(judge.influenceUntil), src: '', tone: judge.influencePct > 0 ? 'bad' : 'good' });
  }
  const charmed = judge.charmUntil !== undefined && judge.charmUntil >= a.turn;
  if (charmed) {
    list.push({ kind: 'charm', label: '魅了', value: 'リアクション停止', turnsLeft: SC._effTurnsLeft(judge.charmUntil), src: '', tone: 'good' });
  } else if (!judge.gone && a.def) {
    const J = SC.CONFIG.audition.judge;
    if (a.def.special === 'no1' && a.turn % 2 === 0) {
      list.push({ kind: 'react', label: '応援', value: (AL[judge.attr] || judge.attr) + ' +100%[' + J.reactDebuffTurns + 'T]', turnsLeft: 1, src: 'このターンのリアクション', tone: 'good' });
    } else if (a.turn % J.reactEvery === 0) {
      const debuffPct = a.def.reactDebuff !== undefined ? a.def.reactDebuff : J.reactDebuff;
      list.push({ kind: 'react', label: 'リアクション強化', value: (a.def.reactZeroDmg ? 'Meダメージなし' : 'Meダメージ×' + J.reactBoost) + ' / ' + (AL[judge.attr] || judge.attr) + ' −' + debuffPct + '%[' + J.reactDebuffTurns + 'T]', turnsLeft: 1, src: J.reactEvery + 'ターンごと', tone: 'bad' });
    }
  }
  return list;
};

// ---- 終了判定 ----
SC.checkBattleEnd = function () {
  const a = SC.state.audition;
  if (a.finished) return true;
  const player = a.units[0];
  if (player.out) { SC.finishAudition('mentalBreak'); return true; }
  const rivalsAlive = a.units.some(function (u) { return !u.isPlayer && !u.out; });
  if (!rivalsAlive) { SC.finishAudition('lastStanding'); return true; }
  if (SC.aliveJudges().length === 0) { SC.finishAudition('complete'); return true; }
  return false;
};

// reason: 'complete' | 'mentalBreak' | 'lastStanding'
SC.finishAudition = function (reason) {
  const a = SC.state.audition;
  const st = SC.state;
  const def = a.def;

  // パーフェクトライブ: 1ターンで全審査員（3人）を自分のトドメで同時満足（v0.22: ★ボーナスなし。★上限=90で統一）
  // ユーザー実機観察: PL達成でも★+9は存在しない。wiki「99」は特別オデ限定の可能性（SPECに記録のみ）
  if (reason === 'complete' && a.goneThisTurn.length === 3 &&
      a.goneThisTurn.every(function (g) { return g.by === 'player'; })) {
    SC.auditionLog('🌟 パーフェクトライブ達成！', 'good');
    a.perfectLive = true;
  }

  // 順位: ★数 → プレイヤー優先（wiki: 同数ならプレイヤー通過） → 与興味合計[推測]
  const sorted = a.units.slice().sort(function (x, y) {
    return (y.stars - x.stars) ||
      ((y.isPlayer ? 1 : 0) - (x.isPlayer ? 1 : 0)) ||
      (a.totalDealt[y.key] - a.totalDealt[x.key]);
  });
  let rank = sorted.findIndex(function (u) { return u.isPlayer; }) + 1;
  if (reason === 'mentalBreak') rank = a.units.length;
  if (reason === 'lastStanding') rank = 1;
  const passed = reason !== 'mentalBreak' && rank <= a.passRank;

  // ---- オーディションマスタリー（1位通過時・全サポ+ゲストを加算）[仮データ] ----
  // raw「オーディションで1位を取ると◯◯+<Lv*N>」。v0.25.17: SPに加えMe/Vo/Da/Viにも対応
  // rawの <Lv*N> はレアリティ別MAX（UR=15/SSR=10/SR=7/R=4）で計算
  const audMastery = { sp: 0, me: 0, vo: 0, da: 0, vi: 0 };
  if (rank === 1 && passed && SC.parseSupportSkillValue) {
    const pool = SC.SUPPORTS.concat(SC.GUEST ? [SC.GUEST] : []);
    pool.forEach(function (sup) {
      if (!sup || !sup.supportSkills) return;
      sup.supportSkills.forEach(function (sk) {
        const m = sk.name && sk.name.match(/^オーディションマスタリー(SP|Me|Vo|Da|Vi)$/);   // 種別限定（ユニット/レッスン系マスタリーは別トリガー）
        if (!m) return;
        audMastery[m[1].toLowerCase()] += SC.parseSupportSkillValue(sk.raw, sup.rarity, sk.maxLv || null);
      });
    });
    if (audMastery.sp > 0) st.sp += audMastery.sp;
    if (audMastery.me > 0) SC.addStat('me', audMastery.me);
    ['vo', 'da', 'vi'].forEach(function (at) { if (audMastery[at] > 0) SC.addStat(at, audMastery[at]); });
  }

  // 報酬
  const rewards = [];
  if (audMastery.sp > 0) rewards.push(`🔸オーディションマスタリーSP発動（SP +${audMastery.sp}）`);
  ['me', 'vo', 'da', 'vi'].forEach(function (at) {
    if (audMastery[at] > 0) rewards.push(`🔸オーディションマスタリー${at === 'me' ? 'Me' : SC.ATTR_LABEL[at]}発動（+${audMastery[at]}）`);
  });
  if (passed) {
    st.fans += def.fans;
    rewards.push(`ファン +${SC.fmt(def.fans)}人`);
    if (def.finalsReward) {
      SC.ATTRS.forEach(function (at) { SC.addStat(at, def.finalsReward.stat); });
      SC.addStat('me', def.finalsReward.stat);
      st.sp += def.finalsReward.sp;
      rewards.push(`Vo/Da/Vi/Me +${def.finalsReward.stat} ／ SP +${def.finalsReward.sp}`);
    } else if (def.statReward) {
      // Vo/Da/Viのうち2つ+base、ランダムな1つ+base×2（wiki）
      const doubled = SC.pick(SC.ATTRS);
      const dblVal = def.statRewardDouble || def.statReward * 2;
      SC.ATTRS.forEach(function (at) {
        const v = at === doubled ? dblVal : def.statReward;
        SC.addStat(at, v);
        rewards.push(`${SC.ATTR_LABEL[at]} +${v}`);
      });
    }
    if (def.limited && st.limitedCleared.indexOf(def.id) < 0) st.limitedCleared.push(def.id);
  }

  a.finished = true;
  // v0.17: 結果発表演出用フラグ初期化（v0.25.3: revealFinal=1位メダル+合格帯ステージ追加）
  a.revealIdx = 0;
  a.revealDone = false;
  a.revealFinal = false;
  a.revealCommDone = false;   // v0.25.3 P6: 発表前の審査員コミュ
  a.result = {
    reason: reason, rank: rank, passed: passed, rewards: rewards,
    units: sorted.map(function (u) {
      return { name: u.name, stars: u.stars, total: Math.round(a.totalDealt[u.key]), isPlayer: u.isPlayer, out: u.out };
    })
  };
};

// ---- 結果を閉じる ----
SC.closeAudition = function () {
  const st = SC.state;
  const a = st.audition;
  if (!a || !a.finished) return;
  const r = a.result;
  const def = a.def;
  st.audition = null;

  if (def.season === 'semi') {
    if (r.passed) {
      st.finalsStage = 'final';
      st.trend = SC.TREND_PATTERNS[st.finalsTrends[1]].slice();
      st.lastResult = { title: '準決勝突破！', lines: ['いよいよ決勝！'], ok: true };
      st.screen = 'home';   // v0.25.12: 本戦前も通常ホームへ（緊迫BGM+特別吹き出し。ユーザー指定）
    } else {
      // コンティニューチケットがあれば継続確認へ
      if (st.continueTickets > 0) {
        st.pendingLoss = { stage: def.season };
        st.screen = 'continueAsk';
      } else {
        SC.setEnding('loseSemi');
      }
    }
    return;
  }
  if (def.season === 'final') {
    if (r.passed) {
      SC.setEnding('champion');
    } else {
      // コンティニューチケットがあれば継続確認へ
      if (st.continueTickets > 0) {
        st.pendingLoss = { stage: def.season };
        st.screen = 'continueAsk';
      } else {
        SC.setEnding('loseFinal');
      }
    }
    return;
  }
  SC.afterAction(true);   // 通常オデ: 結果表示済みなので週結果スキップ
};

// ---- 出場可否 ----
SC.auditionAvailable = function (def) {
  const st = SC.state;
  if (def.noBeginner && st.mode === 0) return { ok: false, reason: 'ビギナー選択不可' };
  if (def.limited && st.limitedCleared.indexOf(def.id) >= 0) return { ok: false, reason: 'クリア済み（1回限定）' };
  const u = def.unlock;
  if (!u) return { ok: true };
  if (u.event && !st.eventWeek) return { ok: false, reason: '強化週間イベント中のみ' };
  if (u.rank && SC.rankIndex(SC.rankOf(st.fans)) < SC.rankIndex(u.rank)) {
    return { ok: false, reason: `アイドルランク${u.rank}以上（ファン${SC.fmt(SC.CONFIG.ranks[SC.rankIndex(u.rank)].fans)}人）` };
  }
  if (u.memLv && SC.memoryLv() < u.memLv) return { ok: false, reason: `思い出Lv${u.memLv}以上` };
  if (u.mental && st.mental < u.mental) return { ok: false, reason: `メンタル${u.mental}以上` };
  if (u.kizunaRed) {
    const reds = st.kizuna.filter(function (k) { return k >= 75; }).length;
    if (reds < u.kizunaRed) return { ok: false, reason: `絆赤ゲージ${u.kizunaRed}人以上` };
  }
  return { ok: true };
};

// ---- コンティニュー ----
// チケットを1枚消費して同じステージに再挑戦
SC.useContinue = function () {
  const st = SC.state;
  if (!st.pendingLoss || st.continueTickets <= 0) return;
  st.continueTickets--;
  st.finalsStage = st.pendingLoss.stage;   // 同じステージに再挑戦
  st.pendingLoss = null;
  st.lastResult = null;
  st.screen = 'home';   // v0.25.12: 本戦前も通常ホームへ
};

// ---- クイックスキル（WING編対象外・ユーザー確認2026-07-04） ----
// WING編ではクイックスキルは使用不可のため発動しない。
// 既習得セーブとの後方互換のため関数定義は残す（呼ばれてもnoop）。
SC.execQuickSkill = function (panelKey) {
  // WING編ではクイックスキル使用不可のためnoop
  void panelKey;
};

// コンティニューを断ってエンディングへ
SC.declineContinue = function () {
  const st = SC.state;
  if (!st.pendingLoss) return;
  const stage = st.pendingLoss.stage;
  st.pendingLoss = null;
  SC.setEnding(stage === 'semi' ? 'loseSemi' : 'loseFinal');
};
