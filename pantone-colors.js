// Curated open-source Pantone color lookup table (Solid Coated, Grays, Plastics/Homeware & FHI TCX).
// Supports direct code entry (e.g. "286 C", "PANTONE 186C", "Cool Gray 5", "CG5", "19-4052 TCX") and search.

const RAW_PANTONE_TABLE = [
  // Neutrals, Whites, Blacks & Grays
  ['White', '纯白', '#ffffff', ['pure white', 'bright white', '11-0601 tcx']],
  ['Black C', '标准黑', '#2d2926', ['black']],
  ['Black 2 C', '炭黑', '#332f21'],
  ['Black 3 C', '墨绿黑', '#212721'],
  ['Black 4 C', '暖深黑', '#31261d'],
  ['Black 5 C', '紫调黑', '#3e2b2e'],
  ['Black 6 C', '深蓝黑', '#101820'],
  ['Black 7 C', '石墨灰黑', '#3d3935'],
  ['Cool Gray 1 C', '冷灰 1', '#d9d9d6', ['cg1', 'cool grey 1']],
  ['Cool Gray 2 C', '冷灰 2', '#d0d0ce', ['cg2', 'cool grey 2']],
  ['Cool Gray 3 C', '冷灰 3', '#c8c9c7', ['cg3', 'cool grey 3']],
  ['Cool Gray 4 C', '冷灰 4', '#bbbcbc', ['cg4', 'cool grey 4']],
  ['Cool Gray 5 C', '冷灰 5', '#b1b3b3', ['cg5', 'cool grey 5']],
  ['Cool Gray 6 C', '冷灰 6', '#a7a8a9', ['cg6', 'cool grey 6']],
  ['Cool Gray 7 C', '冷灰 7', '#97999b', ['cg7', 'cool grey 7']],
  ['Cool Gray 8 C', '冷灰 8', '#888b8d', ['cg8', 'cool grey 8']],
  ['Cool Gray 9 C', '冷灰 9', '#75787b', ['cg9', 'cool grey 9']],
  ['Cool Gray 10 C', '冷灰 10', '#63666a', ['cg10', 'cool grey 10']],
  ['Cool Gray 11 C', '冷灰 11', '#53565a', ['cg11', 'cool grey 11']],
  ['Warm Gray 1 C', '暖灰 1', '#d7d2cb', ['wg1', 'warm grey 1']],
  ['Warm Gray 2 C', '暖灰 2', '#cbc4bc', ['wg2', 'warm grey 2']],
  ['Warm Gray 3 C', '暖灰 3', '#bfb8af', ['wg3', 'warm grey 3']],
  ['Warm Gray 4 C', '暖灰 4', '#b6ada5', ['wg4', 'warm grey 4']],
  ['Warm Gray 5 C', '暖灰 5', '#aca39a', ['wg5', 'warm grey 5']],
  ['Warm Gray 6 C', '暖灰 6', '#a59c94', ['wg6', 'warm grey 6']],
  ['Warm Gray 7 C', '暖灰 7', '#968c83', ['wg7', 'warm grey 7']],
  ['Warm Gray 8 C', '暖灰 8', '#8c8279', ['wg8', 'warm grey 8']],
  ['Warm Gray 9 C', '暖灰 9', '#83786f', ['wg9', 'warm grey 9']],
  ['Warm Gray 10 C', '暖灰 10', '#796e65', ['wg10', 'warm grey 10']],
  ['Warm Gray 11 C', '暖灰 11', '#6e6259', ['wg11', 'warm grey 11']],
  ['420 C', '浅银灰', '#c7c9c7'],
  ['421 C', '云雾灰', '#b2b4b2'],
  ['422 C', '中浅灰', '#9ea2a2'],
  ['423 C', '石板灰', '#898d8d'],
  ['424 C', '深石灰', '#707372'],
  ['425 C', '碳灰', '#54585a'],
  ['426 C', '玄铁黑', '#25282a'],
  ['427 C', '冰霜灰', '#d0d3d4'],
  ['428 C', '淡蓝灰', '#c1c6c8'],
  ['429 C', '冷雾灰', '#a2aaad'],
  ['430 C', '钢灰', '#7c878e'],
  ['431 C', '铁青灰', '#5b6770'],
  ['432 C', '深舰灰', '#333f48'],
  ['433 C', '午夜灰', '#1d252d'],
  ['7527 C', '奶白米灰', '#d6d2c4'],
  ['7528 C', '浅沙米', '#c5b9ac'],
  ['7529 C', '燕麦棕灰', '#ad9c8e'],
  ['7530 C', '暖驼灰', '#958478'],
  ['7534 C', '亚麻浅灰', '#d5d1c5'],
  ['7535 C', '浅卡其灰', '#bab5a6'],
  ['7541 C', '极浅冷灰', '#d9e1e2'],
  ['7542 C', '淡烟蓝灰', '#a4bcc2'],
  ['7543 C', '雾霾灰蓝', '#98a4ae'],
  ['7544 C', '石板蓝灰', '#768692'],
  ['7545 C', '深蓝灰', '#425563'],
  ['7546 C', '暮色蓝灰', '#253746'],
  ['7547 C', '深海夜蓝', '#13294b'],

  // Creams, Beiges, Browns & Earth Tones
  ['7401 C', '奶油象牙白', '#f5e1a4'],
  ['7500 C', '米杏白', '#e3d5b8'],
  ['7501 C', '暖沙白', '#dac7a2'],
  ['7506 C', '柔肤奶白', '#f1d9b5'],
  ['7507 C', '浅麦芽色', '#e6c391'],
  ['468 C', '燕麦米', '#ddcba4'],
  ['467 C', '浅卡其', '#d3bc8d'],
  ['466 C', '暖卡其', '#c6aa76'],
  ['465 C', '焦糖沙', '#b9975b'],
  ['464 C', '驼棕', '#8b5b29'],
  ['4625 C', '深咖啡棕', '#4f2c1d'],
  ['476 C', '浓缩咖啡', '#4e3629'],
  ['7520 C', '浅陶土粉', '#d99a8b'],
  ['7521 C', '赤陶粉棕', '#c47a6c'],
  ['7522 C', '焦糖陶土', '#b55d4c'],
  ['7525 C', '肉桂棕', '#9a5b44'],
  ['7586 C', '铁锈红棕', '#9e472a'],

  // Reds, Corals & Pinks
  ['Red 032 C', '鲜亮红', '#ef3340', ['032 c']],
  ['Rubine Red C', '宝石红', '#ce0058', ['rubine red']],
  ['Rhodamine Red C', '玫红', '#e10098', ['rhodamine red']],
  ['Warm Red C', '暖朱红', '#f9423a', ['warm red']],
  ['178 C', '珊瑚粉红', '#ff585d'],
  ['1788 C', '番茄红', '#ee2737'],
  ['179 C', '火焰红', '#e03c31'],
  ['1795 C', '正红', '#d22630'],
  ['185 C', '经典正红', '#e4002b'],
  ['186 C', '中国红', '#c8102e'],
  ['187 C', '暗红', '#a6192e'],
  ['199 C', '绯红', '#d50032'],
  ['200 C', '酒红', '#ba0c2f'],
  ['202 C', '勃艮第红', '#862633'],
  ['205 C', '莓果粉', '#e0457b'],
  ['211 C', '糖果粉', '#f57eb6'],
  ['219 C', '亮桃红', '#da1884'],
  ['691 C', '柔樱花粉', '#ebd4d7'],
  ['692 C', '浅豆沙粉', '#e2b8bf'],
  ['693 C', '莫兰迪豆沙', '#cf95a1'],
  ['694 C', '烟灰玫瑰', '#b87686'],
  ['695 C', '复古干枯玫瑰', '#9c5669'],
  ['705 C', '极浅婴儿粉', '#f9dbe4'],
  ['706 C', '淡樱粉', '#f8c1d2'],
  ['707 C', '蜜桃粉', '#f4a1ba'],
  ['708 C', '珊瑚少女粉', '#ee7f9e'],
  ['7422 C', '淡藕荷粉', '#f1ccd7'],
  ['7423 C', '柔雾玫瑰', '#e48ba8'],
  ['7606 C', '裸粉陶土', '#d98a82'],

  // Oranges & Yellows
  ['Orange 021 C', '活力橙', '#fe5000', ['021 c']],
  ['137 C', '芒果橙黄', '#ffa300'],
  ['144 C', '琥珀橙', '#ed8b00'],
  ['1505 C', '亮橘橙', '#ff6900'],
  ['151 C', '柑橘橙', '#ff8200'],
  ['158 C', '南瓜橙', '#e87722'],
  ['165 C', '鲜珊瑚橙', '#ff671f'],
  ['1655 C', '柿子橙红', '#fc4c02'],
  ['1665 C', '砖橙红', '#dc4405'],
  ['Yellow C', '标准亮黄', '#fedd00', ['yellow']],
  ['Yellow 012 C', '柠檬正黄', '#ffd700', ['012 c']],
  ['102 C', '明快黄', '#fce300'],
  ['109 C', '向日葵黄', '#ffd100'],
  ['116 C', '金盏黄', '#ffcd00'],
  ['120 C', '鹅蛋淡黄', '#fbdb65'],
  ['121 C', '奶油黄', '#fad25a'],
  ['123 C', '暖姜黄', '#ffc72c'],
  ['1235 C', '蜂蜜金黄', '#ffb81c'],
  ['130 C', '芥末金黄', '#f2a900'],
  ['7404 C', '柔和淡黄', '#f5e050'],
  ['7406 C', '暖铬黄', '#f1c400'],
  ['7408 C', '姜饼黄', '#f0ab00'],
  ['7548 C', '金黄', '#ffc600'],

  // Greens, Mint, Sage & Teals
  ['Green C', '标准绿', '#00ab84', ['green']],
  ['320 C', '孔雀青绿', '#009ca6'],
  ['321 C', '松石青', '#008c95'],
  ['325 C', '清新薄荷青', '#64ccc9'],
  ['326 C', '蒂芙尼绿', '#00b2a9'],
  ['327 C', '祖母绿青', '#008675'],
  ['3272 C', '翠湖青绿', '#00a388'],
  ['3282 C', '深松石绿', '#008578'],
  ['3292 C', '墨松绿', '#005f56'],
  ['333 C', '冰淇淋薄荷', '#3cdbc0'],
  ['334 C', '翡翠薄荷', '#009b77'],
  ['339 C', '鲜绿松石', '#00b388'],
  ['340 C', '森林翠绿', '#00965e'],
  ['341 C', '深松针绿', '#007a53'],
  ['342 C', '墨绿', '#006747'],
  ['343 C', '松柏深绿', '#115740'],
  ['347 C', '草地正绿', '#009a44'],
  ['348 C', '经典绿', '#00843d'],
  ['354 C', '亮苹果绿', '#00b140'],
  ['355 C', '鲜叶绿', '#009639'],
  ['360 C', '青草嫩绿', '#6cc24a'],
  ['361 C', '清新草绿', '#43b02a'],
  ['368 C', '牛油果亮绿', '#78be20'],
  ['375 C', '柠檬青绿', '#97d700'],
  ['376 C', '青柠绿', '#84bd00'],
  ['5523 C', '浅鼠尾草灰绿', '#c2d3cd'],
  ['558 C', '浅豆沙绿', '#9ec3b0'],
  ['559 C', '淡灰薄荷', '#bad5c8'],
  ['563 C', '青瓷薄荷', '#74b7aa'],
  ['564 C', '淡青瓷绿', '#8fd1c4'],
  ['565 C', '极浅薄荷', '#b8e0d6'],
  ['577 C', '柔橄榄青', '#b2c891'],
  ['578 C', '淡抹茶绿', '#c4d6a4'],
  ['5773 C', '莫兰迪鼠尾草', '#8c9b78'],
  ['5763 C', '橄榄灰绿', '#6f7c59'],
  ['621 C', '奶霜薄荷白', '#dbe7e1'],
  ['622 C', '浅雾绿', '#bfd5ca'],
  ['623 C', '灰调松绿', '#94b7a7'],
  ['624 C', '复古灰绿', '#769f8d'],
  ['625 C', '深灰松绿', '#578270'],
  ['628 C', '冰川浅青', '#b8e2e8'],
  ['629 C', '水漾浅蓝绿', '#91d6e0'],
  ['630 C', '清透水蓝', '#6fc7d6'],
  ['7472 C', '清润薄荷蓝', '#5cb8b2'],
  ['7473 C', '松石青灰', '#279989'],
  ['7474 C', '深青瓷', '#007377'],
  ['7480 C', '清新薄荷绿', '#00b373'],
  ['7481 C', '青苹果绿', '#00b74f'],
  ['7487 C', '柔嫩青绿', '#9be38d'],
  ['7488 C', '清新嫩绿', '#7ae170'],
  ['7710 C', '深湖青', '#008c99'],
  ['7725 C', '复古森绿', '#007a5e'],
  ['7730 C', '苔藓绿', '#3a7d5c'],

  // Blues, Sky, Navy & Purples
  ['Process Blue C', '印刷天蓝', '#0085ca', ['process blue']],
  ['Reflex Blue C', '深宝蓝', '#001489', ['reflex blue']],
  ['270 C', '浅薰衣草紫', '#b6b8dc'],
  ['277 C', '宝宝粉蓝', '#a7c6ed'],
  ['278 C', '晴空浅蓝', '#8bb8e8'],
  ['279 C', '矢车菊蓝', '#418fde'],
  ['280 C', '深海军蓝', '#012169'],
  ['281 C', '皇家深蓝', '#00205b'],
  ['282 C', '午夜藏青', '#041e42'],
  ['285 C', '科技亮蓝', '#0072ce'],
  ['286 C', '经典宝蓝', '#0032a0'],
  ['287 C', '深湛蓝', '#003087'],
  ['290 C', '极浅冰蓝', '#b9d9eb'],
  ['291 C', '柔和天蓝', '#9bcbeb'],
  ['292 C', '明澈天蓝', '#69b3e7'],
  ['2925 C', '亮蔚蓝', '#009cde'],
  ['293 C', '钴蓝', '#003da5'],
  ['298 C', '泳池天蓝', '#41b6e6'],
  ['299 C', '沃尔玛天蓝', '#00a3e0'],
  ['300 C', '品牌正蓝', '#005eb8'],
  ['3005 C', '湖水亮蓝', '#0077c8'],
  ['301 C', '经典深蓝', '#004b87'],
  ['306 C', '清爽浅蓝', '#00b5e2'],
  ['311 C', '海岛亮青蓝', '#05c3de'],
  ['312 C', '碧海青蓝', '#00a9ce'],
  ['3125 C', '深海青蓝', '#00aec7'],
  ['542 C', '莫兰迪雾蓝', '#7ba4db'],
  ['543 C', '灰调冰蓝', '#a4c8e1'],
  ['544 C', '云朵浅灰蓝', '#bdd6e6'],
  ['545 C', '霜雾淡蓝', '#cee0ec'],
  ['549 C', '海盐灰蓝', '#6ba4b8'],
  ['550 C', '烟雨灰蓝', '#87b2c4'],
  ['551 C', '静谧浅灰蓝', '#a4c4d0'],
  ['642 C', '微雪浅蓝灰', '#d6dee5'],
  ['644 C', '柔雾蓝', '#9bb8d3'],
  ['645 C', '牛仔浅蓝', '#739abc'],
  ['646 C', '复古牛仔蓝', '#5c82a5'],
  ['647 C', '深牛仔蓝', '#236192'],
  ['648 C', '学院藏蓝', '#002f6c'],
  ['656 C', '极淡冰川蓝', '#dde5ed'],
  ['658 C', '清雅雾蓝', '#a7bcd6'],
  ['7455 C', '克莱因蓝灰', '#3f6ab2'],
  ['7457 C', '冰川浅水蓝', '#cde6ea'],
  ['7458 C', '淡湖水蓝', '#82c8d4'],
  ['7461 C', '明净天青', '#008fc5'],
  ['7689 C', '柔和蔚蓝', '#418ab3'],
  ['Violet C', '标准紫罗兰', '#440099', ['violet']],
  ['Purple C', '亮紫', '#bb29bb', ['purple']],
  ['256 C', '丁香浅紫', '#d5b9e0'],
  ['257 C', '柔香芋紫', '#c599d6'],
  ['258 C', '薰衣草紫', '#8c4799'],
  ['264 C', '雾霾淡紫', '#c5b4e3'],
  ['265 C', '紫藤花色', '#9063cd'],
  ['266 C', '皇家紫', '#753bbd'],
  ['268 C', '深葡萄紫', '#582c83'],
  ['5285 C', '莫兰迪灰紫', '#988ca8'],
  ['5295 C', '烟灰淡紫', '#b5acc2'],
  ['5305 C', '浅云灰紫', '#cdc7d6'],
  ['7437 C', '浅紫丁香', '#d8c5dc'],
  ['7440 C', '烟熏芋紫', '#c8bed8'],
  ['7441 C', '温柔香芋紫', '#a795c6'],

  // Popular Pantone FHI / TCX Fashion & Home Interiors Codes
  ['11-0601 TCX', '亮雪白', '#f4f5f0', ['11-0601', 'bright white']],
  ['11-4800 TCX', '云朵白', '#f0eee9', ['11-4800', 'cloud dancer']],
  ['12-0703 TCX', '暖象牙白', '#eae6dc', ['12-0703']],
  ['13-1023 TCX', '柔和桃', '#ffbe98', ['13-1023', 'peach fuzz']],
  ['13-5306 TCX', '浅薄荷绿', '#cbe3d8', ['13-5306']],
  ['14-1318 TCX', '烟灰粉', '#d8a39d', ['14-1318', 'dusty pink']],
  ['14-4318 TCX', '晴空蓝', '#89b7d6', ['14-4318', 'sky blue']],
  ['15-0343 TCX', '草木绿', '#88b04b', ['15-0343', 'greenery']],
  ['15-5519 TCX', '绿松石', '#45b5aa', ['15-5519', 'turquoise']],
  ['16-1546 TCX', '活珊瑚橘', '#ff6f61', ['16-1546', 'living coral']],
  ['17-1230 TCX', '摩卡慕斯', '#a47864', ['17-1230', 'mocha mousse']],
  ['17-3938 TCX', '长春花蓝', '#6667ab', ['17-3938', 'very peri']],
  ['17-5104 TCX', '极致灰', '#939597', ['17-5104', 'ultimate gray']],
  ['13-0647 TCX', '亮丽黄', '#f5df4d', ['13-0647', 'illuminating']],
  ['18-1750 TCX', '非凡洋红', '#bb2649', ['18-1750', 'viva magenta']],
  ['19-4024 TCX', '优雅藏青', '#2b3a55', ['19-4024', 'dress blues']],
  ['19-4052 TCX', '经典蓝', '#0f4c81', ['19-4052', 'classic blue']],
];

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/^(pantone|pms)\s*/i, '')
    .replace(/grey/g, 'gray')
    .replace(/\s+/g, ' ');
}

function compactKey(value) {
  return normalizeKey(value).replace(/\s+/g, '');
}

function stripSuffix(value) {
  return normalizeKey(value)
    .replace(/\s*(tcx|tpx|tpg|cp|up|c|u)$/i, '')
    .trim();
}

function makeShortCode(code) {
  return String(code).replace(/\s+/g, '');
}

export const PANTONE_COLORS = Object.freeze(
  RAW_PANTONE_TABLE.map(([code, name, hex, aliases = []]) => ({
    code: `PANTONE ${code}`,
    rawCode: code,
    shortCode: makeShortCode(code),
    name,
    hex: hex.toLowerCase(),
    aliases,
  })),
);

const EXACT_INDEX = new Map();
const STRIPPED_INDEX = new Map();

for (const entry of PANTONE_COLORS) {
  const keys = [
    entry.rawCode,
    entry.code,
    entry.shortCode,
    ...entry.aliases,
  ];
  for (const key of keys) {
    const norm = normalizeKey(key);
    const comp = compactKey(key);
    if (norm && !EXACT_INDEX.has(norm)) EXACT_INDEX.set(norm, entry);
    if (comp && !EXACT_INDEX.has(comp)) EXACT_INDEX.set(comp, entry);

    const base = stripSuffix(key);
    const baseComp = base.replace(/\s+/g, '');
    if (base && !STRIPPED_INDEX.has(base)) STRIPPED_INDEX.set(base, entry);
    if (baseComp && !STRIPPED_INDEX.has(baseComp)) STRIPPED_INDEX.set(baseComp, entry);
  }
}

export function lookupPantone(input) {
  const norm = normalizeKey(input);
  if (!norm) return null;
  const comp = compactKey(input);
  if (EXACT_INDEX.has(norm)) return EXACT_INDEX.get(norm);
  if (EXACT_INDEX.has(comp)) return EXACT_INDEX.get(comp);

  const stripped = stripSuffix(input);
  const strippedComp = stripped.replace(/\s+/g, '');
  if (stripped && STRIPPED_INDEX.has(stripped)) return STRIPPED_INDEX.get(stripped);
  if (strippedComp && STRIPPED_INDEX.has(strippedComp)) return STRIPPED_INDEX.get(strippedComp);
  return null;
}

export function searchPantone(query, limit = 8) {
  const norm = normalizeKey(query);
  const comp = compactKey(query);
  if (!norm) {
    return PANTONE_COLORS.slice(0, limit);
  }

  const scored = [];
  for (const entry of PANTONE_COLORS) {
    const rawNorm = normalizeKey(entry.rawCode);
    const rawComp = compactKey(entry.rawCode);
    const nameNorm = normalizeKey(entry.name);
    let score = 0;

    if (rawNorm === norm || rawComp === comp) score = 100;
    else if (rawNorm.startsWith(norm) || rawComp.startsWith(comp)) score = 80;
    else if (rawNorm.includes(norm) || rawComp.includes(comp)) score = 60;
    else if (nameNorm.includes(norm)) score = 50;
    else if (entry.aliases.some(a => normalizeKey(a).includes(norm) || compactKey(a).includes(comp))) score = 45;

    if (score > 0) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score || a.entry.rawCode.localeCompare(b.entry.rawCode, 'en', { numeric: true }));
  return scored.slice(0, limit).map(s => s.entry);
}

export function formatPantoneExportToken(entryOrShortCode) {
  if (!entryOrShortCode) return '';
  const raw = typeof entryOrShortCode === 'string'
    ? entryOrShortCode
    : (entryOrShortCode.shortCode || entryOrShortCode.rawCode || '');
  const clean = String(raw).replace(/^PANTONE[_\-\s]*/i, '').replace(/\s+/g, '');
  return clean ? `PANTONE_${clean}` : '';
}
