// 編成ロードアウト管理（applyLoadout / 保存・復元）
// loadout = { p: cardId|null, supports: [cardId|null ×4], guest: cardId|null }
window.SC = window.SC || {};

SC.LOADOUT_KEY = 'sc_wing_loadout_v1';

// レアリティ別のデフォルト絆初期値 [仮データ]
SC.KIZUNA_DEFAULTS = { UR: 20, SSR: 15, SR: 10, R: 5 };

// レアリティ別のデフォルトスキル倍率 [仮データ]
SC.SKILL_MULT_DEFAULTS = { SSR: 2.5, SR: 2.0, R: 1.5, UR: 3.0 };

// カードIDからSC.CARDS.cardsを検索して返す。見つからなければnull
SC.findCard = function (cardId) {
  if (!cardId || !SC.CARDS) return null;
  return SC.CARDS.cards.find(function (c) { return c.id === cardId; }) || null;
};

// カードのステータスを取得（最大Lvの値。levelsが空ならstatsを、それもnullなら既存仮データのstats相当のnullを返す）
SC.cardStats = function (card) {
  if (!card) return null;
  // levelsが存在する場合は最終行を使用
  if (card.levels && card.levels.length > 0) {
    const last = card.levels[card.levels.length - 1];
    return { vo: last.vo, da: last.da, vi: last.vi, me: last.me };
  }
  // levelsが空でstatsがある場合
  if (card.stats) {
    return { vo: card.stats.vo, da: card.stats.da, vi: card.stats.vi, me: card.stats.me };
  }
  return null;
};

// v0.25.9: 現編成（P+サポ+ゲスト）の所属ユニット種類数（「所属ユニットがN種類以上」条件用）
SC.countLoadoutUnitKinds = function () {
  const units = new Set();
  const findUnit = function (idolNo) {
    if (!idolNo || !SC.UNIT_MEMBERS) return null;
    for (const u in SC.UNIT_MEMBERS) {
      if (SC.UNIT_MEMBERS[u].indexOf(idolNo) >= 0) return u;
    }
    return null;
  };
  const nos = [SC.IDOL && SC.IDOL._idolNo];
  (SC.SUPPORTS || []).forEach(function (s) { if (s) nos.push(s.idolNo || s._idolNo); });
  // v0.25.13: ゲストはカウントしない（ユーザー確認仕様: 参加者=P+サポのみ）
  nos.forEach(function (no) {
    const u = findUnit(no);
    if (u) units.add(u);
  });
  return units.size;
};

// Sカードのattr（vo/da/vi のうち最大ステ属性）を判定する
SC.cardAttr = function (stats) {
  if (!stats) return 'vo';
  let best = 'vo', bestV = stats.vo;
  if (stats.da > bestV) { best = 'da'; bestV = stats.da; }
  if (stats.vi > bestV) { best = 'vi'; }
  return best;
};

// v0.25.35: カードのランダム効果付与の候補（tools/convert_cards.js が MD の「ランダム効果付与」表から出力する
//   card.randomEffects ＝ ['Vocal40%UP[4ターン]', ...]）を返す。スキルごとに候補表が分かれているカード（Find M Trick 等。
//   card.randomEffectsBySkill ＝ { スキル名: [...] }）はスキル名で引く。無ければ null（その札はランダム効果を何もしない）
SC.cardRandomEffects = function (card, skillName) {
  if (!card) return null;
  const by = card.randomEffectsBySkill;
  if (by && skillName && by[skillName] && by[skillName].length > 0) return by[skillName].slice();
  if (card.randomEffects && card.randomEffects.length > 0) return card.randomEffects.slice();
  return null;
};

// v0.25.37: Pカードの思い出アピールの Lv（1〜）に対応する1行 { name, effect, linkEffect, effectParsed } を返す。無ければ null。
//   card.memoryAppeal.levels は通常 Lv1〜5(UR は6) の1表だが、同じ家族ページの R/SR/SSR の表が連結されたカード（アイドルロード／白いツバサ等 56枚。
//   Lv1 から始まる表が複数並ぶ）と、表末の区切り行（「思い出アピールリンク条件」＝effectParsed が null）がある。
//   区切り行を除き Lv1 ごとに表へ分け、複数あるときはカードのレアリティに対応する表（SSR=末尾・SR=その1つ前・R=2つ前）を使う [推測: 表の並びは R→SR→SSR]
SC.memoryAppealLevel = function (card, lv) {
  const ma = card && card.memoryAppeal;
  if (!ma || !Array.isArray(ma.levels) || !(lv >= 1)) return null;
  const runs = [];
  ma.levels.forEach(function (row) {
    const ep = row && row.effectParsed;
    if (!ep || ep.kind !== 'memoryAppeal') return;
    if (ep.lv === 1 || runs.length === 0) runs.push([]);
    runs[runs.length - 1].push(row);
  });
  if (runs.length === 0) return null;
  const back = { SSR: 0, UR: 0, SR: 1, R: 2 }[card.rarity];
  const run = runs[Math.max(0, runs.length - 1 - (back === undefined ? 0 : back))];
  return run.filter(function (row) { return row.effectParsed.lv === lv; })[0] || null;
};

// Sカードのライブスキルを構築する
// liveSkill.effectParsed が kind:'appeal' なら { name, attr: attrs[0], mult } [簡略化: 複合属性は先頭のみ]
// それ以外・null なら レア別デフォルト倍率を使用 [仮データ]
SC.cardLiveSkill = function (card, attr) {
  const ls = card.liveSkill;
  if (ls && ls.effectParsed && ls.effectParsed.kind === 'appeal') {
    const ep = ls.effectParsed;
    const skillAttr = (ep.attrs && ep.attrs.length > 0) ? ep.attrs[0] : attr;
    // v0.24: allAudience/extra を保全（サポ札が全体アピールの場合に allJudges まで届くよう）
    const sk = { name: ls.name, attr: skillAttr, mult: ep.mult };
    // v0.25.7: 複合属性アピール（Vocal & Dance等）はattrs配列も保全（Excellent判定・ステ選択用）
    if (ep.attrs && ep.attrs.length > 1) sk.attrs = ep.attrs;
    if (ep.allAudience === true) sk.allJudges = true;
    if (ls.extra && ls.extra.length > 0) sk.extra = ls.extra;
    // v0.24.1: MD原文の効果文を表示用に保全（「全観客に」等を省略しない）
    sk.effectRaw = [ls.effect].concat(ls.extra || []).filter(Boolean).join('/');
    // v0.25.40: 本体が「最大N倍アピール[tag]」（ep.maxCond）なら倍率変動アピール（max×f）。タグは効果文から（SC.varAppealMainTag）。convert_cards.js は kind:'appeal'＋maxCond:true で出す
    if (ep.maxCond) sk.appealVar = { min: ep.mult * 0.2, max: ep.mult, ref: 'tag', tag: SC.varAppealMainTag(ls.effect) };   // min は旧形式との互換（未使用）
    // v0.25.35: ランダム効果付与の候補（効果文に「ランダム効果N個付与」があるスキルが使う。無ければ付けない）
    const reA = SC.cardRandomEffects(card, ls.name);
    if (reA) sk.randomEffects = reA;
    return sk;
  }
  // appealVar: 可変倍率アピール
  if (ls && ls.effectParsed && ls.effectParsed.kind === 'appealVar') {
    const ep = ls.effectParsed;
    const skillAttr = (ep.attrs && ep.attrs.length > 0) ? ep.attrs[0] : attr;
    const sk = {
      name: ls.name,
      attr: skillAttr,
      mult: ep.max,
      appealVar: { min: ep.min, max: ep.max, ref: ep.ref, tag: SC.varAppealMainTag(ls.effect) }   // v0.25.40: 駆動タグ（効果文の [..ほど効果UP]/[消去:..]）→ SC.varAppealResolve で max×f
    };
    if (ep.allAudience === true) sk.allJudges = true;
    if (ls.extra && ls.extra.length > 0) sk.extra = ls.extra;
    sk.effectRaw = [ls.effect].concat(ls.extra || []).filter(Boolean).join('/');   // v0.25.52: 効果文（必ず最初/最後に・[興味無視]・[魅了強化] の判定に使う。上の appeal 経路と同じ）
    const reB = SC.cardRandomEffects(card, ls.name);   // v0.25.35: ランダム効果付与の候補
    if (reB) sk.randomEffects = reB;
    return sk;
  }
  // liveSkillがない・kind が appeal 以外 → レア別仮データ [仮データ]
  const mult = SC.SKILL_MULT_DEFAULTS[card.rarity] || 2.0;
  const attrLabel = { vo: 'Vocal', da: 'Dance', vi: 'Visual' }[attr] || 'Vocal';
  return { name: `${attrLabel}${mult}倍アピール`, attr: attr, mult: mult }; // [仮データ]
};

// ロードアウト保存
SC.saveLoadout = function (loadout) {
  try { localStorage.setItem(SC.LOADOUT_KEY, JSON.stringify(loadout)); } catch (e) {}
};

// ロードアウト読み込み
SC.loadLoadout = function () {
  try {
    const raw = localStorage.getItem(SC.LOADOUT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
};

// ---- ロードアウト適用 ----
// loadout = { p: cardId|null, supports: [cardId|null ×4], guest: cardId|null }
// nullスロットは idol.js の既存仮データを維持（後方互換）
SC.applyLoadout = function (loadout) {
  if (!loadout) return;

  // --- Pカード適用 ---
  // 初期ステは50固定（ユーザー確認2026-07-03。Pデスク/マッチライブ由来の上昇は対象外）
  if (loadout.p) {
    const card = SC.findCard(loadout.p);
    if (card && card.type === 'P') {
      // v0.25.31: 表示名は自由入力が空なら「ゲスト」（従来はカードのアイドル名）。判定用の realName はカードの実名のまま
      SC.IDOL.name = (SC.customIdolName && SC.customIdolName()) || SC.DEFAULT_IDOL_NAME || 'ゲスト';
      // v0.25.18: 判定用の実名を分離保持（ユーザー指摘: 名前変更でPLUS等の条件判定が壊れないように）
      SC.IDOL.realName = card.idolName;
      SC.IDOL.unit = card.name;
      SC.IDOL.rarity = card.rarity;
      SC.IDOL.initial = { vo: 50, da: 50, vi: 50, me: 50, sp: 0 };
      SC.IDOL._idolNo = card.idolNo;   // v0.23: ユニット判定用
      SC.IDOL._hasRealCard = true; // v0.21: 実カード編成スロット識別フラグ
      SC.IDOL._cardId = card.id;   // v0.25.37: Pカードのid（思い出アピールの付随効果・LINK効果を引くため。SC.memoryExtraCard）
      // initialSkills は既存固定4枠のまま維持【wiki準拠】
    }
  } else {
    SC.IDOL._cardId = null;   // v0.25.37: Pが未指定なら実カードの思い出アピールなし（他の仮データは従来どおり維持）
  }

  // --- Sカード適用（サポート4枠）---
  if (Array.isArray(loadout.supports)) {
    for (let i = 0; i < 4; i++) {
      const cardId = loadout.supports[i];
      if (!cardId) {
        // nullスロット: 仮データ維持 + v0.23: _idolNoをクリア（ユニット全員判定で欠席扱い）
        if (SC.SUPPORTS[i]) { SC.SUPPORTS[i]._idolNo = undefined; SC.SUPPORTS[i]._hasRealCard = false; }
        continue;
      }
      const card = SC.findCard(cardId);
      if (!card || card.type !== 'S') continue;
      const stats = SC.cardStats(card);
      if (!stats) continue;
      const attr = SC.cardAttr(stats);
      const skill = SC.cardLiveSkill(card, attr);
      const kizuna = SC.KIZUNA_DEFAULTS[card.rarity] || 10; // [仮データ]
      // passiveはカード由来パッシブの本格接続は次フェーズ。既存仮データpassiveを維持するため上書きしない
      // kizunaBonusをアイドルの絆スキルから取得してSUPPORTSに保存[仮データ]
      let kizunaBonus = 0;
      if (card.supportSkills) {
        card.supportSkills.forEach(function (sk) {
          if (sk.name && sk.name.indexOf('アイドルの絆') >= 0 && SC.parseSupportSkillValue) {
            // レアリティ別Lv MAXで計算（UR=15/SSR=10/SR=7/R=4）、maxLvが取得できていれば優先
            kizunaBonus += SC.parseSupportSkillValue(sk.raw, card.rarity, sk.maxLv || null);
          }
        });
      }
      SC.SUPPORTS[i] = {
        name: `${card.name}（${card.idolName}）`,
        attr: attr,
        rarity: card.rarity || 'SSR', // レアリティ（体力サポート軽減%等に使用）
        stats: stats,
        skill: skill,
        kizuna: kizuna,
        kizunaBonus: kizunaBonus || 0, // [仮データ] アイドルの絆スキル補正
        supportSkills: card.supportSkills || [], // サポートスキルをそのまま保存
        passive: SC.SUPPORTS[i] ? SC.SUPPORTS[i].passive : null, // 既存passiveを維持
        _idolNo: card.idolNo,      // v0.23: ユニット判定用
        _idolName: card.idolName,  // v0.23: ツールチップ用
        _hasRealCard: true  // v0.21: 実カード編成スロット識別フラグ
      };
    }
  }

  // --- Sカード適用（ゲスト）---
  if (loadout.guest) {
    const card = SC.findCard(loadout.guest);
    if (card && card.type === 'S') {
      const stats = SC.cardStats(card);
      if (stats) {
        const attr = SC.cardAttr(stats);
        const kizuna = SC.KIZUNA_DEFAULTS[card.rarity] || 10; // [仮データ]
        // GUESTは skill/passive なし（idol.js既存参照）
        SC.GUEST = {
          name: `${card.name}（${card.idolName}）`,
          attr: attr,
          rarity: card.rarity || 'SSR',   // v0.25.18: 体力サポート軽減%等で参照（従来欠落）
          stats: stats,
          kizuna: kizuna,
          _idolName: card.idolName,
          _idolNo: card.idolNo,   // v0.25.42: パッシブの持ち主名（SC.passiveOwnerName）用。サポ枠（_idolNo）と同じ
          supportSkills: card.supportSkills || [] // サポートスキルをそのまま保存
        };
      }
    }
  }

  // 動的パネルを構築（loadout適用後）
  SC.buildLoadoutPanels(loadout);
};


// ---- v0.25.18: 条件文字列の共通パーサ（buffパネルのcond / extra内の[〜場合]条件節で共用） ----
// 戻り値: parsedCond（{t:...}）。パターン不一致ならnull（呼び出し側で未対応扱い）
SC.parseCondString = function (condRaw) {
  let parsedCond = null;
  // 正規化: セル内改行を除去・全角％→半角・全角数字→半角（v0.25.13: 表記ゆれ対応）
  // v0.25.28: wiki誤記「智世子」→園田智代子（人物条件2パネルが常に不成立だった）
  const cond = (condRaw || '').replace(/\n/g, '').replace(/％/g, '%')
    .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/智世子/g, '智代子');

  // 2026-10 カード更新対応: 複合条件「Nターン以降/以前」「メンタルN%以上/以下」＋後続条件 → AND（{t:'all'}）
  //   例: 「2ターン以前ノクチル全員がライブに参加している場合」（従来は先頭のターン条件だけ拾い後続を落としていた）
  //   後続が解釈不能（null）の場合は従来どおり先頭条件のみに落とす。
  //   ※旧データの同形式（例: 3ターン以降履歴に1ジャンル以下 等 約70パネル）も後続条件が評価されるようになる＝書かれた条件どおりの動作への是正
  // v0.25.38: 「メンタルN%以上M%以下」（範囲）= mentalAbove N かつ mentalBelow M（従来は下の mPre が「N%以上」だけを拾い、残りの「M%以下」を落としていた）
  {
    const mRange = cond.match(/^メンタル(\d+)%以上(\d+)%以下(.*)$/);
    if (mRange) {
      const listR = [{ t: 'mentalAbove', v: Number(mRange[1]) / 100 }, { t: 'mentalBelow', v: Number(mRange[2]) / 100 }];
      if (mRange[3] && !/^(?:の|である)?場合$/.test(mRange[3])) {
        const restR = SC.parseCondString(mRange[3]);
        if (restR) listR.push(restR);
      }
      return { t: 'all', list: listR };
    }
  }
  {
    const mPre = cond.match(/^(?:(\d+)ターン(以降|以前)|メンタル(\d+)%(以上|以下))(.+)$/);
    if (mPre && !/^(?:の|である)?場合$/.test(mPre[5])) {
      const restCond = SC.parseCondString(mPre[5]);
      if (restCond) {
        const head = mPre[1]
          ? { t: mPre[2] === '以降' ? 'turnMin' : 'turnMax', v: Number(mPre[1]) }
          : { t: mPre[4] === '以上' ? 'mentalAbove' : 'mentalBelow', v: Number(mPre[3]) / 100 };
        return { t: 'all', list: [head, restCond] };
      }
    }
  }

  const mTurn = cond.match(/(\d+)ターン以降/);
  const mTurnBefore = cond.match(/(\d+)ターン以前/);
  const mMental = cond.match(/メンタル(\d+)%以下/);
  const mMentalAbove = cond.match(/メンタル(\d+)%以上/);
  const mStarMin = cond.match(/スター(\d+)以上/);
  const mStarMax = cond.match(/スター(\d+)以下/);
  const mRank = cond.match(/^(\d+)位/);
  const mJudges = cond.match(/観客(\d+)以上/);
  const mJudgesMax = cond.match(/観客(\d+)以下/);
  const mHasBuffN = cond.match(/(Vocal|Dance|Visual)UPが(\d+)[個つ]以上付与/);
  const mHasBuff = !mHasBuffN && cond.match(/(Vocal|Dance|Visual)UPが付与されて(?:い)?る場合/);
  // 2026-10 カード更新対応: wiki表記ゆれ「ViDaViUP全て付与」（Vo→Vi誤記・「が」脱落。002_胸の奥に灯る_P-UR）も同条件として扱う
  const mHasAllN = cond.match(/(?:VoDaVi|ViDaVi|VocalDanceVisual)UP全て(?:が)?(\d+)個以上付与/);
  const mHasAll = !mHasAllN && /(?:VoDaVi|ViDaVi|VocalDanceVisual)UP全て(?:が)?付与/.test(cond);
  const mAttnUpN = cond.match(/注目度UPが(\d+)[個つ]以上付与/);
  const mAttnUp = !mAttnUpN && /注目度UPが付与/.test(cond);
  const mAttnDownN = cond.match(/注目度DOWNが(\d+)[個つ]以上付与/);
  const mAttnDown = !mAttnDownN && /注目度DOWNが付与/.test(cond);
  const mAvoidUpN = cond.match(/リアクション回避率UPが(\d+)[個つ]以上付与/);
  const mAvoidUp = !mAvoidUpN && /リアクション回避率UPが付与/.test(cond);
  const mUnitKinds = cond.match(/所属ユニットが(\d+)種類(以上|以下)/);
  // ==== v0.25.13: 状態効果・回数・生成・履歴系の条件（ユーザー確認: WINGで全て発生し得る） ====
  const mStPassAny = /パッシブスキル発動率UP(?:又は|)強化が付与/.test(cond);
  const mStPassProbN = !mStPassAny && cond.match(/パッシブスキル発動率UPが(\d+)[個つ]以上付与/);
  const mStPassProb = !mStPassAny && !mStPassProbN && /パッシブスキル発動率UPが付与/.test(cond);
  const mStPassBoostN = cond.match(/パッシブスキル強化が(\d+)[個つ]以上付与/);
  const mStPassBoost = !mStPassBoostN && !mStPassAny && /パッシブスキル強化が付与/.test(cond);
  const mStRelaxN = cond.match(/リラックスが(\d+)[個つ]以上付与/);
  const mStRelax = !mStRelaxN && /リラックスが付与/.test(cond);
  const mStHitomiN = cond.match(/瞳の輝きが(\d+)[個つ]以上付与/);
  const mStHitomi = !mStHitomiN && /瞳の輝きが付与/.test(cond);
  const mStMelan = /メランコリーが付与/.test(cond);
  const mStRes = /リザレクション効果が付与/.test(cond);
  const mStCharm = /魅了を観客に付与/.test(cond);
  const mStDamCut = /メンタルダメージCUTが付与/.test(cond);
  const mApUpPerson = cond.match(/^(.+?)のアピール倍率UPが付与/);
  const mGenerated = /ライブスキルが生成されている場合/.test(cond);
  const mMentalMax = cond.match(/最大メンタル(\d+)以上/);
  const mJudgesExact = cond.match(/^観客(\d+)$/);
  const mHealUnit = cond.match(/回復回数(\d+)回以上(?:(.+?)全員がライブに参加)?/);
  const mHistUnitN = cond.match(/履歴に(.+?)のアイドルが(\d+)人以上ある場合/);
  // ライブ参加者（P実名+サポ。ゲスト除く）に wantName（空白除去済み）が部分一致するか。mIdolLive/mNameOnly/mAnyLive で共用
  const liveNameHit = function (wantName) {
    const partNames = [(SC.IDOL.realName || SC.IDOL.name || '')].concat((SC.SUPPORTS || []).map(function (s) {
      return s ? (s._idolName || '') : '';
    })).map(function (n) { return n.replace(/\s/g, ''); }).filter(Boolean);
    return partNames.some(function (pn) {
      return pn.indexOf(wantName) >= 0 || wantName.indexOf(pn) >= 0;
    });
  };
  // 2026-10 カード更新対応: 「履歴にコメティックのアイドル3人以上又は西城 樹里がある場合」= ユニット人数条件 OR 人物履歴条件（{t:'any'}）
  const mHistUnitOr = cond.match(/^履歴に(.+?)のアイドル(?:が)?(\d+)人以上(?:ある場合|いる場合)?又は(.+?)(?:が)?ある場合$/);
  const mHistPersonCnt = cond.match(/履歴に(.+?)が(\d+)個以上ある場合/);
  // ユニット全員参加/編成（「A又はB全員が〜」のor形も）。ゲスト除くP+サポで判定（ユーザー確認仕様）
  const mUnitAllLive = cond.match(/^(?:(.+?)又は)?(.+?)全員が(?:ライブに参加|編成されている)/);
  // 「{ユニット}から{人物}のみがライブに参加」
  const mOnlyLive = cond.match(/^(.+?)から(.+?)のみがライブに参加/);
  const mIdolLive = cond.match(/^(.+?)(?:が)?ライブに参加している場合/);
  // 2026-10 カード更新対応: 「霧子、樹里、透いずれかがライブに参加している場合」= 列挙した人物のうち誰か1人でも参加（従来はmIdolLiveに誤吸収され常に不成立だった）
  const mAnyLive = cond.match(/^(.+?)いずれかが?ライブに参加している場合/);
  // 名前のみの短縮条件（「霧子」「透」等）= ライブ参加条件の略記（v0.25.13: 1文字名にも対応）
  const mNameOnly = !mIdolLive && /^[ぁ-んァ-ヶ一-龠々\s]{1,8}$/.test(cond) && cond.length >= 1;
  const mPosition = /ポジション担当|担当に編成|(?:Vocal|Dance|Visual)担当/.test(cond);
  // キーワード条件=グレフェス専用システム（ユーザー確認）→WINGでは発動しない
  const mKeyword = /^キーワード/.test(cond);
  // histGenre: 「履歴に1ジャンル以下又は3ジャンル以上」「履歴にNジャンル以下」「履歴にNジャンル以上」
  // 【wiki効果解説: 履歴にxジャンル以上(以下)】
  const mHistBoth = cond.match(/履歴に(\d+)ジャンル以下又は(\d+)ジャンル以上/);
  const mHistLe = !mHistBoth && cond.match(/履歴に(\d+)ジャンル以下/);
  const mHistGe = !mHistBoth && cond.match(/履歴に(\d+)ジャンル以上/);
  // v0.25.12: 「履歴に{人物}Nジャンル以上/以下」= その人物のスキルが履歴にある+履歴のジャンル数条件（ユーザー確認仕様）
  //   人物はサポート固有スキルのアピールも含む。例: 履歴に霧子1ジャンル以下
  const mHistPersonGenre = cond.match(/履歴に(.+?)(\d+)ジャンル(以上|以下)/);
  // 「履歴に{人物}がある場合」（、区切りで複数人物=全員必要[推測]）
  const mHistHas = !mHistPersonGenre && cond.match(/履歴に(.+?)がある場合/);
  // v0.25.34: ポジション担当（Leader/Center/Vocal・Dance・Visual担当）=グレフェス概念でWINGでは絶対に発動しない。
  //   他の条件パターンに先に吸われて別解釈にならないよう分岐の先頭で判定（wing:true=シミュの保有パッシブ一覧で「WINGでは発動しない」と注記する目印）
  if (mPosition) parsedCond = { t: 'never', wing: true };
  else if (mTurn) parsedCond = { t: 'turnMin', v: Number(mTurn[1]) };
  else if (mTurnBefore) parsedCond = { t: 'turnMax', v: Number(mTurnBefore[1]) };
  else if (mMental) parsedCond = { t: 'mentalBelow', v: Number(mMental[1]) / 100 };
  else if (mMentalAbove) parsedCond = { t: 'mentalAbove', v: Number(mMentalAbove[1]) / 100 };
  else if (mStarMin) parsedCond = { t: 'starMin', v: Number(mStarMin[1]) };
  else if (mStarMax) parsedCond = { t: 'starMax', v: Number(mStarMax[1]) };
  else if (mRank) parsedCond = { t: 'rank', v: Number(mRank[1]) };
  else if (mJudges) parsedCond = { t: 'judgesMin', v: Number(mJudges[1]) };
  else if (mJudgesMax) parsedCond = { t: 'judgesMax', v: Number(mJudgesMax[1]) };
  else if (mHasBuffN) parsedCond = { t: 'hasBuffN', attr: { Vocal: 'vo', Dance: 'da', Visual: 'vi' }[mHasBuffN[1]], n: Number(mHasBuffN[2]) };
  else if (mHasBuff) parsedCond = { t: 'hasBuff', attr: { Vocal: 'vo', Dance: 'da', Visual: 'vi' }[mHasBuff[1]] };
  else if (mHasAll) parsedCond = { t: 'hasAllBuffs' };
  else if (mAttnUpN) parsedCond = { t: 'hasAttnUpN', n: Number(mAttnUpN[1]) };
  else if (mAttnUp) parsedCond = { t: 'hasAttnUpN', n: 1 };
  else if (mAttnDownN) parsedCond = { t: 'hasAttnDownN', n: Number(mAttnDownN[1]) };
  else if (mAttnDown) parsedCond = { t: 'hasAttnDown' };
  else if (mAvoidUpN) parsedCond = { t: 'hasAvoidUpN', n: Number(mAvoidUpN[1]) };
  else if (mAvoidUp) parsedCond = { t: 'hasAvoidUp' };
  else if (mHasAllN) parsedCond = { t: 'hasAllBuffsN', n: Number(mHasAllN[1]) };
  else if (mUnitKinds) {
    // 編成のユニット種類数（P+サポ、ゲスト除く。ユーザー確認仕様）はビルド時点で確定。v0.25.13: 以下も対応
    const kinds = SC.countLoadoutUnitKinds ? SC.countLoadoutUnitKinds() : 0;
    const okKinds = mUnitKinds[2] === '以下' ? (kinds <= Number(mUnitKinds[1])) : (kinds >= Number(mUnitKinds[1]));
    parsedCond = okKinds ? { t: 'always' } : { t: 'never' };   // v0.25.17: null(未解析扱い)でなくalways
  }
  // ==== v0.25.13: 状態効果・回数・生成・履歴・参加者系 ====
  else if (mStPassAny) parsedCond = { t: 'hasStatusAny', ss: ['passProb', 'passBoost'] };
  else if (mStPassProbN) parsedCond = { t: 'hasStatus', s: 'passProb', n: Number(mStPassProbN[1]) };
  else if (mStPassProb) parsedCond = { t: 'hasStatus', s: 'passProb' };
  else if (mStPassBoostN) parsedCond = { t: 'hasStatus', s: 'passBoost', n: Number(mStPassBoostN[1]) };
  else if (mStPassBoost) parsedCond = { t: 'hasStatus', s: 'passBoost' };
  else if (mStRelaxN) parsedCond = { t: 'hasStatus', s: 'relax', n: Number(mStRelaxN[1]) };
  else if (mStRelax) parsedCond = { t: 'hasStatus', s: 'relax' };
  else if (mStHitomiN) parsedCond = { t: 'hasStatus', s: 'hitomi', n: Number(mStHitomiN[1]) };
  else if (mStHitomi) parsedCond = { t: 'hasStatus', s: 'hitomi' };
  else if (mStMelan) parsedCond = { t: 'hasStatus', s: 'melancholySelf' };
  else if (mStRes) parsedCond = { t: 'hasStatus', s: 'resurrection' };
  else if (mStCharm) parsedCond = { t: 'charmOnJudge' };
  else if (mStDamCut) parsedCond = { t: 'hasDamCut' };
  else if (mApUpPerson) parsedCond = { t: 'hasApUpPerson', person: mApUpPerson[1].replace(/\s/g, '') };
  else if (mGenerated) parsedCond = { t: 'hasGenerated' };
  else if (mMentalMax) parsedCond = { t: 'mentalMaxMin', v: Number(mMentalMax[1]) };
  else if (mJudgesExact) parsedCond = { t: 'judgesExact', v: Number(mJudgesExact[1]) };   // 「観客1」=審査員1名の時（ユーザー確認）
  else if (mHistUnitOr) parsedCond = { t: 'any', list: [
    { t: 'histUnitN', unit: mHistUnitOr[1].replace(/\s/g, ''), n: Number(mHistUnitOr[2]) },
    { t: 'histPerson', persons: mHistUnitOr[3].split(/[、,]/).map(function (s) { return s.replace(/\s/g, ''); }).filter(Boolean) }
  ] };
  else if (mHistUnitN) parsedCond = { t: 'histUnitN', unit: mHistUnitN[1].replace(/\s/g, ''), n: Number(mHistUnitN[2]) };
  else if (mHistPersonCnt) parsedCond = { t: 'histPersonN', person: mHistPersonCnt[1].replace(/\s/g, ''), n: Number(mHistPersonCnt[2]) };
  else if (mHealUnit) {
    // 回復回数N回以上（+任意でユニット全員参加の複合）。参加=P+サポ（ゲスト除く）ビルド時解決
    if (mHealUnit[2] && !(SC.unitAllInLoadout && SC.unitAllInLoadout(mHealUnit[2].replace(/\s/g, '')))) {
      parsedCond = { t: 'never' };
    } else {
      parsedCond = { t: 'healMin', v: Number(mHealUnit[1]) };
    }
  }
  else if (mOnlyLive) {
    // 「{ユニット}から{人物}のみがライブに参加」= 編成中のそのユニット所属者が指定人物1人だけ（ビルド時解決）
    parsedCond = (SC.unitOnlyInLoadout && SC.unitOnlyInLoadout(mOnlyLive[1].replace(/\s/g, ''), mOnlyLive[2].replace(/\s/g, ''))) ? { t: 'always' } : { t: 'never' };
  }
  else if (mUnitAllLive) {
    // 「(A又は)B全員がライブに参加/編成されている」= P+サポ（ゲスト除く）にユニット全員が揃っている（ビルド時解決）
    const unitsToCheck = [mUnitAllLive[1], mUnitAllLive[2]].filter(Boolean).map(function (s) { return s.replace(/\s/g, ''); });
    const okAny = unitsToCheck.some(function (u) { return SC.unitAllInLoadout && SC.unitAllInLoadout(u); });
    parsedCond = okAny ? { t: 'always' } : { t: 'never' };   // v0.25.17: 成立=alwaysとして登録（null=未解析はフォールバックに落ちるバグだった）
  }
  else if (mAnyLive) {
    // 2026-10 カード更新対応: 「A、B、Cいずれかがライブに参加している場合」= 列挙した誰か1人でも参加（P+サポ・ゲスト除く。ビルド時解決）
    const hitAny = mAnyLive[1].split(/[、,，]/).some(function (nm) {
      const w = nm.replace(/\s/g, '');
      return w && liveNameHit(w);
    });
    parsedCond = hitAny ? { t: 'always' } : { t: 'never' };
  }
  else if (mIdolLive || mNameOnly) {
    // 「◯◯がライブに参加している場合」（名前のみの略記・「が」欠落の表記ゆれ含む）
    // v0.25.13: サポート（ゲスト除く）も参加扱い（ユーザー確認仕様）。名前は部分一致
    const wantName = (mIdolLive ? mIdolLive[1] : cond).replace(/\s/g, '');
    parsedCond = liveNameHit(wantName) ? { t: 'always' } : { t: 'never' };   // v0.25.17: 成立=always
  }
  else if (mKeyword) parsedCond = { t: 'never', wing: true };    // キーワード=グレフェス専用（ユーザー確認）。v0.25.34: wing目印付き（ポジション担当は分岐先頭へ移動）
  else if (mHistBoth) parsedCond = { t: 'histGenre', le: Number(mHistBoth[1]), ge: Number(mHistBoth[2]) };
  else if (mHistLe) parsedCond = { t: 'histGenre', le: Number(mHistLe[1]) };
  else if (mHistGe) parsedCond = { t: 'histGenre', ge: Number(mHistGe[1]) };
  else if (mHistPersonGenre) {
    // v0.25.12: 人物+ジャンル数の複合条件（例: 霧子1ジャンル以下）
    parsedCond = { t: 'histGenre', person: mHistPersonGenre[1].replace(/\s/g, '') };
    parsedCond[mHistPersonGenre[3] === '以下' ? 'le' : 'ge'] = Number(mHistPersonGenre[2]);
  }
  else if (mHistHas) parsedCond = { t: 'histPerson',
    persons: mHistHas[1].split(/[、,]/).map(function (s) { return s.replace(/\s/g, ''); }).filter(Boolean) };
  return parsedCond;
};

// v0.25.34: parseCondString の結果が「WINGでは絶対に成立しない」条件（ポジション担当・キーワード = {t:'never', wing:true}）か。
//   複合条件(all)は子のどれかが該当すれば真（ANDなので成立しない）
SC.condIsWingNever = function (cond) {
  if (!cond || typeof cond !== 'object') return false;
  if (cond.t === 'never') return cond.wing === true;
  if (cond.t === 'all') return (cond.list || []).some(function (c) { return SC.condIsWingNever(c); });
  return false;
};

// ---- v0.25.35: カード由来パッシブ（動的パネル）の共通部品 ----
// [確率:N%]（無ければ1.0）／[最大:N回]（無ければ null=無制限）
// v0.25.36: 数字なし確率の暫定値。【wiki】体感値・要検証（ユーザー確認で暫定採用）: wikiに「ごく稀/ごくごく稀 具体的な発動率は不明であり、
//   体感として挙げられる発動率として1%や3%程度」とあるため ごく稀=3%・ごくごく稀=1%。「ごくごく稀」は「ごく稀」を部分文字列に含むので先に判定する
SC.parsePassiveProb = function (probRaw) {
  const s = String(probRaw || '');
  const m = s.match(/(\d+)%/);
  if (m) return Number(m[1]) / 100;
  if (s.indexOf('ごくごく稀') >= 0) return 0.01;   // 【wiki】体感値・要検証（ユーザー確認で暫定採用）
  if (s.indexOf('ごく稀') >= 0) return 0.03;        // 【wiki】体感値・要検証（ユーザー確認で暫定採用）
  return 1.0;
};
SC.parsePassiveMax = function (maxRaw) {
  const m = String(maxRaw || '').match(/(\d+)回/);
  return m ? Number(m[1]) : null;
};
// buff / 思い出ゲージ / 回復 / ダメージカット / 回避 / 注目度 のパッシブを全部同じ形にそろえる:
//   type:'passive'・holder=key・_cond（SC.parseCondString）・_prob・_maxN・_rawCond/_rawProb/_rawMax。
//   条件パース不能なら _cond:{t:'never'}＋_condUnsupported（効果文は解析済み＝習得可能・隣接解放も進む。条件だけ未対応なので発動しない）。
//   effectFields=種別ごとの効果値（_buffAttr/_buffPct、_memGaugePct、_healPct、_cutPct、_avoidPct、_attnPct）と表示名
SC.makeCardPassive = function (p, key, ownerNum, effectFields) {
  const parsedCond = SC.parseCondString(p.cond);
  const def = { name: p.name, type: 'passive',
    holder: key, // 動的パネル固有のholderキー
    sp: p.sp, owner: ownerNum, _isDynamic: true,
    // 生の条件文字列・確率・最大回数（下部バー・パッシブ一覧表示用）
    _rawCond: p.cond || null,       // 例: '2ターン以前'
    _rawProb: p.prob || null,       // 例: '20%'
    _rawMax:  p.max  || null };     // 例: '1回'
  if (parsedCond || !p.cond) {
    def._cond = parsedCond;         // null=条件なし(常時成立)
    def._prob = SC.parsePassiveProb(p.prob);
    def._maxN = SC.parsePassiveMax(p.max);
  } else {
    def._cond = { t: 'never' };
    def._prob = 0;
    def._condUnsupported = true;    // 詳細表示用: 条件判定未対応
  }
  Object.assign(def, effectFields);
  // v0.25.47: 思い出ゲージの上がるタイミング（ユーザー確認）＝効果文が「発動時に思い出ゲージN%UP」なら発動したターン、「思い出ゲージN%UP」だけなら次のターン（_memGaugeNow）。
  //   ゲージ型（_memGaugePct）以外のバフ型・回復型でも、効果文に「思い出ゲージN%UP」があればその分を _memGaugeAdd に持つ（従来は捨てていた。例「Dance75%UP/思い出ゲージ25%UP」）
  const rawFx = String(p.effectRaw || '').replace(/\s+/g, '');
  const mGauge = rawFx.match(/思い出ゲージ(\d+(?:\.\d+)?)%UP/);
  if (mGauge) {
    if (def._memGaugePct === undefined) def._memGaugeAdd = Number(mGauge[1]);
    def._memGaugeNow = /発動時に思い出ゲージ/.test(rawFx);
  }
  // v0.25.52: 「Visual150%UP/興味無視」＝発動したターン、自分のアピールに興味無視を付与（firePassives のバフ型が 'ignoreInt' を付ける）。アピールのタグ [興味無視] とは別物
  if (/(^|\/)興味無視($|\/)/.test(rawFx.replace(/\[興味無視\]/g, ''))) def._ignoreInterestGrant = true;
  return def;
};

// ---- v0.25.36: 非アピールのライブスキル＝「効果札」 ----
// アピールが主効果でないライブスキル（パネルが isLiveSkill で effect.kind が appeal/appealVar 以外）を、本編で山札に入れて使える札にする。
//   従来(〜v0.25.35)は buff/heal/inflDown が raw（使えない）、memGauge/attentionDown が自動発動パッシブ、dmgUp が習得だけで常時効く効果、
//   damCut(ライブ側)/interest が無効パネルになっていた（いずれも誤り）。効果札は type:'live'＋effectOnly:true。
//   札の形: { name, effectOnly:true, heal?(回復率), memGaugePct?(思い出ゲージ%), extra?(効果文配列), effectRaw, randomEffects? }
//   使い方は SC.execPlayerAction の pa.type==='heal' 経路（回復札と共通。アピール予測・審査員選択なし）。
SC.EFFECT_ONLY_KINDS = ['buff', 'heal', 'dmgUp', 'damCut', 'dmgCut', 'interest', 'inflDown', 'memGauge', 'attentionDown', 'attentionUp', 'reactAvoid', 'influence'];
SC.isEffectOnlyPanelDef = function (p) {
  const k = p && p.effect && p.effect.kind;
  return !!(p && p.isLiveSkill && !p.quick && k && SC.EFFECT_ONLY_KINDS.indexOf(k) >= 0);
};
// 効果文原文（effectRaw）の主効果＝(Link)より前の最初の「/」節
SC.effectOnlyMainClause = function (effectRaw) {
  return String(effectRaw || '').split('(Link)')[0].split('/')[0].trim();
};
SC.makeEffectOnlyPanel = function (card, p, ownerNum) {
  const ep = p.effect;
  // v0.25.36: 本体（(Link)より前）に「N倍アピール」節を持つ札（甜花「事務所。静寂。大輪の華」±＝主効果が注目度DOWNと判定される）は
  //   効果札ではなく通常のアピール札にする（単体アピール・審査員選択あり）。主効果文を extra の先頭へ入れ、アピール節は extra から外す（二重アピール防止）。
  //   「[PERFECTならN倍アピール]」は perfectMult（PERFECT判定時の倍率差し替え。execPlayerAction / appealPredict が参照）
  const apIdx = (p.extra || []).findIndex(function (x) { return String(x).indexOf('(Link)') !== 0 && /倍アピール/.test(x); });
  const mBodyAp = apIdx >= 0 ? String(p.extra[apIdx]).match(/^(全観客に)?(Vocal|Dance|Visual)([\d.]+)倍アピール(?:\[PERFECTなら([\d.]+)倍アピール\])?$/) : null;
  if (mBodyAp) {
    const apDef = { name: p.name || '(効果不明)', type: 'live', attr: { Vocal: 'vo', Dance: 'da', Visual: 'vi' }[mBodyAp[2]],
      mult: Number(mBodyAp[3]), allJudges: !!mBodyAp[1], sp: p.sp, owner: ownerNum, _isDynamic: true, plus: null,
      extra: [SC.effectOnlyMainClause(p.effectRaw)].concat(p.extra.filter(function (x, i) { return i !== apIdx; })) };
    if (mBodyAp[4]) apDef.perfectMult = Number(mBodyAp[4]);
    const reAp = SC.cardRandomEffects(card, p.name);
    if (reAp) apDef.randomEffects = reAp;
    return apDef;
  }
  const def = { name: p.name || '(効果不明)', type: 'live', effectOnly: true, sp: p.sp, owner: ownerNum, _isDynamic: true };
  let mainText = SC.effectOnlyMainClause(p.effectRaw);
  // 主効果が回復／思い出ゲージUPなら専用フィールドで処理し、extra には入れない（回復は heal・ゲージは memGaugePct を execPlayerAction が処理）
  //   注: マイフェイバリット系の「アピールフェイズ開始時メンタルN%回復[Nターン]」は本来は毎ターン回復だが、周期回復の仕組みが無いので使用時に1回だけN%回復する近似 [推測]
  if (ep.kind === 'heal' && ep.pct > 0) { def.heal = ep.pct / 100; mainText = ''; }
  else if (ep.kind === 'memGauge' && ep.pct > 0) { def.memGaugePct = ep.pct; mainText = ''; }
  // 主効果の効果文を extra の先頭に（既存の applyExtraEffects が処理できるものだけ効く。処理が無いもの＝「必ず最初にアピールを行い」「メンタルダメージN%UP」
  // 「興味N倍」「影響力N%DOWN」等は何もしない）。残りは従来の p.extra（(Link)/PLUS 節を含む）
  const extra = (mainText ? [mainText] : []).concat(p.extra || []);
  def.extra = extra.length > 0 ? extra : null;
  const re = SC.cardRandomEffects(card, p.name);
  if (re) def.randomEffects = re;
  return def;
};

// ---- 実カードのパネルを動的にconfig.panelに追加 ----
SC.buildLoadoutPanels = function (loadout) {
  // 既存の動的パネルをクリア（cp_で始まるキーを削除）
  Object.keys(SC.CONFIG.panel).forEach(function (k) {
    if (k.indexOf('cp_') === 0) delete SC.CONFIG.panel[k];
  });
  if (!loadout) return;

  // 対象スロットとownerKeyの定義
  const slots = [];
  if (loadout.p) slots.push({ cardId: loadout.p, ownerKey: 'p' });
  (loadout.supports || []).forEach(function (id, i) {
    if (id) slots.push({ cardId: id, ownerKey: 's' + i });
  });
  if (loadout.guest) slots.push({ cardId: loadout.guest, ownerKey: 'guest' });

  slots.forEach(function (slot) {
    const card = SC.findCard(slot.cardId);
    if (!card || !card.panels) return;
    card.panels.forEach(function (p, idx) {
      const key = 'cp_' + slot.ownerKey + '_' + idx;
      // ownerの数値マッピング: 's0'→0, 's1'→1, ..., 'p'→'p', 'guest'→'guest'
      const ownerNum = slot.ownerKey === 'p' ? 'p' :
                      slot.ownerKey === 'guest' ? 'guest' :
                      Number(slot.ownerKey.slice(1));

      let panelDef;
      if (SC.isEffectOnlyPanelDef(p)) {
        // v0.25.36: アピールが主効果でないライブスキル → 効果札（type:'live'＋effectOnly）
        panelDef = SC.makeEffectOnlyPanel(card, p, ownerNum);
      } else if (p.effect && p.effect.kind === 'appeal') {
        // ライブスキルパネル
        const ep = p.effect;
        const attr = ep.attrs && ep.attrs.length > 0 ? ep.attrs[0] : 'vo'; // [簡略化]
        const attrLabel = { vo: 'Vocal', da: 'Dance', vi: 'Visual' }[attr] || attr;
        // v0.23: Plus条件パース（cond文字列から判定オブジェクト生成）
        let plusCond = null;
        const condStr = p.cond || '';
        // cond文字列からユニット全員参加条件を優先チェック
        const mUnitAllCond = condStr.match(/([゠-ヿ぀-ゟ一-鿿]+)全員がライブに参加/);
        const mTurnMin = condStr.match(/(\d+)ターン以降/);
        const mTurnMax = condStr.match(/(\d+)ターン以前/);
        const mMentalAbove = condStr.match(/メンタル(\d+)%以上/);
        const mMentalBelow = condStr.match(/メンタル(\d+)%以下/);
        if (mUnitAllCond) {
          // ターン条件との複合: 例「3ターン以降アンティーカ全員がライブに参加している場合」
          if (mTurnMin) plusCond = { turnMin: Number(mTurnMin[1]), unitAll: mUnitAllCond[1] };
          else if (mTurnMax) plusCond = { turnMax: Number(mTurnMax[1]), unitAll: mUnitAllCond[1] };
          else if (mMentalAbove) plusCond = { mentalAbove: Number(mMentalAbove[1]) / 100, unitAll: mUnitAllCond[1] };
          else if (mMentalBelow) plusCond = { mentalBelow: Number(mMentalBelow[1]) / 100, unitAll: mUnitAllCond[1] };
          else plusCond = { unitAll: mUnitAllCond[1] };
        } else if (mTurnMin) plusCond = { turnMin: Number(mTurnMin[1]) };
        else if (mTurnMax) plusCond = { turnMax: Number(mTurnMax[1]) };
        else if (mMentalAbove) plusCond = { mentalAbove: Number(mMentalAbove[1]) / 100 };
        else if (mMentalBelow) plusCond = { mentalBelow: Number(mMentalBelow[1]) / 100 };
        else if (condStr.length > 0) plusCond = { _unknownCond: condStr }; // パース不能 → 不成立扱い
        // extra内の「全員が参加」条件もチェック（v0.23: ユニット名を保存）
        if (!plusCond) {
          let unitAllFromExtra = null;
          (p.extra || []).forEach(function (ex) {
            const m = ex.match(/([゠-ヿ぀-ゟ一-鿿]+)全員がライブに参加/);
            if (m && !unitAllFromExtra) unitAllFromExtra = m[1];
          });
          if (unitAllFromExtra) plusCond = { unitAll: unitAllFromExtra };
        }
        panelDef = { name: p.name || (attrLabel + ep.mult + '倍アピール'), // [仮データ: 名前未取得時]
          type: 'live', attr: attr, mult: ep.mult, sp: p.sp, owner: ownerNum, _isDynamic: true,
          allJudges: ep.allAudience === true,
          extra: (p.extra && p.extra.length > 0) ? p.extra : null, // v0.20a: 付随効果（注目度DOWN等）
          plus: plusCond }; // v0.22: Plus条件（nullなら条件なし=発動しない）
        // v0.25.39: 複合属性アピール（「Vocal & Dance & Visual3.5倍アピール」等・169パネル）は attrs を保持（appealHits が属性ごとに1発ずつ計算する）。
        //   従来は先頭属性の attr だけを持ち、Pカードの複合アピールが先頭属性の1発分しか計算されていなかった（サポ札は SC.cardLiveSkill で v0.25.7 から対応済み）
        if (ep.attrs && ep.attrs.length > 1) panelDef.attrs = ep.attrs.slice();
        // v0.25.40: 本体が「最大N倍アピール[tag]」（ep.maxCond・86パネル）は倍率変動アピール＝max×f（従来は常に最大倍率で撃っていた）。
        //   タグは効果文原文から（SC.varAppealMainTag。駆動タグが無ければ ''＝f 0.6 [仮データ]）。panelToSkill が appealVar をそのまま札へ運ぶ
        if (ep.maxCond) panelDef.appealVar = { min: ep.mult * 0.2, max: ep.mult, ref: 'tag', tag: SC.varAppealMainTag(p.effectRaw) };   // min は旧形式との互換（未使用）
        // v0.25.35: ランダム効果付与の候補（効果文の「ランダム効果N個付与」で使う。panelToSkill で札へそのまま運ばれる）
        const reLive = SC.cardRandomEffects(card, p.name);
        if (reLive) panelDef.randomEffects = reLive;
      } else if (p.effect && p.effect.kind === 'capLabel') {
        // 上限UPパネル (attrs配列対応)
        const firstAttr = p.effect.attrs && p.effect.attrs.length > 0 ? p.effect.attrs[0] : (p.effect.attr || 'vo');
        panelDef = { name: p.name || (firstAttr + '上限UP'),
          type: 'cap', attr: firstAttr, attrs: p.effect.attrs || [firstAttr], add: 50, sp: p.sp, owner: ownerNum, _isDynamic: true };
      } else if (p.effect && p.effect.kind === 'cap') {
        // cap パネル (attrs配列対応、単属性・複合属性を統一)
        const firstAttr = p.effect.attrs && p.effect.attrs.length > 0 ? p.effect.attrs[0] : (p.effect.attr || 'vo');
        panelDef = { name: p.name || (firstAttr + '上限+' + p.effect.add),
          type: 'cap', attr: firstAttr, attrs: p.effect.attrs || [firstAttr], add: p.effect.add || 0,
          sp: p.sp, owner: ownerNum, _isDynamic: true };
      } else if (p.effect && p.effect.kind === 'clearStatuses') {
        // ステータス効果解除クイック
        panelDef = {
          type: 'quick', name: p.name || 'ステータス効果解除',
          _effectKind: 'clearStatuses',
          sp: p.sp, cost: p.cost || 1,
          owner: ownerNum, _isDynamic: true,
          _effectRaw: p.effectRaw
        };
      } else if (p.effect && p.effect.kind === 'duetAdd') {
        // デュエット追加クイック
        panelDef = {
          type: 'quick', name: p.name || 'デュエット追加',
          _effectKind: 'duetAdd',
          sp: p.sp, cost: p.cost || 1,
          owner: ownerNum, _isDynamic: true,
          _effectRaw: p.effectRaw
        };
      } else if (p.effect && p.effect.kind === 'dmgUp') {
        // メンタルダメージUP → dmgUP型
        panelDef = {
          name: p.name || ('Meダメ' + p.effect.pct + '%UP'),
          type: 'dmgUP', _upPct: p.effect.pct,
          sp: p.sp, owner: ownerNum, _isDynamic: true,
          _desc: '被Meダメ' + p.effect.pct + '%UP'
        };
      } else if (p.effect && p.effect.kind === 'influence') {
        // 影響力UP/DOWN → influence型
        panelDef = {
          name: p.name || ('影響力' + (p.effect.pct >= 0 ? '+' : '') + p.effect.pct + '%'),
          type: 'influence', _influencePct: p.effect.pct,
          sp: p.sp, owner: ownerNum, _isDynamic: true,
          _desc: '審査員の影響力' + (p.effect.pct >= 0 ? '+' : '') + p.effect.pct + '%'
        };
      } else if (p.effect && p.effect.kind === 'interest') {
        // interest → type:'interest'（振り返りではグレー表示・バトル接続は将来）
        panelDef = {
          type: 'interest', name: p.name || ('興味' + p.effect.mult + '倍[' + p.effect.turns + 'T]'),
          _mult: p.effect.mult, _turns: p.effect.turns,
          sp: p.sp, cost: p.cost,
          owner: ownerNum, _isDynamic: true,
          _effectRaw: p.effectRaw
        };
      } else if (p.quick || (p.effect && p.effect.kind === 'interest')) {
        // クイックスキル（interest以外のquick=trueフラグ）→ type:'quick'
        panelDef = {
          type: 'quick', name: p.name,
          sp: p.sp, cost: p.cost,
          owner: ownerNum, _isDynamic: true,
          _effectRaw: p.effectRaw
        };
      } else if (p.effect && p.effect.kind === 'buff' && p.effect.attrs && !p.isLiveSkill) {
        // buffパネル: condをパース（v0.25.18: SC.parseCondStringに共通化＝extra条件節でも使用）
        // v0.25.35: 共通部品 SC.makeCardPassive に統一（条件パース不能なら never＋_condUnsupported＝条件だけ未対応の「発動しないパッシブ」。挙動は従来どおり）
        panelDef = SC.makeCardPassive(p, key, ownerNum, {
          _buffAttr: p.effect.attrs[0], _buffPct: p.effect.pct,
          _buffAttrs: p.effect.attrs   // v0.25.9: 複合属性バフ（Vocal & Dance10%UP等）
        });
      } else if (p.effect && p.effect.kind === 'appealVar') {
        // 可変倍率アピール → ライブスキルパネル
        const ep = p.effect;
        const attr = ep.attrs && ep.attrs.length > 0 ? ep.attrs[0] : 'vo';
        const attrLabelVar = { vo: 'Vocal', da: 'Dance', vi: 'Visual' }[attr] || attr;
        const varTag = SC.varAppealMainTag(p.effectRaw);   // v0.25.40: 駆動タグ（[..ほど効果UP]/[消去:..]）→ SC.varAppealResolve で max×f
        panelDef = {
          name: p.name || (attrLabelVar + ep.min + '~' + ep.max + '倍アピール'), // [仮データ: 名前未取得時]
          type: 'live', attr: attr,
          mult: ep.max,
          appealVar: { min: ep.min, max: ep.max, ref: ep.ref, tag: varTag },
          sp: p.sp, owner: ownerNum, _isDynamic: true,
          _desc: attr.toUpperCase() + ' 最大' + ep.max + '倍アピール（' +
            (SC.appealVarTag({ tag: varTag, ref: ep.ref }) || '条件あり') + '）',
          extra: (p.extra && p.extra.length > 0) ? p.extra : null // v0.20a: 付随効果
        };
        const reVar = SC.cardRandomEffects(card, p.name);   // v0.25.35: ランダム効果付与の候補
        if (reVar) panelDef.randomEffects = reVar;
      } else if (p.effect && (p.effect.kind === 'dmgCut' || p.effect.kind === 'damCut')) {
        // ダメージカット
        // v0.25.9: converterのkindは'damCut'。'dmgCut'比較のタイポで全件raw落ちしていた
        // v0.25.35: パッシブ（[条件][確率][最大]どおりに発動し、発動したターンのみ状態効果 'dmgCut' として軽減。firePassives が付与）
        // v0.25.36: ライブスキル側（isLiveSkill）は上の効果札分岐へ移したので、ここに来るのはパッシブだけ
        panelDef = SC.makeCardPassive(p, key, ownerNum, {
          name: p.name || ('Meダメ' + p.effect.pct + '%CUT'), _cutPct: p.effect.pct
        });
      } else if (p.effect && p.effect.kind === 'heal' && !p.isLiveSkill) {
        // v0.25.35: メンタルN%回復パネル=パッシブ（従来は誤って type:'live', heal: の回復ライブスキル札になり山札に入っていた）。
        //   [条件][確率][最大]どおりに発動し、firePassives が既存の回復式（仮データ passive の heal と同じ）でメンタルを回復する
        panelDef = SC.makeCardPassive(p, key, ownerNum, {
          name: p.name || ('メンタル' + p.effect.pct + '%回復'), _healPct: p.effect.pct
        });
      } else if (p.effect && p.effect.kind === 'memGauge') {
        // v0.25.9: 思い出ゲージN%UP → パッシブ（memGauge型・最大回数準拠）
        // v0.25.35: [条件][確率][最大]どおりに発動（従来はWING非対応条件の時だけ条件を見て、他の条件は無視していた）
        // v0.25.36: ライブスキル側（isLiveSkill＝従来は誤って自動発動パッシブ）は効果札分岐へ移したので、ここに来るのはパッシブだけ
        panelDef = SC.makeCardPassive(p, key, ownerNum, {
          name: p.name || ('思い出ゲージ' + p.effect.pct + '%UP'), _memGaugePct: p.effect.pct
        });
      } else if (p.effect && (p.effect.kind === 'attentionDown' || p.effect.kind === 'attentionUp')) {
        // v0.25.9: 注目度DOWN/UP → パッシブ（attention型）
        const sign = p.effect.kind === 'attentionDown' ? -1 : 1;
        const attnName = p.name || ('注目度' + p.effect.pct + '%' + (sign < 0 ? 'DOWN' : 'UP'));
        // v0.25.35: [条件][確率][最大]どおりに発動（従来は確率100%・最大1回固定でデータの値を無視していた）
        // v0.25.36: ライブスキル側（isLiveSkill＝従来は誤って自動発動パッシブ）は効果札分岐へ移したので、ここに来るのはパッシブだけ
        panelDef = SC.makeCardPassive(p, key, ownerNum, { name: attnName, _attnPct: sign * p.effect.pct });
      } else if (p.effect && p.effect.kind === 'reactAvoid') {
        // リアクション回避率
        // v0.25.35: パッシブ（[条件][確率][最大]どおりに発動し、発動したターンのみ状態効果 'avoid' として回避。firePassives が付与）
        // v0.25.36: ライブスキル側（isLiveSkill）は効果札分岐へ移したので、ここに来るのはパッシブだけ
        panelDef = SC.makeCardPassive(p, key, ownerNum, {
          name: p.name || ('回避率' + p.effect.pct + '%UP'), _avoidPct: p.effect.pct
        });
      } else {
        // effect=null / unknown → rawとして登録
        panelDef = { name: p.name || '(効果不明)',
          type: 'raw', raw: p.effectRaw || '',
          sp: p.sp, owner: ownerNum, _isDynamic: true };
      }
      // v0.20b: 隣接解放ルール用にrow/colをパネルから引き継ぐ
      if (p.row !== undefined) panelDef.row = p.row;
      if (p.col !== undefined) panelDef.col = p.col;
      // v0.24.2: MD原文の効果文と条件を表示用に引き継ぐ（「全観客に」等を省略しない）
      if (p.effectRaw && !panelDef.effectRaw) panelDef.effectRaw = p.effectRaw;
      if (p.cond && !panelDef._rawCond) panelDef._rawCond = p.cond;
      if (p.prob && !panelDef._rawProb) panelDef._rawProb = p.prob;
      if (p.max && !panelDef._rawMax) panelDef._rawMax = p.max;
      SC.CONFIG.panel[key] = panelDef;
    });
  });
};

// 起動時にローカルストレージから復元して適用
SC.restoreLoadout = function () {
  const saved = SC.loadLoadout();
  if (saved) SC.applyLoadout(saved);
};

// v0.20b: 隣接解放ルール ----------------------------------------
// メンバー（owner）ごとにパネル一覧から隣接グラフを構築し、
// 「習得済みパネルに隣接するパネルのみ習得可」を判定する。
// row=0（SP最小帯）のパネルは入口として常時解放済み扱い。
// 隣接: 同row内col差≤2、または隣接row間col差≤2。
SC.buildAdjacencyGraph = function (panelKeys) {
  const P = SC.CONFIG.panel;
  const nodes = [];
  panelKeys.forEach(function (k) {
    const p = P[k];
    if (!p || p.row === undefined || p.col === undefined) return;
    nodes.push({ key: k, row: p.row, col: p.col });
  });
  const adj = {};
  nodes.forEach(function (n) { adj[n.key] = []; });
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const sameRow = (a.row === b.row);
      const adjRow  = Math.abs(a.row - b.row) === 1;
      if ((sameRow || adjRow) && Math.abs(a.col - b.col) <= 2) {
        adj[a.key].push(b.key);
        adj[b.key].push(a.key);
      }
    }
  }
  return adj;
};

// 隣接解放チェック: key が習得可能か（隣接パネルが習得済みか、または入口row）
// row/col がないパネル（汎用パネル・仮データ等）は従来通り reqOk チェックのみで制御→ true を返す
SC.adjacentUnlocked = function (key, adj, opened, P) {
  const p = P[key];
  if (!p) return false;
  if (p.row === undefined || p.col === undefined) return true; // row/col未設定→隣接ルール適用外
  if (p.row === 0) return true;  // row=0 は入口→常時解放
  const neighbors = adj[key] || [];
  return neighbors.some(function (nk) { return opened.indexOf(nk) >= 0; });
};
