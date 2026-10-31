// 週進行・レッスン/お仕事・休む・コミュ・シーズン判定
window.SC = window.SC || {};

// ---- サポートスキル共通ヘルパー ----

// レアリティ別サポートスキルLv上限（wiki: 絆スキルLv表に基づく絆スキルLvMAX値）
// UR: Lv90→15 / SSR: Lv80→10 / SR: Lv70→7 / R: Lv60→4
// 出典: シャニマスwiki「サポートアイドル」絆スキルLv表（絆スキルのみ確認済み）
// 他スキル（マスタリー等）のLvテーブルは絆と異なる可能性あり [推測]
SC.SUPPORT_SKILL_LV = { UR: 15, SSR: 10, SR: 7, R: 4 };

// rawから <Lv*N> の Lv*N 値を返す（_rarity引数: サポのレアリティ。省略時SSR想定）
// Lv はレアリティ別MAX（UR=15 / SSR=10 / SR=7 / R=4）を採用
SC.parseSupportSkillValue = function (raw, rarity, maxLv) {
  const m = raw && raw.match(/<Lv\*(\d+)>/);
  if (!m) return 0;
  const lv = (maxLv != null) ? maxLv : (SC.SUPPORT_SKILL_LV[rarity] || SC.SUPPORT_SKILL_LV['SSR']);
  return lv * Number(m[1]);
};

// rawから N% を返す（0〜1。見つからなければ1.0）
SC.parseSupportSkillProb = function (raw) {
  const m = raw && raw.match(/(\d+)%/);
  if (!m) return 1.0;
  return Number(m[1]) / 100;
};

// ==== v0.25.17: 同席マスタリーの統合計算（実発動=doFacility / 予測=スケジュール画面で共用） ====
// 対応: {施設名}マスタリー{Vo/Da/Vi/Me/SP/体力/◯上限}（クロス属性含む: ダンスマスタリーVo等）
//       + テンションマスタリー系（テンション最高時・「確率で」表記は50%[仮データ]・「＋」付きは確定）
//       + 施設マスタリー（トラブルなしで施設Lvアップ）+ パーフェクトマスタリー（トラブルなしでPERFECT）
// 従来は主属性マスタリーVo/Da/Vi・マスタリー体力・◯◯マスタリーSPのみ発動していた（ユーザー指摘で全面化）
SC.FACILITY_MASTERY_PREFIX = {
  lessonVo: 'ボーカル', lessonDa: 'ダンス', lessonVi: 'ビジュアル',
  radio: 'ラジオ', talk: 'トーク', magazine: '撮影'
};
SC.calcMasteries = function (facilityKey) {
  const st = SC.state;
  const res = {
    stat: { vo: 0, da: 0, vi: 0, me: 0 }, sp: 0, hp: 0, cap: { vo: 0, da: 0, vi: 0 },
    perfectN: 0, facilityN: 0, perfectProbs: [], facilityProbs: [],
    tension: [],   // テンション最高時のみ: {kind, attr, v, sure, supLabel, name}
    items: []      // ログ/予測用: {supLabel, name, kind, attr, v}
  };
  const prefix = SC.FACILITY_MASTERY_PREFIX[facilityKey];
  const seats = (st.placement && st.placement[facilityKey]) || [];
  const parseSuffix = function (nm, base) {
    // baseより後ろの部分から効果種別を判定
    const suf = nm.slice(base.length);
    if (suf.indexOf('SP') >= 0) return { kind: 'sp' };
    if (suf.indexOf('体力') >= 0) return { kind: 'hp' };
    const capM = suf.match(/(Vo|Da|Vi)上限/);
    if (capM) return { kind: 'cap', attr: { Vo: 'vo', Da: 'da', Vi: 'vi' }[capM[1]] };
    const stM = suf.match(/(Vo|Da|Vi|Me)/);
    if (stM) return { kind: 'stat', attr: { Vo: 'vo', Da: 'da', Vi: 'vi', Me: 'me' }[stM[1]] };
    return null;
  };
  seats.forEach(function (idx) {
    const sup = idx === -1 ? SC.GUEST : SC.SUPPORTS[idx];
    if (!sup || !sup.supportSkills) return;
    const supLabel = sup.name || 'サポート';
    sup.supportSkills.forEach(function (sk) {
      let nm = sk.name || '';
      // v0.25.18: 元データtypo「ビジュアルルマスタリーVi」→ビジュアルマスタリーViとして発動（ユーザー指定）
      if (nm.indexOf('ビジュアルル') === 0) nm = nm.replace('ビジュアルル', 'ビジュアル');
      // 発動率はスキルLv依存（ユーザー提供2026-07-07: 施設マスタリー=Lv×2% / パーフェクトマスタリー=Lv×1%）
      const skLv = (sk.maxLv != null) ? sk.maxLv : (SC.SUPPORT_SKILL_LV[sup.rarity] || SC.SUPPORT_SKILL_LV.SSR);
      if (nm === '施設マスタリー') { res.facilityN++; res.facilityProbs.push(skLv * 0.02); res.items.push({ supLabel: supLabel, name: nm, kind: 'facility', v: 0 }); return; }
      if (nm === 'パーフェクトマスタリー') { res.perfectN++; res.perfectProbs.push(skLv * 0.01); res.items.push({ supLabel: supLabel, name: nm, kind: 'perfect', v: 0 }); return; }
      // テンションマスタリー（テンション最高時に一緒に行動。＋付き=確定・無印=確率50%[仮データ]）
      if (nm.indexOf('テンションマスタリー') === 0) {
        const eff = parseSuffix(nm, 'テンションマスタリー');
        if (!eff) return;
        const v = SC.parseSupportSkillValue(sk.raw, sup.rarity, sk.maxLv || null);
        if (v <= 0) return;
        res.tension.push({ kind: eff.kind, attr: eff.attr, v: v, sure: nm.indexOf('＋') >= 0 || nm.indexOf('+') >= 0, supLabel: supLabel, name: nm });
        return;
      }
      // ユニットマスタリーは calcUnitMastery が担当（誤マッチ防止）
      if (nm.indexOf('ユニットマスタリー') === 0) return;
      // {施設prefix}マスタリー◯◯（クロス属性含む）
      if (!prefix || nm.indexOf(prefix + 'マスタリー') !== 0) return;
      const eff = parseSuffix(nm, prefix + 'マスタリー');
      if (!eff) return;
      const v = SC.parseSupportSkillValue(sk.raw, sup.rarity, sk.maxLv || null);
      if (v <= 0) return;
      if (eff.kind === 'sp') res.sp += v;
      else if (eff.kind === 'hp') res.hp += v;
      else if (eff.kind === 'cap') res.cap[eff.attr] += v;
      else res.stat[eff.attr] += v;
      res.items.push({ supLabel: supLabel, name: nm, kind: eff.kind, attr: eff.attr, v: v });
    });
  });
  // ユニットマスタリー分を合算（items にも積む）
  (SC.calcUnitMastery ? SC.calcUnitMastery(facilityKey) : []).forEach(function (um) {
    if (um.kind === 'sp') res.sp += um.total;
    else if (um.kind === 'hp') res.hp += um.total;
    else if (um.kind === 'cap') res.cap[um.attr] += um.total;
    else if (um.kind === 'stat') res.stat[um.attr] += um.total;
    res.items.push({ supLabel: um.supLabel, name: um.name + '（同席' + um.mates + '人）', kind: um.kind, attr: um.attr, v: um.total });
  });
  return res;
};

// ---- v0.25.16: ユニットマスタリー計算の共通化（実発動=doFacility / 予測表示=スケジュール画面） ----
// 「行動した場所に自分以外のユニットメンバーがいると1人につき+<Lv*n>」
// 同席者 = P（行動場所に必ずいる）+ 同施設の他サポ + ゲスト。メンバー判定はUNIT_MEMBERS
// 戻り値: [{ supLabel, name, kind:'sp'|'hp'|'cap'|'stat', attr, total, mates }]
SC.calcUnitMastery = function (facilityKey) {
  const st = SC.state;
  const out = [];
  const seats = (st.placement && st.placement[facilityKey]) || [];
  const unitOf = function (idolNo) {
    if (!idolNo || !SC.UNIT_MEMBERS) return null;
    for (const un in SC.UNIT_MEMBERS) {
      if (SC.UNIT_MEMBERS[un].indexOf(idolNo) >= 0) return un;
    }
    return null;
  };
  seats.forEach(function (idx) {
    const sup = idx === -1 ? SC.GUEST : SC.SUPPORTS[idx];
    if (!sup || !sup.supportSkills) return;
    const holderUnit = unitOf(sup._idolNo || sup.idolNo);
    if (!holderUnit) return;
    const members = SC.UNIT_MEMBERS[holderUnit];
    let mates = 0;
    if (SC.IDOL._idolNo && members.indexOf(SC.IDOL._idolNo) >= 0) mates++;
    seats.forEach(function (oidx) {
      if (oidx === idx) return;
      const osup = oidx === -1 ? SC.GUEST : SC.SUPPORTS[oidx];
      const ono = osup && (osup._idolNo || osup.idolNo);
      if (ono && members.indexOf(ono) >= 0) mates++;
    });
    if (mates === 0) return;
    sup.supportSkills.forEach(function (sk) {
      const nm = sk.name || '';
      if (nm.indexOf('ユニットマスタリー') !== 0) return;
      const per = SC.parseSupportSkillValue(sk.raw, sup.rarity, sk.maxLv || null);
      if (per <= 0) return;
      const total = per * mates;
      const supLabel = sup.name || 'サポート';
      let kind, attr = null;
      if (nm.indexOf('SP') >= 0) kind = 'sp';
      else if (nm.indexOf('体力') >= 0) kind = 'hp';
      else if (nm.indexOf('上限') >= 0) {
        kind = 'cap';
        attr = nm.indexOf('Vo') >= 0 ? 'vo' : nm.indexOf('Da') >= 0 ? 'da' : nm.indexOf('Vi') >= 0 ? 'vi' : null;
        if (!attr) return;
      } else {
        kind = 'stat';
        attr = nm.indexOf('Vo') >= 0 ? 'vo' : nm.indexOf('Da') >= 0 ? 'da' : nm.indexOf('Vi') >= 0 ? 'vi' : nm.indexOf('Me') >= 0 ? 'me' : null;
        if (!attr) return;
      }
      out.push({ supLabel: supLabel, name: nm, kind: kind, attr: attr, total: total, mates: mates });
    });
  });
  return out;
};

// 指定施設に同席するサポ（SUPPORTS+GUEST）のうち、名前が skillName を含む supportSkills を返す
// 返すオブジェクトは sk 本体に _rarity（サポのレアリティ）と _supName（サポ表示名）を付与したコピー
SC.getSeatSkills = function (facilityKey, skillName) {
  const seats = SC.state.placement[facilityKey] || [];
  const result = [];
  seats.forEach(function (idx) {
    const sup = idx === -1 ? SC.GUEST : SC.SUPPORTS[idx];
    if (!sup || !sup.supportSkills) return;
    const rarity = sup.rarity || null;
    const supName = sup.name || (idx === -1 ? 'ゲスト' : ('サポ' + idx));
    sup.supportSkills.forEach(function (sk) {
      if (sk.name === skillName || sk.name.indexOf(skillName) >= 0) {
        // v0.25.14: 「ユニットマスタリーVo」等が汎用「マスタリーVo」クエリに誤マッチしないよう除外
        // （ユニットマスタリーは発動条件・計算が別＝専用処理で扱う）
        if (skillName.indexOf('ユニットマスタリー') !== 0 && (sk.name || '').indexOf('ユニットマスタリー') === 0) return;
        // _rarity/_supName をサポの情報で付与（元オブジェクトを汚染しないようObject.assign）
        result.push(Object.assign({}, sk, { _rarity: rarity, _supName: supName }));
      }
    });
  });
  return result;
};

// ---- Excellent抽選（配置時に確定。絆50以上で発生：wiki / 率は推測） ----
SC.rollExcellent = function () {
  const st = SC.state;
  st.excellentFlags = {};
  Object.keys(st.placement).forEach(function (key) {
    st.excellentFlags[key] = st.placement[key].filter(function (idx) {
      const kz = idx === -1 ? st.guestKizuna : st.kizuna[idx];
      return SC.chance(SC.CONFIG.excellentRate(kz));
    });
  });
};

// ---- レッスン/お仕事の上昇量計算 ----
// サポ補正 = Σ (0.0004×該当ステ)×(1+0.0001×絆)×(1+0.1×経過週)
SC.supportMod = function (facilityKey, outputAttr) {
  const st = SC.state;
  const W = SC.elapsedWeeks();
  let sum = 0;
  st.placement[facilityKey].forEach(function (idx) {
    const sup = idx === -1 ? SC.GUEST : SC.SUPPORTS[idx];
    const kz = idx === -1 ? st.guestKizuna : st.kizuna[idx];
    let stat;
    if (outputAttr === 'sp') {
      stat = (sup.stats.vo + sup.stats.da + sup.stats.vi + sup.stats.me) / 4 * 0.525;
    } else if (outputAttr === 'fan') {
      stat = 0;
    } else {
      stat = sup.stats[outputAttr];
    }
    sum += (0.0004 * stat) * (1 + 0.0001 * kz) * (1 + 0.1 * W);
  });
  return sum;
};

// gain = ROUNDUP((基準値×((1+サポ補正)×テンション補正 + Excellent人数×0.2) + スキル補正))
// skillBonus: マスタリースキル等の固定加算値（省略時0）[仮データ]
SC.facilityGainOne = function (facilityKey, base, outputAttr, exCount, skillBonus) {
  if (!base) return 0;
  const tCoef = 1 + 0.025 * SC.CONFIG.tension.lessonCoef[SC.tensionIdx()];
  const sMod = SC.supportMod(facilityKey, outputAttr);
  const bonus = skillBonus || 0; // [仮データ] スキル補正
  return Math.ceil(base * ((1 + sMod) * tCoef + exCount * SC.CONFIG.excellentBonusPerIdol) + bonus);
};

// UI用プレビュー（Perfectなし想定）
// v0.25.17: マスタリー全種適用後の値を返す（ユーザー指定: 予測はマスタリー系全部適用後の数値）
SC.facilityPreview = function (key) {
  const F = SC.CONFIG.facilities[key];
  const lv = SC.state.facilityLv[key] - 1;
  const ex = (SC.state.excellentFlags[key] || []).length;
  const M = SC.calcMasteries(key);
  const out = { stat: SC.facilityGainOne(key, F.stat[lv], F.attr, ex, M.stat[F.attr]), attr: F.attr };
  if (F.me) out.me = SC.facilityGainOne(key, F.me[lv], 'me', ex, F.attr === 'me' ? 0 : M.stat.me);
  if (F.sp) out.sp = SC.facilityGainOne(key, F.sp[lv], 'sp', ex) + M.sp;
  else if (M.sp > 0) out.sp = M.sp;
  out.fan = SC.facilityGainOne(key, F.fan[lv], 'fan', ex);
  out.mastery = M;   // クロス属性・体力・上限・施設/パーフェクト発生状況（スケジュール画面表示用）
  return out;
};

// ---- レッスン/お仕事 実行 ----
SC.doFacility = function (key) {
  const st = SC.state;
  const C = SC.CONFIG;
  const F = C.facilities[key];
  const lines = [];
  const promiseKept = SC.checkPromise(key);
  // v0.25.22: 直前行動の上昇分を記録（動画実測video1: 翌週のステータス行に+29/+5/+126の緑吹き出しが残る）
  const _gSnap = { vo: st.stats.vo, da: st.stats.da, vi: st.stats.vi, me: st.mental, sp: st.sp, fans: st.fans };
  const _recGains = function () {
    st.lastGains = { vo: st.stats.vo - _gSnap.vo, da: st.stats.da - _gSnap.da, vi: st.stats.vi - _gSnap.vi,
      me: st.mental - _gSnap.me, sp: st.sp - _gSnap.sp, fans: st.fans - _gSnap.fans, week: st.week };
  };

  // トラブル判定（体力消費前の値で判定）
  const rate = SC.troubleRate(F.kind === 'lesson' ? 'lesson' : F.kind);
  const cost = C.stamina.cost[F.kind === 'lesson' ? 'lesson' : F.kind];

  if (rate > 0 && SC.chance(rate)) {
    const catastrophe = SC.chance(rate * rate);   // [推測] 大失敗率
    if (catastrophe) {
      SC.addStat(F.attr, -C.catastropheStatLoss);
      st.stamina = 0;
      SC.addTension(-100);   // テンション最低に（v0.25.44: SC.addTension 経由＝ハイテンションモード中は下がらない）
      lines.push('大失敗（CATASTROPHE）……');
      lines.push(`${SC.ATTR_LABEL[F.attr]} -${C.catastropheStatLoss} ／ 体力0 ／ テンション最低に`);   // 文言はモード中も出す（ユーザー指定: 演出は出して効果だけ無し）
    } else {
      SC.addStat(F.attr, -C.failStatLoss);
      st.stamina = Math.max(0, st.stamina - cost);
      SC.addTension(C.tension.delta.actionFail);
      lines.push('失敗（FAILURE）……');
      lines.push(`${SC.ATTR_LABEL[F.attr]} -${C.failStatLoss} ／ テンション低下 ／ 体力 -${cost}`);
    }
    if (promiseKept) lines.push(SC.fulfillPromise());   // トラブルでも約束は守った扱い（wiki）
    SC.gainKizuna(key, lines);
    _recGains();
    return { title: `${F.label}（トラブル）`, lines: lines, ok: false };
  }

  // ---- 体力サポート判定（トラブルなし時。消費前に発動判定） ----
  // wiki準拠: sSSR=-50% / sSR=-30%（sR/その他=-30%[仮データ]）
  // 複数所持時は発動した全件の軽減%を加算合算（上限80%キャップ）
  // sSSR軽減%【wiki】、sSR軽減%【wiki】、sR/その他=-30%[仮データ]
  // v0.25.18: 体力サポートは一緒に行動しなくても適用（ユーザー指摘）→ 同席でなく全サポ+ゲスト対象
  //   （◯◯マスタリー体力のほうは「一緒に◯◯」が条件＝calcMasteriesの同席判定のまま）
  let actualCost = cost;
  // v0.25.17: 確率発動系スキルのカットイン用（動画19-55-34実測: レッスン時に青帯「Support Skill」カットイン）
  const skillFx = [];
  const staminaSupportSkills = [];
  SC.SUPPORTS.concat(SC.GUEST ? [SC.GUEST] : []).forEach(function (sup) {
    if (!sup || !sup.supportSkills) return;
    sup.supportSkills.forEach(function (sk) {
      if ((sk.name || '').indexOf('体力サポート') >= 0) {
        staminaSupportSkills.push(Object.assign({}, sk, { _rarity: sup.rarity || null, _supName: sup.name || 'サポート' }));
      }
    });
  });
  let totalStaminaReductionPct = 0; // 発動した軽減%の合計（0〜80）
  // 体力サポート軽減%: sSSR=50% / sSR=30% / sR/その他=30%[仮データ]
  const STAMINA_REDUCTION_PCT = { SSR: 50, SR: 30, R: 30, UR: 50 }; // UR=[仮データ]
  staminaSupportSkills.forEach(function (sk) {
    const prob = SC.parseSupportSkillProb(sk.raw);
    if (SC.chance(prob)) {
      // sk._rarity: getSeatSkills経由でサポのrarityを渡すため、sk所有サポのrarityを参照
      const reductionPct = sk._rarity ? (STAMINA_REDUCTION_PCT[sk._rarity] || 30) : 30; // rarity未設定時30%[仮データ]
      totalStaminaReductionPct += reductionPct;
      // v0.15a: カード名（サポ表示名）付きで1行ずつログ出力
      const supLabel = sk._supName || sk.name;
      lines.push(`🔸${supLabel} の体力サポートが発動（消費-${reductionPct}%）`);
      // v0.25.18: 体力サポートのカットイン演出はナシ（ユーザー指定）
    }
  });
  if (totalStaminaReductionPct > 0) {
    const cappedPct = Math.min(totalStaminaReductionPct, 80); // [仮データ] 上限80%
    actualCost = Math.floor(cost * (1 - cappedPct / 100)); // 端数切捨て[仮データ]
    if (cappedPct < totalStaminaReductionPct) {
      // キャップが効いた場合のみ合計をログ補足
      lines.push(`  ↳ 合計軽減 ${totalStaminaReductionPct}%→上限${cappedPct}%キャップ適用`);
    }
  }
  st.stamina = Math.max(0, st.stamina - actualCost);

  // ---- v0.25.17: マスタリー全種の統合適用（SC.calcMasteries共通化・予測表示と同値） ----
  const M = SC.calcMasteries(key);
  // パーフェクトマスタリー: raw「スキル発動時に一緒に行動してトラブルが起きなかった場合パーフェクトが発生」
  // 発動率=スキルLv×1%（ユーザー提供2026-07-07）。複数所持は各々独立に判定
  let masteryPerfect = false;
  M.perfectProbs.forEach(function (prob) { if (!masteryPerfect && SC.chance(prob)) masteryPerfect = true; });
  if (masteryPerfect) {
    const pfItem = M.items.find(function (it) { return it.kind === 'perfect'; });
    skillFx.push({ name: 'パーフェクトマスタリー', sup: pfItem ? pfItem.supLabel : '' });
  }
  const perfect = SC.chance(C.perfectRate) || masteryPerfect;
  const mult = perfect ? 2 : 1;
  const lv = st.facilityLv[key] - 1;
  const ex = (st.excellentFlags[key] || []).length;
  if (perfect) lines.push('大成功（PERFECT）！ 効果2倍！' + (masteryPerfect ? '（パーフェクトマスタリー）' : ''));
  if (ex > 0) lines.push(`Excellent発生中のサポート ×${ex}`);

  const statGain = SC.facilityGainOne(key, F.stat[lv], F.attr, ex, M.stat[F.attr]) * mult;
  SC.addStat(F.attr, statGain);
  lines.push(`${SC.ATTR_LABEL[F.attr]} +${statGain}（現在 ${F.attr === 'me' ? st.mental : st.stats[F.attr]}）`);

  if (F.me) {
    const meGain = SC.facilityGainOne(key, F.me[lv], 'me', ex, F.attr === 'me' ? 0 : M.stat.me) * mult;
    SC.addStat('me', meGain);
    lines.push(`Me +${meGain}（現在 ${st.mental}）`);
  }
  if (F.sp) {
    const spGain = SC.facilityGainOne(key, F.sp[lv], 'sp', ex) * mult;
    st.sp += spGain;
    lines.push(`SP +${spGain}（現在 ${st.sp}）`);
  }
  // クロス属性ステ加算（主属性・Me以外。例: ダンスレッスンでダンスマスタリーVo）＋SP/体力/上限の一括適用
  ['vo', 'da', 'vi'].forEach(function (at) {
    if (at === F.attr || M.stat[at] <= 0) return;
    SC.addStat(at, M.stat[at]);
    lines.push(`${SC.ATTR_LABEL[at]} +${M.stat[at]}（マスタリー）`);
  });
  if (!F.me && M.stat.me > 0) {
    SC.addStat('me', M.stat.me);
    lines.push(`Me +${M.stat.me}（マスタリー）`);
  }
  if (M.sp > 0) { st.sp += M.sp; }
  if (M.hp > 0) { SC.addStamina(M.hp); }
  ['vo', 'da', 'vi'].forEach(function (at) {
    if (M.cap[at] > 0 && st.statCap) st.statCap[at] += M.cap[at];
  });
  // 発動ログ（カード名付き・1件1行）
  M.items.forEach(function (it) {
    if (it.kind === 'perfect' || it.kind === 'facility') return;   // 別途表示
    const what = it.kind === 'sp' ? 'SP+' + it.v
      : it.kind === 'hp' ? '体力+' + it.v
      : it.kind === 'cap' ? SC.ATTR_LABEL[it.attr] + '上限+' + it.v
      : (it.attr === 'me' ? 'Me' : SC.ATTR_LABEL[it.attr]) + '+' + it.v;
    lines.push(`🔸${it.supLabel} の${it.name}が発動（${what}）`);
  });
  // テンションマスタリー（テンション最高時のみ・無印=50%[仮データ]・＋=確定）
  if (SC.tensionIdx() === SC.CONFIG.tension.faces.length - 1) {
    M.tension.forEach(function (tm) {
      if (!tm.sure && !SC.chance(0.5)) return;
      if (tm.kind === 'sp') st.sp += tm.v;
      else if (tm.kind === 'hp') SC.addStamina(tm.v);
      else if (tm.kind === 'cap') { if (st.statCap) st.statCap[tm.attr] += tm.v; }
      else SC.addStat(tm.attr, tm.v);
      const what = tm.kind === 'sp' ? 'SP+' + tm.v : tm.kind === 'hp' ? '体力+' + tm.v
        : tm.kind === 'cap' ? SC.ATTR_LABEL[tm.attr] + '上限+' + tm.v
        : (tm.attr === 'me' ? 'Me' : SC.ATTR_LABEL[tm.attr]) + '+' + tm.v;
      lines.push(`🔸${tm.supLabel} の${tm.name}が発動（テンション最高・${what}）`);
    });
  }

  const fanGain = SC.facilityGainOne(key, F.fan[lv], 'fan', ex) * mult;
  st.fans += fanGain;
  lines.push(`ファン +${SC.fmt(fanGain)}人（合計 ${SC.fmt(st.fans)}人）`);
  lines.push(`体力 -${actualCost}`);

  // 施設Lvアップ（基本はランダム：wiki／率は推測）
  // 施設マスタリー: raw「スキル発動時に一緒に行動してトラブルが起きなかった場合、行動した場所がレベルアップ」
  // 発動率=スキルLv×2%（ユーザー提供2026-07-07）。複数所持は各々独立に判定
  let masteryFacLvUp = false;
  M.facilityProbs.forEach(function (prob) { if (!masteryFacLvUp && SC.chance(prob)) masteryFacLvUp = true; });
  if (masteryFacLvUp && st.facilityLv[key] < C.facilityLvMax) {
    const fcItem = M.items.find(function (it) { return it.kind === 'facility'; });
    skillFx.push({ name: '施設マスタリー', sup: fcItem ? fcItem.supLabel : '' });
  }
  let lvUp = null;
  if (st.facilityLv[key] < C.facilityLvMax && (masteryFacLvUp || SC.chance(C.facilityLvUpRate))) {
    st.facilityLv[key]++;
    lines.push(`⤴ ${F.label}のレベルが ${st.facilityLv[key]} に上がった！${masteryFacLvUp ? '（施設マスタリー）' : ''}`);
    lvUp = { label: F.label, lv: st.facilityLv[key] };   // v0.25.17: 大数字演出用（動画19-55-34実測）
  }

  if (promiseKept) lines.push(SC.fulfillPromise());
  SC.gainKizuna(key, lines);

  // v0.25.3: perfectフラグ=週結果画面の金フラッシュ演出用
  // v0.25.17: skillFx=確率発動系スキルのカットイン / lvUp=施設Lvアップ大数字演出（doActionで再生）
  _recGains();
  return { title: F.label + (perfect ? '（大成功）' : ''), lines: lines, ok: true, perfect: perfect, skillFx: skillFx, lvUp: lvUp };
};

// 同席サポの絆+8（wiki）
SC.gainKizuna = function (key, lines) {
  const st = SC.state;
  const names = [];
  st.placement[key].forEach(function (idx) {
    if (idx === -1) { st.guestKizuna = Math.min(100, st.guestKizuna + SC.CONFIG.kizunaGain); names.push(SC.GUEST.name); }
    else { st.kizuna[idx] = Math.min(100, st.kizuna[idx] + SC.CONFIG.kizunaGain); names.push(SC.SUPPORTS[idx].name); }
  });
  if (names.length) lines.push(`絆 +${SC.CONFIG.kizunaGain}（${names.join('、')}）`);
};

// ---- 休む ----
SC.doRest = function () {
  const st = SC.state;
  const R = SC.CONFIG.stamina.rest;
  const lines = [];
  const promiseKept = SC.checkPromise('rest');
  const roll = SC.rand();
  let gain, label;
  if (roll < R.pFail) { gain = R.fail; label = '失敗'; }
  else if (roll < R.pFail + R.pGreat) { gain = R.great; label = '大成功'; }
  else { gain = R.success; label = '成功'; }

  // ---- お休みブースト（全SUPPORTS+GUESTのrestBoostを確率で発動）[仮データ] ----
  // v0.15a実機準拠: 複数所持時は効果最大の1件のみ発動（加算しない）
  let restBoostTotal = 0;
  const allRestBoostSources = [];
  SC.SUPPORTS.forEach(function (sup) {
    if (!sup || !sup.supportSkills) return;
    const supName = sup.name || 'サポート';
    sup.supportSkills.forEach(function (sk) {
      if (sk.name && sk.name.indexOf('おやすみブースト') >= 0) {
        allRestBoostSources.push(Object.assign({}, sk, { _supName: supName }));
      }
    });
  });
  if (SC.GUEST && SC.GUEST.supportSkills) {
    const guestName = SC.GUEST.name || 'ゲスト';
    SC.GUEST.supportSkills.forEach(function (sk) {
      if (sk.name && sk.name.indexOf('おやすみブースト') >= 0) {
        allRestBoostSources.push(Object.assign({}, sk, { _supName: guestName }));
      }
    });
  }
  // 各ブーストソースに対して発動判定し、発動したものを収集
  const activatedBoosts = []; // { supName, v }
  allRestBoostSources.forEach(function (sk) {
    const prob = SC.parseSupportSkillProb(sk.raw);
    if (SC.chance(prob)) {
      // rawから回復量を読む（+数字の形式[仮データ]）
      const m = sk.raw && sk.raw.match(/\+(\d+)/);
      const v = m ? Number(m[1]) : 0;
      if (v > 0) activatedBoosts.push({ supName: sk._supName || sk.name, v: v });
    }
  });
  // 複数発動時は効果最大の1件のみ適用（実機準拠）
  if (activatedBoosts.length > 0) {
    let best = activatedBoosts[0];
    activatedBoosts.forEach(function (b) { if (b.v > best.v) best = b; });
    restBoostTotal = best.v;
    // v0.15a: カード名付きログ
    lines.push(`🔸${best.supName} のおやすみブーストが発動（+${best.v}）`);
  }

  const before = st.stamina;
  SC.addStamina(gain + restBoostTotal);
  lines.push(`体力 +${st.stamina - before}（現在 ${st.stamina}/${SC.CONFIG.stamina.max}）`);
  if (label !== '失敗') {
    SC.addTension(SC.CONFIG.tension.delta.restSuccess);
    lines.push('テンションが上がった');
  }
  if (promiseKept) lines.push(SC.fulfillPromise());
  return { title: `お休み（${label}）`, lines: lines, ok: true };
};

// ---- 約束 ----
// 約束の達成判定: targetWeek にその行動を実行した場合のみ達成（ユーザー確認仕様）
// 対象はレッスン3種（lessonVo/lessonDa/lessonVi）+ お休み（rest）
SC.promiseFacilityLabel = function (f) {
  if (f === 'rest') return 'お休み';
  return (SC.CONFIG.facilities[f] && SC.CONFIG.facilities[f].label) || f;
};
SC.checkPromise = function (actionKey) {
  const p = SC.state.promise;
  if (!p) return false;
  // 約束対象レッスンと一致し、かつ targetWeek に実行した場合のみ達成
  return p.facility === actionKey && SC.state.week === p.targetWeek;
};
SC.fulfillPromise = function () {
  const st = SC.state;
  st.promise = null;
  SC.addLove(SC.CONFIG.promise.love);
  SC.addTension(SC.CONFIG.tension.delta.promiseKeep);
  SC.rollLoveBurst();
  st.promiseComm = 'kept';   // v0.25.5: 週明けに「約束を守った」コミュを挟む
  return `🤝 約束を守った！ 親愛度 +${SC.CONFIG.promise.love} ／ テンション大幅UP`;
};
SC.acceptPromise = function () {
  const st = SC.state;
  const offer = st.weekEvents.promiseOffer;
  if (!offer) return;
  // targetWeek は offer 時点で確定済み（今週/来週/2週後のいずれか）
  st.promise = { facility: offer.facility, targetWeek: offer.targetWeek };
  st.weekEvents.promiseOffer = null;
};
SC.declinePromise = function () {
  SC.state.weekEvents.promiseOffer = null;
  SC.addTension(SC.CONFIG.tension.delta.promiseDecline);
};

// ---- 朝コミュ ----
SC.doMorningChoice = function (i) {
  const st = SC.state;
  const m = st.weekEvents.morning;
  if (!m || m.done) return null;
  m.done = true;
  const kind = m.choices[i];
  let msg;
  if (kind === 'perfect') {
    SC.addLove(SC.CONFIG.morning.lovePerfect);
    SC.addTension(SC.CONFIG.tension.delta.morningPerfect);
    msg = `パーフェクトコミュニケーション！ 親愛度 +${SC.CONFIG.morning.lovePerfect} テンションUP`;
  } else if (kind === 'good') {
    SC.addLove(SC.CONFIG.morning.loveGood);
    msg = `グッドコミュニケーション。親愛度 +${SC.CONFIG.morning.loveGood}`;
  } else {
    msg = '反応はいまひとつ……';
  }
  m.resultMsg = msg;
  m.kind = kind;   // v0.25.4: 反応セリフ・テンション演出の分岐用
  if (kind !== 'none') SC.rollLoveBurst();
  return msg;
};
SC.rollLoveBurst = function () {
  if (SC.chance(SC.CONFIG.loveBurstRate)) {
    SC.addLove(100);
    SC.state.weekEvents.loveBurst = true;
  }
};

// ---- サポートイベント（週初めランダム発生。[推測]率・効果は仮） ----
SC.rollSupportEvent = function () {
  const st = SC.state;
  const C = SC.CONFIG.supportEvent;
  if (!SC.chance(C.rate)) return;
  const idx = SC.randInt(0, SC.SUPPORTS.length - 1);
  const sup = SC.SUPPORTS[idx];
  if (!sup || sup._empty) return;   // v0.25.31: シミュの「なし」枠ではイベントを起こさない（本編は全枠に実体があるので挙動不変）
  st.kizuna[idx] = Math.min(100, st.kizuna[idx] + C.kizuna);
  SC.addStat(sup.attr, C.stat);
  st.sp += C.sp;
  st.weekEvents.supportEvent = {
    msg: `📖 ${sup.name}のイベント発生！ 絆+${C.kizuna}（現在${st.kizuna[idx]}） ／ ${SC.ATTR_LABEL[sup.attr]}+${C.stat} ／ SP+${C.sp}`
  };
};

// ---- タッチコミュ（週1回・週を消費しない。[推測]効果は仮） ----
SC.doTouch = function () {
  const st = SC.state;
  const C = SC.CONFIG.touch;
  if (st.touchedWeek === st.week) return null;
  st.touchedWeek = st.week;
  // v0.25.4: 立ち絵上の吹き出しセリフ（オリジナル文・ランダム）。v0.25.26: 会話パターン（性格）で差し替え可能
  const lines = SC.personalityText().touch;
  const line = lines[Math.floor(SC.rand() * lines.length)];
  // v0.25.13: タッチはテンションのみ上昇（親愛度は上がらない。ユーザー確認仕様）
  SC.addTension(C.tension);
  const effect = `テンション +${C.tension}`;
  st.weekEvents.touchBubble = { line: line, effect: effect };
  return effect;
};

// ---- 週開始画面の決定（約束コミュ→朝コミュ→home の優先順） ----
SC.weekStartScreen = function () {
  // v0.25.5: 約束の守/破コミュを最優先で挟む（演出カット時はスキップ・効果は適用済み）
  if (SC.state.promiseComm) {
    if (SC.state.commsOff) SC.state.promiseComm = null;
    else return 'promiseComm';
  }
  const m = SC.state.weekEvents && SC.state.weekEvents.morning;
  return (m && !m.done) ? 'morning' : 'home';
};

// ---- 行動確定後の週送り（v0.10: その場結果表示方式） ----
// fromScreen: 実行した画面（'schedule' / 'home'）。その場表示の判定に使用
SC.doAction = function (result, fromScreen) {
  SC.state.lastResult = result;
  // 直近結果をstateに保持（リロード後も直近1件を表示するため）
  SC.state.lastActionPopup = {
    lines: result.lines,
    ok: result.ok,
    title: result.title
  };
  // v0.25.13: 行動結果SE（成功=嬉しい音/トラブル=悲しい音。タップ音とは別。ユーザー指定）
  if (SC.audio && result && !SC.state.commsOff) {
    SC.audio.se(result.ok === false ? 'fail' : 'success');
  }
  // v0.25.17: 行動後演出（動画19-55-34実測: 青帯「Support Skill」カットイン+施設Lvアップ大数字）
  // renderが#appを書き換えた後に再生する必要があるためsetTimeoutで1tick遅らせる（クリックでスキップ可）
  const hasSkillFx = result && result.skillFx && result.skillFx.length;
  if ((hasSkillFx || (result && result.lvUp)) && !SC.state.commsOff && typeof document !== 'undefined') {
    const fires = hasSkillFx ? result.skillFx.slice(0, 2) : [];
    const lvUp = result.lvUp;
    setTimeout(function () {
      SC.fxBegin();
      fires.forEach(function (f) {
        SC.fxPush({ type: 'cutin', cls: 'support', logo: 'Support Skill', text: f.name + (f.sup ? '<span class="fx-cutin-sub">' + f.sup + '</span>' : ''), duration: 850 });
      });
      if (lvUp) SC.fxPush({ type: 'faclv', label: lvUp.label, lv: lvUp.lv, duration: 1000 });
      SC.fxPlay(SC.fxCollect(), null);
    }, 30);
  }
  SC.afterAction(false, fromScreen || SC.state.screen);
};

SC.afterAction = function (skipWeekResult, fromScreen) {
  const st = SC.state;
  const C = SC.CONFIG;

  if (st.week % C.WEEKS_PER_SEASON === 0) {
    // シーズン最終週: 目標判定→seasonResult（従来どおり）
    const seasonIdx = st.week / C.WEEKS_PER_SEASON - 1;
    const goal = C.seasonFanGoals[seasonIdx];
    if (st.fans < goal) { SC.setEnding('seasonFail', seasonIdx); return; }
    st.screen = 'seasonResult';
    st.seasonResult = {
      title: `シーズン${seasonIdx + 1} 目標達成！`,
      lines: [`ファン数 ${SC.fmt(st.fans)}人 / 目標 ${SC.fmt(goal)}人`,
        st.week >= C.TOTAL_WEEKS ? 'W.I.N.G.本戦への出場が決定！' : `シーズン${seasonIdx + 2}へ進みます`],
      toFinals: st.week >= C.TOTAL_WEEKS,
      pendingResult: skipWeekResult ? null : st.lastResult
    };
    // v0.25.14: シーズン最終週と約束が重なった場合＝約束守/破コミュ→シーズン結果の順（ユーザー指定）
    // 破り確定をここで前倒し判定（advanceWeekはseason-ok後なのでpromise=null化で二重判定なし）
    if (st.promise && st.week >= st.promise.targetWeek) {
      st.promise = null;
      if (!SC.tryPromiseRecover()) SC.addTension(SC.CONFIG.tension.delta.promiseBreak);
      st.promiseComm = 'broken';
    }
    if (st.promiseComm) {
      if (st.commsOff) { st.promiseComm = null; }
      else {
        st.promiseCommNext = 'seasonResult';
        st.screen = 'promiseComm';
      }
    }
    return;
  }
  if (skipWeekResult) {
    // オーディション経由: 即座に週送り
    SC.advanceWeek();
    st.screen = SC.weekStartScreen();
    return;
  }
  // v0.10: schedule/home からのレッスン・お仕事・休む → 即座に週送り＋その場に留まる
  // schedule から来た場合は schedule のまま、home から来た場合は home のまま
  const inPlace = (fromScreen === 'schedule' || fromScreen === 'home');
  if (inPlace) {
    SC.advanceWeek();
    const next = SC.weekStartScreen();
    // v0.25.9: promiseComm（約束の守/破コミュ）もここで拾う。従来はmorningだけ拾って
    //   schedule/homeに留まり、約束コミュが握りつぶされていた（ユーザー指摘の根因）
    if (next === 'morning' || next === 'promiseComm') {
      st.screen = next;
    } else {
      // 朝コミュなし: schedule/home に留まって翌週状態を表示
      st.screen = fromScreen;
    }
  } else {
    // 旧weekResult経由（デバッグ等の互換のため残存）
    st.screen = 'weekResult';
  }
};

SC.nextWeek = function () {
  SC.advanceWeek();
  SC.state.screen = SC.weekStartScreen();
};

// 約束リカバー: 全SUPPORTS+GUESTの約束リカバースキルを確率で発動。発動すればtrueを返す[仮データ]
SC.tryPromiseRecover = function () {
  const allRecoverSources = [];
  SC.SUPPORTS.forEach(function (sup) {
    if (!sup || !sup.supportSkills) return;
    sup.supportSkills.forEach(function (sk) {
      if (sk.name && sk.name.indexOf('約束リカバー') >= 0) allRecoverSources.push(sk);
    });
  });
  if (SC.GUEST && SC.GUEST.supportSkills) {
    SC.GUEST.supportSkills.forEach(function (sk) {
      if (sk.name && sk.name.indexOf('約束リカバー') >= 0) allRecoverSources.push(sk);
    });
  }
  for (let i = 0; i < allRecoverSources.length; i++) {
    const prob = SC.parseSupportSkillProb(allRecoverSources[i].raw);
    if (SC.chance(prob)) return true; // 1件でも発動すればリカバー成功[仮データ]
  }
  return false;
};

SC.advanceWeek = function () {
  const st = SC.state;
  st.lastResult = null;
  // 約束の破り判定（v0.25.8修正）: 週送りは st.week++ の前に走るため「>」だと1週遅れで発動し
  //   アイコンも残留していた（ユーザー指摘: シーズン末に出る）。いま終わった週===targetWeekで
  //   promiseが残っていれば（=約束施設を実行しなかった）その時点で破り確定→翌週頭にコミュ
  if (st.promise && st.week >= st.promise.targetWeek) {
    st.promise = null;
    // 約束リカバー判定: 発動すればテンション低下をスキップ[仮データ]
    if (!SC.tryPromiseRecover()) {
      SC.addTension(SC.CONFIG.tension.delta.promiseBreak);
    }
    st.promiseComm = 'broken';   // v0.25.5: 週明けに「約束を破った」コミュを挟む
  }
  st.week++;
  if ((st.week - 1) % SC.CONFIG.WEEKS_PER_SEASON === 0) SC.rollSeasonTrends();
  SC.applyTrendForWeek();
  SC.rollPlacement();
  SC.rollExcellent();
  SC.rollMorning();
  SC.rollSupportEvent();
};

SC.closeSeasonResult = function () {
  const st = SC.state;
  const r = st.seasonResult;
  st.seasonResult = null;
  st.lastResult = null;
  if (r && r.toFinals) {
    st.finalsStage = 'semi';
    SC.rollFinalsTrends();
    st.trend = SC.TREND_PATTERNS[st.finalsTrends[0]].slice();
    st.screen = 'home';   // v0.25.12: 本戦前も通常ホームへ（緊迫BGM+特別吹き出し。ユーザー指定）
  } else {
    SC.advanceWeek();
    st.screen = SC.weekStartScreen();
  }
};

// ---- エンディング ----
SC.setEnding = function (type, seasonIdx) {
  const st = SC.state;
  st.endedAt = Date.now();   // v0.25.9: タイマーストップ用（リザルト時点で凍結・クリアタイム計算にも使用）
  const isTrue = st.fans >= 500000;   // TrueEnd = 優勝＋Aランク（ファン50万）
  const endings = {
    seasonFail: {
      title: 'プロデュース終了……',
      lines: [`シーズン${(seasonIdx || 0) + 1}の目標ファン数 ${SC.fmt(SC.CONFIG.seasonFanGoals[seasonIdx || 0])}人に届かなかった`]
    },
    loseSemi: { title: 'W.I.N.G. 準決勝 敗退……', lines: [
      '精一杯やった。それでも届かなかった悔しさを、二人で噛みしめた。',
      'あと一歩、決勝に届かなかった。'
    ] },
    loseFinal: { title: 'W.I.N.G. 決勝 敗退……', lines: [
      '舞台の上で出し切った全てが、次の夢への道になる——そう信じて顔を上げた。',
      '決勝の舞台で及ばず。それでも準優勝は立派な成績。'
    ] },
    champion: {
      title: '🏆 W.I.N.G. 優勝！！',
      lines: isTrue ? ['頂点に立った！ そしてファン50万人達成——TrueEnd！'] : ['頂点に立った！ 最高のプロデュースだった！']
    },
    // v0.14.1: 諦める（プロデュース中断）
    giveUp: {
      title: 'プロデュース中断',
      lines: ['プロデュースを途中でやめた。']
    }
  };
  const e = endings[type];

  // v0.14.1: 全エンディングでクリアタイムを表示（230万条件・champion限定を撤廃）
  // v0.25.9: 計測終点はリザルト確定時刻（endedAt）——ending画面で放置しても増えない
  if (st.startedAt !== null) {
    const elapsedMs = (st.endedAt || Date.now()) - st.startedAt;
    const totalSec = Math.floor(elapsedMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = function (n) { return String(n).padStart(2, '0'); };
    const timeStr = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    e.lines = [`⏱ クリアタイム ${timeStr}`].concat(e.lines);
  }
  // v0.25.14: 表記整理（ユーザー指定: 「最終ステータス：」ラベル不要・ファン数の後に改行して親愛度・獲得SP不要）
  st.ending = {
    type: type, title: e.title,
    lines: e.lines.concat([
      '',
      `Vo ${st.stats.vo} / Da ${st.stats.da} / Vi ${st.stats.vi} / Me ${st.mental}`,
      `最終ファン数：${SC.fmt(st.fans)}人（ランク${SC.rankOf(st.fans)}）`,
      `親愛度：${st.love}（思い出Lv${SC.memoryLv()}）`
    ])
  };
  st.screen = 'ending';
  // v0.25.14: プロデュース終了＝セーブデータをリセット（ユーザー指定: F5で途中画面に戻らない・前回ログを残さない）
  try { localStorage.removeItem(SC.SAVE_KEY); } catch (err) {}
};
