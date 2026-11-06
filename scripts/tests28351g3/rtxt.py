import re,html,sys
def text(t):
    out=[]
    for m in re.finditer(r'<section class="pg"[^>]*data-page="(\d+)"[^>]*>(.*?)</section>',t,re.S):
        out.append('--- page '+m.group(1))
        rows={}
        for x in re.finditer(r'<text x="([\d.\-]+)" y="([\d.\-]+)"[^>]*>(.*?)</text>',m.group(2),re.S):
            y=round(float(x.group(2))); rows.setdefault(y,[]).append((float(x.group(1)),html.unescape(re.sub(r'<[^>]+>','',x.group(3)))))
        for y in sorted(rows): out.append(' '.join(s for _,s in sorted(rows[y])))
    return '\n'.join(out)
if __name__=='__main__': print(text(open(sys.argv[1]).read()))
