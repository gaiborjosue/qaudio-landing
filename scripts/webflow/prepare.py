"""Build a concrete, guarded SQL apply artifact locally. Never connects to a DB."""
import argparse
import collections
import datetime as dt
import json
from pathlib import Path
import re
import uuid
from plan import ROOT, digest

def literal(value):
    if value is None:return 'null'
    if value is True:return 'true'
    if value is False:return 'false'
    if isinstance(value,int):return str(value)
    return "'"+str(value).replace("'","''")+"'"

def jsonsql(value):return literal(json.dumps(value,ensure_ascii=False))+'::jsonb'

def timestamp(value):
    if not value:return None
    return dt.datetime.strptime(value.split(' (')[0],'%a %b %d %Y %H:%M:%S GMT%z').isoformat()

def identity(rec):
    return str(uuid.uuid5(uuid.NAMESPACE_URL,'qaudio:webflow:'+rec['collection_id']+':'+rec['item_id']))

def fingerprint(table,key):
    if table=='static':return literal('static-qdeal-advice-preserved')
    column='slug' if table in ('products','news_posts','catalog_categories','catalog_brands') else 'id'
    row=f'(select to_jsonb(t) from public.{table} t where {column}={literal(key)})'
    child=None
    if table=='products':child=f"(select coalesce(jsonb_agg(to_jsonb(i) order by sort_order,id),'[]'::jsonb) from public.product_images i where product_id=(select id from public.products where slug={literal(key)}))"
    if table=='deals':child=f"(select coalesce(jsonb_agg(to_jsonb(i) order by sort_order,id),'[]'::jsonb) from public.deal_items i where deal_id={literal(key)}::uuid)"
    expression=f"jsonb_build_object('row',{row},'children',{child})" if child else row
    return f'md5(({expression})::text)'

def insert(table,fields):
    cols=','.join(fields)
    return f'insert into public.{table} ({cols}) select '+','.join('r.'+c for c in fields)+f' from jsonb_populate_record(null::public.{table}, {jsonsql(fields)}) r;'

def baseline_children(snapshot,table,parent_id):
    child_table='product_images' if table=='products' else 'deal_items'
    fk='product_id' if table=='products' else 'deal_id'
    # New schema defaults must be reflected in the pre-schema snapshot.
    # Only normalize the expected side: an owner's later caption edit still conflicts.
    rows=[({**r,'caption':r.get('caption','')} if child_table=='product_images' else r) for r in snapshot['tables'][child_table] if r[fk]==parent_id]
    return sorted(rows,key=lambda r:r['id'])

def prepare(plan,manifest,snapshot):
    assets={a['url']:a for a in manifest};operations=[];unresolved=[]
    def image(url,folder):
        asset=assets.get(url)
        if not asset or asset['status']!='verified':
            unresolved.append(url);return None
        out=asset['derivative']
        return {'path':next(p for p in out['storage_paths'] if p.startswith(folder+'/')),'width':out['width'],'height':out['height']}
    for source in plan['records']:
        rec={**source};fields={**rec['fields']};table=rec['table'];mode=rec['mode']
        if mode=='insert' and table=='products':
            fields['id']=identity(rec);rec['children']=[];seen={}
            for im in rec['images']:
                target=image(im['url'],'products')
                if not target:continue
                if target['path'] in seen:
                    child=seen[target['path']]
                    if im.get('caption') and im['caption'] not in child['caption']:child['caption']=' · '.join(filter(None,[child['caption'],im['caption']]))
                    continue
                child={**target,'id':str(uuid.uuid5(uuid.UUID(fields['id']),target['path'])),'product_id':fields['id'],'sort_order':len(rec['children']),'alt':im['alt'] or fields['name'],'caption':im.get('caption','')}
                rec['children'].append(child);seen[target['path']]=child
            if len(rec['children'])>20:raise ValueError('Gallery exceeds editor support')
        elif mode=='insert' and table=='catalog_brands':
            if rec.get('logo_url'):
                im=image(rec['logo_url'],'brands');fields['logo_path']=im and im['path']
        elif mode=='feature_only':fields={'featured':fields['featured']}
        elif mode=='insert' and table=='news_posts':
            cover=image(rec['cover_url'],'news');markdown=fields.pop('markdown')
            if rec.get('images'):raise ValueError('New article images require interleaved block conversion')
            body=[]
            for paragraph in markdown.split('\n\n'):
                inline=[]
                for i,text in enumerate(paragraph.split('**')):
                    if text:inline.append({'text':text,'strong':True} if i%2 else text)
                if inline:body.append({'type':'paragraph','content':inline})
            fields.update({'id':identity(rec),'status':'published','published_at':timestamp(fields.pop('source_published_at')),'body':body,'cover_path':cover and cover['path'],'cover_width':cover and cover['width'],'cover_height':cover and cover['height'],'cover_alt':fields['title'],'cover_fit':'contain'})
        elif mode=='insert' and table=='deals':
            images=[image(im['url'],'deals') for im in rec['images']]
            if len(images)!=1:raise ValueError('Deal expects its one poster')
            poster=images[0];fields.pop('markdown')
            fields.update({'id':identity(rec),'summary':'','note':'','status':'published','sort_order':1,'starts_at':timestamp(fields.pop('source_starts_at')),'ends_at':timestamp(fields.pop('source_ends_at')),'image_path':poster and poster['path'],'image_width':poster and poster['width'],'image_height':poster and poster['height'],'image_alt':'Ortofon 2M Bronze: MSRP $459.99, sale $399.98. Special pricing on all versions of 2M Bronze and styli; ask for details. Sale ends Nov 30.'})
            rec['key']=fields['id']
        rec['fields']=fields;operations.append(rec)
    # Parent taxonomy must exist before products can reference new brands.
    order={'catalog_categories':0,'catalog_brands':1,'products':2,'news_posts':3,'deals':4,'static':5}
    operations.sort(key=lambda rec:order[rec['table']])
    return operations,sorted(set(unresolved))

def generate_sql(ops,plan,manifest_hash,snapshot):
    sql=['-- Generated locally. Review schema.sql, reports and owned manifest before use.', '-- Upload immutable derivatives and register them before inserting references.', 'begin;', 'set local lock_timeout = \'5s\';', "set local timezone = 'UTC';", 'lock table public.products, public.product_images, public.news_posts, public.deals, public.deal_items, public.catalog_brands, public.catalog_categories, public.webflow_import_records in share row exclusive mode;']
    paths={}
    for rec in ops:
        if rec['mode']=='insert':
            for child in rec.get('children',[]):paths[child['path']]=True
            for key in ['logo_path','cover_path','image_path']:
                path=rec['fields'].get(key)
                if path and not path.startswith('/'):paths[path]=True
    # Explicitly unmanaged original migration inventory: never expires in cleanup.
    # Reference triggers still record every saved dependency, drafts included.
    for path in sorted(paths):sql.append(f"insert into public.media_assets(bucket_id,path,managed) values ('media',{literal(path)},false) on conflict (bucket_id,path) do nothing;")
    for rec in ops:
        table=rec['table'];key=rec['key'];mode=rec['mode'];fields=rec['fields']
        collection=rec.get('collection_id','existing-catalog-brands');item=rec.get('item_id',key);source_sha=rec.get('source_sha256',digest(fields));source_slug=rec.get('source_slug',key)
        fp=fingerprint(table,key);where=f'collection_id={literal(collection)} and item_id={literal(item)}'
        body=[f'-- {table}: {key} ({mode})', 'do $migration$','declare receipt public.webflow_import_records; begin',f'select * into receipt from public.webflow_import_records where {where};', 'if found then',f'  if receipt.source_sha256 <> {literal(source_sha)} or receipt.target_fingerprint is distinct from {fp} then',f"    raise exception 'Import conflict: {table}/{key} changed; review before continuing';",'  end if;', 'else']
        if table!='static':
            column='slug' if table in ('products','news_posts','catalog_categories','catalog_brands') else 'id'
            expected=rec.get('expected')
            if expected:
                body += [f'  if not exists(select 1 from public.{table} t where {column}={literal(key)} and to_jsonb(t) @> {jsonsql(expected)}) then',f"    raise exception 'Baseline changed: {table}/{key}';",'  end if;']
                if table in ('products','deals'):
                    child_table='product_images' if table=='products' else 'deal_items';fk='product_id' if table=='products' else 'deal_id'
                    children=baseline_children(snapshot,table,expected['id'])
                    body += [f"  if (select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]'::jsonb) from public.{child_table} i where {fk}={literal(expected['id'])}) <> {jsonsql(sorted(children,key=lambda r:r['id']))} then raise exception 'Baseline children changed: {table}/{key}'; end if;"]
            elif mode=='insert':body += [f'  if exists(select 1 from public.{table} where {column}={literal(key)}) then raise exception \'Target already exists; re-plan\'; end if;']
            if mode=='insert':
                body.append('  '+insert(table,fields))
                for child in rec.get('children',[]):body.append('  '+insert('product_images',child))
            elif mode in ('feature_only','archive_match'):
                body.append(f'  update public.{table} set '+','.join(c+'='+literal(v) for c,v in fields.items())+f' where {column}={literal(key)};')
        body += [f'  insert into public.webflow_import_records(collection_id,item_id,source_slug,source_sha256,target_table,target_key,target_fingerprint,manifest_sha256) values ({literal(collection)},{literal(item)},{literal(source_slug)},{literal(source_sha)},{literal(table)},{literal(key)},{fp},{literal(manifest_hash)});','end if;','end $migration$;']
        sql.extend(body)
    sql.extend(['commit;','-- Run catalog/metadata/media/import role checks and Supabase advisors, then regenerate types.'])
    return '\n'.join(sql),sorted(paths)

def main():
    p=argparse.ArgumentParser();p.add_argument('run');args=p.parse_args();run=Path(args.run)
    if ROOT not in run.parents:raise ValueError('Use the migration SSD')
    read=lambda name:json.loads((run/name).read_text())
    plan=read('plan.json');manifest=read('asset-manifest.json');snapshot=read('snapshot.json')
    if plan['snapshot_sha256']!=digest(snapshot):raise ValueError('Snapshot checksum changed')
    ops,unresolved=prepare(plan,manifest,snapshot)
    sql,paths=generate_sql(ops,plan,digest(manifest),snapshot)
    (run/'apply-data.sql').write_text(('-- DO NOT APPLY: unresolved assets listed in report.\n' if unresolved else '')+sql)
    (run/'operations.json').write_text(json.dumps(ops,ensure_ascii=False,indent=2))
    (run/'upload-paths.json').write_text(json.dumps(paths,indent=2))
    counts=collections.Counter(r['table']+'/'+r['mode'] for r in ops)
    report={'operations':dict(counts),'upload_paths':len(paths),'unresolved_required_assets':unresolved,'issues':plan['issues'],'featured_brands':plan['featured_brands'],'source_counts':plan['counts'],'snapshot_sha256':plan['snapshot_sha256'],'manifest_sha256':digest(manifest)}
    (run/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    lines=['# Webflow active-content migration — stage 1','', 'No remote schema/data writes or uploads have been performed.','', '## Proposed operations','']+[f'- {k}: {v}' for k,v in sorted(counts.items())]
    lines += ['',f'Immutable upload paths needed: {len(paths)}.',f'Unresolved required asset URLs: {len(unresolved)}.','', '## Mapping and preservation','', '- Keep all 206 active product identities; preserve existing curated matches completely.','- Preserve existing nine source news matches and the independent draft; insert Few days off.','- Keep advice static; draft the exact archived Closeouts match without deleting its four items. Add Bronze November with exact UTC source From/To; end is exclusive, no invented extra day.','- Only 20 featured brands; retain nonfeatured taxonomy and five null product brands. Reuse owned category/brand/news artwork.','- Musical Fideliy maps to musical-fidelity; category aliases are in plan.json. Product/news slugs stay fixed.','- Explicit second price line is selling price, MSRP from named MSRP first line; carry pair units through unlabeled second lines. Source notes preserved; no sale dates invented.','- Source body images become an ordered captioned gallery; identical binary repeats merge captions, original occurrences remain in selected-source.json. HTML never renders.','- Complete exports, originals and current owned assets stay on SSD; public uploads use only fitted sRGB WebP. GIF frames retained; SVG originals retained with raster derivative.','- Ledger compares both source hashes and complete target/child fingerprints. A repeat is a no-op; later admin edits raise a conflict. Fresh baseline/child guards prevent overwriting changes made during review.','', '## Asset failures','']
    lines += [f'- {url}' for url in unresolved] or ['None.']
    lines += ['', '## Review issues','']+[f"- {i['slug']} — {i['kind']}: {i['resolution']}" for i in plan['issues']]
    lines += ['', '## Apply sequence and recovery','', '1. Review schema.sql, operations.json, apply-data.sql, asset-manifest.json, and review.json. Re-snapshot/diff if production changes; do not replace the original snapshot.','2. Apply exactly schema.sql, record the actual migration version and regenerate database types. Deploy staged app support together.','3. Upload only upload-paths.json derivatives with upsert:false; verify existing bytes if a path already exists. Register migration inventory as managed=false before references.','4. Execute apply-data.sql as trusted importer in one transaction; it refuses changed baselines. Run it again to establish no-op behavior, then inspect ledger/rows.','5. Run scripts/verify-catalog-access.sql, verify-metadata-access.sql, verify-media-access.sql, verify-webflow-access.sql and Supabase advisors. Regenerate types and remove temporary overlay. Refresh catalog/news/deals caches.','6. On SQL failure the transaction rolls back. On later recovery, compare ledger fingerprints before deleting only inserted rows; restore only modified baseline rows/children from snapshot.json, preserving subsequent owner edits. Never bulk reset tables or run seed imports. Uploaded immutable files stay pinned/unmanaged; no automatic delete.','', 'Snapshot and owned-manifest.json together preserve data and current rendering files. This is a scoped CMS snapshot, not an Auth/database disaster-recovery dump.','']
    (run/'REPORT.md').write_text('\n'.join(lines));print(json.dumps({'operations':dict(counts),'uploads':len(paths),'unresolved_assets':len(unresolved)}))
if __name__=='__main__':main()
