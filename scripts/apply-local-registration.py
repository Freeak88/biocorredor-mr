#!/usr/bin/env python3
from __future__ import annotations
import argparse,csv,json,re
from pathlib import Path
import cv2
import numpy as np

DATE_JPG=re.compile(r'^\d{4}-\d{2}-\d{2}\.jpg$')

def args():
 p=argparse.ArgumentParser();p.add_argument('--input-dir',type=Path,required=True);p.add_argument('--grid-csv',type=Path,required=True);p.add_argument('--reference',default='2023-04-19.jpg');p.add_argument('--output-dir',type=Path,required=True);p.add_argument('--min-score',type=float,default=.20);return p.parse_args()

def read_im(p):
 im=cv2.imread(str(p));
 if im is None: raise RuntimeError(f'No se pudo leer {p}')
 return im

def load_rows(p):
 out=[]
 with p.open(newline='',encoding='utf-8') as f:
  for r in csv.DictReader(f):
   for k in ('cx','cy','dx_px','dy_px','score'):
    try:r[k]=float(r[k])
    except:r[k]=np.nan
   out.append(r)
 return out

def controls(rows,name,min_score):
 pts=[]
 for r in rows:
  if r.get('file')!=name or r.get('status')!='ok': continue
  if not all(np.isfinite(r[k]) for k in ('cx','cy','dx_px','dy_px','score')): continue
  if r['score']<min_score: continue
  pts.append((r['cx'],r['cy'],r['dx_px'],r['dy_px'],r['score']))
 if len(pts)<4: raise RuntimeError(f'{name}: solo {len(pts)} controles validos')
 return pts

def field(pts,h,w):
 sw=min(320,w);sh=max(1,round(h*sw/w));xs=np.linspace(0,w-1,sw);ys=np.linspace(0,h-1,sh);xx,yy=np.meshgrid(xs,ys)
 ndx=np.zeros_like(xx);ndy=np.zeros_like(xx);nc=np.zeros_like(xx);den=np.zeros_like(xx)
 for cx,cy,dx,dy,s in pts:
  wt=1/np.maximum((xx-cx)**2+(yy-cy)**2,1)
  ndx+=wt*dx;ndy+=wt*dy;nc+=wt*s;den+=wt
 dx=(ndx/den).astype('float32');dy=(ndy/den).astype('float32');cf=(nc/den).astype('float32')
 dx=cv2.resize(dx,(w,h),interpolation=cv2.INTER_CUBIC);dy=cv2.resize(dy,(w,h),interpolation=cv2.INTER_CUBIC);cf=cv2.resize(cf,(w,h),interpolation=cv2.INTER_CUBIC)
 dx=cv2.GaussianBlur(dx,(0,0),120);dy=cv2.GaussianBlur(dy,(0,0),120);cf=cv2.GaussianBlur(cf,(0,0),120)
 return dx,dy,np.clip(cf,0,1)

def main():
 a=args();a.output_dir.mkdir(parents=True,exist_ok=True);rows=load_rows(a.grid_csv);ref=read_im(a.input_dir/a.reference);h,w=ref.shape[:2];report=[]
 for p in sorted(x for x in a.input_dir.iterdir() if x.is_file() and DATE_JPG.match(x.name)):
  im=read_im(p)
  if im.shape[:2]!=(h,w): raise RuntimeError(f'Dimensiones distintas: {p.name}')
  if p.name==a.reference:
   reg=im.copy();dx=np.zeros((h,w),np.float32);dy=dx.copy();cf=np.ones((h,w),np.float32);pts=[]
  else:
   pts=controls(rows,p.name,a.min_score);dx,dy,cf=field(pts,h,w);xx,yy=np.meshgrid(np.arange(w,dtype='float32'),np.arange(h,dtype='float32'));reg=cv2.remap(im,xx-dx,yy-dy,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT101)
  cv2.imwrite(str(a.output_dir/p.name),reg,[cv2.IMWRITE_JPEG_QUALITY,96]);cv2.imwrite(str(a.output_dir/f'confidence-{p.stem}.png'),(cf*255).astype('uint8'))
  rg=cv2.cvtColor(reg,cv2.COLOR_BGR2GRAY);rr=cv2.cvtColor(ref,cv2.COLOR_BGR2GRAY);cv2.imwrite(str(a.output_dir/f'qa-overlay-{p.stem}.jpg'),cv2.merge([rg,rr,rr]),[cv2.IMWRITE_JPEG_QUALITY,92])
  row={'file':p.name,'controls':len(pts),'median_dx_px':float(np.median(dx)),'median_dy_px':float(np.median(dy)),'mean_confidence':float(np.mean(cf))};report.append(row);print(json.dumps(row,ensure_ascii=False))
 (a.output_dir/'local-registration-apply.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
if __name__=='__main__':main()
