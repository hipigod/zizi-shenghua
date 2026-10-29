# -*- coding: utf-8 -*-
"""给 data.js 每个字条补 originSource（出处），并修若干 note/words 缺项。

出处判定不靠记忆，靠《说文解字》数据（shuowenjiezi/shuowen）：
  1. 本字命中          → 《说文解字》
  2. 简化字/异体命中    → 《说文解字》「正体字头」
  3. 数据集未收        → 据字形分析，《说文》未收

用法：python tools/apply_sources.py [--dry]
"""
import io, json, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_JS = os.path.join(ROOT, "data.js")
IDX = os.path.join(HERE, "_shuowen", "index.json")
CHARS = os.path.join(HERE, "_shuowen", "chars.txt")

# 简化字 →《说文》字头（只放确属同一字的，不含借形/同形异字）
ORTHO = {
    "众": "眾", "胆": "膽", "奋": "奮", "丛": "叢", "灭": "滅", "闪": "閃",
    "问": "問", "间": "閒", "闷": "悶", "闲": "閑", "吕": "呂", "体": "體",
    "侣": "侶", "肤": "膚", "吴": "吳", "闸": "閘", "闰": "閏", "闺": "閨",
    "涧": "澗", "润": "潤", "尘": "塵", "灶": "竈", "朋": "鳳",
}
# 《说文》收此字但字头写法不同，同一字的不同写法，卡片上不另标字头
SAME_ENTRY = {"焚", "埋", "旺"}
# 数据集把字头存成了生僻异体，卡片按通行繁体引（如 尘 → 塵，数据集字头是𪋻）
FORCE_HEAD = {"尘": "塵"}

NOTE_ADD = {
    "保": "配方是「人 + 呆」，但保的字源是从人从子——大人背着孩子。这里的「呆」只是笔画凑得上。",
    "泪": "「泪」是后起俗字，本字作「淚」。",
    "由": "《说文》未见「由」字头，古书里多借作声符、地名。",
    "伙": "「伙」是后起俗字，本义与「夥」相通。",
    "旺": "《说文》作「暀」，光美也；旺是后来加日的俗字。",
    "埋": "《说文》作「薶」，瘞也。",
    "焚": "《说文》作「燓」，义为燒田。",
}
WORDS_SET = {
    "棵": ["一棵树", "两棵树", "几棵草"],
}


def load_index():
    return json.load(io.open(IDX, encoding="utf-8"))


def source_of(ch, idx):
    if ch in idx:
        return "《说文解字》"
    if ch in SAME_ENTRY:
        return "《说文解字》"
    if ch in FORCE_HEAD:
        return "《说文解字》「%s」" % FORCE_HEAD[ch]
    if ch in ORTHO and ORTHO[ch] in idx:
        return "《说文解字》「%s」" % ORTHO[ch]
    return "据字形分析，《说文》未收"


def main():
    dry = "--dry" in sys.argv
    idx = load_index()
    chars = io.open(CHARS, encoding="utf-8").read().strip()
    src = io.open(DATA_JS, encoding="utf-8").read()
    lines = src.split("\n")

    cur = None
    filled = 0
    stat = {"本字": 0, "异体": 0, "未收": 0}
    for i, line in enumerate(lines):
        m = re.match(r'^    "([^"]{1})": \{', line)
        if m:
            cur = m.group(1)
            continue
        if not cur or cur not in chars:
            continue
        if 'originSource: ""' in line:
            val = source_of(cur, idx)
            if cur in idx:
                stat["本字"] += 1
            elif cur in ORTHO:
                stat["异体"] += 1
            else:
                stat["未收"] += 1
            lines[i] = line.replace('originSource: ""', 'originSource: "%s"' % val)
            filled += 1
        if cur in WORDS_SET and "words: []" in line:
            lines[i] = line.replace("words: []", "words: %s" % json.dumps(
                WORDS_SET[cur], ensure_ascii=False))
        if cur in NOTE_ADD:
            # note: "" 直接填；已有内容的追加
            if 'note: ""' in lines[i]:
                lines[i] = lines[i].replace('note: ""', 'note: "%s"' % NOTE_ADD[cur])
            elif 'note: "' in lines[i] and NOTE_ADD[cur] not in lines[i]:
                lines[i] = lines[i].replace(
                    'note: "', 'note: "%s' % NOTE_ADD[cur], 1)

    print("补出处", filled, stat, "| 补 note", len(NOTE_ADD), "| 补组词", len(WORDS_SET))
    if dry:
        return
    io.open(DATA_JS, "w", encoding="utf-8", newline="").write("\n".join(lines))


if __name__ == "__main__":
    main()
