// プロデュースアイドル・サポートアイドルの仮データ（自由に書き換え可）
// サポートのステータスは実カードのLv値に合わせて差し替えると本物に近づく
window.SC = window.SC || {};

SC.IDOL = {
  name: 'アイドル（仮）',
  unit: 'ユニット（仮）',
  rarity: 'SSR',                 // R / SR / SSR / UR（思い出Lv上限に影響）
  initial: { vo: 50, da: 50, vi: 50, me: 50, sp: 0 },
  // 初期ライブスキル4枠（wiki: Vo1倍/Da1倍/Vi1倍/メンタル5%回復）
  initialSkills: [
    { name: 'ボーカルアピールⅠ', attr: 'vo', mult: 1.0 },
    { name: 'ダンスアピールⅠ',   attr: 'da', mult: 1.0 },
    { name: 'ビジュアルアピールⅠ', attr: 'vi', mult: 1.0 },
    { name: 'メンタル5%回復',     heal: 0.05 }
  ],
  // パッシブスキル（[仮データ] cond: always/turnMin/mentalBelow、effect: buff/heal/mem）
  passive: { name: 'ここから本番！', rate: 0.3, cond: { t: 'turnMin', v: 2 },
    effect: { t: 'mem', gain: 100 } },
  // チャージアピール（2024年追加要素。持たせる場合 { lv: 1..5 } — 思い出ゲージ上限200%化）
  chargeAppeal: null
};

// サポート編成（前4人=ライブ参加、guest=レッスンのみ）
// kizuna: 絆初期値（レアリティ・サポLv依存。仮値）
SC.SUPPORTS = [
  { name: 'サポA（Vo・SSR級）', attr: 'vo', rarity: 'SSR', stats: { vo: 180, da: 60, vi: 60, me: 80 },
    skill: { name: 'Vocal2.5倍アピール', attr: 'vo', mult: 2.5 }, kizuna: 15,
    // [仮データ] サポAにVoマスタリーを追加（SSR: Lv10→+20）
    supportSkills: [
      { name: 'ボーカルマスタリーVo', raw: '一緒にボーカルレッスンをするとVocal+<Lv*2>' }
    ],
    passive: { name: 'Vocalの流儀', rate: 0.35, cond: { t: 'always' },
      effect: { t: 'buff', attr: 'vo', pct: 15, turns: 2 } } },
  { name: 'サポB（Da・SSR級）', attr: 'da', rarity: 'SSR', stats: { vo: 60, da: 180, vi: 60, me: 80 },
    skill: { name: 'Dance2.5倍アピール', attr: 'da', mult: 2.5 }, kizuna: 15,
    // [仮データ] サポBに体力サポートを追加
    supportSkills: [
      { name: '体力サポート', raw: 'レッスンかお仕事を選択する時に<Lv*3>%の確率で体力消費量-50%' }
    ],
    passive: { name: 'Danceの鼓動', rate: 0.35, cond: { t: 'always' },
      effect: { t: 'buff', attr: 'da', pct: 15, turns: 2 } } },
  { name: 'サポC（Vi・SR級）', attr: 'vi', rarity: 'SR', stats: { vo: 50, da: 50, vi: 150, me: 70 },
    skill: { name: 'Visual2倍アピール', attr: 'vi', mult: 2.0 }, kizuna: 10,
    passive: { name: 'Visualの華', rate: 0.35, cond: { t: 'always' },
      effect: { t: 'buff', attr: 'vi', pct: 15, turns: 2 } } },
  { name: 'サポD（Vo・SR級）', attr: 'vo', rarity: 'SR', stats: { vo: 150, da: 50, vi: 50, me: 70 },
    skill: { name: 'Vocal2倍アピール', attr: 'vo', mult: 2.0 }, kizuna: 10,
    passive: { name: '励まし上手', rate: 0.4, cond: { t: 'mentalBelow', v: 0.5 },
      effect: { t: 'heal', pct: 0.05 } } }
];

SC.GUEST = { name: 'ゲスト（Me・SR級）', attr: 'me', stats: { vo: 40, da: 40, vi: 40, me: 160 }, kizuna: 10 };
