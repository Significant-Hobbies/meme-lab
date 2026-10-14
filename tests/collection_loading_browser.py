"""Collection transport regression: real UI, synthetic data, no providers or auth."""
import json, os, subprocess, sys, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'work/collection-loading')
OUT.mkdir(parents=True, exist_ok=True)
proc = subprocess.Popen(['node', 'scripts/preview-landing.mjs', '4322'], cwd=ROOT,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
base = 'http://127.0.0.1:4322'
rows = [{'id': 'synthetic-'+str(i), 'name': 'Synthetic waiting '+str(i),
         'message': 'A fictional reaction fixture.', 'relational_pattern': 'waiting',
         'tags': ['waiting', 'synthetic'], 'availability': 'live', 'media_type': 'image',
         'image_url': '/synthetic-image.svg'} for i in range(24)]
report = []
try:
    for _ in range(100):
        try:
            urlopen(base).close()
            break
        except Exception:
            time.sleep(.1)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        for width in [390, 768, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 900},
                                          service_workers='block', color_scheme='dark')
            page = context.new_page()
            errors = []
            pending = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            context.route_web_socket('**/*', lambda socket: socket.close())
            cdp = context.new_cdp_session(page)
            cdp.send('Network.enable')
            cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150,
                     'downloadThroughput': 1.6*1024*1024/8, 'uploadThroughput': 750*1024/8,
                     'connectionType': 'cellular4g'})
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
            context.add_init_script("""window.auditShifts=[];window.auditRelease=Infinity;
                new PerformanceObserver(list=>window.auditShifts.push(...list.getEntries()
                .map(e=>({t:e.startTime,value:e.value,recent:e.hadRecentInput}))))
                .observe({type:'layout-shift',buffered:true});""")
            def transport(route):
                url = route.request.url
                if not url.startswith(base+'/'):
                    route.abort()
                elif url.endswith('/collection.json'):
                    pending.append(route)
                elif url.endswith('/synthetic-image.svg'):
                    route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#24334c"/></svg>')
                elif '/api/' in url:
                    route.fulfill(status=503, json={'error': 'Unseeded local test operation'})
                else:
                    route.continue_()
            context.route('**/*', transport)
            page.goto(base+'/collection')
            page.wait_for_function('document.querySelector("#collection-grid").getAttribute("aria-busy")==="true"')
            assert page.locator('.collection-skeleton').count() == 24
            assert page.locator('#collection-error').is_hidden()
            assert page.locator('#collection-empty').is_hidden()
            page.locator('#catalogue-search').fill('waiting')
            page.wait_for_timeout(600)
            page.evaluate('window.auditRelease=performance.now()')
            pending.pop().fulfill(status=503, json={'error': 'Synthetic collection failure'})
            page.locator('#collection-retry').wait_for(state='visible')
            assert page.locator('#collection-empty').is_hidden()
            assert page.locator('#collection-grid').get_attribute('aria-busy') == 'false'
            page.screenshot(path=str(OUT/f'error-{width}.png'), full_page=True)
            page.locator('#collection-retry').click()
            page.wait_for_function('document.querySelector("#collection-grid").getAttribute("aria-busy")==="true"')
            assert page.locator('#collection-retry').is_disabled()
            assert page.locator('#catalogue-search').input_value() == 'waiting'
            page.wait_for_timeout(600)
            page.evaluate('window.auditRelease=performance.now();window.auditShifts=[]')
            pending.pop().fulfill(json=rows)
            page.locator('#collection-count').filter(has_text='24 memes').wait_for()
            page.wait_for_timeout(800)
            cls = page.evaluate('auditShifts.filter(e=>e.t>=auditRelease&&!e.recent).reduce((n,e)=>n+e.value,0)')
            assert cls <= .05, (width, cls)
            assert page.locator('.collection-card').count() == 24
            page.screenshot(path=str(OUT/f'populated-{width}.png'), full_page=True)
            page.locator('#catalogue-search').fill('no-such-fixture')
            page.locator('#collection-empty').wait_for(state='visible')
            assert page.locator('#collection-error').is_hidden()
            assert page.locator('#collection-count').inner_text() == '0 memes'
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            page.screenshot(path=str(OUT/f'empty-{width}.png'), full_page=True)
            page.reload()
            page.wait_for_function('document.querySelector("#collection-grid").getAttribute("aria-busy")==="true"')
            pending.pop().fulfill(json={'invalid': 'collection'})
            page.locator('#collection-error').filter(has_text='unreadable').wait_for()
            assert page.locator('#collection-empty').is_hidden()
            assert not errors, errors
            report.append({'width': width, 'arrival_cls': cls, 'retry_preserves_query': True,
                           'empty_distinct_from_error': True, 'invalid_data_is_error': True})
            context.close()
        browser.close()
    (OUT/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report))
finally:
    proc.terminate()
    proc.wait(timeout=10)
