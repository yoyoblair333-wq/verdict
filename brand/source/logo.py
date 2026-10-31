import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import seal, C, H, OUT
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
f=TTFont(H + 'big-shoulders-display-latin-900-normal.ttf')
gs=f.getGlyphSet(); cmap=f.getBestCmap(); upm=f['head'].unitsPerEm
def outline(text,x,base,size,track):
    sc=size/upm; paths=[]
    for ch in text:
        g=cmap[ord(ch)]; pen=SVGPathPen(gs)
        gs[g].draw(TransformPen(pen,(sc,0,0,-sc,x,base)))
        paths.append(pen.getCommands()); x+=gs[g].width*sc+track
    return ' '.join(paths), x-track
d,end=outline('VERDICT',150,92,96,5)
W=int(end+20)
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="128" viewBox="0 0 {W} 128" role="img" aria-label="VERDICT">
<title>VERDICT</title>
{seal(64,64,58)}
<path d="{d}" fill="{C['robe']}"/>
</svg>'''
open(OUT + 'logo.svg','w').write(svg)
mark=f'''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="VERDICT seal"><title>VERDICT seal</title>{seal(64,64,60)}</svg>'''
open(OUT + 'logo-mark.svg','w').write(mark)
print(W)
