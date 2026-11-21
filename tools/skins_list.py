import re,sys
src=open(sys.argv[1]).read()
out=set()
for m in re.finditer(r'dir: "(assets/skins/[^"]+)"', src):
    blk=src[m.start():m.start()+3000]
    end=re.search(r'\n    \},?\n', blk)
    if end: blk=blk[:end.start()]
    d=m.group(1)
    am=re.search(r'anims: \{(.*?)\n     \}', blk, re.S)
    if am:
        for k in re.findall(r'\n\s+([A-Za-z]+): \[', am.group(1)): out.add(f"{d}/{k}-Anim.png")
    pm=re.search(r'portraits: \[([^\]]*)\]', blk)
    if pm:
        for p in re.findall(r'"([^"]+)"', pm.group(1)): out.add(f"{d}/portrait/{p}.png")
    sm=re.search(r'shot: "([^"]+)"', blk)
    if sm: out.add(f"{d}/{sm.group(1)}")
    for x in re.findall(r'(?:icon|thumb|img|sheet|file): "([^"/]+\.(?:png|jpg))"', blk): out.add(f"{d}/{x}")
print("\n".join(sorted(out)))
