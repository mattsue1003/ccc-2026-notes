"""Build data.js (agenda + notes) and transcript.js (full transcript) for the site.

  notes/sessions.json      agenda skeleton (from the 簡章)
  notes/<sessionId>.json   {"t": start_sec, "summary": "...", "points": [{"t":sec,"kind":"政策","tags":[...],"text":"..."}]}
  raw/chunks/*.json        Whisper output from transcribe.py

Run: python3 build.py
"""
import json, pathlib, re
import opencc

ROOT = pathlib.Path(__file__).parent
cc = opencc.OpenCC("s2twp")

KINDS = ["政策", "策略", "數據", "挑戰", "建議"]
TAGS = ["健康台灣", "長照3.0", "醫照整合", "居家醫療", "在宅急症照護", "急性後期照護", "復健病房", "出院準備",
        "社區醫療", "住宿式機構", "健保給付", "重症兒童", "就學與教育", "偏鄉", "失智照護", "安寧緩和",
        "人力培育", "數位科技", "家庭照顧者", "日本經驗", "財源與預算", "跨部會協作"]
ORG_TYPES = ["政府機關", "立法院", "醫院", "基層診所", "社福團體", "專業團體", "主辦單位"]

# Whisper mishearings (after Traditional conversion). Add more as found.
CORRECTIONS = [
    (r"石崇[梁涼亮]", "石崇良"), (r"陳[節潔傑]如", "陳節如"), (r"黃[聖勝][堅健]", "黃勝堅"), (r"林[宏洪紅][榮容]", "林宏榮"),
    (r"陳亮[余魚瑜宇]", "陳亮妤"), (r"呂[麗力利]理事長", "呂立理事長"), (r"長照三點零", "長照3.0"), (r"長照 3\.0", "長照3.0"),
    (r"總[蒙萌]", "總盟"), (r"在宅[疾極急]診", "在宅急症"), (r"在宅[疾極]症", "在宅急症"), (r"重[症正]兒 ?三六[零〇]", "重症兒360"),
    (r"社群", "社區"), (r"[莉蒞麗][菱臨玲]", "蒞臨"), (r"[齊喜奇][眠美]醫院", "奇美醫院"), (r"[齊喜]美", "奇美"),
    (r"[語雨與羽][壇潭談]人", "與談人"), (r"依照(整合|協作|共案|合一|微聚落)", r"醫照\1"), (r"一照合一", "醫照合一"),
    (r"社福總[盟蒙]|社府總盟", "社福總盟"), (r"社府", "社福"), (r"史部長", "石部長"), (r"聯合議院", "聯合醫院"),
    (r"黎嘉明|李嘉明", "黎家銘"), (r"鍾鴻毅|鐘泓翊|中主任", "鍾泓翊"), (r"邱清瑜|邱青瑜", "邱青萸"), (r"李士宏|黎士宏", "黎世宏"),
    (r"張俊傑|張竣杰", "張竣傑"), (r"林佑君|林右君", "林右鈞"), (r"文建站", "文健站"),
    (r"北戶", "北護"), (r"社母", "聖母"), (r"慈善好診所", "池上好診所"),
]
JUNK = re.compile(r"(字幕|Amara|訂閱|點贊|點讚|欄目|請不吝|明鏡|志願者|以下是繁體中文的研討會)")

PLAIN = [l.split("\t") for l in (ROOT / "notes" / "corrections.tsv").read_text(encoding="utf-8").splitlines()
         if l and not l.startswith("#") and "\t" in l]

def clean(t):
    t = cc.convert(t)
    for a, b in PLAIN:
        t = t.replace(a, b)
    for a, b in CORRECTIONS:
        t = re.sub(a, b, t)
    return t.strip()

def paragraphs(vid):
    segs = []
    for p in sorted((ROOT / "raw" / "chunks").glob(f"{vid}_*.json")):
        segs += json.loads(p.read_text(encoding="utf-8"))
    out, cur, prev, rep = [], None, None, 0
    for s, e, tx in segs:
        tx = clean(tx)
        cjk = len(re.findall(r"[\u4e00-\u9fff]", tx))
        if not tx or JUNK.search(tx) or cjk < len(tx) * 0.4:
            continue
        rep = rep + 1 if tx == prev else 0
        prev = tx
        if rep >= 2:            # whisper loop on silence / music
            continue
        if cur and (e - cur[0] < 45 and len(cur[1]) < 140) and s - cur[2] < 4:
            sep = "" if re.search(r"[，。？！、]$", cur[1]) else "，"
            cur[1] += sep + tx
            cur[2] = e
        else:
            if cur: out.append(cur)
            cur = [round(s), tx, e]
    if cur: out.append(cur)
    return [[t, (tx if re.search(r"[。？！]$", tx) else tx + "。")] for t, tx, _ in out]

def slot_sec(slot):  # rough fallback: agenda clock time → seconds after 09:00
    m = re.match(r"(\d+):(\d+)", slot or "")
    return max(0, (int(m[1]) - 9) * 3600 + int(m[2]) * 60) if m else 0

sk = json.loads((ROOT / "notes" / "sessions.json").read_text(encoding="utf-8"))
tr = {}
for d in sk["days"]:
    vid = d["video"]
    paras = paragraphs(vid)
    if paras:
        tr[vid] = paras
        # plain text copy for writing notes
        (ROOT / "raw" / f"{vid}.txt").write_text(
            "\n".join(f"[{t//3600}:{t%3600//60:02d}:{t%60:02d}] {tx}" for t, tx in paras), encoding="utf-8")
    for s in d["sessions"]:
        n = ROOT / "notes" / f"{s['id']}.json"
        if n.exists():
            s.update(json.loads(n.read_text(encoding="utf-8")))
        s.setdefault("t", slot_sec(s.get("slot")))
        s.setdefault("summary", "")
        s.setdefault("points", [])
        if s.get("handout"):
            s["handout"] = f"https://drive.google.com/file/d/{s['handout']}/view"
        for p in s["points"]:
            assert p["kind"] in KINDS, (s["id"], p)
            bad = [t for t in p.get("tags", []) if t not in TAGS]
            assert not bad, (s["id"], bad)
    d["sessions"].sort(key=lambda s: s["t"])

conf = {"days": sk["days"], "kinds": KINDS, "tags": TAGS, "orgTypes": ORG_TYPES}
(ROOT / "data.js").write_text("window.CONF=" + json.dumps(conf, ensure_ascii=False) + ";\n", encoding="utf-8")
if tr:
    (ROOT / "transcript.js").write_text("window.TRANSCRIPTS=" + json.dumps(tr, ensure_ascii=False) + ";\n", encoding="utf-8")
print("sessions:", sum(len(d["sessions"]) for d in sk["days"]),
      "points:", sum(len(s["points"]) for d in sk["days"] for s in d["sessions"]),
      "transcript paragraphs:", {k: len(v) for k, v in tr.items()})
