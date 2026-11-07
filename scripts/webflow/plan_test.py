import unittest
from plan import active, canonical, pricing, RichText
from prepare import literal, timestamp, fingerprint, generate_sql, baseline_children, prepare

class MigrationTests(unittest.TestCase):
    def test_active_scope(self):
        row={'Archived':'false','Draft':'false','Published On':'date'}
        self.assertTrue(active(row))
        for key,value in [('Archived','true'),('Draft','true'),('Hide Item','true'),('Hide','true'),('Published On','')]:
            self.assertFalse(active({**row,key:value}))

    def test_price_mapping(self):
        def row(a,b,l1,l2):return {'Price1':a,'Price2':b,'Price Category Line 1':l1,'Price Category Line 2':l2}
        p=pricing(row('699.99','399','msrp-pair','sale-price'),{})
        self.assertEqual((p['price_cents'],p['msrp_cents'],p['price_unit']),(39900,69999,'pair'))
        self.assertEqual(pricing(row('799','599','msrp-pair','sale-price-each'),{})['price_unit'],'each')
        p=pricing(row('','','sold',''),{'sold':'SOLD OUT'})
        self.assertEqual((p['price_cents'],p['msrp_cents'],p['availability'],p['price_note']),(None,None,'sold','SOLD OUT'))
        self.assertEqual(pricing(row('175','1','msrp','closeout'),{})['price_cents'],100)
        self.assertEqual(pricing(row('40','','starting-at-each',''),{'starting-at-each':'Starting at (Each)'})['price_note'],'Starting at (Each)')
        self.assertIsNone(pricing(row('500','','item','sale-price'),{})['msrp_cents'])
        with self.assertRaises(ValueError):pricing(row('call','','item',''),{})

    def test_html_preserves_text_links_images_captions_and_variants(self):
        rich=RichText('<h2>Details</h2><p>A <strong>good</strong> amp &amp; DAC <a href="https://example.org">specs</a>.</p><figure><img src="https://assets.website-files.com/x/photo.png" srcset="https://assets.website-files.com/x/photo-p-500.png 500w" alt="Rear"><figcaption>A <strong>rear</strong> view</figcaption></figure><script>bad()</script>')
        self.assertIn('A **good** amp & DAC [specs](https://example.org).',rich.markdown)
        self.assertNotIn('bad()',rich.markdown)
        self.assertNotIn('rear',rich.markdown)
        self.assertEqual(rich.images,[{'url':'https://cdn.prod.website-files.com/x/photo.png','alt':'Rear','caption':'A rear view','source_url':'https://assets.website-files.com/x/photo.png'}])
        self.assertEqual(len(rich.variants),1)
        caption=RichText('<p>Before</p><figure><img src="https://assets.website-files.com/x/a.png"><figcaption>A <a href="https://example.org/old">linked</a> caption</figcaption></figure>')
        self.assertEqual(caption.images[0]['caption'],'A linked caption')
        self.assertEqual(caption.links,['https://example.org/old'])
        self.assertNotIn('[',caption.markdown)

    def test_url_aliases_do_not_merge_distinct_assets(self):
        a='https://uploads-ssl.webflow.com/collection/id_A%20B.png'
        self.assertEqual(canonical(a),canonical('https://cdn.prod.website-files.com/collection/id_A B.png'))
        self.assertNotEqual(canonical(a),canonical(a.replace('id_','different_')))
        encoded='https://cdn.prod.website-files.com/x/id_A%2520B%2BMac%3Aamp.png'
        self.assertEqual(canonical(encoded),encoded)
        self.assertEqual(canonical(canonical(encoded)),encoded)
        self.assertNotEqual(canonical(encoded),canonical(encoded.replace('%2520','%20')))
        self.assertIn('different.example',canonical('https://different.example/a.png'))

    def test_sql_escaping_and_original_dates(self):
        self.assertEqual(literal("owner's $x$"),"'owner''s $x$'")
        self.assertEqual(timestamp('Mon Nov 30 2026 00:00:00 GMT+0000 (Coordinated Universal Time)'),'2026-11-30T00:00:00+00:00')
        self.assertIn('product_images',fingerprint('products','amp'))
        self.assertIn('deal_items',fingerprint('deals','00000000-0000-0000-0000-000000000001'))

    def test_apply_guards_existing_rows_and_noop_receipts(self):
        rec={'table':'products','key':'amp','mode':'preserve','fields':{},'expected':{'id':'a','slug':'amp'}}
        sql,paths=generate_sql([rec],{},'a'*64,{'tables':{'product_images':[]}})
        self.assertIn('target_fingerprint is distinct from',sql)
        self.assertNotIn('begin;',sql.split('declare receipt')[1].split('select *')[0])
        self.assertIn('Baseline children changed',sql)
        self.assertNotIn('update public.products',sql)
        self.assertEqual(paths,[])

    def test_caption_default_allows_unchanged_children_but_refuses_later_edits(self):
        old={'id':'image-1','product_id':'product-1','path':'products/owned.webp','sort_order':0}
        snapshot={'tables':{'product_images':[old]}}
        expected=baseline_children(snapshot,'products','product-1')
        current=[{**old,'caption':''}]
        self.assertEqual(expected,current)
        self.assertNotEqual(expected,[{**current[0],'caption':'Owner edited this'}])
        self.assertNotEqual(expected,[{**current[0],'path':'products/new.webp'}])
        self.assertNotEqual(expected,[])
        self.assertNotIn('caption',old)
        rec={'table':'products','key':'amp','mode':'preserve','fields':{},'expected':{'id':'product-1','slug':'amp'}}
        sql,_=generate_sql([rec],{},'a'*64,snapshot)
        self.assertIn('"caption": ""',sql)
        self.assertIn('Baseline children changed',sql)

    def test_taxonomy_precedes_product_foreign_keys(self):
        plan={'records':[
            {'table':'products','mode':'preserve','key':'amp','fields':{}},
            {'table':'catalog_brands','mode':'feature_only','key':'brand','fields':{'featured':False}},
            {'table':'catalog_categories','mode':'preserve','key':'category','fields':{}},
        ]}
        ops,_=prepare(plan,[],{})
        self.assertEqual([r['table'] for r in ops],['catalog_categories','catalog_brands','products'])

if __name__=='__main__':unittest.main()
