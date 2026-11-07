"""Read-only Webflow rescue planner. Raw source and generated reports stay on SSD."""
import argparse
import collections
import csv
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
from urllib.parse import urlsplit, urlunsplit, unquote, quote

ROOT = Path('/Volumes/Edzio SSD/qaudioAssets')
CATEGORY_ALIASES = {'cd-sacdblu-raydac':'cd-sacd', 'genuine-thorens-parts':'thorens-parts', 'network-players-hires-audio':'network-players', 'preamplifier-processor':'preamplifiers', 'subwoofer':'subwoofers'}
BRAND_ALIASES = {'musical-fideliy':'musical-fidelity'}
HOSTS = {'cdn.prod.website-files.com','assets.website-files.com','uploads-ssl.webflow.com','uploads.webflow.com','cdn.prod.website-files.com'}

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def active(row):
    return row['Archived']=='false' and row['Draft']=='false' and row.get('Hide Item')!='true' and row.get('Hide')!='true' and bool(row['Published On'])

def canonical(url):
    p=urlsplit(html.unescape(url.strip()))
    # Alias only known Webflow CDN hosts, preserve the complete decoded path.
    host='cdn.prod.website-files.com' if p.hostname in HOSTS else p.netloc
    return urlunsplit(('https',host,quote(unquote(p.path),safe='/-._~'),p.query,''))

class RichText(HTMLParser):
    """Convert safe textual structure; move figures to an ordered captioned gallery.

    Keep every URL variant as evidence, but prefer original src over resized srcset.
    No source HTML is executed or rendered. The complete original remains archived.
    """
    def __init__(self,text):
        super().__init__(convert_charrefs=True)
        self.parts=[]; self.images=[]; self.links=[]; self.variants=[]; self.caption=False; self.caption_parts=[]; self.href=[]; self.skip=0; self.tags=collections.Counter()
        self.feed(text)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs); self.tags[tag]+=1
        if tag in ('script','style','iframe'): self.skip+=1
        if self.skip:return
        if self.caption and tag!='figcaption':
            if tag=='a':self.links.append(a.get('href',''))
            return
        if tag=='img':
            src=a.get('src','')
            variants=[v.strip().split()[0] for v in a.get('srcset','').split(',') if v.strip()]
            self.variants.extend(variants)
            if src:self.images.append({'url':canonical(src),'alt':a.get('alt','').replace('__wf_reserved_inherit',''),'caption':'','source_url':src})
        elif tag=='figcaption':self.caption=True; self.caption_parts=[]
        elif tag in ('p','div','figure','ul','ol'):self.parts.append('\n\n')
        elif tag=='li':self.parts.append('\n- ')
        elif tag=='br':self.parts.append('\n')
        elif tag.startswith('h') and tag[1:].isdigit():self.parts.append('\n\n### ')
        elif tag in ('strong','b'):self.parts.append('**')
        elif tag in ('em','i'):self.parts.append('*')
        elif tag=='a':
            href=a.get('href','');self.links.append(href);self.href.append(href)
            self.parts.append('[' if re.match(r'^(https?://|mailto:|tel:|/(?!/))',href) else '')
    def handle_endtag(self,tag):
        if tag in ('script','style','iframe'):self.skip=max(0,self.skip-1);return
        if self.skip:return
        if tag=='figcaption':
            self.caption=False
            if self.images:self.images[-1]['caption']=''.join(self.caption_parts).strip()
        elif self.caption:return
        elif tag in ('p','div','figure','ul','ol','h1','h2','h3','h4'):self.parts.append('\n\n')
        elif tag in ('strong','b'):self.parts.append('**')
        elif tag in ('em','i'):self.parts.append('*')
        elif tag=='a' and self.href:
            href=self.href.pop()
            if re.match(r'^(https?://|mailto:|tel:|/(?!/))',href): self.parts.append(']('+href+')')
    def handle_data(self,data):
        if self.skip:return
        if self.caption:self.caption_parts.append(data)
        else:self.parts.append(data.replace('\u200d','').replace('\xa0',' '))
    @property
    def markdown(self):
        return re.sub(r'\n{3,}','\n\n',''.join(self.parts)).strip()

def cents(value):
    if not value:return None
    if not re.fullmatch(r'\d+(\.\d{1,2})?',value):raise ValueError('Unrecognized price: '+value)
    from decimal import Decimal
    return int(Decimal(value)*100)

def pricing(row,labels):
    one,two=cents(row['Price1']),cents(row['Price2'])
    l1,l2=row['Price Category Line 1'],row['Price Category Line 2']
    names=[labels.get(v,v).strip() for v in (l1,l2)]
    sold=l1 in ('sold','sold-2','no-longer-available') or l2 in ('sold','sold-2','no-longer-available')
    # Explicit second line selling price wins. Blank second values never become 0.
    price=None if sold else two if two is not None else one
    msrp=one if 'msrp' in l1 and not sold else None
    unit='each' if two is not None and 'each' in l2 else 'pair' if 'pair' in l1 or (two is not None and 'pair' in l2) else 'each'
    note=' · '.join(n for n in names if n)
    return {'price_cents':price,'msrp_cents':msrp,'price_unit':unit,'price_note':note,'availability':'sold' if sold else 'available'}

def build(collections_,snapshot):
    existing=snapshot['tables']; selected={k:list(filter(active,v)) for k,v in collections_.items()}
    products=selected['Products']; brands={r['Slug']:r for r in collections_['Brands']}
    labels={r['Slug']:r['Name'] for r in collections_['Price Categories']}
    conditions={r['Slug']:r['Name'] for r in collections_['Conditions']}
    required=set(r['Brand'] for r in products if r['Brand'])
    featured={r['Slug'] for r in selected['Brands'] if r['Show on Brand Selectors']=='true'}
    required|=featured
    records=[]; assets={}; issues=[]; reuse=[]
    def asset(url,collection,row,field,folder,alt='',caption=''):
        if not url:return None
        if url=='https://d3e54v103j8qbb.cloudfront.net/img/image-placeholder.svg':
            issues.append({'slug':row['Slug'],'kind':'webflow_placeholder','resolution':'Decorative Webflow missing-photo placeholder omitted, original URL retained in source archive'})
            return None
        key=canonical(url)
        entry=assets.setdefault(key,{'url':key,'source_urls':[],'uses':[]})
        if url not in entry['source_urls']:entry['source_urls'].append(url)
        entry['uses'].append({'collection':collection,'item_id':row['Item ID'],'slug':row['Slug'],'field':field,'folder':folder,'alt':alt or row['Name'],'caption':caption})
        return key
    def record(collection,row,table,key,fields,mode):
        out={'collection':collection,'collection_id':row['Collection ID'],'item_id':row['Item ID'],'source_slug':row['Slug'],'source_sha256':digest(row),'table':table,'key':key,'mode':mode,'fields':fields}
        records.append(out);return out
    source_asset_index={}
    for rows in collections_.values():
        for source_row in rows:
            for value in source_row.values():
                for url in re.findall(r'https?://[^\s\"<>]+',value):
                    match=re.search(r'/([a-f0-9]{24})_[^/]+$',urlsplit(url).path)
                    if match:source_asset_index.setdefault(match[1],set()).add(canonical(url))
    for i,row in enumerate(products):
        old=next((p for p in existing['products'] if p['slug']==row['Slug']),None)
        rich=RichText(row['Product Description'])
        fields={'slug':row['Slug'],'name':row['Name'],'category_slug':CATEGORY_ALIASES.get(row['Category'],row['Category']),'brand_slug':BRAND_ALIASES.get(row['Brand'],row['Brand']) or None,'short_description':row['Teaser'],'description_intro':rich.markdown,'description_closing':'','features':[],**pricing(row,labels),'condition':'Used' if row['Condition'].startswith('used') else 'New','condition_note':' · '.join(x for x in [conditions.get(row['Condition'],'') if row['Condition']=='used-final-sale' else '',row['Condition (if used)']] if x),'ready_for_audition':row['In Store Ready for Audition']=='true','manufacturer_url':row['URL'] if row['URL'].startswith('https://') else None,'status':'published','sort_order':i+100}
        rec=record('Products',row,'products',row['Slug'],fields,'preserve' if old else 'insert')
        rec['expected']=old;rec['images']=[];rec['srcset_variants']=rich.variants;rec['links']=rich.links
        if row['URL'].startswith('http://'):
            issues.append({'slug':row['Slug'],'kind':'http_manufacturer_link','href':row['URL'],'resolution':'Preserved in source archive; CMS manufacturer_url stays null under its HTTPS-only contract. External-link repair is separate; do not guess HTTPS.'})
        # Even preserved records' source photos are rescued for review; never replace curated images automatically.
        lead=asset(row['Product Image'],'Products',row,'Product Image','products')
        if lead:rec['images'].append({'url':lead,'alt':row['Name'],'caption':''})
        for j,img in enumerate(rich.images):
            selected_url=asset(img.get('source_url',img['url']),'Products',row,f'Product Description image {j+1}','products',img['alt'],img['caption'])
            if selected_url:rec['images'].append(img)
        if not fields['brand_slug']:issues.append({'slug':row['Slug'],'kind':'missing_brand','resolution':'Keep null; no guessed brand'})
        if fields['price_cents'] is not None and fields['price_cents']<=100:issues.append({'slug':row['Slug'],'kind':'suspicious_price','source':{k:row[k] for k in ['Price1','Price2','Price Category Line 1','Price Category Line 2']},'resolution':'Keep explicit source $1 closeout with MSRP $175, confirmed by current live HTML; unusual-source-price warning for owner follow-up'})
        if len(fields['short_description'])>300:issues.append({'slug':row['Slug'],'kind':'long_teaser','length':len(fields['short_description']),'resolution':'Raise supported limit to 1000; keep complete teaser'})
        if not fields['price_cents']:issues.append({'slug':row['Slug'],'kind':'no_price','resolution':'Keep null and source availability; never extract teaser price'})
        if len(rich.images)>19:issues.append({'slug':row['Slug'],'kind':'large_gallery','count':len(rec['images']),'resolution':'Preserve source ordering/captions'})
        if old:issues.append({'slug':row['Slug'],'kind':'curated_match','resolution':'Preserve all existing fields and images; archive source for reviewed additions','field_diff':{k:{'current':old.get(k),'source':v} for k,v in fields.items() if old.get(k)!=v}})
    for slug in sorted(required):
        row=brands[slug]; target=BRAND_ALIASES.get(slug,slug);old=next((b for b in existing['catalog_brands'] if b['slug']==target),None)
        fields={'slug':target,'name':'Musical Fidelity' if slug=='musical-fideliy' else row['Name'],'featured':slug in featured,'logo_path':old['logo_path'] if old else None,'sort_order':old['sort_order'] if old else len(existing['catalog_brands'])}
        rec=record('Brands',row,'catalog_brands',target,fields,'feature_only' if old else 'insert');rec['expected']=old
        if old:reuse.append({'kind':'brand','source_slug':slug,'path':old['logo_path']})
        elif row['Brand Logo']:rec['logo_url']=asset(row['Brand Logo'],'Brands',row,'Brand Logo','brands')
        else:issues.append({'slug':slug,'kind':'missing_logo','resolution':'Keep null, render brand name'})
    # Current unrequired brands remain useful in the CMS but leave the homepage selector.
    for old in existing['catalog_brands']:
        if old['slug'] not in [BRAND_ALIASES.get(s,s) for s in required]:
            records.append({'table':'catalog_brands','key':old['slug'],'mode':'feature_only','fields':{'featured':False},'expected':old})
    for row in selected['Product Categories']:
        target=CATEGORY_ALIASES.get(row['Slug'],row['Slug']);old=next((c for c in existing['catalog_categories'] if c['slug']==target),None)
        if not old:raise ValueError('Unexpected missing category '+target)
        record('Product Categories',row,'catalog_categories',target,{},'preserve')['expected']=old
        reuse.append({'kind':'category','source_slug':row['Slug'],'path':old['artwork_path'],'scene':old['scene_path']})
    for row in selected['News']:
        old=next((n for n in existing['news_posts'] if n['slug']==row['Slug']),None)
        rec=record('News',row,'news_posts',row['Slug'],{'slug':row['Slug'],'title':row['Name'],'excerpt':row['Preview Text'],'source_published_at':row['Published On'],'markdown':RichText(row['Body']).markdown},'preserve' if old else 'insert')
        rec['expected']=old
        rec['links']=RichText(row['Body']).links
        if old:
            reuse.append({'kind':'news','source_slug':row['Slug'],'cover':old['cover_path'],'body':'Preserve current body/owned images'})
        else:
            rec['cover_url']=asset(row['Post Image'],'News',row,'Post Image','news')
            rec['images']=[{**im,'url':asset(im['url'],'News',row,'Body','news',im['alt'],im['caption'])} for im in RichText(row['Body']).images]
    for row in selected['Deals']:
        if row['Slug']=='knowlege-advise-is-priceless':
            record('Deals',row,'static','qdeal-advice',{},'preserve');continue
        rich=RichText(row['Deal'])
        rec=record('Deals',row,'deals',row['Slug'],{'title':row['Name'],'source_starts_at':row['From'],'source_ends_at':row['To'],'markdown':rich.markdown},'insert')
        rec['images']=[{**im,'url':asset(im['url'],'Deals',row,'Deal','deals',im['alt'],im['caption'])} for im in rich.images]
        issues.append({'slug':row['Slug'],'kind':'deal_differs_from_dispatch','resolution':'Add active Bronze November with exact source dates; keep archived Closeouts as draft with its items'})
    # Exact archived source Closeouts match: keep content/items as draft.
    for row in collections_['Deals']:
        if row['Archived']=='true' and row['Slug']=='closeouts-great-gear-incredible-prices':
            old=next((d for d in existing['deals'] if d['title'].strip().lower().startswith('closeouts')),None)
            if old:
                record('Deals',row,'deals',old['id'],{'status':'draft'},'archive_match')['expected']=old
    active_slugs={r['Slug'] for r in products}
    for rec in records:
        for href in rec.get('links',[]):
            parsed=urlsplit(href)
            if parsed.hostname and parsed.hostname not in ('www.qaudio.com','qaudio.com'):continue
            path=parsed.path
            if path.startswith('/products/') and path.split('/')[-1] not in active_slugs:
                issues.append({'slug':rec['key'],'kind':'stale_product_link','href':href,'resolution':'Keep reported; no archived imports or invented redirects'})
    for rec in records:
        if rec['table']=='products':
            text=rec['fields']['description_intro']
            for href in rec.get('links',[]):
                parsed=urlsplit(href)
                if parsed.hostname in ('www.qaudio.com','qaudio.com') and parsed.path.startswith('/products/') and parsed.path.split('/')[-1] in active_slugs:
                    text=text.replace(href,parsed.path+('?' + parsed.query if parsed.query else '')+('#'+parsed.fragment if parsed.fragment else ''))
            rec['fields']['description_intro']=text
    for entry in assets.values():
        match=re.search(r'/[a-f0-9]{24}_([a-f0-9]{24})_',urlsplit(entry['url']).path)
        if match:entry['export_original_candidates']=sorted(source_asset_index.get(match[1],set())-{entry['url']})
    return {'version':1,'project':snapshot['project'],'snapshot_sha256':digest(snapshot),'counts':{k:{'total':len(v),'active':len(selected[k])} for k,v in collections_.items()},'featured_brands':sorted(BRAND_ALIASES.get(s,s) for s in featured),'required_brands':len(required),'records':records,'assets':list(assets.values()),'reuse':reuse,'issues':issues,'category_aliases':CATEGORY_ALIASES,'brand_aliases':BRAND_ALIASES}

def main():
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('run');args=p.parse_args()
    run=Path(args.run)
    if ROOT not in run.parents:raise ValueError('Reports must stay on migration SSD')
    source=Path(args.source);backup=run/'csv';backup.mkdir(exist_ok=True)
    cs={};checksums=[]
    for path in sorted(source.glob('*.csv')):
        if path.name.startswith('.'):continue
        dest=backup/path.name
        if dest.exists() and dest.read_bytes()!=path.read_bytes():raise ValueError('CSV backup changed')
        if not dest.exists():shutil.copy2(path,dest)
        checksums.append({'file':path.name,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
        cs[path.name.split(' - ')[1]]=list(csv.DictReader(dest.open(encoding='utf-8-sig',newline='')))
    if len(cs)!=7:raise ValueError('Expected seven complete collection exports')
    snapshot=json.loads((run/'snapshot.json').read_text())
    plan=build(cs,snapshot)
    for name,data in [('source-checksums.json',checksums),('plan.json',plan),('selected-source.json',{k:list(filter(active,v)) for k,v in cs.items()})]:
        (run/name).write_text(json.dumps(data,ensure_ascii=False,indent=2))
    print(json.dumps({'records':len(plan['records']),'asset_urls':len(plan['assets']),'featured':len(plan['featured_brands']),'issues':len(plan['issues'])}))
if __name__=='__main__':main()
