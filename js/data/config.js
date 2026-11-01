// ゲーム定数（wiki実仕様準拠。推測値には[推測]コメント）
// 出典: wikiwiki 仕様考察 / オーディションの基本 / 各オーディション個別攻略 / プロデュース
window.SC = window.SC || {};

SC.CONFIG = {
  TOTAL_WEEKS: 32,
  WEEKS_PER_SEASON: 8,

  // シーズン目標ファン数（未達で強制終了）
  seasonFanGoals: [1000, 10000, 50000, 100000],

  // アイドルランク（総ファン数閾値）
  ranks: [
    { key: 'F', fans: 0 }, { key: 'E', fans: 1000 }, { key: 'D', fans: 10000 },
    { key: 'C', fans: 50000 }, { key: 'B', fans: 100000 }, { key: 'A', fans: 500000 },
    { key: 'S', fans: 1000000 }
  ],

  // ステータス上限（初期値。上限UPパネルで拡張）
  statCap: 500,

  // ---- 体力・トラブル ----
  stamina: {
    max: 100,
    cost: { lesson: 15, radio: 20, talk: 20, magazine: 5 },
    // 休む: 失敗+30 / 成功+50 / 大成功+70（確率は[推測]）
    rest: { fail: 30, success: 50, great: 70, pFail: 0.2, pGreat: 0.1 },
    troubleBase: { lesson: 70, radio: 70, talk: 70, magazine: 20 } // トラブル基準体力
  },
  perfectRate: 0.1,          // レッスン等の大成功率（wiki: 約10%）
  failStatLoss: 2,           // [推測] 失敗時ステ減
  catastropheStatLoss: 10,   // [推測] 大失敗時ステ減

  // ---- テンション（内部値0〜100） ----
  tension: {
    init: 50,
    // 顔マーク: 紫0-20 青21-40 緑41-60 黄61-80 赤81-100
    faces: [
      { key: 'purple', label: '紫', min: 0 },
      { key: 'blue',   label: '青', min: 21 },
      { key: 'green',  label: '緑', min: 41 },
      { key: 'yellow', label: '黄', min: 61 },
      { key: 'red',    label: '赤', min: 81 }
    ],
    delta: {
      promiseKeep: 25, restSuccess: 10, morningPerfect: 5, preTalkGood: 5,
      promiseDecline: -5, preTalkBad: -5, promiseBreak: -10, actionFail: -20
    },
    lessonCoef: [0, 1, 2, 3, 4],          // レッスン補正 = 1+0.025*係数
    memoryInit: [0, 100, 200, 300, 700],  // 思い出ゲージ初期値（/1000）
    memoryGoodRate: [0.40, 0.55, 0.70, 0.80, 0.90] // [推測] 思い出リールGood割合
  },

  // ---- レッスン・お仕事 基準値（施設Lv1〜5） ----
  facilities: {
    lessonVo: { label: 'ボーカルレッスン', kind: 'lesson', attr: 'vo',
      stat: [19, 22, 26, 30, 34], sp: [4, 4, 5, 6, 7], fan: [30, 120, 270, 480, 960] },
    lessonDa: { label: 'ダンスレッスン', kind: 'lesson', attr: 'da',
      stat: [19, 22, 26, 30, 34], sp: [4, 4, 5, 6, 7], fan: [30, 120, 270, 480, 960] },
    lessonVi: { label: 'ビジュアルレッスン', kind: 'lesson', attr: 'vi',
      stat: [19, 22, 26, 30, 34], sp: [4, 4, 5, 6, 7], fan: [30, 120, 270, 480, 960] },
    radio: { label: 'ラジオの収録', kind: 'radio', attr: 'vo',
      stat: [4, 4, 5, 6, 7], me: [15, 18, 21, 24, 27], sp: [4, 4, 5, 6, 7], fan: [150, 300, 600, 1000, 1500] },
    talk: { label: 'トークイベント', kind: 'talk', attr: 'da',
      stat: [4, 4, 5, 6, 7], me: [4, 4, 5, 6, 7], sp: [15, 18, 21, 24, 27], fan: [150, 300, 600, 1000, 1500] },
    magazine: { label: '雑誌の撮影', kind: 'magazine', attr: 'vi',
      stat: [4, 4, 5, 6, 7], me: [4, 4, 5, 6, 7], sp: [4, 4, 5, 6, 7], fan: [250, 500, 900, 1400, 2000] }
  },
  facilityLvMax: 5,
  facilityLvUpRate: 0.4,     // [推測] 実行時レベルアップ率（wiki:「ランダムで上昇」）
  kizunaGain: 8,             // 同席サポの絆上昇（wiki）
  excellentBonusPerIdol: 0.2,
  // Excellent発生率（ユーザー提供の実測データ2026-07-07: 絆50=0%〜100=51.3%・2次カーブが実測に最良フィット）
  // rate = (絆-50)² × 0.000205（実測点: 絆82=20.9%→式21.0% / 絆90=32.2%→32.8% / 絆100=51.3%→51.3%）
  excellentRate: function (kizuna) {
    const d = kizuna - 50;
    if (d <= 0) return 0;
    return Math.min(1, d * d * 0.000205);
  },

  // ---- コミュ ----
  morning: {
    rate: 0.3,        // [推測] 朝コミュ発生率（v0.25.44: 0.5→0.3。ユーザーFB「頻度が高いのでちょっと落として。率は適当でいい」）
    maxCount: 15,     // 1プロデュース最大15回（wiki）
    lovePerfect: 3, loveGood: 1
  },
  promise: {
    rate: 0.4,        // [推測] 朝コミュ後の約束提案率
    love: 10,
    deadlineWeeks: 2  // 今週〜2週間後（wiki）
  },
  loveBurstRate: 0.02, // [推測] 親愛度急上昇(+100)発生率
  // 親愛度→思い出Lv（wiki）
  memoryLvTable: [0, 1, 25, 50, 75, 100, 150],  // Lv0..6 の必要親愛度
  memoryLvCap: { R: 3, SR: 5, SSR: 5, UR: 6 },

  // ---- オーディション共通 ----
  audition: {
    handSize: 3,
    skillCooldown: 5,        // 使用札の再登場までのターン数（wiki: 5ターン程度）
    judge: {
      // 判定係数（wiki）
      coef: { bad: 0.5, normal: 1.0, good: 1.1, perfect: 1.5 },
      excellent: 2.0,
      reactEvery: 4,         // 4の倍数ターンで強化リアクション【wiki確認済2026-07-07: kihon「一定間隔=基本的に4の倍数のターン」】
      reactBoost: 1.5,       // 強化時Meダメ倍率（スクショ: メンタルに1.5倍ダメージ）
      reactDebuff: 10,       // 強化時 担当属性10%DOWN（%）
      reactDebuffTurns: 2
    },
    // ★配分 [流行1位, 2位, 3位]（wiki）
    stars: { ta: [20, 15, 10], la: [8, 6, 4], bonus: [4, 3, 2] },
    bonusThresholds: [0.3, 0.6, 0.9],
    trendBadge: ['★2倍', '★1.5倍', ''],
    // 思い出ゲージ（内部値0〜1000）: ターン終了時メンタル割合→増加量（wiki）
    memoryGain: [
      { mental: 1.00, gain: 100 }, { mental: 0.75, gain: 150 }, { mental: 0.50, gain: 175 },
      { mental: 0.25, gain: 200 }, { mental: 0.05, gain: 225 }, { mental: 0, gain: 1000 }
    ],
    memoryMult: [0, 0.8, 1.0, 1.2, 1.4, 2.0, 2.4], // 思い出Lv0..6 基礎倍率（Lv6は[推測]）
    // アピールメーター ゾーン構成（[キー,幅%]の並び順どおりに左→右へ描画）
    // 動画実測2026-07-07（Iron=メンタル88-100% / 19-51-30=60.6% / 19-47-38=40% / 19-50-04=14.3% ピクセル計測）:
    //   帯と判定の対応: ティール=Normal・金=Good・白=Perfect・紫=Bad（金/白は停止→判定テキストで直接確定）
    //   第2段階以降は「Bad|Normal|Good|Perfect|Good」＝Perfectの先もGood（wiki記述と一致・Goodが2分割）
    //   段階境界は wiki: 第1=100〜71%・第2=〜51%・第3=51%〜・第3/4境界は[推測]16%（旧仕様表の値を流用）
    meterStages: [
      { minMental: 0.71, zones: [['normal', 51], ['good', 24], ['perfect', 25]] },                          // 動画実測(Iron)
      { minMental: 0.51, zones: [['bad', 25], ['normal', 26], ['good', 24], ['perfect', 10], ['good', 15]] }, // 動画実測(60.6%)
      { minMental: 0.16, zones: [['bad', 22], ['normal', 24], ['good', 22], ['perfect', 3], ['good', 29]] },  // 動画実測(40%)・棒パフェ
      { minMental: 0.00, zones: [['bad', 20], ['normal', 20], ['good', 14], ['perfect', 5], ['good', 41]] }   // 動画実測(14.3%)
    ],
    meterSpeed: 1.0,          // カーソル速度（スイープ/秒）。動画実測(21-10-27 60fps・40連続フレーム目視): 1周ちょうど1.00秒
    meterHold: 0.25,          // スイープ開始前の静止時間(秒)。動画実測: バー出現後~0.25s静止→始動（ループ時の停止はなし）
    // ライバル判定分布 [Perfect, Good, Normal]（[推測] 残りBad）
    rivalJudgeBySeason: [
      [0.10, 0.50, 0.40], [0.20, 0.50, 0.30], [0.25, 0.55, 0.20], [0.30, 0.55, 0.15]
    ],
    rivalJudgeFinals: [0.35, 0.55, 0.10],
    rivalMysteryBuff: { fromTurn: 3, rate: 0.2, mult: 1.25 }, // [推測]発生率（wiki再確認2026-07-07: 「主に3T目以降に1.25倍ほど・条件不明(ランダム?)・思い出にも影響」→通常+思い出の両方に適用）
    rivalMemory: { init: 200, judgeGoodRate: 0.85 },          // [推測] ライバル思い出ゲージ初期値・リール
    preTalkGoodRate: 0.5,     // [推測] オデ前会話グッド率
    // ---- リンク/プラス/チャージ/パーフェクトライブ ----
    historyMax: 5,            // スキル履歴の保持数（wiki: 直近5回分）
    linkNeed: 2,              // [簡略化] リンク発動条件＝履歴に異なるサポート札2種（本来はユニットメンバー全員）
    linkFollowMult: 0.5,      // [推測] リンク追撃の倍率（本体アピールの50%）
    // plusBoostはv0.25.18で撤去（PLUS=extra経由の条件付き追加効果として本来仕様を実装）
    // perfectLiveStar: 削除（v0.22: ユーザー実機観察でパーフェクトライブ+9ボーナスは存在しない。★上限=90で統一）
    // wiki「朝ごはん注1: PL達成で総数99」は特別オデ限定ルールの可能性あり（未実装、SPECに記録のみ）
    chargeMult: [0.6, 0.8, 1.0, 1.2, 1.5], // [推測] チャージアピールLv1..5の倍率（思い出値に対する）
    passiveMaxPerTurn: 6,      // 1ターンのパッシブ発動上限（wiki「同一ターンにパッシブスキルが7個以上発動することもない」・ユーザー確認「6個まで」）
    passiveMaxPerTurnPUR: 8,   // v0.25.42: 編成のPがURの時だけの上限（ユーザー確認「P-UR編成時のみ8個発動する」）。SC.passiveMaxPerTurn() が選ぶ
    // v0.25.36: パッシブの効果（バフ・メンタルダメージカット・リアクション回避）が有効なターン数。ユーザー確認:「パッシブの効果はパッシブが発動したターンのみに有効」
    //   （従来は pd._buffTurns || 2 [仮データ] で常に2ターンだった）。ライブスキルが付与する効果はスキルごとの [Nターン] のまま。仮データ用 passive（IDOL/SUPPORTS の passive.effect.turns）には影響しない
    passiveEffectTurns: 1,     // ユーザー確認（2026-10-24）
    // v0.25.52: 興味操作（審査員に付く状態効果。ライバルのアピールにも効く）【wiki】スキル効果の解説「興味◯倍／興味反転／興味限定」
    //   反転後の倍率 = flipBase − 興味N倍の総積（下限 flipFloor）。memoryLimitMult＝興味限定の審査員へのライバル思い出アピール（属性の内訳を持たない）の倍率。
    //   プレイヤーの思い出は一致属性の分（2×一致）だけ残す＝同ステで半減【wiki】。ライバルも同じく半減（ユーザー確認 2026-11-01）
    interest: { flipBase: 2, flipFloor: 0.1, memoryLimitMult: 0.5 },
    // v0.25.52: 魅了【wiki】スキル効果の解説「魅了」: 付けたユニット（自分）のその審査員へのアピール +pct%（複数は加算）・最終的な興味が1倍未満なら1倍。
    //   「魅了強化アピール」は魅了の効果を boostMult 倍で計算（20%×2個×1.5＝60%UP）。従来の「魅了中はリアクションしない」は [推測] で、wiki に無いので撤去（ユーザー指定）
    charm: { pct: 20, boostMult: 1.5 },
    // v0.25.43: ライブスキルの自動装備（SC.applyCheatAllPanels。本編のチート全習得・シミュの「自動」枠）で、全体アピール札でも倍率がこの値以下のものは「取らない」扱い（優先順の最後尾＝単体アピール札の後・効果札の前）。
    //   ユーザー指定「そらカラフル、幾千の の1.5倍全体は取らない方がデフォルト（2.5全体は取る）」。倍率は札の mult（可変倍率『最大N倍』は最大倍率）
    autoEquipAllMultMax: 1.5,
    // 動画の350表示はミドルモード時のwiki個別値と不一致だったが、
    // 動画2本ともミドルモードであることをユーザーが確認（2026-07-03）。wiki個別値が正、350は誤読。
    // rivalMentalObservedは削除し、audition.js は def.rivalMental を使用。
    // AUDITIONSの rivalMental 列がwiki値（buffet=180, 歌姫=600 等）
  },

  // ---- サポートイベント（[推測] 週初めランダム発生） ----
  supportEvent: { rate: 0.25, kizuna: 15, stat: 4, sp: 5 },

  // ---- タッチコミュ（[推測] 週1回。親愛度かテンションが上がる） ----
  touch: { love: 1, tension: 3 },

  // ---- 振り返り（スキルパネル）----
  // SPコストは動画実測（SP10/20/30/40/50の5段階深度依存）。Ⅱ=PLUS／Ⅲ・Ⅳ=LINK [簡略化]
  // owner: 'p'=Pアイドル / 0〜3=サポA〜D / 'guest'=ゲスト [仮データ]
  // type: 'live'=ライブスキルに追加 / 'cap'=ステ上限UP / 'passive'=パッシブ習得 / 'stat'=即時加算（一回きり）
  panel: {
    // ---- P（owner:'p'）: Voツリー ----
    vo2: { name: 'ボーカルアピールⅡ', type: 'live', attr: 'vo', mult: 1.5, sp: 10, owner: 'p', plus: { turnMin: 3 } },
    vo3: { name: 'ボーカルアピールⅢ', type: 'live', attr: 'vo', mult: 2.0, sp: 20, owner: 'p', req: 'vo2', link: true },
    vo4: { name: 'ボーカルアピールⅣ', type: 'live', attr: 'vo', mult: 2.5, sp: 40, owner: 'p', req: 'vo3', link: true },
    // P固有スキル（実機のP固有スキル例「DIVA+」を一般化した仮データ）
    // 全審査員にVo4.5倍アピール＋自身のメンタル25%減＋メンタル減少が大きいほどVoバフUP(最大150%)[3T]
    pSolo: { name: 'スポットライト・ソロ', type: 'live', attr: 'vo', mult: 4.5, sp: 50, owner: 'p', req: 'vo4',
      allJudges: true, selfDmg: 0.25, condBuff: { attr: 'vo', pctMax: 150, turns: 3 }, link: true },
    // Pパッシブ [仮データ]
    pPassive: { name: 'パッシブ: ここから本番！', type: 'passive', owner: 'p', holder: 'p', sp: 10 },

    // ---- サポA・Vo（owner:0）----
    aPassive: { name: 'パッシブ: Vocalの流儀', type: 'passive', owner: 0, holder: 0, sp: 10 },
    capVo: { name: 'Vo上限＋50', type: 'cap', attr: 'vo', add: 50, sp: 30, owner: 0, req: 'aPassive' },

    // ---- サポB・Da（owner:1）----
    da2: { name: 'ダンスアピールⅡ', type: 'live', attr: 'da', mult: 1.5, sp: 10, owner: 1, plus: { turnMin: 3 } },
    da3: { name: 'ダンスアピールⅢ', type: 'live', attr: 'da', mult: 2.0, sp: 20, owner: 1, req: 'da2', link: true },
    da4: { name: 'ダンスアピールⅣ', type: 'live', attr: 'da', mult: 2.5, sp: 40, owner: 1, req: 'da3', link: true },
    bPassive: { name: 'パッシブ: Danceの鼓動', type: 'passive', owner: 1, holder: 1, sp: 10 },
    capDa: { name: 'Da上限＋50', type: 'cap', attr: 'da', add: 50, sp: 30, owner: 1, req: 'bPassive' },

    // ---- サポC・Vi（owner:2）----
    vi2: { name: 'ビジュアルアピールⅡ', type: 'live', attr: 'vi', mult: 1.5, sp: 10, owner: 2, plus: { turnMin: 3 } },
    vi3: { name: 'ビジュアルアピールⅢ', type: 'live', attr: 'vi', mult: 2.0, sp: 20, owner: 2, req: 'vi2', link: true },
    vi4: { name: 'ビジュアルアピールⅣ', type: 'live', attr: 'vi', mult: 2.5, sp: 40, owner: 2, req: 'vi3', link: true },
    cPassive: { name: 'パッシブ: Visualの華', type: 'passive', owner: 2, holder: 2, sp: 10 },
    capVi: { name: 'Vi上限＋50', type: 'cap', attr: 'vi', add: 50, sp: 30, owner: 2, req: 'cPassive' },

    // ---- サポD（owner:3）: メンタル回復ツリー ----
    dPassive: { name: 'パッシブ: 励まし上手', type: 'passive', owner: 3, holder: 3, sp: 10 },
    heal10: { name: 'メンタル10%回復', type: 'live', heal: 0.10, sp: 20, owner: 3, req: 'dPassive' },

    // ---- ゲスト（owner:'guest'）[仮データ] ----
    gMental: { name: 'メンタルトレーニング', type: 'stat', attr: 'me', add: 30, sp: 20, owner: 'guest' },
    gSp:     { name: '効率のいい練習法', type: 'stat', spGain: 30, sp: 30, owner: 'guest', req: 'gMental' }
  },

  // ステータスのランク文字（動画実測: E130-191 / D212-280 / C380 / B422 / A571 と整合する100刻み[推測]）
  statRanks: [
    { key: 'F', min: 0 }, { key: 'E', min: 100 }, { key: 'D', min: 200 }, { key: 'C', min: 300 },
    { key: 'B', min: 400 }, { key: 'A', min: 500 }, { key: 'S', min: 600 }
  ],

  // オーディション難易度（動画実測: ichiban=1, buffet=11, odotte=15。他は[推測]）
  auditionDifficulty: {
    ichiban: 1, utaunja: 2, otome: 3, kirakira: 5, asagohan: 8,
    newbeat: 6, genki: 7, yuugata: 8, hoppin: 10, elebest: 13,
    buffet: 11, popon: 12, spotlight: 14, odotte: 15, no1: 20,
    megami: 16, hello: 17, festival: 18, legend: 19, nanairo: 21, utahime: 23, kaeritakunai: 25,
    semi: 20, final: 22
  },

  // 推奨能力値（動画実測の3件のみ。他は未測定）
  auditionRecommend: {
    ichiban: { vo: 70, me: 70 },
    buffet: { vo: 390, me: 250 },
    odotte: { vo: 380, me: 280 }
  },

  // 持ち込みアイテム（プロデュース開始時に2枠選択。[仮データ]）
  // 実測例: ボーカル応用知識本=開始時Vo+60
  produceItems: [
    { key: 'bookVo', name: 'ボーカル応用知識本', desc: '開始時 Vo+60', stat: 'vo', v: 60 },
    { key: 'bookDa', name: 'ダンス応用知識本', desc: '開始時 Da+60', stat: 'da', v: 60 },
    { key: 'bookVi', name: 'ビジュアル応用知識本', desc: '開始時 Vi+60', stat: 'vi', v: 60 },
    { key: 'bookMe', name: 'メンタル読本', desc: '開始時 Me+30', stat: 'me', v: 30 },
    { key: 'spNote', name: 'レッスンノート', desc: '開始時 SP+50', sp: 50 },
    // v0.25.13: 実機アイテム2種（ユーザー指定・スクショ222653/222713実測）
    { key: 'memo', name: '秘密のメモ帳', desc: 'コミュの選択肢の結果（Perfect/Good/Normal）が見える' },
    { key: 'trendMag', name: '流行雑誌', desc: '使用すると流行がランダムに変わる（1回）' }
  ],

  // コンティニューチケット初期所持数（[仮]。実機は蓄積アイテム、動画では53枚所持を確認）
  continueTicketInit: 1,

  // v0.10.1: タイムアタック表示の対象ファン数下限（WING優勝かつこの値以上でクリアタイム表示）
  timeAttackFans: 2300000
};

// v0.23: ユニットメンバーマッピング（idolNo文字列のリスト）
// P+サポA〜D の編成で「○○全員がライブに参加」条件を判定するために使用
// 短縮名（イルミネ/放クラ/アルスト）と正式名を両方登録（cards.jsの条件文がどちらを使うか不定なため）
SC.UNIT_MEMBERS = {
  'イルミネーションスターズ': ['001','002','003'],
  'イルミネ': ['001','002','003'],
  'アンティーカ': ['004','005','006','007','008'],
  '放課後クライマックスガールズ': ['009','010','011','012','013'],
  '放クラ': ['009','010','011','012','013'],
  'アルストロメリア': ['014','015','016'],
  'アルスト': ['014','015','016'],
  'ストレイライト': ['017','018','019'],
  'ストレイ': ['017','018','019'],   // v0.25.28: 短縮名（「ストレイ全員が…」条件14件が常に不成立だった）
  'ノクチル': ['020','021','022','023'],
  'シーズ': ['024','025'],
  'コメティック': ['026','027','028']
};

// ---- オーディションDB（ミドル基準。hp/dmg/atk = [ビギナー, ミドル, マスター]） ----
// rivals: fav=得意属性(必ずExcellent) / r=[ビギナー, ミドル, マスター]の行動型
//   'c231'  = 変遷231（流2→流3→流1の繰り返し）
//   's1>2'  = 流行1スピア→(退場後)流行2へ移行
// statReward: base → Vo/Da/Viのうち2つ+base、ランダムな1つ+base*2（wiki）
SC.AUDITIONS = [
  // ======== シーズン1 ========
  { id: 'ichiban', season: 0, name: '明日のアイドル一番星', fans: 1000,
    hp: [2400, 2400, 3600], dmg: [2, 3, 4], way: 2, statReward: 2, rivalMental: 100,
    atk: [176, 196, 294], rivals: [
      { name: '灯織', fav: 'vi', r: ['c312', 'c312', 'c312'] },
      { name: 'めぐる', fav: 'vo', r: ['c123', 'c123', 'c123'] }
    ] },
  { id: 'utaunja', season: 0, name: '歌ウンジャNIGHT？', fans: 2000,
    hp: [5200, 5200, 7800], dmg: [3, 4, 5], way: 2, statReward: 3, rivalMental: 120,
    atk: [239, 265, 530], rivals: [
      { name: '摩美々', fav: 'vo', r: ['c213', 'c213', 's2>1'] },
      { name: '咲耶', fav: 'da', r: ['c231', 's2>3', 's1>3'] }
    ] },
  { id: 'otome', season: 0, name: 'とどけ！オトメ☆ファンファーレ', fans: 3000,
    hp: [6500, 6500, 9750], dmg: [4, 6, 8], way: 2, statReward: 4, rivalMental: 150,
    atk: [529, 588, 1059], rivals: [
      { name: '結華', fav: 'vi', r: ['c321', 'c321', 's2>1'] },
      { name: '霧子', fav: 'da', r: ['c312', 's3>1', 's1>3'] }
    ] },
  { id: 'kirakira', season: 0, name: '今がキラキラ！おもいッきりアイドル', fans: 5000,
    unlock: { rank: 'E' }, hp: [12000, 12000, 18000], dmg: [6, 9, 12], way: 2, statReward: 5,
    rivalMental: 150, atk: [848, 942, 1884], rivals: [
      { name: '果穂', fav: 'vo', r: ['s2>1', 's1>2', 's1>2'] },
      { name: '真乃', fav: 'da', r: ['c123', 's1>2', 's1>2'] },
      { name: '灯織', fav: 'vi', r: ['c312', 'c132', 's2>1'] }
    ] },
  { id: 'asagohan', season: 0, name: 'おはよう街角の朝ごはん', fans: 40000, limited: true,
    unlock: { rank: 'D', event: true }, hp: [15000, 15000, 22500], dmg: [10, 15, 20], way: 2,
    statReward: 10, rivalMental: 250, atk: [1182, 1315, 2630], favRandom: true,
    stars: { ta: [4, 3, 2], la: [4, 3, 2], bonus: [12, 9, 6] }, rivals: [
      { name: '果穂', fav: null, r: ['c123', 's1>2', 's1>2'] },
      { name: '真乃', fav: null, r: ['s2>3', 's2>3', 's2>3'] },
      { name: '灯織', fav: null, r: ['c321', 's3>2', 's3>2'] }
    ] },

  // ======== シーズン2 ========
  { id: 'newbeat', season: 1, name: 'NEW BE@T', fans: 3000,
    hp: [5000, 5000, 7500], dmg: [7, 11, 15], way: 2, statReward: 3, rivalMental: 150,
    atk: [301, 334, 501], rivals: [
      { name: '咲耶', fav: 'vi', r: ['c312', 'c312', 'c312'] },
      { name: '結華', fav: 'vo', r: ['c123', 'c123', 's2>1'] },
      { name: '霧子', fav: 'vi', r: ['s2>1', 's1>3', 's1>3'] }
    ] },
  { id: 'genki', season: 1, name: 'ハッピー☆元気Show☆パーリータイム', fans: 5000,
    hp: [7500, 7500, 11250], dmg: [9, 14, 19], way: 2, statReward: 4, rivalMental: 180,
    atk: [405, 450, 765], rivals: [
      { name: '樹里', fav: 'vo', r: ['c321', 'c321', 'c321'] },
      { name: '凛世', fav: 'da', r: ['s3>1', 's3>1', 's2>1'] },
      { name: '夏葉', fav: 'vi', r: ['s2>3', 's1>2', 's1>2'] }
    ] },
  { id: 'yuugata', season: 1, name: '夕方ワイドアイドル一番！', fans: 10000,
    hp: [12000, 12000, 18000], dmg: [10, 15, 20], way: 2, statReward: 5, rivalMental: 210,
    atk: [787, 874, 1399], rivals: [
      { name: '千雪', fav: 'vo', r: ['c231', 'c231', 'c231'] },
      { name: '真乃', fav: 'da', r: ['s3>2', 's3>2', 's1>2'] },
      { name: '灯織', fav: 'vo', r: ['c312', 'c312', 'c312'] }
    ] },
  { id: 'hoppin', season: 1, name: 'HOPPIN JAM↑', fans: 15000,
    unlock: { rank: 'D' }, hp: [25000, 25000, 37500], dmg: [11, 16, 21], way: 3, statReward: 6,
    rivalMental: 225, atk: [1350, 1500, 3000], rivals: [
      { name: 'めぐる', fav: 'da', r: ['c123', 'c123', 'c123'] },
      { name: '摩美々', fav: 'vi', r: ['c213', 'c213', 's2>1'] },
      { name: '咲耶', fav: 'da', r: ['s2>3', 's2>3', 's2>3'] },
      { name: '結華', fav: 'vi', r: ['c321', 'c321', 'c312'] }
    ] },
  { id: 'elebest', season: 1, name: 'エレぇベスト', fans: 100000, limited: true,
    unlock: { memLv: 2, event: true }, hp: [35000, 35000, 52500], dmg: [12, 18, 24], way: 3,
    statReward: 10, rivalMental: 270, atk: [1440, 1600, 3200], reactDebuff: 80, reactZeroDmg: true,
    stars: { ta: [8, 6, 4], la: [20, 15, 10], bonus: [4, 3, 2] }, rivals: [
      { name: 'めぐる', fav: 'da', r: ['c123', 'c123', 'c123'] },
      { name: '摩美々', fav: 'vi', r: ['c213', 'c213', 'c213'] },
      { name: '咲耶', fav: 'da', r: ['s2>1', 's1>2', 's1>2'] },
      { name: '結華', fav: 'vi', r: ['c321', 'c321', 'c321'] }
    ] },

  // ======== シーズン3 ========
  { id: 'buffet', season: 2, name: 'iDOLBuffet アイドルビュッフェ', fans: 15000,
    hp: [11000, 11000, 16500], dmg: [9, 14, 19], way: 3, statReward: 4, rivalMental: 180,
    atk: [636, 706, 1272], rivals: [
      { name: '霧子', fav: 'vo', r: ['s3>1', 's3>1', 's3>1'] },
      { name: '果穂', fav: 'da', r: ['s2>1', 's1>2', 's2>1'] },
      { name: '真乃', fav: 'vi', r: ['c123', 's1>2', 's1>2'] },
      { name: '灯織', fav: 'vi', r: ['c132', 'c132', 'c132'] }
    ] },
  { id: 'popon', season: 2, name: 'POP-ON!', fans: 20000,
    hp: [18000, 18000, 27000], dmg: [11, 17, 23], way: 3, statReward: 5, rivalMental: 210,
    atk: [834, 927, 1668], rivals: [
      { name: '咲耶', fav: 'vo', r: ['c312', 'c312', 'c312'] },
      { name: '結華', fav: 'vo', r: ['c123', 'c123', 'c123'] },
      { name: '霧子', fav: 'da', r: ['s2>1', 's1>3', 's1>3'] },
      { name: '樹里', fav: 'vi', r: ['c321', 'c321', 'c321'] }
    ] },
  { id: 'spotlight', season: 2, name: 'SPOT LIGHTのせいにして…', fans: 40000,
    hp: [40000, 40000, 60000], dmg: [13, 19, 25], way: 3, statReward: 6, rivalMental: 300,
    atk: [2288, 2542, 4576], rivals: [
      { name: '凛世', fav: 'da', r: ['s3>1', 's3>1', 's3>1'] },
      { name: '夏葉', fav: 'vo', r: ['s2>1', 's1>2', 's1>2'] },
      { name: '千雪', fav: 'vo', r: ['c231', 'c231', 'c231'] },
      { name: '真乃', fav: 'vi', r: ['s3>2', 's3>2', 's2>1'] }
    ] },
  { id: 'odotte', season: 2, name: '踊っていいとも？増刊号', fans: 50000,
    unlock: { rank: 'C' }, hp: [52000, 52000, 78000], dmg: [17, 26, 35], way: 3, statReward: 7,
    rivalMental: 350, atk: [2746, 3050, 6100], rivals: [
      { name: '灯織', fav: 'da', r: ['c312', 'c312', 's1>2'] },
      { name: 'めぐる', fav: 'vo', r: ['c123', 'c123', 'c123'] },
      { name: '摩美々', fav: 'vi', r: ['c213', 'c213', 'c213'] },
      { name: '咲耶', fav: 'vo', r: ['s2>3', 's2>3', 's2>3'] },
      { name: '結華', fav: 'da', r: ['c321', 'c321', 'c321'] }
    ] },
  { id: 'no1', season: 2, name: 'めざせアイドルNo.1', fans: 50000, limited: true,
    unlock: { kizunaRed: 3, event: true }, hp: [210000, 210000, 315000], dmg: [13, 20, 27],
    way: 4, statReward: 10, statRewardDouble: 50, rivalMental: 400, atk: [3294, 3660, 7320],
    special: 'no1', // 審査員: 2ターン毎にMeダメ0&属性100%UP[2T]・行動順がGoodより先
    rivals: [
      { name: '灯織', fav: 'da', r: ['c213', 'c213', 'c123'] },
      { name: 'めぐる', fav: 'vo', r: ['c231', 'c231', 'c213'] },
      { name: '摩美々', fav: 'vi', r: ['s2>1', 's1>2', 's1>2'] },
      { name: '咲耶', fav: 'vo', r: ['s3>2', 's1>2', 's2>1'] },
      { name: '結華', fav: 'da', r: ['c123', 's1>2', 's1>2'] }
    ] },

  // ======== シーズン4 ========
  { id: 'megami', season: 3, name: 'アイドルの女神様', fans: 15000,
    hp: [20000, 20000, 30000], dmg: [15, 23, 31], way: 3, statReward: 5, rivalMental: 300,
    atk: [1624, 1804, 3158], rivals: [
      { name: '霧子', fav: 'vi', r: ['s3>1', 's3>1', 's3>1'] },
      { name: '果穂', fav: 'vo', r: ['s2>1', 's1>2', 's1>2'] },
      { name: '真乃', fav: 'da', r: ['c123', 's1>2', 's1>2'] },
      { name: '灯織', fav: 'vo', r: ['c132', 'c132', 'c132'] },
      { name: '咲耶', fav: 'da', r: ['c312', 'c312', 'c312'] }
    ] },
  { id: 'hello', season: 3, name: "LET'S SAY “HELLO!!”", fans: 25000,
    hp: [25000, 25000, 37500], dmg: [17, 26, 35], way: 3, statReward: 6, rivalMental: 340,
    atk: [2296, 2552, 4084], rivals: [
      { name: '結華', fav: 'vi', r: ['c123', 'c123', 'c123'] },
      { name: '霧子', fav: 'da', r: ['c132', 's1>3', 's1>3'] },
      { name: '樹里', fav: 'vi', r: ['c321', 'c321', 'c321'] },
      { name: '凛世', fav: 'vo', r: ['s3>1', 's3>1', 's2>3'] },
      { name: '夏葉', fav: 'da', r: ['s2>1', 's1>2', 's1>2'] }
    ] },
  { id: 'festival', season: 3, name: 'オールアイドル感謝FESTIVAL', fans: 50000,
    hp: [71500, 71500, 107250], dmg: [18, 27, 36], way: 3, statReward: 7, rivalMental: 450,
    atk: [3652, 4058, 8116], rivals: [
      { name: '千雪', fav: 'vi', r: ['c231', 'c231', 'c231'] },
      { name: '真乃', fav: 'vi', r: ['s3>2', 's3>2', 's1>2'] },
      { name: '灯織', fav: 'vo', r: ['c312', 'c312', 'c312'] },
      { name: 'めぐる', fav: 'vo', r: ['c123', 'c123', 'c123'] },
      { name: '摩美々', fav: 'da', r: ['c213', 'c213', 'c213'] }
    ] },
  { id: 'legend', season: 3, name: 'THE LEGEND', fans: 100000,
    unlock: { rank: 'B' }, hp: [75000, 75000, 112500], dmg: [20, 30, 40], way: 3, statReward: 8,
    rivalMental: 470, atk: [3826, 4250, 8500], rivals: [
      { name: '咲耶', fav: 'vi', r: ['c213', 's2>3', 's1>2'] },
      { name: '結華', fav: 'da', r: ['c321', 'c321', 'c231'] },
      { name: '霧子', fav: 'vo', r: ['s3>1', 's3>1', 'c231'] },
      { name: '果穂', fav: 'vo', r: ['c123', 's1>2', 's1>2'] },
      { name: '真乃', fav: 'da', r: ['s2>1', 's1>2', 's1>2'] }
    ] },
  { id: 'nanairo', season: 3, name: '七彩メモリーズ', fans: 200000,
    unlock: { rank: 'A' }, noBeginner: true, hp: [null, 90000, 135000], dmg: [null, 36, 48],
    way: 3, statReward: 9, rivalMental: 520, atk: [null, 7245, 11592], rivals: [
      { name: '灯織', fav: 'vi', r: [null, 'c132', 'c123'] },
      { name: '咲耶', fav: 'vo', r: [null, 'c312', 'c123'] },
      { name: '結華', fav: 'vi', r: [null, 'c123', 'c213'] },
      { name: '霧子', fav: 'vo', r: [null, 's1>3', 'c213'] },
      { name: '樹里', fav: 'da', r: [null, 'c321', 's1>2'] }
    ] },
  { id: 'utahime', season: 3, name: '歌姫楽宴', fans: 300000,
    unlock: { rank: 'S' }, noBeginner: true, hp: [null, 144000, 216000], dmg: [null, 40, 53],
    way: 3, statReward: 10, rivalMental: 600, atk: [null, 10551, 15828], rivals: [
      { name: '凛世', fav: 'vi', r: [null, 's3>1', 's2>3'] },
      { name: '夏葉', fav: 'vo', r: [null, 's1>2', 's1>2'] },
      { name: '千雪', fav: 'da', r: [null, 'c231', 'c231'] },
      { name: '真乃', fav: 'vo', r: [null, 's3>2', 's3>2'] },
      { name: '灯織', fav: 'da', r: [null, 'c312', 'c312'] }
    ] },
  { id: 'kaeritakunai', season: 3, name: '今夜は帰りたくない！', fans: 250000, limited: true,
    unlock: { mental: 500, event: true }, noBeginner: true, hp: [null, 300000, 450000],
    dmg: [null, 30, 40], way: 2, statReward: 30, statRewardDouble: 150, rivalMental: 650,
    atk: [null, 7359, 11094],
    stars: { ta: [8, 6, 4], la: [20, 15, 10], bonus: [4, 3, 2] }, rivals: [
      { name: '果穂', fav: 'vi', r: [null, 's1>2', 's1>2'] },
      { name: '真乃', fav: 'da', r: [null, 's1>2', 's1>2'] },
      { name: '咲耶', fav: 'vo', r: [null, 's2>3', 's2>3'] },
      { name: '結華', fav: 'da', r: [null, 'c321', 'c321'] },
      { name: '霧子', fav: 'vi', r: [null, 'c312', 'c312'] }
    ] },

  // ======== W.I.N.G.本戦（1位のみ通過。敗退で終了） ========
  { id: 'semi', season: 'semi', name: 'W.I.N.G. 準決勝', fans: 5000, passRank: 1,
    hp: [66000, 66000, 99000], dmg: [17, 25, 40], way: 3,
    finalsReward: { stat: 20, sp: 40 }, rivalMental: 450, atk: [3582, 3980, 5970], rivals: [
      { name: '真乃', fav: 'vi', r: ['c213', 's1>2', 's1>2'] },
      { name: '灯織', fav: 'vi', r: ['c132', 'c132', 'c231'] },
      { name: '咲耶', fav: 'vo', r: ['c312', 'c312', 'c231'] },
      { name: '結華', fav: 'vo', r: ['c123', 'c123', 's1>2'] },
      { name: '霧子', fav: 'da', r: ['c132', 's1>3', 's1>3'] }
    ] },
  { id: 'final', season: 'final', name: 'W.I.N.G. 決勝', fans: 10000, passRank: 1,
    hp: [72000, 72000, 108000], dmg: [10, 15, 40], way: 3,
    finalsReward: { stat: 30, sp: 60 }, rivalMental: 540, atk: [4172, 4636, 6954], rivals: [
      { name: '樹里', fav: 'vi', r: ['c321', 'c321', 's1>2'] },
      { name: '凛世', fav: 'da', r: ['s3>1', 's3>1', 'c213'] },
      { name: '夏葉', fav: 'vo', r: ['c123', 's1>2', 's1>2'] },
      { name: '千雪', fav: 'vo', r: ['c231', 'c231', 'c231'] },
      { name: '真乃', fav: 'da', r: ['s3>2', 's3>2', 'c312'] }
    ] }
];

// v0.25.29: アイドル短縮名（idolNo→手札のサポ札に付ける名前バッジ用。ユーザー指定）
// SC.CARDS.idols の全番号を網羅。無い番号は SC.idolShortName(no)（state.js）がフルネームで代替する
SC.IDOL_SHORT_NAME = {
  '001': '真乃', '002': '灯織', '003': 'めぐる', '004': '恋鐘', '005': '摩美々', '006': '咲耶', '007': '結華',
  '008': '霧子', '009': '果穂', '010': '智代子', '011': '樹里', '012': '凛世', '013': '夏葉', '014': '甘奈',
  '015': '甜花', '016': '千雪', '017': 'あさひ', '018': '冬優子', '019': '愛依', '020': '透', '021': '円香',
  '022': '小糸', '023': '雛菜', '024': 'にちか', '025': '美琴', '026': 'ルカ', '027': '羽那', '028': 'はるき',
  '091': 'はづき', '801': 'ルビー', '802': 'かな', '803': 'MEMちょ', '804': 'あかね'
};

// v0.25.31: おまかせ編成（アイドル別）。出典=Pカップ集計スプレッドシート（docs.google.com/spreadsheets/d/1mEdwfivki_AKajZda157Ye2aZl6dXoal5xSX-Z-dHt0）
//   8.5thの各アイドル1位の編成。1位が空欄のアイドルは8thの1位。摩美々・ルカは両方空欄のためユーザー指定（2026-10-23）
//   愛称→カードIDの解決: シート内の愛称対応表＋PカードMDの「入手方法」（パラ=パラレル/キャス=キャスティング/マイ=My Songs/トワ=トワイライツ/プレ=プレリュード）
//   [推測] 透のゲスト「BD小糸」=特別をめいっぱい（対応表になく、2025/11/11実装の期間限定から判断）
SC.OMAKASE_LOADOUTS = {
  '001': { src: '8.5th 1位', p: '001_あなたと、いただきます_P-SSR',
    supports: ['014_傍に……_S-SSR', '003_門出を飾る_S-SSR', '013_ビードロの翳_S-SSR', '002_言葉にならないサプライズ_S-SSR'], guest: '025_REHEARSE_S-UR' },
  '002': { src: '8.5th 1位', p: '002_The thing is_P-SSR',
    supports: ['003_君色オーバーラップ_S-UR', '008_寛・汗・幽・湯_S-SSR', '006_かっこよさの定義_S-SSR', '021_ナカキヨノ_S-SSR'], guest: '016_そらカラフル、幾千の_S-SSR' },
  '003': { src: '8.5th 1位', p: '003_ふたり色　クレオール_P-SSR',
    supports: ['025_REHEARSE_S-UR', '002_言葉にならないサプライズ_S-SSR', '013_ビードロの翳_S-SSR', '014_傍に……_S-SSR'], guest: '001_こころ、みちびく。ゆかし夜_S-SSR' },
  '004': { src: '8.5th 1位', p: '004_思いがけず、ジェラシー_P-SSR',
    supports: ['005_フローラル・レミニセンス_S-SSR', '006_かわいいひと_S-SSR', '007_いたずら猫_S-SSR', '008_円環 -Halo around-_S-SSR'], guest: '025_REHEARSE_S-UR' },
  '005': { src: '8.5th 3位（1位空欄のためユーザー指定）', p: '005_ダイブ・My・ハート_P-SSR',
    supports: ['006_かっこよさの定義_S-SSR', '003_君色オーバーラップ_S-UR', '021_ナカキヨノ_S-SSR', '016_そらカラフル、幾千の_S-SSR'], guest: '008_寛・汗・幽・湯_S-SSR' },
  '006': { src: '8.5th 1位', p: '006_いつかのアルファルドへ_P-SSR',
    supports: ['003_君色オーバーラップ_S-UR', '008_寛・汗・幽・湯_S-SSR', '016_そらカラフル、幾千の_S-SSR', '021_ナカキヨノ_S-SSR'], guest: '007_一夏・泡沫・ギフテッド_S-SSR' },
  '007': { src: '8.5th 1位', p: '007_心、知れて_P-SSR',
    supports: ['025_REHEARSE_S-UR', '013_ビードロの翳_S-SSR', '014_傍に……_S-SSR', '022_そらいろの海_S-SSR'], guest: '004_にゃんにゃんにゃ～ん♡_S-SSR' },
  '008': { src: '8.5th 1位', p: '008_縷・縷・屡・来_P-SSR',
    supports: ['025_REHEARSE_S-UR', '003_門出を飾る_S-SSR', '004_にゃんにゃんにゃ～ん♡_S-SSR', '014_傍に……_S-SSR'], guest: '013_ビードロの翳_S-SSR' },
  '009': { src: '8.5th 1位', p: '009_日刊ウィズ・ユー！_P-SSR',
    supports: ['025_REHEARSE_S-UR', '013_ビードロの翳_S-SSR', '014_傍に……_S-SSR', '022_そらいろの海_S-SSR'], guest: '010_リアルラックにお願い☆★_S-SSR' },
  '010': { src: '8th 1位', p: '010_はじめましてラストダンス_P-SSR',
    supports: ['003_君色オーバーラップ_S-UR', '007_一夏・泡沫・ギフテッド_S-SSR', '012_遠き御空_S-SSR', '021_ナカキヨノ_S-SSR'], guest: '013_コンビ・コンビニエンス_S-SSR' },
  '011': { src: '8th 1位', p: '011_sparkle,,,_P-SSR',
    supports: ['015_A Kiss to JOL_S-UR', '009_チルドレンモード！_S-SSR', '026_JUNK STAR_S-SSR', '014_OT♡NAメイクヘンシン☆_S-SSR'], guest: '010_Perfect☆February_S-SSR' },
  '012': { src: '8th 1位', p: '012_晩秋ろまんす_P-SSR',
    supports: ['015_A Kiss to JOL_S-UR', '010_Perfect☆February_S-SSR', '013_今夜限り_S-SSR', '026_JUNK STAR_S-SSR'], guest: '091_輝きを支える_S-SSR' },
  '013': { src: '8th 1位', p: '013_a[___]ction_P-SSR',
    supports: ['017_くっつく、くっつかない_S-UR', '014_OT♡NAメイクヘンシン☆_S-SSR', '009_チルドレンモード！_S-SSR', '010_◎もちもちよこ◎_S-SSR'], guest: '011_Hearty!Holy!Party!_S-SSR' },
  '014': { src: '8.5th 1位', p: '014_前進オフェンス_P-UR',
    supports: ['015_見果てぬ先のアヴァロン_S-SSR', '016_ウォーム・スノウ_S-SSR', '025_LATE_S-SSR', '026_JUNK STAR_S-SSR'], guest: '008_潜・潜・夏・娘_S-SSR' },
  '015': { src: '8.5th 1位', p: '015_きみは相棒_P-SSR',
    supports: ['025_REHEARSE_S-UR', '013_ビードロの翳_S-SSR', '022_そらいろの海_S-SSR', '024_そういう時間、も_S-SSR'], guest: '016_溢れそうなDiary_S-SSR' },
  '016': { src: '8.5th 1位', p: '016_末永く、ふたり_P-SSR',
    supports: ['025_REHEARSE_S-UR', '013_ビードロの翳_S-SSR', '014_勇気をください_S-SSR', '015_よーいドン、の前に_S-SSR'], guest: '003_門出を飾る_S-SSR' },
  '017': { src: '8.5th 1位', p: '017_Howling_P-SSR',
    supports: ['003_君色オーバーラップ_S-UR', '016_そらカラフル、幾千の_S-SSR', '018_おっきくならなくちゃ_S-SSR', '021_ナカキヨノ_S-SSR'], guest: '091_七草はづきのプライベート_S-SSR' },
  '018': { src: '8.5th 1位', p: '018_幕間、沸々と高温_P-SSR',
    supports: ['011_1歩、60cmの距離感_S-SSR', '026_JUNK STAR_S-SSR', '014_OT♡NAメイクヘンシン☆_S-SSR', '015_見果てぬ先のアヴァロン_S-SSR'], guest: '091_輝きを支える_S-SSR' },
  '019': { src: '8th 1位', p: '019_今、できることを全て_P-SSR',
    supports: ['015_A Kiss to JOL_S-UR', '017_おめでとうを毎日_S-SSR', '018_きづけばまほろば_S-SSR', '026_JUNK STAR_S-SSR'], guest: '091_あなた次第_S-SSR' },
  '020': { src: '8th 1位', p: '020_月の下、花_P-SSR',
    supports: ['015_A Kiss to JOL_S-UR', '014_OT♡NAメイクヘンシン☆_S-SSR', '021_ワーキングスナップ～デート_S-SSR', '023_from now ♡n_S-SSR'], guest: '022_特別をめいっぱい_S-SSR' },
  '021': { src: '8.5th 1位', p: '021_ジャンク・ション_P-SSR',
    supports: ['025_REHEARSE_S-UR', '020_ひだまりの時間_S-SSR', '022_そらいろの海_S-SSR', '023_DIVEIN!_S-SSR'], guest: '013_ビードロの翳_S-SSR' },
  '022': { src: '8.5th 1位', p: '022_ちいさな巣立ち_P-SSR',
    supports: ['025_REHEARSE_S-UR', '003_門出を飾る_S-SSR', '013_ビードロの翳_S-SSR', '014_傍に……_S-SSR'], guest: '020_アメと風と_S-SSR' },
  '023': { src: '8.5th 1位', p: '023_change____P-SSR',
    supports: ['012_幸あれと_S-SSR', '024_浪漫キャメラ0号_S-SSR', '025_円環 -Halo around-_S-SSR', '026_JUNK STAR_S-SSR'], guest: '091_あなた次第_S-SSR' },
  '024': { src: '8.5th 1位', p: '024_花ノ名前_P-SSR',
    supports: ['003_君色オーバーラップ_S-UR', '015_ファストムーン・バーガリア_S-SSR', '016_そらカラフル、幾千の_S-SSR', '021_ナカキヨノ_S-SSR'], guest: '025_SPECTACLES_S-SSR' },
  '025': { src: '8.5th 1位', p: '025_YOU＆I_P-SSR',
    supports: ['003_君色オーバーラップ_S-UR', '016_そらカラフル、幾千の_S-SSR', '021_ナカキヨノ_S-SSR', '024_道しるべに灯ス_S-SSR'], guest: '091_七草はづきのプライベート_S-SSR' },
  '026': { src: 'ユーザー指定（8.5th/8thとも1位空欄）', p: '026_BLUES_P-SSR',
    supports: ['025_REHEARSE_S-UR', '013_ビードロの翳_S-SSR', '027_A Piece Of Peach_S-SSR', '028_My Christmas_S-SSR'], guest: '091_ケーキブレイク_S-SSR' },
  '027': { src: '8.5th 1位', p: '027_７日間の天使_P-SSR',
    supports: ['003_君色オーバーラップ_S-UR', '017_路地裏のRhyme_S-SSR', '016_そらカラフル、幾千の_S-SSR', '026_当たり前みたいに_S-SSR'], guest: '091_七草はづきのプライベート_S-SSR' },
  '028': { src: '8.5th 1位', p: '028_song for you_P-SSR',
    supports: ['025_REHEARSE_S-UR', '014_傍に……_S-SSR', '018_帰慕ノ姫騎士_S-SSR', '027_MANAZASHI_S-SSR'], guest: '013_ビードロの翳_S-SSR' },
};
